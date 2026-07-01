from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import string
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="ServeSync API")
api_router = APIRouter(prefix="/api")


# -------------------- Utility --------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_pairing_code() -> str:
    return "".join(random.choices(string.digits, k=4))


def clean(doc: dict) -> dict:
    """Strip Mongo _id from a document."""
    if doc is None:
        return doc
    d = dict(doc)
    d.pop("_id", None)
    return d


# -------------------- Models --------------------

class RoomCreate(BaseModel):
    name: str = Field(default="My Restaurant")


class RoomUpdate(BaseModel):
    name: str


class Room(BaseModel):
    id: str
    code: str
    name: str
    created_at: str


class CategoryCreate(BaseModel):
    name: str


class Category(BaseModel):
    id: str
    room_code: str
    name: str
    sort: int = 0


class MenuItemCreate(BaseModel):
    name: str
    price: float
    category_id: str
    description: Optional[str] = ""
    available: bool = True


class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    category_id: Optional[str] = None
    description: Optional[str] = None
    available: Optional[bool] = None


class MenuItem(BaseModel):
    id: str
    room_code: str
    name: str
    price: float
    category_id: str
    description: str = ""
    available: bool = True


class OrderLineIn(BaseModel):
    item_id: str
    quantity: int = 1
    notes: Optional[str] = ""


class OrderCreate(BaseModel):
    table_number: str
    waiter_name: str
    lines: List[OrderLineIn]
    notes: Optional[str] = ""


class OrderLine(BaseModel):
    item_id: str
    name: str
    price: float
    quantity: int
    notes: str = ""


class Order(BaseModel):
    id: str
    room_code: str
    table_number: str
    waiter_name: str
    lines: List[OrderLine]
    notes: str = ""
    status: str = "new"  # new | preparing | ready | served | cancelled
    total: float
    created_at: str
    updated_at: str


class OrderStatusUpdate(BaseModel):
    status: str


class OrderUpdatePayload(BaseModel):
    table_number: Optional[str] = None
    notes: Optional[str] = None
    lines: Optional[List[OrderLineIn]] = None


# -------------------- Push Notifications (Emergent-managed) --------------------

PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

_push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str
    device_token: str


@api_router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    try:
        resp = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
        if resp.status_code == 401:
            raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
        if resp.status_code >= 500:
            raise HTTPException(502, "Push provider unavailable")
        resp.raise_for_status()
    except HTTPException:
        raise
    except Exception as e:
        # Non-fatal — user id remembered client-side, notifications simply won't fire
        logging.getLogger(__name__).warning("register-push failed: %s", e)
        raise HTTPException(502, "Push provider unavailable")
    return {"status": "registered"}


async def send_push(
    recipients: List[str],
    data: Dict[str, Any],
    idempotency_key: Optional[str] = None,
) -> None:
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: Dict[str, Any] = {"recipients": recipients[:100], "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _push_client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()


def push_user_id(room_code: str, waiter_name: str) -> str:
    """Stable user id used for push registration (per waiter, per restaurant)."""
    return f"{room_code}:{waiter_name.strip().lower()}"


# -------------------- WebSocket manager --------------------

class RoomConnectionManager:
    def __init__(self) -> None:
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, room_code: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.rooms.setdefault(room_code, []).append(websocket)

    def disconnect(self, room_code: str, websocket: WebSocket) -> None:
        conns = self.rooms.get(room_code, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self.rooms.pop(room_code, None)

    async def broadcast(self, room_code: str, message: Any) -> None:
        conns = list(self.rooms.get(room_code, []))
        dead = []
        for c in conns:
            try:
                await c.send_json(message)
            except Exception:
                dead.append(c)
        for c in dead:
            self.disconnect(room_code, c)


manager = RoomConnectionManager()


# -------------------- Seed helper --------------------

DEFAULT_MENU = [
    ("Starters", [
        ("Bruschetta", 6.5, "Toasted bread, tomato, basil"),
        ("Garlic Bread", 4.0, "House-baked with herb butter"),
        ("Caesar Salad", 8.5, "Romaine, parmesan, croutons"),
    ]),
    ("Mains", [
        ("Margherita Pizza", 12.0, "Tomato, mozzarella, basil"),
        ("Spaghetti Carbonara", 13.5, "Pancetta, egg, pecorino"),
        ("Grilled Salmon", 18.0, "Lemon butter sauce"),
        ("Ribeye Steak", 24.0, "250g, seasonal sides"),
    ]),
    ("Drinks", [
        ("Sparkling Water", 3.0, "500ml"),
        ("House Red Wine", 6.5, "Glass"),
        ("Espresso", 2.5, "Single shot"),
        ("Fresh Lemonade", 4.0, "Homemade"),
    ]),
    ("Desserts", [
        ("Tiramisu", 6.5, "Classic Italian"),
        ("Cheesecake", 7.0, "Berry compote"),
    ]),
]


async def seed_menu(room_code: str) -> None:
    sort = 0
    for cat_name, items in DEFAULT_MENU:
        cat = {
            "id": str(uuid.uuid4()),
            "room_code": room_code,
            "name": cat_name,
            "sort": sort,
        }
        await db.categories.insert_one(cat)
        sort += 1
        for name, price, desc in items:
            it = {
                "id": str(uuid.uuid4()),
                "room_code": room_code,
                "name": name,
                "price": price,
                "category_id": cat["id"],
                "description": desc,
                "available": True,
            }
            await db.items.insert_one(it)


# -------------------- Room routes --------------------

@api_router.get("/")
async def root():
    return {"message": "ServeSync API", "ok": True}


@api_router.post("/rooms", response_model=Room)
async def create_room(payload: RoomCreate):
    # Generate a unique 4-digit code
    for _ in range(30):
        code = gen_pairing_code()
        existing = await db.rooms.find_one({"code": code})
        if not existing:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not allocate code")

    room = {
        "id": str(uuid.uuid4()),
        "code": code,
        "name": payload.name or "My Restaurant",
        "created_at": now_iso(),
    }
    await db.rooms.insert_one(room)
    await seed_menu(code)
    return Room(**clean(room))


@api_router.get("/rooms/{code}", response_model=Room)
async def get_room(code: str):
    room = await db.rooms.find_one({"code": code})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return Room(**clean(room))


@api_router.put("/rooms/{code}", response_model=Room)
async def update_room(code: str, payload: RoomUpdate):
    name = (payload.name or "").strip() or "My Restaurant"
    result = await db.rooms.update_one({"code": code}, {"$set": {"name": name}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    room = await db.rooms.find_one({"code": code})
    return Room(**clean(room))


@api_router.post("/rooms/{code}/regenerate", response_model=Room)
async def regenerate_code(code: str):
    room = await db.rooms.find_one({"code": code})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    for _ in range(30):
        new_code = gen_pairing_code()
        if not await db.rooms.find_one({"code": new_code}):
            break
    else:
        raise HTTPException(status_code=500, detail="Could not allocate code")
    # Update all related docs
    await db.rooms.update_one({"code": code}, {"$set": {"code": new_code}})
    await db.categories.update_many({"room_code": code}, {"$set": {"room_code": new_code}})
    await db.items.update_many({"room_code": code}, {"$set": {"room_code": new_code}})
    await db.orders.update_many({"room_code": code}, {"$set": {"room_code": new_code}})
    updated = await db.rooms.find_one({"code": new_code})
    return Room(**clean(updated))


# -------------------- Categories --------------------

@api_router.get("/rooms/{code}/categories", response_model=List[Category])
async def list_categories(code: str):
    cats = await db.categories.find({"room_code": code}).sort("sort", 1).to_list(500)
    return [Category(**clean(c)) for c in cats]


@api_router.post("/rooms/{code}/categories", response_model=Category)
async def add_category(code: str, payload: CategoryCreate):
    count = await db.categories.count_documents({"room_code": code})
    cat = {
        "id": str(uuid.uuid4()),
        "room_code": code,
        "name": payload.name,
        "sort": count,
    }
    await db.categories.insert_one(cat)
    return Category(**clean(cat))


@api_router.put("/rooms/{code}/categories/{cat_id}", response_model=Category)
async def update_category(code: str, cat_id: str, payload: CategoryCreate):
    result = await db.categories.update_one(
        {"room_code": code, "id": cat_id},
        {"$set": {"name": payload.name}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    cat = await db.categories.find_one({"room_code": code, "id": cat_id})
    return Category(**clean(cat))


@api_router.delete("/rooms/{code}/categories/{cat_id}")
async def delete_category(code: str, cat_id: str):
    await db.categories.delete_one({"room_code": code, "id": cat_id})
    await db.items.delete_many({"room_code": code, "category_id": cat_id})
    return {"ok": True}


# -------------------- Menu items --------------------

@api_router.get("/rooms/{code}/items", response_model=List[MenuItem])
async def list_items(code: str):
    items = await db.items.find({"room_code": code}).to_list(2000)
    return [MenuItem(**clean(i)) for i in items]


@api_router.post("/rooms/{code}/items", response_model=MenuItem)
async def add_item(code: str, payload: MenuItemCreate):
    it = {
        "id": str(uuid.uuid4()),
        "room_code": code,
        "name": payload.name,
        "price": float(payload.price),
        "category_id": payload.category_id,
        "description": payload.description or "",
        "available": bool(payload.available),
    }
    await db.items.insert_one(it)
    return MenuItem(**clean(it))


@api_router.put("/rooms/{code}/items/{item_id}", response_model=MenuItem)
async def update_item(code: str, item_id: str, payload: MenuItemUpdate):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = await db.items.update_one(
        {"room_code": code, "id": item_id},
        {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    it = await db.items.find_one({"room_code": code, "id": item_id})
    return MenuItem(**clean(it))


@api_router.delete("/rooms/{code}/items/{item_id}")
async def delete_item(code: str, item_id: str):
    await db.items.delete_one({"room_code": code, "id": item_id})
    return {"ok": True}


# -------------------- Orders --------------------

@api_router.get("/rooms/{code}/orders", response_model=List[Order])
async def list_orders(code: str, active_only: bool = False):
    q: Dict[str, Any] = {"room_code": code}
    if active_only:
        q["status"] = {"$in": ["new", "preparing", "ready"]}
    orders = await db.orders.find(q).sort("created_at", -1).to_list(1000)
    return [Order(**clean(o)) for o in orders]


@api_router.post("/rooms/{code}/orders", response_model=Order)
async def create_order(code: str, payload: OrderCreate):
    room = await db.rooms.find_one({"code": code})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    # Build lines with current prices
    lines: List[dict] = []
    total = 0.0
    for line_in in payload.lines:
        item = await db.items.find_one({"room_code": code, "id": line_in.item_id})
        if not item:
            continue
        qty = max(1, int(line_in.quantity))
        price = float(item["price"])
        total += price * qty
        lines.append({
            "item_id": item["id"],
            "name": item["name"],
            "price": price,
            "quantity": qty,
            "notes": line_in.notes or "",
        })

    if not lines:
        raise HTTPException(status_code=400, detail="No valid items in order")

    now = now_iso()
    order = {
        "id": str(uuid.uuid4()),
        "room_code": code,
        "table_number": payload.table_number,
        "waiter_name": payload.waiter_name,
        "lines": lines,
        "notes": payload.notes or "",
        "status": "new",
        "total": round(total, 2),
        "created_at": now,
        "updated_at": now,
    }
    await db.orders.insert_one(order)
    order_out = clean(order)
    await manager.broadcast(code, {"event": "order_created", "order": order_out})
    return Order(**order_out)


@api_router.put("/rooms/{code}/orders/{order_id}", response_model=Order)
async def edit_order(code: str, order_id: str, payload: OrderUpdatePayload):
    existing = await db.orders.find_one({"room_code": code, "id": order_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")

    update: Dict[str, Any] = {}
    if payload.table_number is not None:
        update["table_number"] = payload.table_number.strip() or existing["table_number"]
    if payload.notes is not None:
        update["notes"] = payload.notes

    if payload.lines is not None:
        new_lines: List[dict] = []
        total = 0.0
        for line_in in payload.lines:
            item = await db.items.find_one({"room_code": code, "id": line_in.item_id})
            if not item:
                continue
            qty = max(1, int(line_in.quantity))
            price = float(item["price"])
            total += price * qty
            new_lines.append({
                "item_id": item["id"],
                "name": item["name"],
                "price": price,
                "quantity": qty,
                "notes": line_in.notes or "",
            })
        if not new_lines:
            raise HTTPException(status_code=400, detail="Order must have at least one item")
        update["lines"] = new_lines
        update["total"] = round(total, 2)

    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")

    update["updated_at"] = now_iso()
    await db.orders.update_one({"room_code": code, "id": order_id}, {"$set": update})
    o = await db.orders.find_one({"room_code": code, "id": order_id})
    order_out = clean(o)
    await manager.broadcast(code, {"event": "order_updated", "order": order_out})
    return Order(**order_out)


@api_router.put("/rooms/{code}/orders/{order_id}/status", response_model=Order)
async def update_order_status(code: str, order_id: str, payload: OrderStatusUpdate):
    if payload.status not in ("new", "preparing", "ready", "served", "cancelled"):
        raise HTTPException(status_code=400, detail="Invalid status")
    result = await db.orders.update_one(
        {"room_code": code, "id": order_id},
        {"$set": {"status": payload.status, "updated_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    o = await db.orders.find_one({"room_code": code, "id": order_id})
    order_out = clean(o)
    await manager.broadcast(code, {"event": "order_updated", "order": order_out})

    # Push notification to the waiter for ready/served transitions
    if payload.status in ("ready", "served"):
        try:
            title = (
                f"Table {order_out['table_number']} · Ready for pickup"
                if payload.status == "ready"
                else f"Table {order_out['table_number']} · Order finished"
            )
            message = (
                "The kitchen has your order ready to serve."
                if payload.status == "ready"
                else "The kitchen has marked your order as served."
            )
            await send_push(
                recipients=[push_user_id(code, order_out["waiter_name"])],
                data={"title": title, "message": message, "action_url": "/waiter/orders"},
                idempotency_key=f"{order_out['id']}-{payload.status}",
            )
        except Exception as e:
            logging.getLogger(__name__).warning("push failed (non-blocking): %s", e)

    return Order(**order_out)


# -------------------- Stats --------------------

@api_router.get("/rooms/{code}/stats")
async def get_stats(code: str):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_iso = today_start.isoformat()
    week_start = (today_start - timedelta(days=6)).isoformat()

    all_orders = await db.orders.find({
        "room_code": code,
        "status": {"$ne": "cancelled"},
    }).to_list(5000)

    today_orders = [o for o in all_orders if o.get("created_at", "") >= today_iso]
    week_orders = [o for o in all_orders if o.get("created_at", "") >= week_start]

    today_revenue = sum(float(o.get("total", 0)) for o in today_orders)
    week_revenue = sum(float(o.get("total", 0)) for o in week_orders)

    # Top items today
    counts: Dict[str, Dict[str, Any]] = {}
    for o in today_orders:
        for line in o.get("lines", []):
            key = line["item_id"]
            entry = counts.setdefault(key, {"item_id": key, "name": line["name"], "quantity": 0, "revenue": 0.0})
            entry["quantity"] += line["quantity"]
            entry["revenue"] += line["quantity"] * line["price"]
    top_items = sorted(counts.values(), key=lambda x: -x["quantity"])[:5]

    # Waiter breakdown today
    waiters: Dict[str, Dict[str, Any]] = {}
    for o in today_orders:
        w = o.get("waiter_name", "Unknown")
        entry = waiters.setdefault(w, {"name": w, "orders": 0, "revenue": 0.0})
        entry["orders"] += 1
        entry["revenue"] += float(o.get("total", 0))
    waiter_list = sorted(waiters.values(), key=lambda x: -x["revenue"])

    return {
        "today_orders": len(today_orders),
        "today_revenue": round(today_revenue, 2),
        "week_orders": len(week_orders),
        "week_revenue": round(week_revenue, 2),
        "top_items": [{**t, "revenue": round(t["revenue"], 2)} for t in top_items],
        "waiters": [{**w, "revenue": round(w["revenue"], 2)} for w in waiter_list],
    }


# -------------------- WebSocket --------------------

@api_router.websocket("/ws/{code}")
async def ws_room(websocket: WebSocket, code: str):
    room = await db.rooms.find_one({"code": code})
    if not room:
        await websocket.close(code=4404)
        return
    await manager.connect(code, websocket)
    try:
        # Send hello
        await websocket.send_json({"event": "connected", "code": code})
        while True:
            # Keep connection open. We accept but ignore inbound messages.
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(code, websocket)
    except Exception:
        manager.disconnect(code, websocket)


# -------------------- Wire up --------------------

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

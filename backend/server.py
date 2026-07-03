from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends
from starlette.middleware.cors import CORSMiddleware
import logging
import random
import string
import httpx
import os
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext

# Import database configuration (avoids circular imports)
from database import db, get_db, SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, client

app = FastAPI(title="ServeSync API")
api_router = APIRouter(prefix="/api")

# Import and include admin routes
from admin_routes import admin_router
app.include_router(admin_router)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# -------------------- Utility --------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_pairing_code() -> str:
    return "".join(random.choices(string.digits, k=4))


def gen_daily_code() -> str:
    """Generate 4-digit daily code for restaurant."""
    return "".join(random.choices(string.digits, k=4))


def clean(doc: dict) -> dict:
    """Strip Mongo _id from a document."""
    if doc is None:
        return doc
    d = dict(doc)
    d.pop("_id", None)
    return d


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# -------------------- Multi-Tenant Models --------------------

class RestaurantCreate(BaseModel):
    name: str = Field(default="My Restaurant")
    # Optional: owner info for SaaS admin
    owner_email: Optional[str] = None
    owner_phone: Optional[str] = None


class RestaurantUpdate(BaseModel):
    name: Optional[str] = None
    abonelik_durumu: Optional[str] = None  # aktif | pasif
    gunluk_kod: Optional[str] = None


class Restaurant(BaseModel):
    id: str
    name: str
    code: str  # 4-digit pairing code (for initial setup)
    gunluk_kod: str  # Daily changing 4-digit code
    abonelik_durumu: str = "aktif"  # aktif | pasif
    owner_email: Optional[str] = None
    owner_phone: Optional[str] = None
    created_at: str
    updated_at: str


class WaiterLogin(BaseModel):
    nickname: str
    gunluk_kod: str  # Daily code from restaurant


class WaiterSessionCreate(BaseModel):
    nickname: str
    restoran_id: str


class WaiterSession(BaseModel):
    id: str
    restoran_id: str
    nickname: str
    session_token: str  # JWT token
    olusturulma_tarihi: str
    son_aktivite: str


class WaiterSessionResponse(BaseModel):
    session_token: str
    nickname: str
    restoran_id: str
    restoran_adi: str
    gunluk_kod: str


# -------------------- Updated Existing Models --------------------

class CategoryCreate(BaseModel):
    name: str


class Category(BaseModel):
    id: str
    restoran_id: str
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
    restoran_id: str
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
    restoran_id: str
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


def push_user_id(restoran_id: str, waiter_name: str) -> str:
    """Stable user id used for push registration (per waiter, per restaurant)."""
    return f"{restoran_id}:{waiter_name.strip().lower()}"


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


async def seed_menu(restoran_id: str) -> None:
    sort = 0
    for cat_name, items in DEFAULT_MENU:
        cat = {
            "id": str(uuid.uuid4()),
            "restoran_id": restoran_id,
            "name": cat_name,
            "sort": sort,
        }
        await db.categories.insert_one(cat)
        sort += 1
        for name, price, desc in items:
            it = {
                "id": str(uuid.uuid4()),
                "restoran_id": restoran_id,
                "name": name,
                "price": price,
                "category_id": cat["id"],
                "description": desc,
                "available": True,
            }
            await db.items.insert_one(it)


# -------------------- Auth Dependencies --------------------

async def get_current_waiter(token: str) -> dict:
    """Verify JWT token and return waiter session."""
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        session_id: str = payload.get("sub")
        if session_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    session = await db.waiter_sessions.find_one({"id": session_id})
    if session is None:
        raise credentials_exception
    
    # Update last activity
    await db.waiter_sessions.update_one(
        {"id": session_id},
        {"$set": {"son_aktivite": now_iso()}}
    )
    
    return session


# -------------------- Restaurant (Tenant) Routes --------------------

@api_router.get("/")
async def root():
    return {"message": "ServeSync API", "ok": True}


@api_router.post("/restaurants", response_model=Restaurant)
async def create_restaurant(payload: RestaurantCreate):
    """Create a new restaurant (tenant)."""
    # Generate unique 4-digit code for initial setup
    for _ in range(30):
        code = gen_pairing_code()
        existing = await db.restaurants.find_one({"code": code})
        if not existing:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not allocate code")

    # Generate daily code
    gunluk_kod = gen_daily_code()
    
    now = now_iso()
    restaurant = {
        "id": str(uuid.uuid4()),
        "code": code,
        "name": payload.name or "My Restaurant",
        "gunluk_kod": gunluk_kod,
        "abonelik_durumu": "aktif",
        "owner_email": payload.owner_email,
        "owner_phone": payload.owner_phone,
        "created_at": now,
        "updated_at": now,
    }
    await db.restaurants.insert_one(restaurant)
    await seed_menu(restaurant["id"])
    return Restaurant(**clean(restaurant))


@api_router.get("/restaurants/{restoran_id}", response_model=Restaurant)
async def get_restaurant(restoran_id: str):
    restaurant = await db.restaurants.find_one({"id": restoran_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return Restaurant(**clean(restaurant))


@api_router.put("/restaurants/{restoran_id}", response_model=Restaurant)
async def update_restaurant(restoran_id: str, payload: RestaurantUpdate):
    restaurant = await db.restaurants.find_one({"id": restoran_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    update_data = {}
    if payload.name is not None:
        update_data["name"] = payload.name.strip() or "My Restaurant"
    if payload.abonelik_durumu is not None:
        update_data["abonelik_durumu"] = payload.abonelik_durumu
    if payload.gunluk_kod is not None:
        update_data["gunluk_kod"] = payload.gunluk_kod
    
    update_data["updated_at"] = now_iso()
    
    await db.restaurants.update_one({"id": restoran_id}, {"$set": update_data})
    updated = await db.restaurants.find_one({"id": restoran_id})
    return Restaurant(**clean(updated))


@api_router.post("/restaurants/{restoran_id}/regenerate-daily-code", response_model=Restaurant)
async def regenerate_daily_code(restoran_id: str):
    """Regenerate the daily code (called daily by cron job or admin)."""
    restaurant = await db.restaurants.find_one({"id": restoran_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    new_code = gen_daily_code()
    await db.restaurants.update_one(
        {"id": restoran_id},
        {"$set": {"gunluk_kod": new_code, "updated_at": now_iso()}}
    )
    updated = await db.restaurants.find_one({"id": restoran_id})
    return Restaurant(**clean(updated))


# -------------------- Waiter Authentication Routes --------------------

@api_router.post("/auth/waiter/login", response_model=WaiterSessionResponse)
async def waiter_login(payload: WaiterLogin):
    """
    Waiter login with nickname + daily code.
    No password required - just nickname and the restaurant's daily code.
    """
    # Find restaurant by daily code
    restaurant = await db.restaurants.find_one({"gunluk_kod": payload.gunluk_kod})
    if not restaurant:
        raise HTTPException(status_code=401, detail="Invalid daily code")
    
    if restaurant.get("abonelik_durumu") != "aktif":
        raise HTTPException(status_code=403, detail="Restaurant subscription is inactive")
    
    # Create session
    session_id = str(uuid.uuid4())
    now = now_iso()
    expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    session_token = create_access_token(
        data={"sub": session_id, "nickname": payload.nickname, "restoran_id": restaurant["id"]},
        expires_delta=expires_delta
    )
    
    session = {
        "id": session_id,
        "restoran_id": restaurant["id"],
        "nickname": payload.nickname.strip(),
        "session_token": session_token,
        "olusturulma_tarihi": now,
        "son_aktivite": now,
    }
    await db.waiter_sessions.insert_one(session)
    
    return WaiterSessionResponse(
        session_token=session_token,
        nickname=payload.nickname,
        restoran_id=restaurant["id"],
        restoran_adi=restaurant["name"],
        gunluk_kod=restaurant["gunluk_kod"],
    )


@api_router.post("/auth/waiter/logout")
async def waiter_logout(current_session: dict = Depends(get_current_waiter)):
    """Logout waiter by deleting session."""
    await db.waiter_sessions.delete_one({"id": current_session["id"]})
    return {"message": "Logged out successfully"}


@api_router.get("/auth/waiter/me")
async def get_current_waiter_info(current_session: dict = Depends(get_current_waiter)):
    """Get current waiter info."""
    restaurant = await db.restaurants.find_one({"id": current_session["restoran_id"]})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    return {
        "nickname": current_session["nickname"],
        "restoran_id": current_session["restoran_id"],
        "restoran_adi": restaurant["name"],
        "gunluk_kod": restaurant["gunluk_kod"],
    }


# -------------------- Categories --------------------

@api_router.get("/restaurants/{restoran_id}/categories", response_model=List[Category])
async def list_categories(restoran_id: str):
    cats = await db.categories.find({"restoran_id": restoran_id}).sort("sort", 1).to_list(500)
    return [Category(**clean(c)) for c in cats]


@api_router.post("/restaurants/{restoran_id}/categories", response_model=Category)
async def add_category(restoran_id: str, payload: CategoryCreate):
    count = await db.categories.count_documents({"restoran_id": restoran_id})
    cat = {
        "id": str(uuid.uuid4()),
        "restoran_id": restoran_id,
        "name": payload.name,
        "sort": count,
    }
    await db.categories.insert_one(cat)
    return Category(**clean(cat))


@api_router.put("/restaurants/{restoran_id}/categories/{cat_id}", response_model=Category)
async def update_category(restoran_id: str, cat_id: str, payload: CategoryCreate):
    result = await db.categories.update_one(
        {"restoran_id": restoran_id, "id": cat_id},
        {"$set": {"name": payload.name}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    cat = await db.categories.find_one({"restoran_id": restoran_id, "id": cat_id})
    return Category(**clean(cat))


@api_router.delete("/restaurants/{restoran_id}/categories/{cat_id}")
async def delete_category(restoran_id: str, cat_id: str):
    await db.categories.delete_one({"restoran_id": restoran_id, "id": cat_id})
    await db.items.delete_many({"restoran_id": restoran_id, "category_id": cat_id})
    return {"ok": True}


# -------------------- Menu items --------------------

@api_router.get("/restaurants/{restoran_id}/items", response_model=List[MenuItem])
async def list_items(restoran_id: str):
    items = await db.items.find({"restoran_id": restoran_id}).to_list(2000)
    return [MenuItem(**clean(i)) for i in items]


@api_router.post("/restaurants/{restoran_id}/items", response_model=MenuItem)
async def add_item(restoran_id: str, payload: MenuItemCreate):
    it = {
        "id": str(uuid.uuid4()),
        "restoran_id": restoran_id,
        "name": payload.name,
        "price": float(payload.price),
        "category_id": payload.category_id,
        "description": payload.description or "",
        "available": bool(payload.available),
    }
    await db.items.insert_one(it)
    return MenuItem(**clean(it))


@api_router.put("/restaurants/{restoran_id}/items/{item_id}", response_model=MenuItem)
async def update_item(restoran_id: str, item_id: str, payload: MenuItemUpdate):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = await db.items.update_one(
        {"restoran_id": restoran_id, "id": item_id},
        {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    it = await db.items.find_one({"restoran_id": restoran_id, "id": item_id})
    return MenuItem(**clean(it))


@api_router.delete("/restaurants/{restoran_id}/items/{item_id}")
async def delete_item(restoran_id: str, item_id: str):
    await db.items.delete_one({"restoran_id": restoran_id, "id": item_id})
    return {"ok": True}


# -------------------- Orders --------------------

@api_router.get("/restaurants/{restoran_id}/orders", response_model=List[Order])
async def list_orders(restoran_id: str, active_only: bool = False):
    q: Dict[str, Any] = {"restoran_id": restoran_id}
    if active_only:
        q["status"] = {"$in": ["new", "preparing", "ready"]}
    orders = await db.orders.find(q).sort("created_at", -1).to_list(1000)
    return [Order(**clean(o)) for o in orders]


@api_router.post("/restaurants/{restoran_id}/orders", response_model=Order)
async def create_order(restoran_id: str, payload: OrderCreate):
    restaurant = await db.restaurants.find_one({"id": restoran_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    # Build lines with current prices
    lines: List[dict] = []
    total = 0.0
    for line_in in payload.lines:
        item = await db.items.find_one({"restoran_id": restoran_id, "id": line_in.item_id})
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
        "restoran_id": restoran_id,
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
    
    # Broadcast using restaurant daily code
    await manager.broadcast(restaurant["gunluk_kod"], {"event": "order_created", "order": order_out})
    return Order(**order_out)


@api_router.put("/restaurants/{restoran_id}/orders/{order_id}", response_model=Order)
async def edit_order(restoran_id: str, order_id: str, payload: OrderUpdatePayload):
    existing = await db.orders.find_one({"restoran_id": restoran_id, "id": order_id})
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
            item = await db.items.find_one({"restoran_id": restoran_id, "id": line_in.item_id})
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
    await db.orders.update_one({"restoran_id": restoran_id, "id": order_id}, {"$set": update})
    o = await db.orders.find_one({"restoran_id": restoran_id, "id": order_id})
    order_out = clean(o)
    
    # Get restaurant daily code for WebSocket broadcast
    restaurant = await db.restaurants.find_one({"id": restoran_id})
    if restaurant:
        await manager.broadcast(restaurant["gunluk_kod"], {"event": "order_updated", "order": order_out})
    
    return Order(**order_out)


@api_router.put("/restaurants/{restoran_id}/orders/{order_id}/status", response_model=Order)
async def update_order_status(restoran_id: str, order_id: str, payload: OrderStatusUpdate):
    if payload.status not in ("new", "preparing", "ready", "served", "cancelled"):
        raise HTTPException(status_code=400, detail="Invalid status")
    
    result = await db.orders.update_one(
        {"restoran_id": restoran_id, "id": order_id},
        {"$set": {"status": payload.status, "updated_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    o = await db.orders.find_one({"restoran_id": restoran_id, "id": order_id})
    order_out = clean(o)
    
    # Get restaurant daily code for WebSocket broadcast
    restaurant = await db.restaurants.find_one({"id": restoran_id})
    if restaurant:
        await manager.broadcast(restaurant["gunluk_kod"], {"event": "order_updated", "order": order_out})

        # Push notification to the waiter when order is ready to pick up
        if payload.status == "ready":
            try:
                await send_push(
                    recipients=[push_user_id(restoran_id, order_out["waiter_name"])],
                    data={
                        "title": f"Table {order_out['table_number']} · Ready for pickup",
                        "message": "The kitchen has your order ready — deliver and mark served.",
                        "action_url": "/waiter/orders",
                    },
                    idempotency_key=f"{order_out['id']}-ready",
                )
            except Exception as e:
                logging.getLogger(__name__).warning("push failed (non-blocking): %s", e)

    return Order(**order_out)


# -------------------- Stats --------------------

@api_router.get("/restaurants/{restoran_id}/stats")
async def get_stats(restoran_id: str):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_iso = today_start.isoformat()
    week_start = (today_start - timedelta(days=6)).isoformat()

    all_orders = await db.orders.find({
        "restoran_id": restoran_id,
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

@api_router.websocket("/ws/{gunluk_kod}")
async def ws_room(websocket: WebSocket, gunluk_kod: str):
    restaurant = await db.restaurants.find_one({"gunluk_kod": gunluk_kod})
    if not restaurant:
        await websocket.close(code=4404)
        return
    await manager.connect(gunluk_kod, websocket)
    try:
        # Send hello
        await websocket.send_json({"event": "connected", "gunluk_kod": gunluk_kod})
        while True:
            # Keep connection open. We accept but ignore inbound messages.
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(gunluk_kod, websocket)
    except Exception:
        manager.disconnect(gunluk_kod, websocket)


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
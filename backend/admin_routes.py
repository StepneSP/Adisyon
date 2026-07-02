"""
Admin/Owner authentication and management routes.
Restaurant owners can login with email/password and manage their restaurant.
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
import uuid
from jose import jwt
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.database import db, get_db, ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, SECRET_KEY

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Router
admin_router = APIRouter(prefix="/api/admin", tags=["admin"])


# ==================== MODELS ====================

class AdminLoginPayload(BaseModel):
    email: str
    password: str


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    restaurant_id: str
    restaurant_name: str
    owner_email: str


class RestaurantUpdatePayload(BaseModel):
    name: Optional[str] = None
    gunluk_kod: Optional[str] = None
    abonelik_durumu: Optional[str] = None


# ==================== HELPERS ====================

def now_iso() -> str:
    return datetime.utcnow().isoformat()


def create_admin_token(restaurant_id: str, email: str) -> str:
    """Create JWT token for admin."""
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(uuid.uuid4()),
        "type": "admin",
        "restaurant_id": restaurant_id,
        "email": email,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_admin(token: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Get current admin from JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "admin":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        restaurant_id = payload.get("restaurant_id")
        email = payload.get("email")
        
        if not restaurant_id or not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Verify restaurant still exists
        restaurant = await db.restaurants.find_one({"id": restaurant_id})
        if not restaurant:
            raise HTTPException(status_code=404, detail="Restaurant not found")
        
        return {
            "restaurant_id": restaurant_id,
            "email": email,
            "restaurant": restaurant,
        }
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ==================== ROUTES ====================

@admin_router.post("/login", response_model=AdminLoginResponse)
async def admin_login(payload: AdminLoginPayload, db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Admin login with email and password.
    Email must match the restaurant's owner_email.
    """
    # Find restaurant by owner email
    restaurant = await db.restaurants.find_one({"owner_email": payload.email})
    if not restaurant:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Verify password (if password is set)
    stored_password = restaurant.get("owner_password_hash")
    if not stored_password:
        # First time login - set password
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        
        password_hash = pwd_context.hash(payload.password)
        await db.restaurants.update_one(
            {"id": restaurant["id"]},
            {"$set": {"owner_password_hash": password_hash}}
        )
    else:
        # Verify password
        if not pwd_context.verify(payload.password, stored_password):
            raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Create token
    access_token = create_admin_token(restaurant["id"], payload.email)
    
    return AdminLoginResponse(
        access_token=access_token,
        restaurant_id=restaurant["id"],
        restaurant_name=restaurant["name"],
        owner_email=payload.email,
    )


@admin_router.get("/me")
async def get_admin_info(admin: dict = Depends(get_current_admin)):
    """Get current admin info."""
    restaurant = admin["restaurant"]
    return {
        "restaurant_id": admin["restaurant_id"],
        "owner_email": admin["email"],
        "restaurant_name": restaurant["name"],
        "gunluk_kod": restaurant.get("gunluk_kod", ""),
        "abonelik_durumu": restaurant.get("abonelik_durumu", "aktif"),
        "created_at": restaurant.get("created_at"),
    }


@admin_router.put("/restaurant/{restaurant_id}")
async def update_restaurant(
    restaurant_id: str,
    payload: RestaurantUpdatePayload,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Update restaurant settings."""
    if admin["restaurant_id"] != restaurant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {}
    if payload.name:
        update_data["name"] = payload.name
    if payload.gunluk_kod:
        update_data["gunluk_kod"] = payload.gunluk_kod
    if payload.abonelik_durumu:
        update_data["abonelik_durumu"] = payload.abonelik_durumu
    
    if update_data:
        update_data["updated_at"] = now_iso()
        await db.restaurants.update_one(
            {"id": restaurant_id},
            {"$set": update_data}
        )
    
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    return {"message": "Updated successfully", "restaurant": restaurant}


@admin_router.post("/restaurant/{restaurant_id}/regenerate-daily-code")
async def regenerate_daily_code(
    restaurant_id: str,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Regenerate the daily code."""
    if admin["restaurant_id"] != restaurant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    import random
    new_code = f"{random.randint(0, 9999):04d}"
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {"gunluk_kod": new_code, "updated_at": now_iso()}}
    )
    
    return {"gunluk_kod": new_code}


@admin_router.get("/restaurant/{restaurant_id}/stats")
async def get_restaurant_stats(
    restaurant_id: str,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get restaurant statistics."""
    if admin["restaurant_id"] != restaurant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    from datetime import datetime, timezone
    
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    
    # Today's orders
    today_orders = await db.orders.count_documents({
        "restoran_id": restaurant_id,
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    # Today's revenue
    today_revenue_pipeline = [
        {"$match": {"restoran_id": restaurant_id, "created_at": {"$gte": today_start.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    today_revenue_result = await db.orders.aggregate(today_revenue_pipeline).to_list(1)
    today_revenue = today_revenue_result[0]["total"] if today_revenue_result else 0
    
    # Week's orders
    week_orders = await db.orders.count_documents({
        "restoran_id": restaurant_id,
        "created_at": {"$gte": week_start.isoformat()}
    })
    
    # Week's revenue
    week_revenue_pipeline = [
        {"$match": {"restoran_id": restaurant_id, "created_at": {"$gte": week_start.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    week_revenue_result = await db.orders.aggregate(week_revenue_pipeline).to_list(1)
    week_revenue = week_revenue_result[0]["total"] if week_revenue_result else 0
    
    # Top items
    top_items_pipeline = [
        {"$match": {"restoran_id": restaurant_id}},
        {"$unwind": "$lines"},
        {"$group": {
            "_id": "$lines.item_id",
            "name": {"$first": "$lines.name"},
            "quantity": {"$sum": "$lines.quantity"},
            "revenue": {"$sum": {"$multiply": ["$lines.price", "$lines.quantity"]}}
        }},
        {"$sort": {"quantity": -1}},
        {"$limit": 10}
    ]
    top_items = await db.orders.aggregate(top_items_pipeline).to_list(10)
    
    # Waiters performance
    waiters_pipeline = [
        {"$match": {"restoran_id": restaurant_id, "created_at": {"$gte": week_start.isoformat()}}},
        {"$group": {
            "_id": "$waiter_name",
            "orders": {"$sum": 1},
            "revenue": {"$sum": "$total"}
        }},
        {"$sort": {"orders": -1}}
    ]
    waiters = await db.orders.aggregate(waiters_pipeline).to_list(50)
    
    return {
        "today_orders": today_orders,
        "today_revenue": round(today_revenue, 2),
        "week_orders": week_orders,
        "week_revenue": round(week_revenue, 2),
        "top_items": [
            {
                "item_id": item["_id"],
                "name": item["name"],
                "quantity": item["quantity"],
                "revenue": round(item["revenue"], 2)
            }
            for item in top_items
        ],
        "waiters": [
            {
                "name": waiter["_id"],
                "orders": waiter["orders"],
                "revenue": round(waiter["revenue"], 2)
            }
            for waiter in waiters
        ]
    }


@admin_router.get("/restaurant/{restaurant_id}/waiters")
async def get_restaurant_waiters(
    restaurant_id: str,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get all waiters for this restaurant."""
    if admin["restaurant_id"] != restaurant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get unique waiter names from orders
    waiters = await db.orders.distinct("waiter_name", {"restoran_id": restaurant_id})
    
    # Get waiter stats
    waiter_stats = []
    for waiter_name in waiters:
        orders = await db.orders.count_documents({
            "restoran_id": restaurant_id,
            "waiter_name": waiter_name
        })
        waiter_stats.append({
            "name": waiter_name,
            "total_orders": orders
        })
    
    return waiter_stats
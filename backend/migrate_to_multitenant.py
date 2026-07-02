"""
Multi-tenant migration script.
Migrates existing data to multi-tenant structure and creates default restaurant with sample data.
"""
import asyncio
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import uuid
import random

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


async def migrate():
    print("Starting multi-tenant migration...")
    print("=" * 60)
    
    # Check if restaurants collection exists and has data
    existing_restaurants = await db.restaurants.count_documents({})
    
    if existing_restaurants == 0:
        print("\n1. Creating default restaurant...")
        
        # Generate unique codes
        pairing_code = f"{random.randint(1000, 9999)}"
        daily_code = "0000"  # Default test code
        
        # Ensure pairing code is unique
        while await db.restaurants.find_one({"code": pairing_code}):
            pairing_code = f"{random.randint(1000, 9999)}"
        
        restaurant_id = f"default-restaurant-{str(uuid.uuid4())[:8]}"
        
        restaurant = {
            "id": restaurant_id,
            "code": pairing_code,
            "name": "Default Restaurant",
            "gunluk_kod": daily_code,
            "abonelik_durumu": "aktif",
            "owner_email": "owner@restaurant.com",
            "owner_phone": "+90 555 123 4567",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        
        await db.restaurants.insert_one(restaurant)
        print(f"[OK] Created default restaurant with ID: {restaurant_id}")
        print(f"  - Pairing code: {pairing_code}")
        print(f"  - Daily code: {daily_code}")
        print(f"  - Owner email: owner@restaurant.com")
    else:
        # Get the first restaurant
        restaurant = await db.restaurants.find_one({})
        restaurant_id = restaurant["id"]
        daily_code = restaurant.get("gunluk_kod", "0000")
        print(f"\n1. Using existing restaurant: {restaurant['name']}")
        print(f"  - ID: {restaurant_id}")
        print(f"  - Daily code: {daily_code}")
    
    # Delete existing categories and items for this restaurant
    print(f"\n2. Preparing sample data...")
    existing_cats_count = await db.categories.count_documents({"restoran_id": restaurant_id})
    existing_items_count = await db.items.count_documents({"restoran_id": restaurant_id})
    
    if existing_cats_count > 0 or existing_items_count > 0:
        print(f"  - Deleting {existing_cats_count} existing categories and {existing_items_count} items...")
        await db.items.delete_many({"restoran_id": restaurant_id})
        await db.categories.delete_many({"restoran_id": restaurant_id})
    
    # Create sample categories and items
    print(f"  Creating sample categories and items...")
    
    # Sample menu data
    categories_data = [
        {
            "name": "İçecekler",
            "items": [
                {"name": "Ayran", "price": 5.0, "description": "Ev yapımı ayran"},
                {"name": "Kola", "price": 8.0, "description": "330ml"},
                {"name": "Su", "price": 3.0, "description": "500ml"},
                {"name": "Çay", "price": 4.0, "description": "Demlik çay"},
            ]
        },
        {
            "name": "Ana Yemekler",
            "items": [
                {"name": "Lahmacun", "price": 25.0, "description": "Kıymalı, ince hamur"},
                {"name": "Adana Kebap", "price": 85.0, "description": "200g, pilav, salata"},
                {"name": "İskender", "price": 95.0, "description": "Döner, ekmek, yoğurt, tereyağı"},
                {"name": "Pide", "price": 65.0, "description": "Kaşarlı, yumurtalı"},
            ]
        },
        {
            "name": "Başlangıçlar",
            "items": [
                {"name": "Mercimek Çorbası", "price": 20.0, "description": "Sıcak, limonlu"},
                {"name": "Domates Çorbası", "price": 20.0, "description": "Sıcak"},
                {"name": "Haydari", "price": 15.0, "description": "Yoğurt, salatalık, sarımsak"},
            ]
        },
        {
            "name": "Tatlılar",
            "items": [
                {"name": "Baklava", "price": 35.0, "description": "Cevizli, 1 dilim"},
                {"name": "Künefe", "price": 45.0, "description": "Peynirli, şerbetli"},
                {"name": "Sütlaç", "price": 25.0, "description": "Fırın sütlaç"},
            ]
        },
    ]
    
    for cat_data in categories_data:
        category_id = str(uuid.uuid4())
        category = {
            "id": category_id,
            "restoran_id": restaurant_id,
            "name": cat_data["name"],
            "sort": categories_data.index(cat_data),
        }
        await db.categories.insert_one(category)
        print(f"  [OK] Created category: {cat_data['name']}")
        
        # Create items for this category
        for idx, item_data in enumerate(cat_data["items"]):
            item = {
                "id": str(uuid.uuid4()),
                "restoran_id": restaurant_id,
                "name": item_data["name"],
                "price": item_data["price"],
                "category_id": category_id,
                "description": item_data["description"],
                "available": True,
            }
            await db.items.insert_one(item)
            print(f"    - {item_data['name']} (${item_data['price']:.2f})")
    
    # Update existing orders with restoran_id if missing
    print(f"\n3. Updating existing orders...")
    orders_without_restaurant = await db.orders.count_documents({"restoran_id": {"$exists": False}})
    
    if orders_without_restaurant > 0:
        result = await db.orders.update_many(
            {"restoran_id": {"$exists": False}},
            {"$set": {"restoran_id": restaurant_id}}
        )
        print(f"  [OK] Updated {result.modified_count} orders with restaurant_id")
    else:
        print(f"  - All orders already have restoran_id")
    
    # Update existing categories with restoran_id if missing
    print(f"\n4. Updating existing categories...")
    cats_without_restaurant = await db.categories.count_documents({"restoran_id": {"$exists": False}})
    
    if cats_without_restaurant > 0:
        result = await db.categories.update_many(
            {"restoran_id": {"$exists": False}},
            {"$set": {"restoran_id": restaurant_id}}
        )
        print(f"  [OK] Updated {result.modified_count} categories with restaurant_id")
    else:
        print(f"  - All categories already have restoran_id")
    
    # Update existing items with restoran_id if missing
    print(f"\n5. Updating existing items...")
    items_without_restaurant = await db.items.count_documents({"restoran_id": {"$exists": False}})
    
    if items_without_restaurant > 0:
        result = await db.items.update_many(
            {"restoran_id": {"$exists": False}},
            {"$set": {"restoran_id": restaurant_id}}
        )
        print(f"  [OK] Updated {result.modified_count} items with restaurant_id")
    else:
        print(f"  - All items already have restoran_id")
    
    print("\n" + "=" * 60)
    print("[OK] Migration completed successfully!")
    print("=" * 60)
    
    # Print summary
    print(f"\nSummary:")
    print(f"  Restaurant ID: {restaurant_id}")
    print(f"  Daily Code: {daily_code}")
    print(f"  Owner Email: owner@restaurant.com")
    
    cats_count = await db.categories.count_documents({"restoran_id": restaurant_id})
    items_count = await db.items.count_documents({"restoran_id": restaurant_id})
    orders_count = await db.orders.count_documents({"restoran_id": restaurant_id})
    
    print(f"  Categories: {cats_count}")
    print(f"  Items: {items_count}")
    print(f"  Orders: {orders_count}")
    
    print(f"\nTest credentials:")
    print(f"  Waiter Login:")
    print(f"    - Nickname: Ahmet")
    print(f"    - Daily Code: {daily_code}")
    print(f"  Admin Login:")
    print(f"    - Email: owner@restaurant.com")
    print(f"    - Password: (set on first login)")
    
    print("\n" + "=" * 60)


if __name__ == "__main__":
    asyncio.run(migrate())
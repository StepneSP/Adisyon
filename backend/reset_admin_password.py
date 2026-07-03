"""
Reset admin password script.
Use this to reset the admin password for owner@restaurant.com
"""
import asyncio
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def reset_admin_password():
    print("Resetting admin password...")
    print("=" * 60)
    
    # List all restaurants for debugging
    all_restaurants = await db.restaurants.find({}).to_list(10)
    print(f"\nFound {len(all_restaurants)} restaurant(s) in database:")
    for r in all_restaurants:
        print(f"  - {r.get('name')}: {r.get('owner_email')}")
    
    # Find restaurant by owner email
    restaurant = await db.restaurants.find_one({"owner_email": "owner@restaurant.com"})
    
    if not restaurant:
        print("\n[ERROR] Restaurant with owner@restaurant.com not found!")
        print("   Checking if any restaurant exists...")
        if all_restaurants:
            print(f"   Using first restaurant: {all_restaurants[0].get('name')}")
            restaurant = all_restaurants[0]
        else:
            print("   No restaurants found. Please run migrate_to_multitenant.py first.")
            return
    
    print(f"\n[OK] Found restaurant: {restaurant['name']}")
    print(f"  - ID: {restaurant['id']}")
    print(f"  - Owner email: {restaurant['owner_email']}")
    
    # Check if password already exists
    existing_hash = restaurant.get("owner_password_hash")
    if existing_hash:
        print(f"\n  Current password hash exists: {existing_hash[:20]}...")
    
    # Set new password
    new_password = "admin123"
    new_hash = pwd_context.hash(new_password)
    
    await db.restaurants.update_one(
        {"id": restaurant["id"]},
        {"$set": {
            "owner_password_hash": new_hash,
            "owner_email": "owner@restaurant.com"
        }}
    )
    
    print(f"\n[OK] Password reset successful!")
    print(f"  - New password: {new_password}")
    print(f"  - New hash: {new_hash[:20]}...")
    
    # Verify the password works
    print(f"\nVerifying password...")
    is_valid = pwd_context.verify(new_password, new_hash)
    print(f"  - Password verification: {'PASS' if is_valid else 'FAIL'}")
    
    print("\n" + "=" * 60)
    print("You can now login with:")
    print("  Email: owner@restaurant.com")
    print("  Password: admin123")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(reset_admin_password())
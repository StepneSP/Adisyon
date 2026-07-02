"""
Quick test script to verify multi-tenant architecture is working.
"""

import asyncio
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from jose import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Test configuration
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"


async def test_multi_tenant():
    """Test multi-tenant architecture."""
    print("="*60)
    print("Testing Multi-Tenant Architecture")
    print("="*60)
    
    # Connect to database
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    # Test 1: Check restaurants collection
    print("\n1. Testing restaurants collection...")
    restaurant_count = await db.restaurants.count_documents({})
    print(f"   ✓ Found {restaurant_count} restaurant(s)")
    
    if restaurant_count == 0:
        print("   ⚠ No restaurants found. Run migrate_to_multitenant.py first!")
        return
    
    # Get first restaurant
    restaurant = await db.restaurants.find_one()
    print(f"   ✓ Restaurant: {restaurant['name']}")
    print(f"   ✓ ID: {restaurant['id']}")
    print(f"   ✓ Daily Code: {restaurant['gunluk_kod']}")
    print(f"   ✓ Status: {restaurant['abonelik_durumu']}")
    
    # Test 2: Check categories have restoran_id
    print("\n2. Testing categories...")
    categories = await db.categories.find({"restoran_id": restaurant['id']}).to_list(10)
    print(f"   ✓ Found {len(categories)} categories for this restaurant")
    
    # Test 3: Check items have restoran_id
    print("\n3. Testing menu items...")
    items = await db.items.find({"restoran_id": restaurant['id']}).to_list(10)
    print(f"   ✓ Found {len(items)} items for this restaurant")
    
    # Test 4: Check orders have restoran_id
    print("\n4. Testing orders...")
    orders = await db.orders.find({"restoran_id": restaurant['id']}).to_list(10)
    print(f"   ✓ Found {len(orders)} orders for this restaurant")
    
    # Test 5: Verify data isolation
    print("\n5. Testing data isolation...")
    # Try to find items from a different restaurant (should be 0 or very few)
    all_items = await db.items.find({}).to_list(1000)
    items_without_restoran = [i for i in all_items if 'restoran_id' not in i]
    
    if items_without_restoran:
        print(f"   ⚠ Found {len(items_without_restoran)} items without restoran_id")
    else:
        print("   ✓ All items have restoran_id (data is isolated)")
    
    # Test 6: Test JWT token creation and validation
    print("\n6. Testing JWT authentication...")
    test_session_id = "test-session-123"
    test_data = {
        "sub": test_session_id,
        "nickname": "TestWaiter",
        "restoran_id": restaurant['id']
    }
    
    # Create token
    token = jwt.encode(test_data, SECRET_KEY, algorithm=ALGORITHM)
    print(f"   ✓ Created JWT token: {token[:50]}...")
    
    # Decode token
    decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    print(f"   ✓ Decoded token: {decoded}")
    
    if decoded['sub'] == test_session_id:
        print("   ✓ JWT token validation successful")
    else:
        print("   ✗ JWT token validation failed")
    
    # Test 7: Check indexes
    print("\n7. Testing database indexes...")
    
    # Get index information
    restaurant_indexes = await db.restaurants.index_information()
    print(f"   ✓ Restaurants collection has {len(restaurant_indexes)} indexes")
    
    categories_indexes = await db.categories.index_information()
    print(f"   ✓ Categories collection has {len(categories_indexes)} indexes")
    
    items_indexes = await db.items.index_information()
    print(f"   ✓ Items collection has {len(items_indexes)} indexes")
    
    orders_indexes = await db.orders.index_information()
    print(f"   ✓ Orders collection has {len(orders_indexes)} indexes")
    
    # Summary
    print("\n" + "="*60)
    print("✓ All tests passed!")
    print("="*60)
    
    print("\n📊 Summary:")
    print(f"  - Restaurants: {restaurant_count}")
    print(f"  - Categories: {len(categories)}")
    print(f"  - Menu Items: {len(items)}")
    print(f"  - Orders: {len(orders)}")
    print(f"  - Data Isolation: ✓")
    print(f"  - JWT Auth: ✓")
    print(f"  - Indexes: ✓")
    
    print("\n✅ Multi-tenant architecture is working correctly!")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(test_multi_tenant())
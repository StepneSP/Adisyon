

Database and configuration setup.
This module provides shared database connection and JWT configuration
to avoid circular imports between server.py and admin_routes.py.
"""
from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from dotenv import load_dotenv
import os
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection (lazy initialization)
mongo_url = os.environ['MONGO_URL']
client = None
db = None


def get_database():
    """Get or create database connection."""
    global client, db
    if db is None:
        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
        db = client[os.environ['DB_NAME']]
    return db

# JWT Settings
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12  # 12 hours (shift length)


# Dependency for getting database
async def get_db() -> AsyncIOMotorDatabase:
    """Dependency to get database instance."""
    return get_database()

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from backend directory
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
DEVICE_ID = os.getenv("DEVICE_ID", "esp32-park-01")
DEVICE_TOKEN = os.getenv("DEVICE_TOKEN", "dev-park-secret-token-2026")
DATABASE_PATH = os.getenv("DATABASE_PATH", str(BASE_DIR / "park_assist.db"))
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,*").split(",")]
DEBUG = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")

# Firebase Configuration
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
FIREBASE_CREDENTIALS_PATH = os.getenv("FIREBASE_CREDENTIALS_PATH", "")
FIREBASE_CREDENTIALS_JSON = os.getenv("FIREBASE_CREDENTIALS_JSON", "")
FIREBASE_DATABASE_URL = os.getenv("FIREBASE_DATABASE_URL", "")
USE_FIREBASE = (
    os.getenv("USE_FIREBASE", "").lower() in ("true", "1", "yes")
    or bool(FIREBASE_PROJECT_ID or FIREBASE_CREDENTIALS_PATH or FIREBASE_CREDENTIALS_JSON)
)

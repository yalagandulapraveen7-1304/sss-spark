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
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")]
DEBUG = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")

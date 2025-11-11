# config.py
import os
from pathlib import Path

BASE_DIR = Path(__file__).parent

# Environment
ENV = os.environ.get("HMS_ENV", "development")
DEBUG = ENV == "development"

# SQLite by default (hms.db in the same folder)
DATABASE_URL = os.environ.get("HMS_DATABASE_URL") or f"sqlite:///{BASE_DIR / 'hms.db'}"

HOST = os.environ.get("HMS_HOST", "0.0.0.0")
PORT = int(os.environ.get("HMS_PORT", 8000))

import sqlite3
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from .config import DATABASE_PATH

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Enable WAL mode for concurrent read/write performance
    cursor.execute("PRAGMA journal_mode=WAL;")

    # Table: Sensor Telemetry Readings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        received_at TEXT NOT NULL,
        sensor_raw REAL NOT NULL,
        reference_raw REAL NOT NULL,
        offset REAL NOT NULL,
        sensor_corrected REAL NOT NULL,
        residual REAL NOT NULL,
        residual_abs REAL NOT NULL,
        cal_state TEXT NOT NULL,
        cal_result TEXT NOT NULL,
        led_state INTEGER NOT NULL,
        sequence_num INTEGER DEFAULT 0
    );
    """)

    # Indices for fast time-series queries
    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_readings_device_time 
    ON readings (device_id, timestamp_ms);
    """)
    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_readings_received_at 
    ON readings (received_at);
    """)

    # Table: Calibration Events (Initial + Dynamic Corrections)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS calibration_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        received_at TEXT NOT NULL,
        old_offset REAL NOT NULL,
        new_offset REAL NOT NULL,
        residual_avg REAL NOT NULL,
        residual_spread REAL NOT NULL,
        status TEXT NOT NULL,
        notes TEXT NOT NULL
    );
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_cal_events_time 
    ON calibration_events (device_id, timestamp_ms);
    """)

    # Table: Device Status / Registry
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS device_state (
        device_id TEXT PRIMARY KEY,
        registered_at TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        last_timestamp_ms INTEGER NOT NULL,
        cal_state TEXT NOT NULL,
        current_offset REAL NOT NULL,
        led_state INTEGER NOT NULL
    );
    """)

    conn.commit()
    conn.close()

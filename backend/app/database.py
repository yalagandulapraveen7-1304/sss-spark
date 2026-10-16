import os
import json
import sqlite3
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple

from .config import (
    DATABASE_PATH,
    USE_FIREBASE,
    FIREBASE_PROJECT_ID,
    FIREBASE_CREDENTIALS_PATH,
    FIREBASE_CREDENTIALS_JSON,
    FIREBASE_DATABASE_URL
)

# Firebase Globals
_firestore_db = None
_firebase_initialized = False
_db_type = "sqlite3"

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_db_type() -> str:
    global _db_type
    return _db_type

def init_db():
    global _firestore_db, _firebase_initialized, _db_type

    # 1. Initialize SQLite tables as baseline local storage
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")

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

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_readings_device_time 
    ON readings (device_id, timestamp_ms);
    """)
    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_readings_received_at 
    ON readings (received_at);
    """)

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

    # 2. Initialize Firebase if enabled or credentials present
    if USE_FIREBASE:
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore

            if not firebase_admin._apps:
                cred = None
                if FIREBASE_CREDENTIALS_PATH and os.path.exists(FIREBASE_CREDENTIALS_PATH):
                    cred = credentials.Certificate(FIREBASE_CREDENTIALS_PATH)
                elif FIREBASE_CREDENTIALS_JSON:
                    cred_dict = json.loads(FIREBASE_CREDENTIALS_JSON)
                    cred = credentials.Certificate(cred_dict)
                elif FIREBASE_PROJECT_ID:
                    cred = credentials.ApplicationDefault()

                options = {}
                if FIREBASE_DATABASE_URL:
                    options["databaseURL"] = FIREBASE_DATABASE_URL
                if FIREBASE_PROJECT_ID:
                    options["projectId"] = FIREBASE_PROJECT_ID

                if cred:
                    firebase_admin.initialize_app(cred, options)
                else:
                    firebase_admin.initialize_app(options=options)

            _firestore_db = firestore.client()
            _firebase_initialized = True
            _db_type = "Firebase Firestore"
            print(f"[Database] Successfully connected to Firebase Firestore (Project: {FIREBASE_PROJECT_ID or 'default'})")
        except Exception as e:
            print(f"[Database] Warning: Could not initialize Firebase ({e}). Using local SQLite3.")
            _db_type = "sqlite3"
    else:
        _db_type = "sqlite3"
        print("[Database] Using local SQLite3 storage.")

# ---------------------------------------------------------------------------
# Data Access Methods (Unified for SQLite and Firebase)
# ---------------------------------------------------------------------------

def insert_reading(data: Dict[str, Any]) -> int:
    """Insert telemetry reading into database (SQLite and Firebase Firestore)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check max sequence number for this device and timestamp
    cursor.execute("""
        SELECT COALESCE(MAX(sequence_num), -1) AS max_seq
        FROM readings
        WHERE device_id = ? AND timestamp_ms = ?
    """, (data["device_id"], data["timestamp_ms"]))
    row = cursor.fetchone()
    seq_num = row["max_seq"] + 1

    cursor.execute("""
        INSERT INTO readings (
            device_id, timestamp_ms, received_at, sensor_raw, reference_raw,
            offset, sensor_corrected, residual, residual_abs,
            cal_state, cal_result, led_state, sequence_num
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data["device_id"], data["timestamp_ms"], data["received_at"],
        data["sensor_raw"], data["reference_raw"], data["offset"],
        data["sensor_corrected"], data["residual"], data["residual_abs"],
        data["cal_state"], data["cal_result"], data["led_state"], seq_num
    ))
    reading_id = cursor.lastrowid
    conn.commit()
    conn.close()

    # Sync to Firebase Firestore if active
    if _firebase_initialized and _firestore_db:
        try:
            doc_data = {**data, "id": reading_id, "sequence_num": seq_num}
            _firestore_db.collection("readings").document(f"{data['device_id']}_{reading_id}").set(doc_data)
        except Exception as e:
            print(f"[Firebase] Error saving reading: {e}")

    return reading_id, seq_num

def insert_calibration_event(data: Dict[str, Any]):
    """Insert calibration ledger event (SQLite and Firebase Firestore)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO calibration_events (
            device_id, event_type, timestamp_ms, received_at,
            old_offset, new_offset, residual_avg, residual_spread, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data["device_id"], data["event_type"], data["timestamp_ms"], data["received_at"],
        data["old_offset"], data["new_offset"], data["residual_avg"], data["residual_spread"],
        data["status"], data["notes"]
    ))
    event_id = cursor.lastrowid
    conn.commit()
    conn.close()

    if _firebase_initialized and _firestore_db:
        try:
            doc_data = {**data, "id": event_id}
            _firestore_db.collection("calibration_events").add(doc_data)
        except Exception as e:
            print(f"[Firebase] Error saving calibration event: {e}")

def upsert_device_state(data: Dict[str, Any]):
    """Update or insert device state registry."""
    now_iso = datetime.now(timezone.utc).isoformat()
    device_data = dict(data)
    device_data.setdefault("registered_at", now_iso)
    device_data.setdefault("last_seen", now_iso)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO device_state (
            device_id, registered_at, last_seen, last_timestamp_ms, cal_state, current_offset, led_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
            last_seen = excluded.last_seen,
            last_timestamp_ms = excluded.last_timestamp_ms,
            cal_state = excluded.cal_state,
            current_offset = excluded.current_offset,
            led_state = excluded.led_state
    """, (
        device_data["device_id"], device_data["registered_at"], device_data["last_seen"],
        device_data["last_timestamp_ms"], device_data["cal_state"], device_data["current_offset"],
        device_data["led_state"]
    ))
    conn.commit()
    conn.close()

    if _firebase_initialized and _firestore_db:
        try:
            _firestore_db.collection("device_state").document(device_data["device_id"]).set(device_data)
        except Exception as e:
            print(f"[Firebase] Error updating device state: {e}")

def get_device_state(device_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve device state (reads from Firebase Firestore if available, falls back to SQLite)."""
    if _firebase_initialized and _firestore_db:
        try:
            doc = _firestore_db.collection("device_state").document(device_id).get()
            if doc.exists:
                return doc.to_dict()
        except Exception as e:
            print(f"[Firebase] Error reading device state: {e}")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT device_id, last_seen, last_timestamp_ms, cal_state, current_offset, led_state
        FROM device_state WHERE device_id = ?
    """, (device_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def get_readings_history(
    device_id: str,
    start_time: Optional[str],
    end_time: Optional[str],
    page: int,
    limit: int
) -> Tuple[int, List[Dict[str, Any]]]:
    """Retrieve paginated reading history."""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM readings WHERE device_id = ?"
    params: List[Any] = [device_id]

    if start_time:
        query += " AND received_at >= ?"
        params.append(start_time)
    if end_time:
        query += " AND received_at <= ?"
        params.append(end_time)

    count_query = query.replace("SELECT *", "SELECT COUNT(*)", 1)
    cursor.execute(count_query, params)
    total_count = cursor.fetchone()[0]

    query += " ORDER BY received_at DESC LIMIT ? OFFSET ?"
    offset = (page - 1) * limit
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    items = [dict(r) for r in rows]
    return total_count, items

def get_calibration_events(device_id: str, limit: int) -> Tuple[int, List[Dict[str, Any]]]:
    """Retrieve calibration events history."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM calibration_events WHERE device_id = ?", (device_id,))
    total_count = cursor.fetchone()[0]

    cursor.execute("""
        SELECT * FROM calibration_events 
        WHERE device_id = ? 
        ORDER BY received_at DESC 
        LIMIT ?
    """, (device_id, limit))
    rows = cursor.fetchall()
    conn.close()

    items = [dict(r) for r in rows]
    return total_count, items

def export_readings(device_id: str) -> List[Dict[str, Any]]:
    """Export all readings for CSV."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, device_id, timestamp_ms, received_at, sensor_raw, reference_raw,
               offset, sensor_corrected, residual, residual_abs, cal_state, cal_result, led_state
        FROM readings
        WHERE device_id = ?
        ORDER BY timestamp_ms ASC
    """, (device_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def export_calibration_events(device_id: str) -> List[Dict[str, Any]]:
    """Export all calibration events for CSV."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, device_id, event_type, timestamp_ms, received_at,
               old_offset, new_offset, residual_avg, residual_spread, status, notes
        FROM calibration_events
        WHERE device_id = ?
        ORDER BY timestamp_ms ASC
    """, (device_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

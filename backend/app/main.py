import io
import csv
import json
import sqlite3
from datetime import datetime, timezone
from typing import List, Optional, Set
from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect, Query, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import (
    DEVICE_ID,
    DEVICE_TOKEN,
    CORS_ORIGINS,
    DEBUG
)
from .database import (
    get_db_connection,
    init_db,
    get_db_type,
    insert_reading,
    insert_calibration_event,
    upsert_device_state,
    get_device_state,
    get_readings_history as db_get_readings_history,
    get_calibration_events as db_get_calibration_events,
    export_readings as db_export_readings,
    export_calibration_events as db_export_calibration_events,
)
from .schemas import (
    TelemetryPayload,
    ReadingItem,
    ReadingHistoryResponse,
    CalibrationEventItem,
    CalibrationHistoryResponse,
    DeviceStatusResponse,
    HealthResponse,
)

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(
    title="Park-Assist Sensor Educational Telemetry Service",
    description="Educational model of reverse-parking & park-assist sensor calibration, monitoring, and telemetry.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket Live Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict):
        dead_connections = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.add(connection)
        for dead in dead_connections:
            self.active_connections.discard(dead)

manager = ConnectionManager()

# Authentication dependency for ingestion
async def verify_device_token(x_device_token: Optional[str] = Header(None, alias="X-Device-Token")):
    if not x_device_token or x_device_token != DEVICE_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Device-Token header."
        )
    return x_device_token

def generate_status_explanation(cal_state: str, offset: float, residual: float, led_state: int) -> str:
    """Generate plain-language automotive park-assist explanation."""
    if cal_state == "CALIBRATING":
        return "Reverse gear engaged. Controller is sampling baseline distance to establish zero-point reference."
    elif cal_state == "FAILED":
        return "Sensor check failed: excessive variance or implausible offset detected. Park assist degraded."
    elif cal_state == "CALIBRATED":
        if abs(residual) <= 1.0:
            return "Park assist operating normally. Sensor and reference are in agreement (zero residual, Green LED ON)."
        elif abs(residual) <= 3.0:
            return "Minor signal variation detected. Reading is within normal operating tolerance."
        elif abs(residual) <= 15.0:
            return "Noticeable obstacle discrepancy or sensor drift detected. Residual buffer monitoring stability."
        else:
            return "Significant obstacle distance mismatch detected. Close proximity or physical scene change."
    return "Park assist system initializing."

# ----------------------------------------------------
# 1. HEALTH ENDPOINT
# ----------------------------------------------------
@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check():
    return HealthResponse(
        status="ok",
        version="1.0.0",
        database=get_db_type(),
        timestamp=datetime.now(timezone.utc).isoformat()
    )

# ----------------------------------------------------
# 2. DEVICE STATUS ENDPOINT
# ----------------------------------------------------
@app.get("/api/v1/device", response_model=DeviceStatusResponse, tags=["Device"])
def get_device_status(device_id: str = DEVICE_ID):
    row = get_device_state(device_id)

    if not row:
        return DeviceStatusResponse(
            device_id=device_id,
            connected=False,
            last_seen=None,
            last_timestamp_ms=None,
            cal_state="NOT_CALIBRATED",
            current_offset=0.0,
            led_state=0,
            explanation="No telemetry received yet. Start the ESP32 simulation or mock feeder."
        )

    # Check connection liveness: consider connected if last seen within 10 seconds
    last_seen_dt = datetime.fromisoformat(row["last_seen"])
    now_dt = datetime.now(timezone.utc)
    seconds_ago = (now_dt - last_seen_dt).total_seconds()
    is_connected = seconds_ago < 10.0

    explanation = generate_status_explanation(
        row["cal_state"], row["current_offset"], 0.0, row["led_state"]
    )
    if not is_connected:
        explanation = f"Simulator disconnected ({int(seconds_ago)}s ago). Displaying last known state."

    return DeviceStatusResponse(
        device_id=row["device_id"],
        connected=is_connected,
        last_seen=row["last_seen"],
        last_timestamp_ms=row["last_timestamp_ms"],
        cal_state=row["cal_state"],
        current_offset=row["current_offset"],
        led_state=row["led_state"],
        explanation=explanation
    )

# ----------------------------------------------------
# 3. TELEMETRY INGESTION ENDPOINT
# ----------------------------------------------------
@app.post("/api/v1/telemetry", tags=["Telemetry"])
async def ingest_telemetry(
    payload: TelemetryPayload,
    token: str = Depends(verify_device_token)
):
    now_iso = datetime.now(timezone.utc).isoformat()
    residual_abs = abs(payload.residual)

    # Insert reading record via database abstraction (SQLite + Firebase)
    reading_data = {
        "device_id": payload.device_id,
        "timestamp_ms": payload.timestamp_ms,
        "received_at": now_iso,
        "sensor_raw": payload.sensor_raw,
        "reference_raw": payload.reference_raw,
        "offset": payload.offset,
        "sensor_corrected": payload.sensor_corrected,
        "residual": payload.residual,
        "residual_abs": residual_abs,
        "cal_state": payload.cal_state,
        "cal_result": payload.cal_result,
        "led_state": payload.led_state
    }
    reading_id, seq_num = insert_reading(reading_data)

    # If an embedded calibration event occurred, persist it
    if payload.calibration_event:
        ce = payload.calibration_event
        event_data = {
            "device_id": payload.device_id,
            "event_type": ce.event_type,
            "timestamp_ms": payload.timestamp_ms,
            "received_at": now_iso,
            "old_offset": ce.old_offset,
            "new_offset": ce.new_offset,
            "residual_avg": ce.residual_avg,
            "residual_spread": ce.residual_spread,
            "status": ce.status,
            "notes": ce.notes
        }
        insert_calibration_event(event_data)

    # Update or insert device_state
    device_data = {
        "device_id": payload.device_id,
        "registered_at": now_iso,
        "last_seen": now_iso,
        "last_timestamp_ms": payload.timestamp_ms,
        "cal_state": payload.cal_state,
        "current_offset": payload.offset,
        "led_state": payload.led_state
    }
    upsert_device_state(device_data)

    # Broadcast live update to all connected WebSocket clients
    broadcast_data = {
        "type": "telemetry",
        "reading": {
            "id": reading_id,
            "device_id": payload.device_id,
            "timestamp_ms": payload.timestamp_ms,
            "received_at": now_iso,
            "sensor_raw": round(payload.sensor_raw, 2),
            "reference_raw": round(payload.reference_raw, 2),
            "offset": round(payload.offset, 2),
            "sensor_corrected": round(payload.sensor_corrected, 2),
            "residual": round(payload.residual, 2),
            "residual_abs": round(residual_abs, 2),
            "cal_state": payload.cal_state,
            "cal_result": payload.cal_result,
            "led_state": payload.led_state,
            "sequence_num": seq_num
        },
        "device": {
            "connected": True,
            "cal_state": payload.cal_state,
            "current_offset": round(payload.offset, 2),
            "led_state": payload.led_state,
            "explanation": generate_status_explanation(
                payload.cal_state, payload.offset, payload.residual, payload.led_state
            )
        }
    }
    if payload.calibration_event:
        broadcast_data["calibration_event"] = payload.calibration_event.model_dump()

    await manager.broadcast(broadcast_data)

    return {"status": "ok", "reading_id": reading_id, "sequence_num": seq_num}

# ----------------------------------------------------
# 4. READINGS HISTORY ENDPOINT
# ----------------------------------------------------
@app.get("/api/v1/readings", response_model=ReadingHistoryResponse, tags=["History"])
def get_readings_history(
    device_id: str = DEVICE_ID,
    start_time: Optional[str] = Query(None, description="ISO8601 start time"),
    end_time: Optional[str] = Query(None, description="ISO8601 end time"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500)
):
    total_count, rows = db_get_readings_history(device_id, start_time, end_time, page, limit)
    items = [
        ReadingItem(
            id=r["id"],
            device_id=r["device_id"],
            timestamp_ms=r["timestamp_ms"],
            received_at=r["received_at"],
            sensor_raw=r["sensor_raw"],
            reference_raw=r["reference_raw"],
            offset=r["offset"],
            sensor_corrected=r["sensor_corrected"],
            residual=r["residual"],
            residual_abs=r["residual_abs"],
            cal_state=r["cal_state"],
            cal_result=r["cal_result"],
            led_state=r["led_state"],
            sequence_num=r["sequence_num"]
        ) for r in rows
    ]

    return ReadingHistoryResponse(
        total_count=total_count,
        page=page,
        limit=limit,
        items=items
    )

# ----------------------------------------------------
# 5. CALIBRATION EVENTS ENDPOINT
# ----------------------------------------------------
@app.get("/api/v1/calibration-events", response_model=CalibrationHistoryResponse, tags=["History"])
def get_calibration_events(
    device_id: str = DEVICE_ID,
    limit: int = Query(50, ge=1, le=200)
):
    total_count, rows = db_get_calibration_events(device_id, limit)
    items = [
        CalibrationEventItem(
            id=r["id"],
            device_id=r["device_id"],
            event_type=r["event_type"],
            timestamp_ms=r["timestamp_ms"],
            received_at=r["received_at"],
            old_offset=r["old_offset"],
            new_offset=r["new_offset"],
            residual_avg=r["residual_avg"],
            residual_spread=r["residual_spread"],
            status=r["status"],
            notes=r["notes"]
        ) for r in rows
    ]

    return CalibrationHistoryResponse(total_count=total_count, items=items)

# ----------------------------------------------------
# 6. CSV EXPORT ENDPOINTS
# ----------------------------------------------------
@app.get("/api/v1/export/readings.csv", tags=["Export"])
def export_readings_csv(device_id: str = DEVICE_ID):
    rows = db_export_readings(device_id)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "device_id", "timestamp_ms", "received_at",
        "sensor_raw", "reference_raw", "offset", "sensor_corrected",
        "residual", "residual_abs", "cal_state", "cal_result", "led_state"
    ])
    for r in rows:
        writer.writerow([
            r["id"], r["device_id"], r["timestamp_ms"], r["received_at"],
            f"{r['sensor_raw']:.2f}", f"{r['reference_raw']:.2f}",
            f"{r['offset']:.2f}", f"{r['sensor_corrected']:.2f}",
            f"{r['residual']:.2f}", f"{r['residual_abs']:.2f}",
            r["cal_state"], r["cal_result"], r["led_state"]
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=park_assist_readings_{device_id}.csv"}
    )

@app.get("/api/v1/export/calibration-events.csv", tags=["Export"])
def export_calibration_events_csv(device_id: str = DEVICE_ID):
    rows = db_export_calibration_events(device_id)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "device_id", "event_type", "timestamp_ms", "received_at",
        "old_offset", "new_offset", "residual_avg", "residual_spread", "status", "notes"
    ])
    for r in rows:
        writer.writerow([
            r["id"], r["device_id"], r["event_type"], r["timestamp_ms"], r["received_at"],
            f"{r['old_offset']:.2f}", f"{r['new_offset']:.2f}",
            f"{r['residual_avg']:.2f}", f"{r['residual_spread']:.2f}",
            r["status"], r["notes"]
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=park_assist_calibration_events_{device_id}.csv"}
    )

# ----------------------------------------------------
# 7. WEBSOCKET REAL-TIME ENDPOINT
# ----------------------------------------------------
@app.websocket("/api/v1/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial device state on connection
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM device_state WHERE device_id = ?", (DEVICE_ID,))
        row = cursor.fetchone()

        # Fetch last 30 readings for initial chart population
        cursor.execute("""
            SELECT * FROM readings 
            WHERE device_id = ? 
            ORDER BY timestamp_ms DESC LIMIT 30
        """, (DEVICE_ID,))
        recent_rows = cursor.fetchall()
        conn.close()

        recent_readings = [
            {
                "id": r["id"],
                "device_id": r["device_id"],
                "timestamp_ms": r["timestamp_ms"],
                "received_at": r["received_at"],
                "sensor_raw": round(r["sensor_raw"], 2),
                "reference_raw": round(r["reference_raw"], 2),
                "offset": round(r["offset"], 2),
                "sensor_corrected": round(r["sensor_corrected"], 2),
                "residual": round(r["residual"], 2),
                "residual_abs": round(r["residual_abs"], 2),
                "cal_state": r["cal_state"],
                "cal_result": r["cal_result"],
                "led_state": r["led_state"],
                "sequence_num": r["sequence_num"]
            }
            for r in reversed(recent_rows)
        ]

        init_payload = {
            "type": "init",
            "device": {
                "device_id": DEVICE_ID,
                "connected": row is not None,
                "cal_state": row["cal_state"] if row else "NOT_CALIBRATED",
                "current_offset": round(row["current_offset"], 2) if row else 0.0,
                "led_state": row["led_state"] if row else 0,
                "explanation": generate_status_explanation(
                    row["cal_state"] if row else "NOT_CALIBRATED",
                    row["current_offset"] if row else 0.0,
                    0.0,
                    row["led_state"] if row else 0
                )
            },
            "recent_readings": recent_readings
        }
        await websocket.send_json(init_payload)

        # Keep connection open to listen for client pings or queries
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# ----------------------------------------------------
# 8. FRONTEND STATIC ASSETS MOUNT (FOR RENDER DEPLOYMENT)
# ----------------------------------------------------
from fastapi.staticfiles import StaticFiles
from pathlib import Path

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")


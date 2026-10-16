import os
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import DEVICE_TOKEN, DEVICE_ID
from app.database import init_db

client = TestClient(app)

def setup_module():
    init_db()

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "sqlite3"

def test_telemetry_unauthorized():
    payload = {
        "version": 1,
        "device_id": DEVICE_ID,
        "timestamp_ms": 1000,
        "sensor_raw": 55.0,
        "reference_raw": 50.0,
        "offset": 5.0,
        "sensor_corrected": 50.0,
        "residual": 0.0,
        "cal_state": "CALIBRATED",
        "cal_result": "STABLE",
        "led_state": 1
    }
    # No header
    resp = client.post("/api/v1/telemetry", json=payload)
    assert resp.status_code == 401

    # Wrong header
    resp = client.post("/api/v1/telemetry", json=payload, headers={"X-Device-Token": "wrong-token"})
    assert resp.status_code == 401

def test_telemetry_ingest_and_read():
    payload = {
        "version": 1,
        "device_id": DEVICE_ID,
        "timestamp_ms": 2000,
        "sensor_raw": 54.5,
        "reference_raw": 49.5,
        "offset": 5.0,
        "sensor_corrected": 49.5,
        "residual": 0.0,
        "cal_state": "CALIBRATED",
        "cal_result": "STABLE",
        "led_state": 1,
        "calibration_event": {
            "event_type": "INITIAL_STARTUP",
            "old_offset": 0.0,
            "new_offset": 5.0,
            "residual_avg": 0.0,
            "residual_spread": 0.2,
            "status": "PASSED",
            "notes": "Startup calibration passed 16-sample stability check."
        }
    }
    resp = client.post(
        "/api/v1/telemetry",
        json=payload,
        headers={"X-Device-Token": DEVICE_TOKEN}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "reading_id" in data

    # Verify device state updated
    dev_resp = client.get("/api/v1/device")
    assert dev_resp.status_code == 200
    dev_data = dev_resp.json()
    assert dev_data["connected"] is True
    assert dev_data["current_offset"] == 5.0
    assert dev_data["led_state"] == 1

    # Verify readings history
    readings_resp = client.get(f"/api/v1/readings?device_id={DEVICE_ID}")
    assert readings_resp.status_code == 200
    readings_data = readings_resp.json()
    assert readings_data["total_count"] >= 1
    assert readings_data["items"][0]["sensor_raw"] == 54.5

    # Verify calibration events
    cal_resp = client.get(f"/api/v1/calibration-events?device_id={DEVICE_ID}")
    assert cal_resp.status_code == 200
    cal_data = cal_resp.json()
    assert cal_data["total_count"] >= 1
    assert cal_data["items"][0]["event_type"] == "INITIAL_STARTUP"

def test_duplicate_timestamp_handling():
    # Sending same timestamp_ms twice must be accepted and given distinct sequence_num
    payload1 = {
        "version": 1,
        "device_id": DEVICE_ID,
        "timestamp_ms": 3000,
        "sensor_raw": 60.0,
        "reference_raw": 55.0,
        "offset": 5.0,
        "sensor_corrected": 55.0,
        "residual": 0.0,
        "cal_state": "CALIBRATED",
        "cal_result": "STABLE",
        "led_state": 1
    }
    resp1 = client.post("/api/v1/telemetry", json=payload1, headers={"X-Device-Token": DEVICE_TOKEN})
    assert resp1.status_code == 200
    seq1 = resp1.json()["sequence_num"]

    payload2 = {
        "version": 1,
        "device_id": DEVICE_ID,
        "timestamp_ms": 3000,  # Duplicate timestamp
        "sensor_raw": 61.0,
        "reference_raw": 55.0,
        "offset": 5.0,
        "sensor_corrected": 56.0,
        "residual": 1.0,
        "cal_state": "CALIBRATED",
        "cal_result": "STABLE",
        "led_state": 1
    }
    resp2 = client.post("/api/v1/telemetry", json=payload2, headers={"X-Device-Token": DEVICE_TOKEN})
    assert resp2.status_code == 200
    seq2 = resp2.json()["sequence_num"]

    assert seq2 > seq1

def test_csv_export():
    r_resp = client.get(f"/api/v1/export/readings.csv?device_id={DEVICE_ID}")
    assert r_resp.status_code == 200
    assert "text/csv" in r_resp.headers["content-type"]
    assert "sensor_raw,reference_raw" in r_resp.text

    c_resp = client.get(f"/api/v1/export/calibration-events.csv?device_id={DEVICE_ID}")
    assert c_resp.status_code == 200
    assert "text/csv" in c_resp.headers["content-type"]
    assert "old_offset,new_offset" in c_resp.text

if __name__ == "__main__":
    pytest.main(["-v", __file__])

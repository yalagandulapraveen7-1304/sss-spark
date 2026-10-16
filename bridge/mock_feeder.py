#!/usr/bin/env python3
"""
Mock ESP32 Telemetry Feeder for Park-Assist Dashboard Testing
=============================================================
Sends realistic educational scenarios directly to the FastAPI backend
without needing a physical ESP32 or running Wokwi simulator.

Scenarios simulated:
  1. Vehicle enters reverse -> 16-sample startup calibration
  2. Normal reversing maneuver -> stable zero-residual operation
  3. Sensor thermal drift -> residual > 3.0, triggers 16-sample stability check
  4. Automatic dynamic offset adaptation -> adaptation applied, offset updated
  5. Unstable scene / moving pedestrian -> spread > 1.0, adaptation rejected
  6. Real obstacle detection -> simulated vehicle approaching curb
"""

import os
import time
import json
import random
import argparse
import urllib.request
import urllib.error

DEFAULT_BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000/api/v1/telemetry")
DEFAULT_DEVICE_TOKEN = os.getenv("DEVICE_TOKEN", "dev-park-secret-token-2026")
DEFAULT_DEVICE_ID = os.getenv("DEVICE_ID", "esp32-park-01")

def send_payload(url: str, token: str, payload: dict) -> bool:
    headers = {
        "Content-Type": "application/json",
        "X-Device-Token": token,
        "User-Agent": "Mock-Feeder/1.0"
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"[Feeder Error] {e}")
        return False

def run_simulation(url: str, token: str, device_id: str, cycles: int = 200, interval_sec: float = 0.25):
    print("==========================================================")
    print("PARK-ASSIST MOCK TELEMETRY FEEDER")
    print(f"Target: {url} | Device: {device_id}")
    print("==========================================================")

    millis = 1000
    current_offset = 0.0
    cal_state = "CALIBRATING"

    # Step 1: Startup Calibration (16 paired samples)
    print("\n[Scenario 1] Vehicle Enters Reverse: 16-sample startup calibration...")
    sensor_samples = []
    ref_samples = []
    base_ref = 50.0  # Normalized reference distance (~50% scale, ~1.5m)
    sensor_bias = 5.2 # Physical mounting offset / bias

    for i in range(16):
        millis += 50
        s = base_ref + sensor_bias + random.uniform(-0.15, 0.15)
        r = base_ref + random.uniform(-0.15, 0.15)
        sensor_samples.append(s)
        ref_samples.append(r)

        payload = {
            "version": 1,
            "device_id": device_id,
            "timestamp_ms": millis,
            "sensor_raw": round(s, 2),
            "reference_raw": round(r, 2),
            "offset": round(current_offset, 2),
            "sensor_corrected": round(s - current_offset, 2),
            "residual": round((s - current_offset) - r, 2),
            "cal_state": "CALIBRATING",
            "cal_result": "NONE",
            "led_state": 0
        }
        send_payload(url, token, payload)
        time.sleep(0.05)

    # Compute initial offset
    current_offset = (sum(sensor_samples) / 16.0) - (sum(ref_samples) / 16.0)
    cal_state = "CALIBRATED"
    print(f"[Scenario 1 OK] Initial calibration offset computed: {current_offset:.2f}")

    millis += 100
    # Send calibration completion event
    startup_event = {
        "event_type": "INITIAL_STARTUP",
        "old_offset": 0.0,
        "new_offset": round(current_offset, 2),
        "residual_avg": 0.0,
        "residual_spread": 0.3,
        "status": "PASSED",
        "notes": "Startup calibration passed 16-sample stability check."
    }
    payload = {
        "version": 1,
        "device_id": device_id,
        "timestamp_ms": millis,
        "sensor_raw": round(base_ref + current_offset, 2),
        "reference_raw": round(base_ref, 2),
        "offset": round(current_offset, 2),
        "sensor_corrected": round(base_ref, 2),
        "residual": 0.0,
        "cal_state": "CALIBRATED",
        "cal_result": "STABLE",
        "led_state": 1,
        "calibration_event": startup_event
    }
    send_payload(url, token, payload)

    # Step 2: Normal parking maneuver (obstacle distance steady or smooth)
    print("\n[Scenario 2] Normal Reversing Operation (Green LED ON, Residual ~ 0)...")
    for step in range(30):
        millis += int(interval_sec * 1000)
        # Slow gradual reverse backing toward an obstacle: 50 down to 40
        distance = base_ref - (step * 0.25)
        s_raw = distance + current_offset + random.uniform(-0.15, 0.15)
        r_raw = distance + random.uniform(-0.15, 0.15)
        s_corr = s_raw - current_offset
        residual = s_corr - r_raw
        is_zero = abs(residual) <= 1.0

        payload = {
            "version": 1,
            "device_id": device_id,
            "timestamp_ms": millis,
            "sensor_raw": round(s_raw, 2),
            "reference_raw": round(r_raw, 2),
            "offset": round(current_offset, 2),
            "sensor_corrected": round(s_corr, 2),
            "residual": round(residual, 2),
            "cal_state": "CALIBRATED",
            "cal_result": "STABLE",
            "led_state": 1 if is_zero else 0
        }
        send_payload(url, token, payload)
        print(f"  t={millis}ms | Sensor={s_raw:.1f} Ref={r_raw:.1f} Corr={s_corr:.1f} Res={residual:.2f} LED={'ON' if is_zero else 'OFF'}")
        time.sleep(interval_sec)

    # Step 3: Sensor Drift / Contamination (Residual jumps to +4.5, triggers 16-sample persistence check)
    print("\n[Scenario 3] Temperature/Contamination Drift: Residual magnitude > 3.0...")
    persistent_residuals = []
    drift_delta = 4.5
    for i in range(16):
        millis += int(interval_sec * 1000)
        distance = 42.0
        s_raw = distance + current_offset + drift_delta + random.uniform(-0.1, 0.1)
        r_raw = distance + random.uniform(-0.1, 0.1)
        s_corr = s_raw - current_offset
        residual = s_corr - r_raw
        persistent_residuals.append(residual)

        payload = {
            "version": 1,
            "device_id": device_id,
            "timestamp_ms": millis,
            "sensor_raw": round(s_raw, 2),
            "reference_raw": round(r_raw, 2),
            "offset": round(current_offset, 2),
            "sensor_corrected": round(s_corr, 2),
            "residual": round(residual, 2),
            "cal_state": "CALIBRATED",
            "cal_result": "DRIFT_DETECTED",
            "led_state": 0
        }
        send_payload(url, token, payload)
        print(f"  [Drift Sample {i+1}/16] Residual={residual:.2f} (Threshold > 3.0)")
        time.sleep(interval_sec)

    # Step 4: Stability check passes (spread <= 1.0), dynamic adaptation applied!
    spread = max(persistent_residuals) - min(persistent_residuals)
    mean_res = sum(persistent_residuals) / len(persistent_residuals)
    print(f"\n[Scenario 4] Persistent Residual Stable: Spread={spread:.2f} <= 1.0! Applying offset adaptation...")
    old_off = current_offset
    current_offset += mean_res

    adaptation_event = {
        "event_type": "DYNAMIC_ADAPTATION",
        "old_offset": round(old_off, 2),
        "new_offset": round(current_offset, 2),
        "residual_avg": round(mean_res, 2),
        "residual_spread": round(spread, 2),
        "status": "PASSED",
        "notes": "16 consecutive stable residual samples detected. Offset updated dynamically."
    }
    millis += int(interval_sec * 1000)
    s_raw = 42.0 + current_offset
    r_raw = 42.0
    payload = {
        "version": 1,
        "device_id": device_id,
        "timestamp_ms": millis,
        "sensor_raw": round(s_raw, 2),
        "reference_raw": round(r_raw, 2),
        "offset": round(current_offset, 2),
        "sensor_corrected": round(s_raw - current_offset, 2),
        "residual": 0.0,
        "cal_state": "CALIBRATED",
        "cal_result": "ADAPTATION_APPLIED",
        "led_state": 1,
        "calibration_event": adaptation_event
    }
    send_payload(url, token, payload)
    print(f"[Scenario 4 OK] Offset updated from {old_off:.2f} -> {current_offset:.2f}. Green LED restored.")

    # Step 5: Unstable scene change / noise (Spread > 1.0) -> Rejection demonstration
    print("\n[Scenario 5] Unstable Scene Noise (Spread > 1.0): Calibration Rejected...")
    for i in range(16):
        millis += int(interval_sec * 1000)
        # High variance readings (e.g. pedestrian moving or acoustic multipath)
        noise = random.uniform(-3.0, 3.0)
        s_raw = 40.0 + current_offset + 5.0 + noise
        r_raw = 40.0
        s_corr = s_raw - current_offset
        residual = s_corr - r_raw
        payload = {
            "version": 1,
            "device_id": device_id,
            "timestamp_ms": millis,
            "sensor_raw": round(s_raw, 2),
            "reference_raw": round(r_raw, 2),
            "offset": round(current_offset, 2),
            "sensor_corrected": round(s_corr, 2),
            "residual": round(residual, 2),
            "cal_state": "CALIBRATED",
            "cal_result": "DRIFT_DETECTED",
            "led_state": 0
        }
        send_payload(url, token, payload)
        time.sleep(interval_sec)

    rejection_event = {
        "event_type": "DYNAMIC_ADAPTATION",
        "old_offset": round(current_offset, 2),
        "new_offset": round(current_offset, 2),  # Unchanged
        "residual_avg": 5.1,
        "residual_spread": 4.8,  # > 1.0!
        "status": "REJECTED_INSTABILITY",
        "notes": "Residual spread 4.8 exceeds stability limit of 1.0. Offset retained."
    }
    millis += int(interval_sec * 1000)
    payload["timestamp_ms"] = millis
    payload["cal_result"] = "REJECTED_INSTABILITY"
    payload["calibration_event"] = rejection_event
    send_payload(url, token, payload)
    print("[Scenario 5 OK] Stability check failed. Offset retained. Rejected event recorded.")

    print("\n[Feeder] Demo sequence completed. Loop continuing with steady telemetry...")
    while True:
        millis += int(interval_sec * 1000)
        s_raw = 40.0 + current_offset + random.uniform(-0.15, 0.15)
        r_raw = 40.0 + random.uniform(-0.15, 0.15)
        s_corr = s_raw - current_offset
        residual = s_corr - r_raw
        payload = {
            "version": 1,
            "device_id": device_id,
            "timestamp_ms": millis,
            "sensor_raw": round(s_raw, 2),
            "reference_raw": round(r_raw, 2),
            "offset": round(current_offset, 2),
            "sensor_corrected": round(s_corr, 2),
            "residual": round(residual, 2),
            "cal_state": "CALIBRATED",
            "cal_result": "STABLE",
            "led_state": 1 if abs(residual) <= 1.0 else 0
        }
        send_payload(url, token, payload)
        time.sleep(interval_sec)

def main():
    parser = argparse.ArgumentParser(description="Mock ESP32 Park-Assist Telemetry Feeder")
    parser.add_argument("--url", default=DEFAULT_BACKEND_URL, help="Backend telemetry URL")
    parser.add_argument("--token", default=DEFAULT_DEVICE_TOKEN, help="Device token")
    parser.add_argument("--device", default=DEFAULT_DEVICE_ID, help="Device ID")
    parser.add_argument("--interval", type=float, default=0.25, help="Sample interval seconds")
    args = parser.parse_args()

    try:
        run_simulation(args.url, args.token, args.device, interval_sec=args.interval)
    except KeyboardInterrupt:
        print("\n[Feeder] Stopped by user.")

if __name__ == "__main__":
    main()

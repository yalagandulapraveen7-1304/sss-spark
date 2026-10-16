#!/usr/bin/env python3
"""
Park-Assist Sensor Serial-to-HTTP Ingestion Bridge
==================================================
Reads newline-terminated JSON telemetry lines from the ESP32 via:
  1. Serial COM Port (Windows COMx, default COM3)
  2. TCP Socket (Wokwi VS Code RFC2217 / socket, e.g. localhost:4000)
  3. Standard Input (--stdin pipe)

Safely ignores human-readable diagnostic text, validates JSON structure,
and securely forwards valid telemetry payloads to the local FastAPI backend.
"""

import os
import sys
import time
import json
import socket
import argparse
from typing import Optional
import urllib.request
import urllib.error

# Default fallback values (can also be loaded from environment or CLI)
DEFAULT_BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000/api/v1/telemetry")
DEFAULT_DEVICE_TOKEN = os.getenv("DEVICE_TOKEN", "dev-park-secret-token-2026")
DEFAULT_BAUD_RATE = int(os.getenv("BAUD_RATE", "115200"))
DEFAULT_SERIAL_PORT = os.getenv("SERIAL_PORT", "COM3")

def post_payload(backend_url: str, token: str, payload_str: str) -> bool:
    """Validate JSON and POST to FastAPI ingestion endpoint."""
    try:
        data = json.loads(payload_str)
    except json.JSONDecodeError:
        # Silently skip non-JSON diagnostic lines
        return False

    # Check for minimal required schema fields
    if "version" not in data or "device_id" not in data or "sensor_raw" not in data:
        return False

    headers = {
        "Content-Type": "application/json",
        "X-Device-Token": token,
        "User-Agent": "ESP32-Serial-Bridge/1.0"
    }

    req = urllib.request.Request(
        backend_url,
        data=payload_str.encode("utf-8"),
        headers=headers,
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            if resp.status == 200:
                print(f"[Bridge -> API OK] Reading recorded: t={data.get('timestamp_ms')}ms, "
                      f"Sensor={data.get('sensor_raw')}, Ref={data.get('reference_raw')}, "
                      f"Residual={data.get('residual')}, State={data.get('cal_state')}")
                return True
    except urllib.error.HTTPError as e:
        print(f"[Bridge Error] HTTP {e.code}: {e.reason}")
    except urllib.error.URLError as e:
        print(f"[Bridge Error] Failed to reach backend at {backend_url}: {e.reason}")
    except Exception as e:
        print(f"[Bridge Error] Unexpected: {e}")
    return False

def run_stdin_mode(backend_url: str, token: str):
    """Read lines from standard input (useful for testing or piping logs)."""
    print("[Bridge] Running in STDIN mode. Type or pipe ESP32 JSON lines...")
    try:
        for line in sys.stdin:
            clean = line.strip()
            if clean:
                post_payload(backend_url, token, clean)
    except KeyboardInterrupt:
        print("\n[Bridge] Stopped by user.")

def run_tcp_mode(host: str, port: int, backend_url: str, token: str):
    """Connect to a TCP server (e.g. Wokwi simulation socket)."""
    print(f"[Bridge] Connecting to TCP socket {host}:{port}...")
    while True:
        try:
            with socket.create_connection((host, port), timeout=5.0) as sock:
                print(f"[Bridge] Connected to {host}:{port}. Listening for telemetry...")
                sock_file = sock.makefile("r", encoding="utf-8", errors="replace")
                for line in sock_file:
                    clean = line.strip()
                    if clean:
                        post_payload(backend_url, token, clean)
        except (socket.error, ConnectionRefusedError, TimeoutError) as e:
            print(f"[Bridge] TCP connection to {host}:{port} failed ({e}). Retrying in 3s...")
            time.sleep(3)
        except KeyboardInterrupt:
            print("\n[Bridge] Stopped by user.")
            break

def run_serial_mode(port: str, baudrate: int, backend_url: str, token: str):
    """Connect to physical or virtual serial port via pyserial."""
    try:
        import serial
        import serial.tools.list_ports
    except ImportError:
        print("[Bridge Error] 'pyserial' is not installed. Run: pip install pyserial")
        sys.exit(1)

    print(f"[Bridge] Available serial ports:")
    available = serial.tools.list_ports.comports()
    if available:
        for p in available:
            print(f"  - {p.device}: {p.description}")
    else:
        print("  (No physical COM ports detected)")

    print(f"\n[Bridge] Attempting to open {port} at {baudrate} baud...")
    while True:
        try:
            with serial.Serial(port, baudrate=baudrate, timeout=1.0) as ser:
                print(f"[Bridge] Successfully opened {port}. Awaiting ESP32 JSON stream...")
                while True:
                    line = ser.readline().decode("utf-8", errors="replace").strip()
                    if line:
                        post_payload(backend_url, token, line)
        except serial.SerialException as e:
            print(f"[Bridge] Serial port error ({port}): {e}. Retrying in 3s...")
            time.sleep(3)
        except KeyboardInterrupt:
            print("\n[Bridge] Stopped by user.")
            break

def main():
    parser = argparse.ArgumentParser(description="Park-Assist Sensor Serial-to-HTTP Ingestion Bridge")
    parser.add_argument("--port", default=DEFAULT_SERIAL_PORT, help=f"Serial port name (default: {DEFAULT_SERIAL_PORT})")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD_RATE, help=f"Serial baud rate (default: {DEFAULT_BAUD_RATE})")
    parser.add_argument("--url", default=DEFAULT_BACKEND_URL, help=f"Backend telemetry URL (default: {DEFAULT_BACKEND_URL})")
    parser.add_argument("--token", default=DEFAULT_DEVICE_TOKEN, help="Device authentication token")
    parser.add_argument("--stdin", action="store_true", help="Read JSON from stdin instead of serial port")
    parser.add_argument("--tcp", type=str, default=None, help="Connect via TCP socket 'host:port' (e.g. localhost:4000)")

    args = parser.parse_args()

    print("==========================================================")
    print("PARK-ASSIST EDUCATIONAL SENSOR BRIDGE")
    print(f"Target Backend: {args.url}")
    print("==========================================================")

    if args.stdin:
        run_stdin_mode(args.url, args.token)
    elif args.tcp:
        try:
            h, p = args.tcp.split(":")
            run_tcp_mode(h, int(p), args.url, args.token)
        except ValueError:
            print("[Bridge Error] --tcp must be in 'host:port' format (e.g. 127.0.0.1:4000)")
            sys.exit(1)
    else:
        run_serial_mode(args.port, args.baud, args.url, args.token)

if __name__ == "__main__":
    main()

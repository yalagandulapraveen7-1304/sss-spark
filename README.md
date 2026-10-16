# sss-spark: Self-Calibrating Reverse-Parking Sensor System (Educational Prototype)

> **SAFETY & DOMAIN DISCLAIMER:** This project is an **educational model, simulation, and software prototype**. It is designed to illustrate sensor calibration, residual tracking, and drift detection concepts inspired by automotive Low-Speed Manoeuvring Aids (such as [ISO 17386 MALSO](https://www.iso.org/standard/35327.html)). **It does not interface with actual vehicle brakes, steering, or automotive Electronic Control Units (ECUs), and it is not certified or suitable for use in production motor vehicles.**

---

## 1. Real-World Application Context: Reverse-Parking Assist

In automotive park-assist systems, ultrasonic transducers mounted along the rear bumper emit high-frequency acoustic sound pulses (~40 kHz to 58 kHz) and measure the time-of-flight until the reflected echo returns. Because sound travels at approximately $343\text{ m/s}$ in dry air at $20^\circ\text{C}$, the distance $d$ to an obstacle is calculated as:
$$d = \frac{v_{\text{sound}} \cdot \Delta t}{2}$$

Modern Advanced Driver Assistance Systems (ADAS) often fuse ultrasonic range data with rear-view cameras and short-range corner radars to navigate parking spaces and prevent low-speed collisions.

```
       +-------------------------------------------------------------+
       |             REAR VEHICLE BUMPER & SENSOR FUSION            |
       |                                                             |
       |   [Ultrasonic 1]       [Rear Camera]       [Ultrasonic 2]   |
       |        \                    |                    /          |
       |         v                   v                   v           |
       |     (Acoustic ToF)     (Vision/Edges)      (Acoustic ToF)   |
       +-----------------------------+-------------------------------+
                                     |
                                     v
                       +---------------------------+
                       |   ADAS Health Monitor     |
                       | - Zero-point calibration  |
                       | - Persistence tracking    |
                       | - Residual spread check   |
                       +-------------+-------------+
                                     |
               +---------------------+---------------------+
               v                                           v
       [Acoustic Chime / Warning]                 [Driver UI Console]
       (Intermittent -> Continuous)            (Distance & Health Status)
```

### Automotive Environmental Realities & Distinctions
1. **Physical Distortions:** Bumper flex, mounting misalignment, dirt, water accumulation, ice accretion, and temperature swings (the speed of sound shifts by $\approx 0.6\text{ m/s}$ per $^\circ\text{C}$) alter transducer response.
2. **What Wokwi Potentiometers Model:** The potentiometers in Wokwi supply simple analog voltage levels ($0\text{V}$ to $3.3\text{V}$, converted to a $0\text{--}100$ scale). They **do not** model acoustic wave propagation, beam patterns, attenuation, multi-echo reflections, radar Doppler shifts, optical lens distortion, or 12V automotive battery electrical transients ([ISO 7637-2](https://www.iso.org/standard/50917.html)).
3. **What the Calibration Algorithm Corrects:** The algorithm estimates an **additive offset** ($y_{\text{corrected}} = y_{\text{sensor}} - \text{offset}$). It **does not** model scale factor/gain errors ($y = m \cdot x + c$), transducer non-linearities, temperature response curves, or blind-zone deadbands.
4. **Sensor Modality Differences:**
   * **Ultrasonic:** Acoustic time-of-flight; ranges $0.2\text{m} - 2.5\text{m}$; strongly affected by air temperature, wind, and sound-absorbing surfaces.
   * **Radar:** Radio frequency electromagnetic waves (77 GHz); unaffected by dirt or rain; measures Doppler radial velocity.
   * **Camera:** Optical projection onto CMOS matrix; sensitive to lighting, glare, and lens occlusions.

---

## 2. Architecture & Folder Layout

```
park-assist-sensor-system/
├── backend/                  # FastAPI telemetry service & SQLite database
│   ├── app/
│   │   ├── config.py         # Environment variables & token settings
│   │   ├── database.py       # SQLite connection & schema initialization
│   │   ├── models.py         # DB schema representation
│   │   ├── schemas.py        # Typed Pydantic request/response models
│   │   └── main.py           # REST endpoints, WebSocket manager, CSV exports
│   ├── requirements.txt      # Python dependencies
│   ├── .env.example          # Environment template
│   └── test_backend.py       # Automated test suite
├── bridge/                   # Bridge & local feeder tools
│   ├── serial_bridge.py      # Serial/TCP/stdin to HTTP ingestion bridge
│   └── mock_feeder.py        # Scenario simulator for testing without Wokwi
├── firmware/                 # ESP32 C++ firmware & Wokwi simulation
│   ├── sketch.ino            # ESP32 Arduino sketch with 16-sample calibration
│   ├── diagram.json          # Wokwi circuit schematic
│   └── wokwi.toml            # Wokwi VS Code config
├── frontend/                 # React + TypeScript + Vite dashboard
│   ├── src/
│   │   ├── components/       # StatusCard, Visualizer, Chart, Tables, Modals
│   │   ├── api.ts            # REST & WebSocket client
│   │   ├── types.ts          # Shared TypeScript interfaces
│   │   ├── App.tsx           # Main dashboard coordinator
│   │   └── index.css         # Automotive ADAS theme styling
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

---

## 3. The Calibration & Residual Algorithm Explained

### Algorithm Specifications:
1. **Input Normalization:** 12-bit ADC ($0\text{--}4095$) is converted to a $0\text{--}100$ scale:
   $$\text{value} = \frac{\text{adc} \times 100.0}{4095.0}$$
2. **Startup Calibration (16 Paired Samples):** When reverse gear is engaged, 16 paired sensor and reference samples are averaged:
   $$\text{offset} = \frac{1}{16}\sum_{i=1}^{16} \text{sensor}_i - \frac{1}{16}\sum_{i=1}^{16} \text{reference}_i$$
3. **Runtime Correction & Residual:**
   $$\text{sensor}_{\text{corrected}} = \text{sensor}_{\text{raw}} - \text{offset}$$
   $$\text{residual} = \text{sensor}_{\text{corrected}} - \text{reference}_{\text{raw}}$$
4. **Drift Detection:** If $|\text{residual}| > 3.0$, the reading is flagged as drift and buffered.
5. **Persistence Check:** The controller monitors for **16 consecutive samples** where $|\text{residual}| > 3.0$.
6. **Stability Check:**
   $$\text{spread} = \max(\text{residual}_{1..16}) - \min(\text{residual}_{1..16})$$
   * **If $\text{spread} \le 1.0$ AND $|\text{candidate offset}| \le 50.0$:** The residual is stable and plausible! The offset is updated:
     $$\text{offset} \leftarrow \text{offset} + \text{mean}(\text{residual})$$
   * **If $\text{spread} > 1.0$ or $|\text{candidate}| > 50.0$:** Rejection! The previous offset is retained to avoid corrupting the system with unstable noise.
7. **Green Status LED (GPIO 25):** Glows **GREEN** when the corrected reading agrees with reference (residual within $\pm 1.0$ count), and turns **OFF** when any error is present.

### Critical Safety Insight: Residual Correction vs. Obstacle Detection
> **IMPORTANT:** In a real car, automatically adapting the offset to erase a persistent residual is **only safe if the reference is guaranteed to measure the exact same stationary target**. If a driver backs up toward a wall or a pedestrian steps behind the car, that residual represents a **REAL SCENE CHANGE**, NOT sensor drift! Erasing it via offset adaptation would be dangerous (it would "zero out" the obstacle!). The dashboard explicitly distinguishes a *residual correction event* from an *obstacle warning*.

---

## 4. Setup and Run Instructions (Windows PowerShell)

### Step 1: Start the Backend Service
Open a PowerShell terminal:
```powershell
# Navigate to backend directory
cd C:\Users\ammul\.gemini\antigravity\scratch\park-assist-sensor-system\backend

# Install dependencies (if not already installed)
python -m pip install -r requirements.txt

# Run automated tests to verify backend health
python -m pytest test_backend.py -v

# Start the FastAPI server with live reloading on port 8000
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
*Health check URL:* `http://127.0.0.1:8000/health`  
*Interactive Swagger API Docs:* `http://127.0.0.1:8000/docs`

---

### Step 2: Start the Frontend Dashboard
Open a second PowerShell terminal:
```powershell
# Navigate to frontend directory
cd C:\Users\ammul\.gemini\antigravity\scratch\park-assist-sensor-system\frontend

# Install dependencies (if needed)
npm install

# Start Vite development server
npm run dev
```
Open your browser at: **`http://localhost:5173`**

---

### Step 3: Stream Telemetry to the Dashboard

You have **two convenient options** to feed data:

#### Option A: Run the Mock Telemetry Feeder (No Wokwi or hardware needed!)
Open a third PowerShell terminal:
```powershell
cd C:\Users\ammul\.gemini\antigravity\scratch\park-assist-sensor-system\bridge
python mock_feeder.py
```
This automatically steps through:
1. Startup 16-sample calibration
2. Steady reverse parking (Green LED ON, residual ~ 0.0)
3. Temperature drift ($|\text{residual}| > 3.0$)
4. 16-sample persistent stability check ($\text{spread} \le 1.0$) $\rightarrow$ Dynamic adaptation applied
5. High-variance noise rejection ($\text{spread} > 1.0$) $\rightarrow$ Adaptation safely rejected
6. Moving obstacle detection

#### Option B: Connect to Wokwi Simulator via Serial Bridge
1. Open [wokwi.com](https://wokwi.com), start a new **ESP32** project.
2. Paste `firmware/sketch.ino` into `sketch.ino`.
3. Paste `firmware/diagram.json` into `diagram.json`.
4. Click **Play** in Wokwi.
5. In your local terminal, run the Serial Bridge in pipe mode or COM port mode:
```powershell
# Stdin pipe mode: copy JSON lines from Wokwi Serial Monitor and pipe:
python bridge/serial_bridge.py --stdin

# Or if using a COM port / virtual serial:
python bridge/serial_bridge.py --port COM3 --baud 115200

# Or if using Wokwi VS Code TCP socket:
python bridge/serial_bridge.py --tcp 127.0.0.1:4000
```

---

## 5. Sample Valid Message & Direct Ingestion Command

### Sample JSON Telemetry Line
```json
{
  "version": 1,
  "device_id": "esp32-park-01",
  "timestamp_ms": 4200,
  "sensor_raw": 54.80,
  "reference_raw": 50.00,
  "offset": 4.80,
  "sensor_corrected": 50.00,
  "residual": 0.00,
  "cal_state": "CALIBRATED",
  "cal_result": "STABLE",
  "led_state": 1
}
```

### Ingest via PowerShell `Invoke-RestMethod`
```powershell
$headers = @{
    "Content-Type" = "application/json"
    "X-Device-Token" = "dev-park-secret-token-2026"
}

$body = @{
    version = 1
    device_id = "esp32-park-01"
    timestamp_ms = 5000
    sensor_raw = 55.0
    reference_raw = 50.0
    offset = 5.0
    sensor_corrected = 50.0
    residual = 0.0
    cal_state = "CALIBRATED"
    cal_result = "STABLE"
    led_state = 1
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/telemetry" -Method Post -Headers $headers -Body $body
```

---

## 6. CSV Export Instructions

You can export stored data at any time:
1. **Via Dashboard UI:** Click the **Readings CSV** or **Events CSV** buttons in the dashboard header.
2. **Via PowerShell command:**
```powershell
# Export all sensor readings
Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/v1/export/readings.csv" -OutFile "readings.csv"

# Export calibration ledger events
Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/v1/export/calibration-events.csv" -OutFile "calibration_events.csv"
```

---

## 7. Known Limitations & Next Steps toward Production ADAS

| Feature | Educational Prototype | Production Automotive Park-Assist |
| :--- | :--- | :--- |
| **Physical Sensing** | 10k potentiometer voltage divider | Waterproof Piezoelectric Ultrasonic Transducer (40–58 kHz) |
| **Error Modeling** | Fixed additive offset ($y - \delta$) | Speed of sound compensation ($\sqrt{T_k}$), scale factor, multipath rejection |
| **Validation** | In-memory 16-sample ring buffer | Hardware watchdog, ECC memory, AUTOSAR Classic BSW stack |
| **Safety Compliance** | Educational lab code | ISO 26262 ASIL-B / ASIL-C certified architecture |
| **Networking** | JSON over Serial / WebSocket | Automotive CAN-FD / LIN bus with cyclic checksums (E2E protection) |
| **Driver Interface** | Web browser dashboard | Direct CAN tone generator and cluster gauge display |

#include <Arduino.h>
#include <math.h>
#include <WiFi.h>
#include <HTTPClient.h>

// -----------------------------------------------------------------------------
// Pin Configuration (Matches Wokwi Diagram & Physical ESP32 DevKit V4)
// -----------------------------------------------------------------------------
const int PIN_SENSOR = 34;    // Sensor Potentiometer Wiper (ADC1_CH6)
const int PIN_REF = 35;       // Reference Potentiometer Wiper (ADC1_CH7)
const int PIN_LED = 25;       // Calibration & Residual Warning LED (Wokwi GPIO 25)
const int PIN_LED_ERR = 26;   // Dedicated Red LED for physical dual-LED setup

// -----------------------------------------------------------------------------
// Network & Telemetry Backend Configuration
// -----------------------------------------------------------------------------
// In Wokwi simulation, "Wokwi-GUEST" provides instant virtual Wi-Fi without password.
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASS = "";

// Set to your deployed Render URL or local tunnel endpoint:
// For Wokwi local testing: "http://host.wokwi.internal:8000/api/v1/telemetry"
// For Render production: "https://sss-spark.onrender.com/api/v1/telemetry"
const char* BACKEND_URL = "http://host.wokwi.internal:8000/api/v1/telemetry";
const char* DEVICE_TOKEN = "dev-park-secret-token-2026";
const char* DEVICE_ID = "esp32-park-01";
const int PROTOCOL_VERSION = 1;

// -----------------------------------------------------------------------------
// Calibration & Drift Detection Parameters
// -----------------------------------------------------------------------------
const int N = 16;
const float MAX_ALLOWED_OFFSET = 25.0f;
const float MAX_ALLOWED_VARIANCE = 4.0f;
const float DRIFT_THRESHOLD = 3.0f;
const float RESIDUAL_STABILITY_TOLERANCE = 1.0f;

float offset_b = 0.0f;
bool calibrated = false;
float residual_samples[N];
int residual_count = 0;
unsigned long last_network_transmit_ms = 0;
const unsigned long TRANSMIT_INTERVAL_MS = 500; // 2 Hz network telemetry rate

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------
float readChannel(int pin) {
  return (analogRead(pin) / 4095.0f) * 100.0f;
}

float computeVariance(const float samples[], float mean, int count) {
  float sum_sq = 0.0f;
  for (int i = 0; i < count; i++) {
    float diff = samples[i] - mean;
    sum_sq += diff * diff;
  }
  return sum_sq / count;
}

void resetResidualCheck() {
  residual_count = 0;
}

bool calibrate() {
  digitalWrite(PIN_LED, HIGH);
  float s_samples[N];
  float r_samples[N];
  float sum_s = 0.0f;
  float sum_r = 0.0f;

  for (int i = 0; i < N; i++) {
    s_samples[i] = readChannel(PIN_SENSOR);
    r_samples[i] = readChannel(PIN_REF);
    sum_s += s_samples[i];
    sum_r += r_samples[i];
    delay(5);
  }

  float mean_s = sum_s / N;
  float mean_r = sum_r / N;
  float var_s = computeVariance(s_samples, mean_s, N);
  float var_r = computeVariance(r_samples, mean_r, N);

  if (var_s > MAX_ALLOWED_VARIANCE || var_r > MAX_ALLOWED_VARIANCE) {
    Serial.printf("[warning] Stability check failed: var_sensor=%.2f, var_ref=%.2f. Retaining previous correction.\n", var_s, var_r);
    digitalWrite(PIN_LED, LOW);
    return false;
  }

  float candidate_offset = mean_s - mean_r;
  if (fabsf(candidate_offset) > MAX_ALLOWED_OFFSET) {
    Serial.printf("[alarm] Offset out of bounds: candidate=%.2f, limit=%.2f.\n", candidate_offset, MAX_ALLOWED_OFFSET);
    digitalWrite(PIN_LED, LOW);
    return false;
  }

  offset_b = candidate_offset;
  calibrated = true;
  Serial.printf("[success] Calibration complete: correction offset=%.2f\n", offset_b);

  digitalWrite(PIN_LED, LOW);
  return true;
}

void checkAndCorrectStableResidual(float residual) {
  if (fabsf(residual) <= DRIFT_THRESHOLD) {
    resetResidualCheck();
    return;
  }

  residual_samples[residual_count] = residual;
  residual_count++;

  Serial.printf("[residual] %.2f; stable readings %d/%d\n", residual, residual_count, N);

  if (residual_count < N) return;

  float min_residual = residual_samples[0];
  float max_residual = residual_samples[0];
  float sum_residual = 0.0f;

  for (int i = 0; i < N; i++) {
    if (residual_samples[i] < min_residual) min_residual = residual_samples[i];
    if (residual_samples[i] > max_residual) max_residual = residual_samples[i];
    sum_residual += residual_samples[i];
  }

  float residual_spread = max_residual - min_residual;
  if (residual_spread <= RESIDUAL_STABILITY_TOLERANCE) {
    float residual_mean = sum_residual / N;
    offset_b += residual_mean;
    Serial.printf("[correction updated] stable residual=%.2f; new offset_b=%.2f\n", residual_mean, offset_b);
    resetResidualCheck();
  } else {
    for (int i = 1; i < N; i++) {
      residual_samples[i - 1] = residual_samples[i];
    }
    residual_count = N - 1;
    Serial.printf("[residual] not stable yet; spread=%.2f, required <= %.2f\n", residual_spread, RESIDUAL_STABILITY_TOLERANCE);
  }
}

void transmitTelemetryOverWiFi(float raw, float ref, float corrected, float residual, int led_state) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(BACKEND_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(2000);

  char payload[320];
  snprintf(payload, sizeof(payload),
    "{\"version\":%d,\"device_id\":\"%s\",\"timestamp_ms\":%lu,\"sensor_raw\":%.2f,"
    "\"reference_raw\":%.2f,\"offset\":%.2f,\"sensor_corrected\":%.2f,\"residual\":%.2f,"
    "\"cal_state\":\"%s\",\"cal_result\":\"%s\",\"led_state\":%d}",
    PROTOCOL_VERSION, DEVICE_ID, millis(), raw, ref, offset_b, corrected, residual,
    calibrated ? "CALIBRATED" : "CALIBRATING",
    fabsf(residual) > DRIFT_THRESHOLD ? "DRIFT_DETECTED" : "STABLE",
    led_state
  );

  int httpCode = http.POST(payload);
  if (httpCode > 0) {
    if (httpCode != 200) {
      Serial.printf("[HTTP] Warning: Response code %d\n", httpCode);
    }
  } else {
    // Network errors (e.g. backend offline) do not block local sensor operation
    Serial.printf("[HTTP] Transport error: %s\n", http.errorToString(httpCode).c_str());
  }
  http.end();
}

// -----------------------------------------------------------------------------
// Arduino Setup & Main Loop
// -----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  analogReadResolution(12);

  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_LED_ERR, OUTPUT);
  digitalWrite(PIN_LED, LOW);
  digitalWrite(PIN_LED_ERR, LOW);

  // Initialize Wi-Fi connection (Wokwi virtual Wi-Fi or local WLAN)
  Serial.print("Connecting to Wi-Fi SSID: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long startWifi = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startWifi < 4000) {
    delay(200);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Wi-Fi] Connected! IP Address: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[Wi-Fi] Offline/Standalone mode. Telemetry available via USB Serial.");
  }

  Serial.println("Performing initial boot calibration...");
  calibrate();
}

void loop() {
  float raw = readChannel(PIN_SENSOR);
  float ref = readChannel(PIN_REF);

  if (!calibrated) {
    Serial.println("[warning] Not calibrated; retrying calibration.");
    calibrate();
    delay(200);
    return;
  }

  float corrected = raw - offset_b;
  float signed_residual = corrected - ref;
  checkAndCorrectStableResidual(signed_residual);

  // Update readings with latest offset_b
  corrected = raw - offset_b;
  signed_residual = corrected - ref;

  // LED state: Active when residual exceeds drift tolerance (Red warning)
  int led_state = 0;
  if (fabsf(signed_residual) > DRIFT_THRESHOLD) {
    digitalWrite(PIN_LED, HIGH);
    digitalWrite(PIN_LED_ERR, HIGH);
    led_state = 1;
  } else {
    digitalWrite(PIN_LED, LOW);
    digitalWrite(PIN_LED_ERR, LOW);
    led_state = 0;
  }

  // Consistent Serial Output for Web Serial / Serial Monitor
  Serial.printf(
    "raw=%.2f ref=%.2f offset_b=%.2f corrected=%.2f residual=%.2f\n",
    raw, ref, offset_b, corrected, signed_residual
  );

  // Periodic network transmission over Wi-Fi
  if (millis() - last_network_transmit_ms >= TRANSMIT_INTERVAL_MS) {
    last_network_transmit_ms = millis();
    transmitTelemetryOverWiFi(raw, ref, corrected, signed_residual, led_state);
  }

  delay(200);
}

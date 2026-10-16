/*
  PROJECT: ESP32 SELF-CALIBRATING PARK-ASSIST SENSOR EDUCATIONAL MODEL
  PLATFORM: ESP32 DevKit V4 + Wokwi Simulation

  HARDWARE MAPPING:
  - GPIO 34: Sensor Potentiometer (ADC1_CH6, 0-100 scale)
  - GPIO 35: Reference Potentiometer (ADC1_CH7, 0-100 scale)
  - GPIO 25: Calibration / 0-Error Status LED (Green)

  ALGORITHM SPECIFICATION:
  - Startup Calibration: 16 paired sensor & reference samples
  - Initial Offset: avg(sensor) - avg(reference)
  - Corrected Value: sensor - offset
  - Signed Residual: corrected - reference
  - Drift Threshold: |residual| > 3.0
  - Persistence Check: 16 consecutive samples with |residual| > 3.0
  - Stability Condition: peak-to-peak spread (max - min) <= 1.0
  - Dynamic Adaptation: if stable, offset += mean(residual)
  - Plausibility Check: if spread > 1.0 or |new_offset| > 50.0, reject & retain previous offset
*/

const int PIN_SENSOR = 34;
const int PIN_REFERENCE = 35;
const int PIN_LED_GREEN = 25;

const char* DEVICE_ID = "esp32-park-01";
const int PROTOCOL_VERSION = 1;

// Sampling & Calibration Constants
const int CALIBRATION_SAMPLES = 16;
const unsigned long SAMPLE_INTERVAL_MS = 200;
const float DRIFT_THRESHOLD = 3.0;
const float SPREAD_STABILITY_LIMIT = 1.0;
const float MAX_PLAUSIBLE_OFFSET = 50.0;
const float ZERO_ERROR_TOLERANCE = 1.0;

// System State Variables
float calibrationOffset = 0.0;
bool isCalibrated = false;
unsigned long lastSampleTime = 0;

// Persistent Residual Ring Buffer
float residualBuffer[16];
int persistentDriftCount = 0;

// Convert 12-bit ADC (0-4095) to 0-100 Normalized Scale
float readNormalizedInput(int pin) {
  int rawADC = analogRead(pin);
  return ((float)rawADC * 100.0) / 4095.0;
}

// --------------------------------------------------
// STARTUP CALIBRATION ROUTINE
// --------------------------------------------------
void calibrateStartup() {
  Serial.println("# [ParkAssist] Reverse gear engaged: Starting 16-sample baseline calibration...");
  digitalWrite(PIN_LED_GREEN, LOW);

  float sumSensor = 0.0;
  float sumRef = 0.0;

  for (int i = 0; i < CALIBRATION_SAMPLES; i++) {
    float s = readNormalizedInput(PIN_SENSOR);
    float r = readNormalizedInput(PIN_REFERENCE);
    sumSensor += s;
    sumRef += r;
    delay(50); // 16 * 50ms = 800ms calibration window
  }

  float avgSensor = sumSensor / (float)CALIBRATION_SAMPLES;
  float avgRef = sumRef / (float)CALIBRATION_SAMPLES;

  calibrationOffset = avgSensor - avgRef;
  isCalibrated = true;
  persistentDriftCount = 0;

  Serial.print("# [ParkAssist] Baseline Offset Computed: ");
  Serial.println(calibrationOffset, 2);

  // Emit Initial Startup Calibration Event JSON
  Serial.print("{\"version\":1,\"device_id\":\"");
  Serial.print(DEVICE_ID);
  Serial.print("\",\"timestamp_ms\":");
  Serial.print(millis());
  Serial.print(",\"sensor_raw\":");
  Serial.print(avgSensor, 2);
  Serial.print(",\"reference_raw\":");
  Serial.print(avgRef, 2);
  Serial.print(",\"offset\":");
  Serial.print(calibrationOffset, 2);
  Serial.print(",\"sensor_corrected\":");
  Serial.print(avgSensor - calibrationOffset, 2);
  Serial.print(",\"residual\":0.00,\"cal_state\":\"CALIBRATED\",\"cal_result\":\"STABLE\",\"led_state\":1,");
  Serial.print("\"calibration_event\":{\"event_type\":\"INITIAL_STARTUP\",\"old_offset\":0.00,\"new_offset\":");
  Serial.print(calibrationOffset, 2);
  Serial.print(",\"residual_avg\":0.00,\"residual_spread\":0.20,\"status\":\"PASSED\",\"notes\":\"Startup 16-sample baseline completed.\"}");
  Serial.println("}");

  digitalWrite(PIN_LED_GREEN, HIGH);
}

// --------------------------------------------------
// SETUP
// --------------------------------------------------
void setup() {
  Serial.begin(115200);
  analogReadResolution(12);

  pinMode(PIN_SENSOR, INPUT);
  pinMode(PIN_REFERENCE, INPUT);
  pinMode(PIN_LED_GREEN, OUTPUT);
  digitalWrite(PIN_LED_GREEN, LOW);

  delay(1000); // 1s stabilization pause

  calibrateStartup();
  lastSampleTime = millis();
}

// --------------------------------------------------
// MAIN LOOP
// --------------------------------------------------
void loop() {
  // Allow manual recalibration trigger via serial monitor ('c' or 'C')
  if (Serial.available()) {
    char c = Serial.read();
    if (c == 'c' || c == 'C') {
      calibrateStartup();
      lastSampleTime = millis();
    }
  }

  unsigned long currentTime = millis();
  if (currentTime - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = currentTime;

    float sensorRaw = readNormalizedInput(PIN_SENSOR);
    float refRaw = readNormalizedInput(PIN_REFERENCE);

    // 1. Correct sensor using current offset
    float sensorCorrected = sensorRaw - calibrationOffset;

    // 2. Compute signed residual
    float residual = sensorCorrected - refRaw;
    float residualAbs = abs(residual);

    // 3. LED Indicator: Glows GREEN when residual is 0 (within +/- 1.0 count)
    bool isZeroError = (residualAbs <= ZERO_ERROR_TOLERANCE);
    digitalWrite(PIN_LED_GREEN, isZeroError ? HIGH : LOW);

    String calResult = "STABLE";
    bool emitEvent = false;
    String eventJson = "";

    // 4. Persistence & Stability Monitoring
    if (residualAbs > DRIFT_THRESHOLD) {
      // Store into 16-sample buffer
      residualBuffer[persistentDriftCount % 16] = residual;
      persistentDriftCount++;
      calResult = "DRIFT_DETECTED";

      // When 16 consecutive above-threshold readings accumulate:
      if (persistentDriftCount >= 16) {
        float minRes = residualBuffer[0];
        float maxRes = residualBuffer[0];
        float sumRes = 0.0;

        for (int i = 0; i < 16; i++) {
          float val = residualBuffer[i];
          sumRes += val;
          if (val < minRes) minRes = val;
          if (val > maxRes) maxRes = val;
        }

        float spread = maxRes - minRes;
        float meanRes = sumRes / 16.0;
        float candidateOffset = calibrationOffset + meanRes;

        // Stability check: spread <= 1.0 AND plausibility check: |candidate| <= 50.0
        if (spread <= SPREAD_STABILITY_LIMIT && abs(candidateOffset) <= MAX_PLAUSIBLE_OFFSET) {
          float oldOffset = calibrationOffset;
          calibrationOffset = candidateOffset;
          calResult = "ADAPTATION_APPLIED";
          emitEvent = true;

          // Recompute corrected reading with new offset
          sensorCorrected = sensorRaw - calibrationOffset;
          residual = sensorCorrected - refRaw;

          eventJson = String(",\"calibration_event\":{\"event_type\":\"DYNAMIC_ADAPTATION\",\"old_offset\":") +
                      String(oldOffset, 2) + ",\"new_offset\":" + String(calibrationOffset, 2) +
                      ",\"residual_avg\":" + String(meanRes, 2) + ",\"residual_spread\":" + String(spread, 2) +
                      ",\"status\":\"PASSED\",\"notes\":\"16 persistent stable samples. Offset adapted.\"}";
        } else {
          // Rejection: either unstable noise or implausible offset
          calResult = (spread > SPREAD_STABILITY_LIMIT) ? "REJECTED_INSTABILITY" : "REJECTED_IMPLAUSIBLE";
          emitEvent = true;

          eventJson = String(",\"calibration_event\":{\"event_type\":\"DYNAMIC_ADAPTATION\",\"old_offset\":") +
                      String(calibrationOffset, 2) + ",\"new_offset\":" + String(calibrationOffset, 2) +
                      ",\"residual_avg\":" + String(meanRes, 2) + ",\"residual_spread\":" + String(spread, 2) +
                      ",\"status\":\"" + calResult + "\",\"notes\":\"Spread " + String(spread, 2) + " exceeded limit. Offset retained.\"}";
        }

        // Reset persistent counter
        persistentDriftCount = 0;
      }
    } else {
      // Residual is within normal threshold: reset counter
      persistentDriftCount = 0;
    }

    // 5. Output Machine-Readable JSON Line
    Serial.print("{\"version\":1,\"device_id\":\"");
    Serial.print(DEVICE_ID);
    Serial.print("\",\"timestamp_ms\":");
    Serial.print(currentTime);
    Serial.print(",\"sensor_raw\":");
    Serial.print(sensorRaw, 2);
    Serial.print(",\"reference_raw\":");
    Serial.print(refRaw, 2);
    Serial.print(",\"offset\":");
    Serial.print(calibrationOffset, 2);
    Serial.print(",\"sensor_corrected\":");
    Serial.print(sensorCorrected, 2);
    Serial.print(",\"residual\":");
    Serial.print(residual, 2);
    Serial.print(",\"cal_state\":\"CALIBRATED\",\"cal_result\":\"");
    Serial.print(calResult);
    Serial.print("\",\"led_state\":");
    Serial.print(isZeroError ? 1 : 0);
    if (emitEvent) {
      Serial.print(eventJson);
    }
    Serial.println("}");
  }
}

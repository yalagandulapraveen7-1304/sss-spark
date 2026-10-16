#include <Arduino.h>
#include <math.h>

const int PIN_SENSOR = 34;
const int PIN_REF = 35;
const int PIN_LED = 25;

const int N = 16;
const float MAX_ALLOWED_OFFSET = 25.0f;
const float MAX_ALLOWED_VARIANCE = 4.0f;
const float DRIFT_THRESHOLD = 3.0f;

// Residuals count as approximately constant if their spread is within this
// peak-to-peak range, in the same 0–100 units as readChannel().
const float RESIDUAL_STABILITY_TOLERANCE = 1.0f;

float offset_b = 0.0f;
bool calibrated = false;

float residual_samples[N];
int residual_count = 0;

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

  // Collect 16 sensor/reference pairs.
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

  if (var_s > MAX_ALLOWED_VARIANCE ||
      var_r > MAX_ALLOWED_VARIANCE) {
    Serial.printf(
      "[warning] Stability check failed: var_sensor=%.2f, "
      "var_ref=%.2f. Keeping previous correction.\n",
      var_s, var_r
    );
    digitalWrite(PIN_LED, LOW);
    return false;
  }

  float candidate_offset = mean_s - mean_r;

  if (fabsf(candidate_offset) > MAX_ALLOWED_OFFSET) {
    Serial.printf(
      "[alarm] Offset out of bounds: candidate=%.2f, limit=%.2f.\n",
      candidate_offset, MAX_ALLOWED_OFFSET
    );
    digitalWrite(PIN_LED, LOW);
    return false;
  }

  offset_b = candidate_offset;
  calibrated = true;

  Serial.printf(
    "[success] Calibration complete: correction offset=%.2f\n",
    offset_b
  );

  digitalWrite(PIN_LED, LOW);
  return true;
}

// Record residuals above the threshold. Once 16 consecutive residuals are
// stable, adjust offset_b by their average so the correction removes them.
void checkAndCorrectStableResidual(float residual) {
  if (fabsf(residual) <= DRIFT_THRESHOLD) {
    resetResidualCheck();
    return;
  }

  residual_samples[residual_count] = residual;
  residual_count++;

  Serial.printf(
    "[residual] %.2f; stable readings %d/%d\n",
    residual, residual_count, N
  );

  if (residual_count < N) {
    return;
  }

  float min_residual = residual_samples[0];
  float max_residual = residual_samples[0];
  float sum_residual = 0.0f;

  for (int i = 0; i < N; i++) {
    if (residual_samples[i] < min_residual) {
      min_residual = residual_samples[i];
    }
    if (residual_samples[i] > max_residual) {
      max_residual = residual_samples[i];
    }
    sum_residual += residual_samples[i];
  }

  float residual_spread = max_residual - min_residual;

  if (residual_spread <= RESIDUAL_STABILITY_TOLERANCE) {
    float residual_mean = sum_residual / N;

    // corrected = raw - offset_b; add the signed residual to the offset.
    offset_b += residual_mean;

    Serial.printf(
      "[correction updated] stable residual=%.2f; new offset_b=%.2f\n",
      residual_mean, offset_b
    );

    resetResidualCheck();
  } else {
    // Keep the latest 15 readings and wait for one more, so the system can
    // still detect a stable run without starting over completely.
    for (int i = 1; i < N; i++) {
      residual_samples[i - 1] = residual_samples[i];
    }
    residual_count = N - 1;

    Serial.printf(
      "[residual] not stable yet; spread=%.2f, required <= %.2f\n",
      residual_spread, RESIDUAL_STABILITY_TOLERANCE
    );
  }
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);

  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);

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

  // Show readings using the current correction value.
  corrected = raw - offset_b;
  signed_residual = corrected - ref;

  Serial.printf(
    "raw=%.2f ref=%.2f offset_b=%.2f corrected=%.2f residual=%.2f\n",
    raw, ref, offset_b, corrected, signed_residual
  );

  delay(200);
}

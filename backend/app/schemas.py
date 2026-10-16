from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime

class CalibrationEventPayload(BaseModel):
    event_type: str = Field(..., description="INITIAL_STARTUP, DYNAMIC_ADAPTATION, RECALIBRATION_MANUAL")
    old_offset: float = Field(..., description="Previous offset value")
    new_offset: float = Field(..., description="Resulting offset value (same as old if rejected)")
    residual_avg: float = Field(..., description="Mean residual over 16-sample buffer")
    residual_spread: float = Field(..., description="Peak-to-peak spread (max - min) over 16 samples")
    status: str = Field(..., description="PASSED, REJECTED_INSTABILITY, REJECTED_IMPLAUSIBLE")
    notes: str = Field("", description="Educational reason / diagnostic note")

class TelemetryPayload(BaseModel):
    version: int = Field(1, description="Payload schema version (must be 1)")
    device_id: str = Field(..., min_length=1, max_length=64, description="Unique ESP32 device ID")
    timestamp_ms: int = Field(..., ge=0, description="Monotonic millisecond timestamp from ESP32 millis()")
    sensor_raw: float = Field(..., ge=0.0, le=100.0, description="Sensor potentiometer reading (0-100 scale)")
    reference_raw: float = Field(..., ge=0.0, le=100.0, description="Reference potentiometer reading (0-100 scale)")
    offset: float = Field(..., ge=-100.0, le=100.0, description="Current additive calibration offset")
    sensor_corrected: float = Field(..., description="Corrected sensor value: raw - offset")
    residual: float = Field(..., description="Signed residual: corrected - reference")
    cal_state: str = Field("CALIBRATED", description="NOT_CALIBRATED, CALIBRATING, CALIBRATED, FAILED")
    cal_result: str = Field("STABLE", description="STABLE, DRIFT_DETECTED, ADAPTATION_APPLIED, REJECTED_INSTABILITY, NONE")
    led_state: int = Field(..., ge=0, le=1, description="Status LED state (1 = ON/Green, 0 = OFF)")
    calibration_event: Optional[CalibrationEventPayload] = None

    @field_validator("version")
    @classmethod
    def validate_version(cls, v: int) -> int:
        if v != 1:
            raise ValueError(f"Unsupported payload version {v}. Expected version 1.")
        return v

class ReadingItem(BaseModel):
    id: int
    device_id: str
    timestamp_ms: int
    received_at: str
    sensor_raw: float
    reference_raw: float
    offset: float
    sensor_corrected: float
    residual: float
    residual_abs: float
    cal_state: str
    cal_result: str
    led_state: int
    sequence_num: int

class ReadingHistoryResponse(BaseModel):
    total_count: int
    page: int
    limit: int
    items: List[ReadingItem]

class CalibrationEventItem(BaseModel):
    id: int
    device_id: str
    event_type: str
    timestamp_ms: int
    received_at: str
    old_offset: float
    new_offset: float
    residual_avg: float
    residual_spread: float
    status: str
    notes: str

class CalibrationHistoryResponse(BaseModel):
    total_count: int
    items: List[CalibrationEventItem]

class DeviceStatusResponse(BaseModel):
    device_id: str
    connected: bool
    last_seen: Optional[str]
    last_timestamp_ms: Optional[int]
    cal_state: str
    current_offset: float
    led_state: int
    explanation: str

class HealthResponse(BaseModel):
    status: str
    version: str
    database: str
    timestamp: str

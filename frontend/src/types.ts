export interface Reading {
  id: number;
  device_id: string;
  timestamp_ms: number;
  received_at: string;
  sensor_raw: number;
  reference_raw: number;
  offset: number;
  sensor_corrected: number;
  residual: number;
  residual_abs: number;
  cal_state: 'NOT_CALIBRATED' | 'CALIBRATING' | 'CALIBRATED' | 'FAILED';
  cal_result: 'STABLE' | 'DRIFT_DETECTED' | 'ADAPTATION_APPLIED' | 'REJECTED_INSTABILITY' | 'REJECTED_IMPLAUSIBLE' | 'NONE';
  led_state: number;
  sequence_num: number;
}

export interface CalibrationEvent {
  id: number;
  device_id: string;
  event_type: 'INITIAL_STARTUP' | 'DYNAMIC_ADAPTATION' | 'RECALIBRATION_MANUAL';
  timestamp_ms: number;
  received_at: string;
  old_offset: number;
  new_offset: number;
  residual_avg: number;
  residual_spread: number;
  status: 'PASSED' | 'REJECTED_INSTABILITY' | 'REJECTED_IMPLAUSIBLE';
  notes: string;
}

export interface DeviceStatus {
  device_id: string;
  connected: boolean;
  last_seen: string | null;
  last_timestamp_ms: number | null;
  cal_state: 'NOT_CALIBRATED' | 'CALIBRATING' | 'CALIBRATED' | 'FAILED';
  current_offset: number;
  led_state: number;
  explanation: string;
}

export interface HistoryFilter {
  startTime?: string;
  endTime?: string;
  page: number;
  limit: number;
}

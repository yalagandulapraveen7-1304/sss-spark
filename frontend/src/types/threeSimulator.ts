export type SensorId = "A" | "B" | "C";
export const SENSOR_IDS: SensorId[] = ["A", "B", "C"];

export type SensorStatus = "healthy" | "warning" | "corrected" | "critical" | "unknown" | "disconnected";

export interface Sensor3DReading {
  id: SensorId;
  rawReading: number | null;
  referenceDistance: number | null;
  residual: number | null;
  correction: number | null;
  correctedReading: number | null;
  correctionApplied: boolean | null;
  status: SensorStatus;
  rawStatus: string | null;
}

export interface Sensor3DSnapshot {
  timestamp: Date | null;
  distanceToWall: number | null;
  sensors: Partial<Record<SensorId, Sensor3DReading>>;
  source: "live" | "demo";
}

export type CameraView = "front" | "side" | "top" | "reset";

export interface SceneHandle {
  setView: (v: CameraView) => void;
}

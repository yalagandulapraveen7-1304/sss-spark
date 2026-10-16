import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ThreeDScene } from './ThreeDScene';
import type { SceneHandle, CameraView, SensorStatus, SensorId } from '../../types/threeSimulator';
import type { Reading, DeviceStatus } from '../../types';
import {
  Eye,
  Camera,
  ArrowUp,
  ArrowDown,
  Pause,
  RotateCcw,
  Radio,
  Sparkles,
  Info,
  ShieldCheck,
  AlertTriangle,
  Cpu
} from 'lucide-react';

interface ThreeDSimulatorProps {
  latestReading: Reading | null;
  deviceStatus: DeviceStatus | null;
  wsConnected: boolean;
}

const MIN_DIST = 0.5;
const MAX_DIST = 10.0;
const DEFAULT_DIST = 3.5;
const SPEED = 1.2; // m/s

export const ThreeDSimulator: React.FC<ThreeDSimulatorProps> = ({
  latestReading,
  deviceStatus,
  wsConnected
}) => {
  const sceneRef = useRef<SceneHandle>(null);
  const [distance, setDistance] = useState<number>(DEFAULT_DIST);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const [useLiveDistance, setUseLiveDistance] = useState<boolean>(false);
  const [hasWebGLError, setHasWebGLError] = useState<boolean>(false);

  // Check WebGL availability safely on mount
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setHasWebGLError(true);
      }
    } catch {
      setHasWebGLError(true);
    }
  }, []);

  const distRef = useRef<number>(distance);
  distRef.current = distance;

  // Map 0-100 ESP32 normalized scale to 0.5m - 5.0m realistic visual parking range
  const mappedBackendMeters = useMemo(() => {
    if (!latestReading) return null;
    // 0 -> 0.5m, 100 -> 5.0m
    return 0.5 + (latestReading.sensor_corrected / 100.0) * 4.5;
  }, [latestReading]);

  // If Live Distance mode is active, smoothly follow live reading
  useEffect(() => {
    if (useLiveDistance && mappedBackendMeters !== null) {
      setDistance(mappedBackendMeters);
    }
  }, [useLiveDistance, mappedBackendMeters]);

  // Keyboard navigation (ArrowUp, ArrowDown, Space)
  const toward = useCallback(() => {
    setUseLiveDistance(false);
    setDirection(-1);
  }, []);

  const away = useCallback(() => {
    setUseLiveDistance(false);
    setDirection(1);
  }, []);

  const stop = useCallback(() => {
    setDirection(0);
  }, []);

  const resetPos = useCallback(() => {
    setDirection(0);
    setUseLiveDistance(false);
    setDistance(DEFAULT_DIST);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable ||
          el.getAttribute('role') === 'slider')
      )
        return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        toward();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        away();
      } else if (e.key === ' ') {
        e.preventDefault();
        stop();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toward, away, stop]);

  // Motion animation loop for interactive driving
  useEffect(() => {
    if (direction === 0 || useLiveDistance) return;

    let raf = 0;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      const next = Math.min(MAX_DIST, Math.max(MIN_DIST, distRef.current + direction * SPEED * dt));
      setDistance(next);

      if (next <= MIN_DIST || next >= MAX_DIST) {
        setDirection(0);
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [direction, useLiveDistance]);

  // Map ESP32 sensor state to 3D sensor statuses
  const sensorStatuses: Record<SensorId, SensorStatus> = useMemo(() => {
    if (!latestReading) {
      return { A: 'healthy', B: 'healthy', C: 'healthy' };
    }

    let centerStatus: SensorStatus = 'healthy';
    if (latestReading.cal_result === 'DRIFT_DETECTED') {
      centerStatus = 'warning';
    } else if (latestReading.cal_state === 'FAILED' || Math.abs(latestReading.residual) > 15.0) {
      centerStatus = 'critical';
    } else if (latestReading.cal_result === 'ADAPTATION_APPLIED') {
      centerStatus = 'corrected';
    } else if (latestReading.led_state === 1) {
      centerStatus = 'healthy';
    }

    return {
      A: 'healthy', // Left corner reference
      B: centerStatus, // Primary center sensor driven by ESP32 GPIO 34/35
      C: 'healthy', // Right corner reference
    };
  }, [latestReading]);

  const view = (v: CameraView) => {
    sceneRef.current?.setView(v);
  };

  return (
    <div className="three-simulator-container">
      {/* 3D Scene Viewport Card */}
      <div className="card three-scene-panel">
        <div className="card-header">
          <div className="card-title-group">
            <Radio size={18} className="text-cyan" />
            <h3>3D Digital Twin: Reverse-Parking Ultrasonic Model</h3>
          </div>

          <div className="three-camera-actions">
            {(
              [
                ['front', 'Front'],
                ['side', 'Side'],
                ['top', 'Top'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => view(v)}
                className="btn btn-sm btn-outline"
                title={`Switch camera to ${label} angle`}
              >
                <Eye size={13} /> {label}
              </button>
            ))}
            <button
              onClick={() => view('reset')}
              className="btn btn-sm btn-secondary"
              title="Reset camera to default perspective"
            >
              <Camera size={13} /> Reset View
            </button>
          </div>
        </div>

        {/* 3D Canvas Container */}
        <div className="three-canvas-viewport">
          {hasWebGLError ? (
            <div className="webgl-fallback">
              <AlertTriangle size={32} className="text-amber" />
              <h4>WebGL Not Available</h4>
              <p>
                Your browser or environment does not support WebGL hardware acceleration. The 2D
                sensor telemetry dashboard remains fully operational.
              </p>
            </div>
          ) : (
            <React.Suspense
              fallback={
                <div className="webgl-loading">
                  <div className="spin-loader"></div>
                  <span>Loading 3D Vehicle & Acoustic Scene...</span>
                </div>
              }
            >
              <ThreeDScene
                ref={sceneRef}
                distance={distance}
                backendDistance={mappedBackendMeters}
                statuses={sensorStatuses}
              />
            </React.Suspense>
          )}

          {/* Floating Distance Overlay */}
          <div className="floating-distance-overlay">
            <span className="overlay-label">Distance to Wall / Obstacle</span>
            <div className="overlay-val font-mono">{distance.toFixed(2)} m</div>
            <span className="overlay-sub">
              {useLiveDistance
                ? 'Driven by ESP32 live reading'
                : 'Interactive 3D simulation distance'}
            </span>
            {mappedBackendMeters !== null && !useLiveDistance && (
              <div className="backend-reported-pill font-mono">
                Live Sensor: {mappedBackendMeters.toFixed(2)} m
              </div>
            )}
          </div>
        </div>

        {/* 3D Interactive Vehicle Controls */}
        <div className="three-controls-bar">
          <div className="slider-control-group">
            <div className="slider-header">
              <label htmlFor="dist-slider">Wall Distance Slider</label>
              <span className="font-mono">{distance.toFixed(2)} m</span>
            </div>
            <input
              id="dist-slider"
              type="range"
              min={MIN_DIST}
              max={MAX_DIST}
              step={0.05}
              value={distance}
              onChange={(e) => {
                setUseLiveDistance(false);
                stop();
                setDistance(Number(e.target.value));
              }}
              className="distance-range-slider"
            />
            <div className="slider-ticks font-mono">
              <span>{MIN_DIST.toFixed(1)}m (Danger)</span>
              <span>{DEFAULT_DIST.toFixed(1)}m (Normal)</span>
              <span>{MAX_DIST.toFixed(1)}m (Clear)</span>
            </div>
          </div>

          <div className="motion-buttons-group">
            <button
              onClick={toward}
              className={`btn btn-sm ${direction === -1 ? 'btn-primary' : 'btn-outline'}`}
              title="Reverse vehicle closer to the obstacle (Arrow Up)"
            >
              <ArrowUp size={14} /> Toward Wall
            </button>
            <button
              onClick={away}
              className={`btn btn-sm ${direction === 1 ? 'btn-primary' : 'btn-outline'}`}
              title="Drive vehicle away from the obstacle (Arrow Down)"
            >
              <ArrowDown size={14} /> Away
            </button>
            <button
              onClick={stop}
              className="btn btn-sm btn-outline"
              title="Stop vehicle motion (Spacebar)"
            >
              <Pause size={14} /> Stop
            </button>
            <button
              onClick={resetPos}
              className="btn btn-sm btn-secondary"
              title="Reset position to default distance"
            >
              <RotateCcw size={14} /> Reset
            </button>

            {mappedBackendMeters !== null && (
              <button
                onClick={() => setUseLiveDistance((prev) => !prev)}
                className={`btn btn-sm ${useLiveDistance ? 'btn-primary' : 'btn-secondary'}`}
                title="Lock 3D car position to live ESP32 sensor stream"
              >
                <Sparkles size={14} />
                {useLiveDistance ? 'Live Tracking Active' : 'Follow Live Sensor'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Side Panel: Live Sensor Mapping & Multi-Sensor Beam Status */}
      <div className="three-side-panel">
        <div className="card live-mapping-card">
          <div className="card-header">
            <div className="card-title-group">
              <Cpu size={18} className="text-blue" />
              <h3>Live ESP32 Hardware Integration</h3>
            </div>
            <span
              className={`badge ${wsConnected && latestReading ? 'badge-green' : 'badge-amber'}`}
            >
              {wsConnected && latestReading ? 'Live Data Connected' : 'Waiting for Telemetry'}
            </span>
          </div>

          <div className="mapping-metrics-list">
            <div className="mapping-row">
              <span className="mapping-label">Device Identifier:</span>
              <span className="mapping-val font-mono">
                {deviceStatus?.device_id || 'esp32-park-01'}
              </span>
            </div>
            <div className="mapping-row">
              <span className="mapping-label">Transducer B (Center):</span>
              <span className="mapping-val font-mono text-cyan">
                {latestReading ? `${latestReading.sensor_raw.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div className="mapping-row">
              <span className="mapping-label">Ground Truth Reference:</span>
              <span className="mapping-val font-mono text-amber">
                {latestReading ? `${latestReading.reference_raw.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div className="mapping-row">
              <span className="mapping-label">Active Calibration Offset:</span>
              <span className="mapping-val font-mono text-green font-bold">
                {latestReading ? `${latestReading.offset.toFixed(2)}` : '0.00'}
              </span>
            </div>
            <div className="mapping-row">
              <span className="mapping-label">Corrected Visual Distance:</span>
              <span className="mapping-val font-mono highlight-green">
                {mappedBackendMeters !== null ? `${mappedBackendMeters.toFixed(2)} m` : '—'}
              </span>
            </div>
            <div className="mapping-row">
              <span className="mapping-label">Signed Residual Error:</span>
              <span
                className={`mapping-val font-mono ${
                  latestReading && Math.abs(latestReading.residual) > 3.0
                    ? 'text-red font-bold'
                    : 'text-blue'
                }`}
              >
                {latestReading
                  ? `${latestReading.residual >= 0 ? '+' : ''}${latestReading.residual.toFixed(2)}`
                  : '0.00'}
              </span>
            </div>
            <div className="mapping-row">
              <span className="mapping-label">Bumper Status LED:</span>
              <span className="mapping-val">
                <span
                  className={`led-mini ${
                    latestReading?.led_state === 1 ? 'led-mini-green' : 'led-mini-off'
                  }`}
                >
                  {latestReading?.led_state === 1 ? 'GREEN (0 Error)' : 'OFF (Error)'}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* 3D Ultrasonic Transducer Array */}
        <div className="card transducer-array-card">
          <div className="card-header">
            <div className="card-title-group">
              <ShieldCheck size={18} className="text-green" />
              <h3>3-Transducer Bumper Array</h3>
            </div>
          </div>

          <div className="transducers-grid">
            <div className="transducer-chip chip-a">
              <span className="chip-id">Sensor A (Left)</span>
              <span className="chip-angle font-mono">-15° Corner</span>
              <span className="chip-status text-green">● Healthy</span>
            </div>
            <div className="transducer-chip chip-b highlight-chip">
              <span className="chip-id">Sensor B (Center)</span>
              <span className="chip-angle font-mono">0° Primary (ESP32)</span>
              <span
                className={`chip-status ${
                  sensorStatuses.B === 'healthy'
                    ? 'text-green'
                    : sensorStatuses.B === 'warning'
                    ? 'text-amber'
                    : 'text-red'
                }`}
              >
                ● {sensorStatuses.B.toUpperCase()}
              </span>
            </div>
            <div className="transducer-chip chip-c">
              <span className="chip-id">Sensor C (Right)</span>
              <span className="chip-angle font-mono">+15° Corner</span>
              <span className="chip-status text-green">● Healthy</span>
            </div>
          </div>
        </div>

        {/* Educational Callout */}
        <div className="card educational-model-card">
          <div className="card-header">
            <div className="card-title-group">
              <Info size={16} className="text-cyan" />
              <h4>How the 3D Model Integrates</h4>
            </div>
          </div>
          <p className="educational-note">
            The 3D vehicle visualizes acoustic sound pulses emitted from the rear bumper. When you
            turn the physical potentiometer in Wokwi or hardware, the corrected reading shifts the
            beam distance and illuminates the sensor LEDs in real time!
          </p>
        </div>
      </div>
    </div>
  );
};

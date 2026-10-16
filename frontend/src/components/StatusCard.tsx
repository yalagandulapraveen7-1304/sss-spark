import React from 'react';
import type { DeviceStatus, Reading } from '../types';
import { CheckCircle2, AlertTriangle, RefreshCw, Cpu, Gauge } from 'lucide-react';

interface StatusCardProps {
  status: DeviceStatus | null;
  latestReading: Reading | null;
}

export const StatusCard: React.FC<StatusCardProps> = ({ status, latestReading }) => {
  const calState = latestReading?.cal_state || status?.cal_state || 'NOT_CALIBRATED';
  const currentOffset = latestReading?.offset ?? status?.current_offset ?? 0.0;
  const isLedOn = latestReading ? latestReading.led_state === 1 : status?.led_state === 1;
  const residual = latestReading?.residual ?? 0.0;
  const isConnected = status?.connected ?? false;

  const getCalBadge = () => {
    switch (calState) {
      case 'CALIBRATING':
        return (
          <span className="badge badge-amber">
            <RefreshCw className="spin" size={14} />
            <span>Calibrating (16 samples)</span>
          </span>
        );
      case 'CALIBRATED':
        return (
          <span className="badge badge-green">
            <CheckCircle2 size={14} />
            <span>Calibrated & Active</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="badge badge-red">
            <AlertTriangle size={14} />
            <span>Calibration Failed / Rejected</span>
          </span>
        );
      default:
        return (
          <span className="badge badge-gray">
            <span>Not Calibrated</span>
          </span>
        );
    }
  };

  return (
    <div className="status-grid">
      <div className="card status-summary-card">
        <div className="card-header">
          <div className="card-title-group">
            <Cpu size={18} />
            <h3>Park-Assist Controller State</h3>
          </div>
          {getCalBadge()}
        </div>

        <div className="status-metrics-row">
          <div className="metric-box">
            <span className="metric-label">Device Identifier</span>
            <span className="metric-value code-font">{status?.device_id || 'esp32-park-01'}</span>
            <span className="metric-subtext">
              Status: <span className={isConnected ? 'text-green' : 'text-red'}>{isConnected ? 'Live' : 'Disconnected'}</span>
            </span>
          </div>

          <div className="metric-box">
            <span className="metric-label">Active Calibration Offset</span>
            <span className="metric-value font-mono highlight-blue">
              {currentOffset >= 0 ? `+${currentOffset.toFixed(2)}` : currentOffset.toFixed(2)}
            </span>
            <span className="metric-subtext">Sensor zero-point shift</span>
          </div>

          <div className="metric-box">
            <span className="metric-label">Hardware Status LED (GPIO 25)</span>
            <div className="led-indicator-container">
              <div className={`hardware-led ${isLedOn ? 'led-green-glowing' : 'led-off'}`}></div>
              <span className="led-label font-mono">
                {isLedOn ? 'GREEN (0 Error / Agreement)' : 'OFF (Error / Residual > 1.0)'}
              </span>
            </div>
            <span className="metric-subtext">Physical vehicle cluster indicator</span>
          </div>

          <div className="metric-box">
            <span className="metric-label">Current Residual Error</span>
            <span className={`metric-value font-mono ${Math.abs(residual) <= 1.0 ? 'text-green' : Math.abs(residual) <= 3.0 ? 'text-amber' : 'text-red'}`}>
              {residual >= 0 ? `+${residual.toFixed(2)}` : residual.toFixed(2)}
            </span>
            <span className="metric-subtext">
              {Math.abs(residual) <= 1.0 ? 'Within Zero Tolerance' : Math.abs(residual) <= 3.0 ? 'Minor Variation' : 'Drift > 3.0 (Monitored)'}
            </span>
          </div>
        </div>

        <div className="explanation-callout">
          <Gauge size={18} className="callout-icon" />
          <div className="callout-content">
            <strong>System Operational Context:</strong>
            <p>{status?.explanation || 'Waiting for initial telemetry stream from ESP32...'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

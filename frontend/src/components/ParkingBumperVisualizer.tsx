import React from 'react';
import type { Reading } from '../types';
import { Car, Info } from 'lucide-react';

interface VisualizerProps {
  reading: Reading | null;
}

export const ParkingBumperVisualizer: React.FC<VisualizerProps> = ({ reading }) => {
  const sensorRaw = reading?.sensor_raw ?? 50.0;
  const refRaw = reading?.reference_raw ?? 50.0;
  const sensorCorr = reading?.sensor_corrected ?? 50.0;
  const residual = reading?.residual ?? 0.0;

  // Convert 0-100 normalized reading to approximate physical metric distance (0 to 2.5 meters)
  const approxDistanceMeters = (val: number) => ((val / 100.0) * 2.5).toFixed(2);

  // Proximity zone classification
  const getProximityZone = (distVal: number) => {
    if (distVal > 60.0) return { label: 'Clear Zone (> 1.5m)', colorClass: 'zone-green', chime: 'Intermittent Beep' };
    if (distVal > 30.0) return { label: 'Warning Zone (0.8m - 1.5m)', colorClass: 'zone-amber', chime: 'Rapid Pulsing Beep' };
    return { label: 'Danger / Stop Zone (< 0.8m)', colorClass: 'zone-red', chime: 'Continuous Tone' };
  };

  const zone = getProximityZone(sensorCorr);

  return (
    <div className="card visualizer-card">
      <div className="card-header">
        <div className="card-title-group">
          <Car size={20} />
          <h3>Reverse Parking Scene & Sensor Health Model</h3>
        </div>
        <span className={`proximity-pill ${zone.colorClass}`}>
          {zone.label}
        </span>
      </div>

      <div className="visualizer-stage">
        {/* Car Bumper Simulation Representation */}
        <div className="car-bumper-area">
          <div className="bumper-graphic">
            <div className="bumper-plate">REAR VEHICLE BUMPER</div>
            <div className="ultrasonic-transducer-mount">
              <div className="transducer-dot"></div>
              <span className="transducer-label">Ultrasonic Transducer (GPIO 34)</span>
            </div>
            <div className="reference-sensor-mount">
              <div className="transducer-dot ref-dot"></div>
              <span className="transducer-label">Reference / Redundant (GPIO 35)</span>
            </div>
          </div>

          {/* Sound Wave / Measurement Gap Graphic */}
          <div className="acoustic-wave-field">
            <div
              className={`acoustic-cone ${zone.colorClass}`}
              style={{ width: `${Math.min(Math.max(sensorCorr, 15), 95)}%` }}
            >
              <div className="wave-ripple ripple-1"></div>
              <div className="wave-ripple ripple-2"></div>
              <div className="wave-ripple ripple-3"></div>
            </div>

            <div
              className="simulated-obstacle"
              style={{ left: `${Math.min(Math.max(sensorCorr, 15), 95)}%` }}
            >
              <div className="obstacle-wall"></div>
              <span className="obstacle-label">Simulated Obstacle</span>
            </div>
          </div>
        </div>

        {/* Distance Comparison Gauges */}
        <div className="distance-comparison-grid">
          <div className="dist-box sensor-box">
            <span className="dist-title">1. Raw Sensor Reading</span>
            <span className="dist-number font-mono">{sensorRaw.toFixed(1)}%</span>
            <span className="dist-sub">~{approxDistanceMeters(sensorRaw)}m (with physical offset)</span>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill fill-amber" style={{ width: `${sensorRaw}%` }}></div>
            </div>
          </div>

          <div className="dist-box ref-box">
            <span className="dist-title">2. Reference Signal</span>
            <span className="dist-number font-mono">{refRaw.toFixed(1)}%</span>
            <span className="dist-sub">~{approxDistanceMeters(refRaw)}m (ground truth baseline)</span>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill fill-cyan" style={{ width: `${refRaw}%` }}></div>
            </div>
          </div>

          <div className="dist-box corr-box">
            <span className="dist-title">3. Corrected Distance</span>
            <span className="dist-number font-mono highlight-green">{sensorCorr.toFixed(1)}%</span>
            <span className="dist-sub">~{approxDistanceMeters(sensorCorr)}m (driver display distance)</span>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill fill-green" style={{ width: `${sensorCorr}%` }}></div>
            </div>
          </div>
        </div>

        {/* Critical Educational Disambiguation Banner */}
        <div className="distinction-alert">
          <Info size={18} className="alert-icon" />
          <div className="alert-text">
            <strong>Key Automotive Insight: Residual Event vs. Obstacle Detection:</strong>
            <p>
              In this educational model, when the sensor reading deviates from the reference, the signed residual is{' '}
              <code className="code-tag">{residual >= 0 ? `+${residual.toFixed(2)}` : residual.toFixed(2)}</code>.
              {Math.abs(residual) > 3.0 ? (
                <span>
                  {' '}The controller detects persistent drift. If this is a real car, a moving pedestrian or backing closer to a post is a <strong>REAL SCENE CHANGE</strong>, not sensor drift. Automatically erasing persistent residuals is only safe when the reference is certified to measure the exact same stationary target!
                </span>
              ) : (
                <span>
                  {' '}Sensor and reference readings agree within normal tolerance. Driver warning chime:{' '}
                  <strong>{zone.chime}</strong>.
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

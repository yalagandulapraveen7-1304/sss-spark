import React from 'react';
import { X, Sliders, AlertCircle, Compass, Cpu, ExternalLink } from 'lucide-react';

interface SimulationGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SimulationGuide: React.FC<SimulationGuideProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Sliders size={20} className="text-amber" />
            <h3>Wokwi Simulation Controls & Educational Scenarios</h3>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body guide-body">
          {/* Hardware Potentiometer Mapping */}
          <div className="guide-section">
            <h4 className="guide-subtitle">
              <Cpu size={16} /> 1. How Wokwi Potentiometers Map to the Model
            </h4>
            <div className="pot-mapping-cards">
              <div className="pot-card">
                <span className="pot-badge sensor-badge">GPIO 34: Sensor Potentiometer (pot_sensor)</span>
                <p>
                  <strong>Simulates:</strong> The ultrasonic obstacle sensor under test, including its inherent mounting bias, thermal variation, and transducer drift.
                </p>
                <div className="pot-meta">
                  <span>Wokwi Setting: <strong>550</strong></span>
                  <span>ADC Output: ~2200 counts (~53.7% scale)</span>
                </div>
              </div>

              <div className="pot-card">
                <span className="pot-badge ref-badge">GPIO 35: Reference Potentiometer (pot_ref)</span>
                <p>
                  <strong>Simulates:</strong> A known ground-truth reference baseline or redundant secondary verification sensor measuring the target distance.
                </p>
                <div className="pot-meta">
                  <span>Wokwi Setting: <strong>500</strong></span>
                  <span>ADC Output: ~2000 counts (~48.8% scale)</span>
                </div>
              </div>
            </div>
            <p className="note-text">
              * Note: In Wokwi, the potentiometer dial ranges from 0 to 1023 (representing 0V to 3.3V). The ESP32 converts this via 12-bit ADC to a normalized 0–100 scale.
            </p>
          </div>

          {/* Test Scenarios */}
          <div className="guide-section">
            <h4 className="guide-subtitle">
              <Compass size={16} /> 2. Hands-on Test Scenarios to Try in Wokwi
            </h4>

            <div className="scenario-list">
              <div className="scenario-item">
                <span className="scenario-num">A</span>
                <div className="scenario-content">
                  <h5>Normal Operation (0 Residual / Green LED ON)</h5>
                  <p>
                    Leave both potentiometers at their startup positions (550 and 500). The startup calibration takes 16 samples, establishes an offset of ~4.9, and brings the corrected residual to <strong>0.00</strong>. The <strong>Green LED glows ON</strong>.
                  </p>
                </div>
              </div>

              <div className="scenario-item">
                <span className="scenario-num">B</span>
                <div className="scenario-content">
                  <h5>Simulating Sensor Drift & Dynamic Adaptation</h5>
                  <p>
                    Turn the <strong>Sensor Potentiometer (pot_sensor)</strong> slightly clockwise (e.g. from 550 to 590).
                    The residual exceeds <strong>+3.0</strong> (Green LED turns OFF). Keep it steady for 16 samples (~3.2 seconds).
                    Because the residual is steady (Spread &lt;= 1.0), the controller adapts by shifting the offset and restoring the Green LED!
                  </p>
                </div>
              </div>

              <div className="scenario-item">
                <span className="scenario-num">C</span>
                <div className="scenario-content">
                  <h5>Unstable Scene / Noise Rejection (Spread &gt; 1.0)</h5>
                  <p>
                    Wiggle the potentiometer back and forth rapidly while the 16-sample buffer is accumulating.
                    The peak-to-peak spread exceeds <strong>1.0</strong>. The controller detects high variance, <strong>rejects the adaptation</strong>, and retains the previous safe offset!
                  </p>
                </div>
              </div>

              <div className="scenario-item">
                <span className="scenario-num">D</span>
                <div className="scenario-content">
                  <h5>Extreme Implausible Offset Rejection (|Offset| &gt; 50.0)</h5>
                  <p>
                    If the sensor potentiometer is dragged all the way to maximum while reference is at zero, the candidate offset exceeds 50.0. The controller flags this as an electrical short or transducer disconnect and rejects the offset.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Real World Distinction Notice */}
          <div className="guide-alert-box">
            <AlertCircle size={20} className="alert-box-icon" />
            <div>
              <strong>Important Automotive Engineering Context:</strong>
              <p>
                This demonstration illustrates an <em>additive offset</em> calibration algorithm. Real automotive ADAS systems must also handle acoustic temperature drift (~0.6 m/s per °C), sensor blind-zones, dirty bumper covers, and non-linear multipath echoes. In production, sensor fusion with cameras and radar ensures that moving obstacles are never mistaken for sensor offset drift.
              </p>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <a
            href="https://wokwi.com/projects/new/esp32"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
            style={{ borderColor: "#f59e0b", color: "#f59e0b", display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ExternalLink size={16} />
            <span>Open Wokwi Circuit Simulator ↗</span>
          </a>
          <button onClick={onClose} className="btn btn-primary">Got it, Let's Test!</button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { BookOpen, X } from 'lucide-react';

interface GlossaryProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Glossary: React.FC<GlossaryProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const terms = [
    {
      term: 'Offset (Additive Calibration Bias)',
      definition:
        'The systematic numerical difference between the sensor’s uncalibrated output and the reference ground truth (Offset = Average(Sensor) - Average(Reference)). In reverse-parking, an offset can be caused by bumper mounting angle, plastic bumper thickness, or internal transducer delay.',
    },
    {
      term: 'Corrected Reading',
      definition:
        'The raw sensor measurement after subtracting the calibrated offset (Corrected = Raw Sensor - Offset). This represents the system’s best estimate of the true physical obstacle distance.',
    },
    {
      term: 'Residual (Signed Error)',
      definition:
        'The difference between the corrected measurement and the reference value (Residual = Corrected - Reference). A positive residual means the sensor reads farther than reference; negative means it reads closer. Under ideal conditions, residual is 0.00.',
    },
    {
      term: 'Variance & Peak-to-Peak Spread',
      definition:
        'A measure of reading noise or instability over a sampling window (Spread = Max(Residual) - Min(Residual)). The algorithm requires Spread <= 1.0 to prove the signal is steady before allowing an offset adaptation.',
    },
    {
      term: 'Calibration (Startup & Dynamic)',
      definition:
        'The process of establishing a mathematical zero-point baseline. Startup calibration takes 16 initial readings when reverse gear is engaged. Dynamic adaptation slowly absorbs persistent steady drift without human intervention.',
    },
    {
      term: 'Simulated Input (Wokwi Potentiometers)',
      definition:
        'Adjustable analog voltage dividers connected to ESP32 ADC pins. They provide repeatable numerical test inputs (0-100 scale) for software verification. They DO NOT simulate actual ultrasonic acoustic echoes, radar reflections, or camera pixels.',
    },
    {
      term: 'Park-Assist System (ISO 17386 MALSO)',
      definition:
        'Manoeuvring Aids for Low Speed Operation. Driver-assistance systems designed to detect obstacles within 0.2m to 2.5m at low speeds (< 10 km/h) using ultrasonic acoustic pulses. They emit audible chimes and visual warnings to help drivers park safely.',
    },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <BookOpen size={20} className="text-cyan" />
            <h3>Automotive Sensing & Calibration Glossary</h3>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="glossary-grid">
            {terms.map((item, idx) => (
              <div key={idx} className="glossary-card">
                <h4 className="glossary-term">{item.term}</h4>
                <p className="glossary-def">{item.definition}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-primary">Close Glossary</button>
        </div>
      </div>
    </div>
  );
};

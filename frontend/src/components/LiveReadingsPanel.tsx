import React from 'react';
import type { Reading } from '../types';
import { Radio, Crosshair, Sparkles, TrendingUp, ShieldAlert, Check } from 'lucide-react';

interface LiveReadingsPanelProps {
  reading: Reading | null;
}

export const LiveReadingsPanel: React.FC<LiveReadingsPanelProps> = ({ reading }) => {
  const sensorRaw = reading?.sensor_raw ?? 0.0;
  const refRaw = reading?.reference_raw ?? 0.0;
  const sensorCorr = reading?.sensor_corrected ?? 0.0;
  const residual = reading?.residual ?? 0.0;
  const residualAbs = reading?.residual_abs ?? 0.0;
  const calResult = reading?.cal_result ?? 'STABLE';

  const isDrift = residualAbs > 3.0;

  return (
    <div className="readings-grid">
      <div className="reading-card">
        <div className="card-top">
          <Radio size={16} className="text-amber" />
          <span className="reading-title">Raw Sensor Value</span>
        </div>
        <div className="reading-metric font-mono">{sensorRaw.toFixed(2)}</div>
        <div className="reading-footer">
          <span>ADC GPIO 34 (0-100 scale)</span>
        </div>
      </div>

      <div className="reading-card">
        <div className="card-top">
          <Crosshair size={16} className="text-cyan" />
          <span className="reading-title">Reference Reading</span>
        </div>
        <div className="reading-metric font-mono">{refRaw.toFixed(2)}</div>
        <div className="reading-footer">
          <span>ADC GPIO 35 (Ground Truth)</span>
        </div>
      </div>

      <div className="reading-card highlight-border">
        <div className="card-top">
          <Sparkles size={16} className="text-green" />
          <span className="reading-title">Corrected Sensor Value</span>
        </div>
        <div className="reading-metric font-mono text-green">{sensorCorr.toFixed(2)}</div>
        <div className="reading-footer">
          <span>Formula: Raw - Offset</span>
        </div>
      </div>

      <div className="reading-card">
        <div className="card-top">
          <TrendingUp size={16} className={isDrift ? 'text-red' : 'text-blue'} />
          <span className="reading-title">Signed Residual</span>
        </div>
        <div className={`reading-metric font-mono ${isDrift ? 'text-red' : 'text-blue'}`}>
          {residual >= 0 ? `+${residual.toFixed(2)}` : residual.toFixed(2)}
        </div>
        <div className="reading-footer">
          <span>Formula: Corrected - Reference</span>
        </div>
      </div>

      <div className="reading-card">
        <div className="card-top">
          <ShieldAlert size={16} className={isDrift ? 'text-red' : 'text-muted'} />
          <span className="reading-title">Residual Magnitude</span>
        </div>
        <div className={`reading-metric font-mono ${isDrift ? 'text-red' : ''}`}>
          {residualAbs.toFixed(2)}
        </div>
        <div className="reading-footer">
          <span className={isDrift ? 'badge-drift' : 'badge-ok'}>
            {isDrift ? 'Drift Alert (> 3.0)' : 'Normal (<= 3.0)'}
          </span>
        </div>
      </div>

      <div className="reading-card">
        <div className="card-top">
          <Check size={16} className={calResult === 'STABLE' ? 'text-green' : 'text-amber'} />
          <span className="reading-title">Stability State</span>
        </div>
        <div className="reading-metric status-text font-mono">
          {calResult}
        </div>
        <div className="reading-footer">
          <span>Spread Limit: &lt;= 1.0 count</span>
        </div>
      </div>
    </div>
  );
};

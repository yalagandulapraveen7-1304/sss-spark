import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import type { Reading } from '../types';
import { LineChart as ChartIcon } from 'lucide-react';

interface LiveChartProps {
  readings: Reading[];
}

export const LiveChart: React.FC<LiveChartProps> = ({ readings }) => {
  // Format data for chart display
  const chartData = readings.map((r) => ({
    time: `${(r.timestamp_ms / 1000).toFixed(1)}s`,
    sensor: r.sensor_raw,
    reference: r.reference_raw,
    corrected: r.sensor_corrected,
    residual: r.residual,
    raw_error: r.sensor_raw - r.reference_raw,
  }));

  return (
    <div className="card chart-card">
      <div className="card-header">
        <div className="card-title-group">
          <ChartIcon size={18} />
          <h3>Real-Time Telemetry & Residual Drift Stream</h3>
        </div>
        <span className="badge badge-gray font-mono">
          Buffer: {readings.length} points
        </span>
      </div>

      <div className="charts-split-container">
        {/* Top Chart: Sensor, Reference & Corrected Reading */}
        <div className="chart-wrapper">
          <span className="chart-legend-title">Sensor Signals vs. Ground Truth Reference (0 - 100 scale)</span>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3342" />
                <XAxis dataKey="time" stroke="#718096" fontSize={11} tickLine={false} />
                <YAxis domain={['auto', 'auto']} stroke="#718096" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#f3f4f6', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
                <Line
                  type="monotone"
                  dataKey="sensor"
                  name="Raw Sensor (GPIO 34)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="reference"
                  name="Reference (GPIO 35)"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="corrected"
                  name="Corrected Sensor (Raw - Offset)"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bottom Chart: Signed Residual & Drift Thresholds */}
        <div className="chart-wrapper">
          <span className="chart-legend-title">Signed Residual Error & Drift Thresholds (Target: 0.0)</span>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3342" />
                <XAxis dataKey="time" stroke="#718096" fontSize={11} tickLine={false} />
                <YAxis domain={[-10, 10]} stroke="#718096" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#f3f4f6', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
                <ReferenceLine y={0} stroke="#10b981" strokeWidth={1.5} label={{ value: 'Zero Error', fill: '#10b981', fontSize: 10, position: 'insideTopLeft' }} />
                <ReferenceLine y={3.0} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '+3.0 Drift Threshold', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
                <ReferenceLine y={-3.0} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '-3.0 Drift Threshold', fill: '#ef4444', fontSize: 10, position: 'insideBottomRight' }} />
                <Line
                  type="monotone"
                  dataKey="residual"
                  name="Signed Residual (Corrected - Reference)"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

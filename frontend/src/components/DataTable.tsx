import React, { useState } from 'react';
import type { Reading, HistoryFilter } from '../types';
import { Database, ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { getExportReadingsUrl } from '../api';

interface DataTableProps {
  readings: Reading[];
  totalCount: number;
  filter: HistoryFilter;
  onFilterChange: (newFilter: HistoryFilter) => void;
  onRefresh: () => void;
}

export const DataTable: React.FC<DataTableProps> = ({
  readings,
  totalCount,
  filter,
  onFilterChange,
  onRefresh
}) => {
  const [startTime, setStartTime] = useState(filter.startTime || '');
  const [endTime, setEndTime] = useState(filter.endTime || '');

  const totalPages = Math.ceil(totalCount / filter.limit) || 1;

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({
      ...filter,
      page: 1,
      startTime: startTime || undefined,
      endTime: endTime || undefined
    });
  };

  const handleReset = () => {
    setStartTime('');
    setEndTime('');
    onFilterChange({
      ...filter,
      page: 1,
      startTime: undefined,
      endTime: undefined
    });
  };

  return (
    <div className="card table-card">
      <div className="card-header">
        <div className="card-title-group">
          <Database size={18} />
          <h3>Persistent Historical Telemetry Log</h3>
        </div>

        <div className="table-header-actions">
          <form onSubmit={handleApplyFilter} className="filter-form">
            <input
              type="text"
              placeholder="Start Time (ISO/Text)"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="input-text"
            />
            <input
              type="text"
              placeholder="End Time (ISO/Text)"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="input-text"
            />
            <button type="submit" className="btn btn-sm btn-primary">Filter</button>
            <button type="button" onClick={handleReset} className="btn btn-sm btn-outline">Reset</button>
          </form>

          <button onClick={onRefresh} className="btn btn-sm btn-outline" title="Refresh Table">
            <RefreshCw size={14} />
          </button>

          <a href={getExportReadingsUrl()} download className="btn btn-sm btn-secondary">
            <Download size={14} />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Time (Received)</th>
              <th>ESP32 (ms)</th>
              <th>Raw Sensor</th>
              <th>Reference</th>
              <th>Active Offset</th>
              <th>Corrected Value</th>
              <th>Signed Residual</th>
              <th>Calibration State</th>
              <th>Result</th>
              <th>LED (GPIO 25)</th>
            </tr>
          </thead>
          <tbody>
            {readings.length === 0 ? (
              <tr>
                <td colSpan={11} className="empty-table-cell">
                  No telemetry logged in database yet. Ensure the ESP32 simulator or mock feeder is running.
                </td>
              </tr>
            ) : (
              readings.map((r) => (
                <tr key={r.id}>
                  <td className="code-font">{r.id}</td>
                  <td className="code-font">{new Date(r.received_at).toLocaleTimeString()}</td>
                  <td className="font-mono">{r.timestamp_ms}</td>
                  <td className="font-mono">{r.sensor_raw.toFixed(2)}</td>
                  <td className="font-mono">{r.reference_raw.toFixed(2)}</td>
                  <td className="font-mono text-muted">{r.offset.toFixed(2)}</td>
                  <td className="font-mono text-green font-bold">{r.sensor_corrected.toFixed(2)}</td>
                  <td className="font-mono">
                    <span className={Math.abs(r.residual) > 3.0 ? 'text-red font-bold' : 'text-blue'}>
                      {r.residual >= 0 ? `+${r.residual.toFixed(2)}` : r.residual.toFixed(2)}
                    </span>
                  </td>
                  <td>
                    <span className="pill-small">{r.cal_state}</span>
                  </td>
                  <td>
                    <span className="pill-small">{r.cal_result}</span>
                  </td>
                  <td>
                    <span className={`led-mini ${r.led_state === 1 ? 'led-mini-green' : 'led-mini-off'}`}>
                      {r.led_state === 1 ? 'ON (0 Error)' : 'OFF'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination-bar">
        <span>
          Showing page {filter.page} of {totalPages} ({totalCount} total records)
        </span>
        <div className="pagination-buttons">
          <button
            disabled={filter.page <= 1}
            onClick={() => onFilterChange({ ...filter, page: filter.page - 1 })}
            className="btn btn-sm btn-outline"
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <button
            disabled={filter.page >= totalPages}
            onClick={() => onFilterChange({ ...filter, page: filter.page + 1 })}
            className="btn btn-sm btn-outline"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

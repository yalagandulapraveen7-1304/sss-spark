import React from 'react';
import type { CalibrationEvent } from '../types';
import { History, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface CalibrationHistoryTableProps {
  events: CalibrationEvent[];
}

export const CalibrationHistoryTable: React.FC<CalibrationHistoryTableProps> = ({ events }) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PASSED':
        return (
          <span className="badge badge-green">
            <CheckCircle size={12} />
            <span>Passed & Applied</span>
          </span>
        );
      case 'REJECTED_INSTABILITY':
        return (
          <span className="badge badge-amber">
            <AlertTriangle size={12} />
            <span>Rejected (Spread &gt; 1.0)</span>
          </span>
        );
      case 'REJECTED_IMPLAUSIBLE':
        return (
          <span className="badge badge-red">
            <XCircle size={12} />
            <span>Rejected (|Offset| &gt; 50)</span>
          </span>
        );
      default:
        return <span className="badge badge-gray">{status}</span>;
    }
  };

  return (
    <div className="card table-card">
      <div className="card-header">
        <div className="card-title-group">
          <History size={18} />
          <h3>Calibration & Adaptation Event Ledger</h3>
        </div>
        <span className="badge badge-gray">
          Total Events: {events.length}
        </span>
      </div>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Event Type</th>
              <th>Old Offset</th>
              <th>New Offset</th>
              <th>Residual Avg</th>
              <th>Peak Spread</th>
              <th>Stability & Plausibility Check</th>
              <th>Diagnostic Notes</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-table-cell">
                  No calibration events recorded yet. Perform startup calibration or trigger drift to view events.
                </td>
              </tr>
            ) : (
              events.map((evt) => (
                <tr key={evt.id}>
                  <td className="code-font">{new Date(evt.received_at).toLocaleTimeString()}</td>
                  <td>
                    <span className="event-type-pill">{evt.event_type}</span>
                  </td>
                  <td className="font-mono">{evt.old_offset.toFixed(2)}</td>
                  <td className="font-mono font-bold">
                    <span className={evt.status === 'PASSED' ? 'text-green' : 'text-muted'}>
                      {evt.new_offset.toFixed(2)}
                    </span>
                  </td>
                  <td className="font-mono">{evt.residual_avg.toFixed(2)}</td>
                  <td className="font-mono">
                    <span className={evt.residual_spread <= 1.0 ? 'text-green' : 'text-red font-bold'}>
                      {evt.residual_spread.toFixed(2)}
                    </span>
                  </td>
                  <td>{getStatusBadge(evt.status)}</td>
                  <td className="text-secondary-sub">{evt.notes}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="card-footer-note">
        <strong>Fail-Safe Rule:</strong> If an adaptation check is rejected (e.g., residual spread &gt; 1.0 or offset &gt; 50.0), the previous offset is strictly retained to prevent corrupted calibrations.
      </div>
    </div>
  );
};

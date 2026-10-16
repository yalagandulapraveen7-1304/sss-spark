import React from 'react';
import { Wifi, WifiOff, Download, HelpCircle, Activity } from 'lucide-react';
import { getExportReadingsUrl, getExportCalibrationEventsUrl } from '../api';

interface HeaderProps {
  wsConnected: boolean;
  onOpenGuide: () => void;
  onOpenGlossary: () => void;
}

export const Header: React.FC<HeaderProps> = ({ wsConnected, onOpenGuide, onOpenGlossary }) => {
  return (
    <header className="header-container">
      <div className="header-left">
        <div className="brand-badge">
          <Activity className="icon-pulse" size={22} />
          <span>ISO 17386 MALSO MODEL</span>
        </div>
        <div className="header-titles">
          <h1>Park-Assist Sensor Telemetry & Health Dashboard</h1>
          <p className="subtitle">
            Educational reverse-parking sensor offset calibration, residual monitoring, and drift detection
          </p>
        </div>
      </div>

      <div className="header-actions">
        <div className={`ws-badge ${wsConnected ? 'connected' : 'disconnected'}`}>
          {wsConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
          <span>{wsConnected ? 'Live Stream Active' : 'Connecting to Backend...'}</span>
        </div>

        <a href={getExportReadingsUrl()} download className="btn btn-outline" title="Export readings as CSV">
          <Download size={15} />
          <span>Readings CSV</span>
        </a>

        <a href={getExportCalibrationEventsUrl()} download className="btn btn-outline" title="Export calibration history as CSV">
          <Download size={15} />
          <span>Events CSV</span>
        </a>

        <button onClick={onOpenGuide} className="btn btn-primary" title="View simulation guide & potentiometer mapping">
          <HelpCircle size={15} />
          <span>Simulation Guide</span>
        </button>

        <button onClick={onOpenGlossary} className="btn btn-secondary" title="View technical glossary">
          <span>Glossary</span>
        </button>
      </div>
    </header>
  );
};

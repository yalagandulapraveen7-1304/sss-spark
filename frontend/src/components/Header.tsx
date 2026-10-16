import React from 'react';
import { Wifi, WifiOff, Download, HelpCircle, Activity, Box, LayoutDashboard } from 'lucide-react';
import { getExportReadingsUrl, getExportCalibrationEventsUrl } from '../api';

interface HeaderProps {
  wsConnected: boolean;
  currentTab: 'dashboard' | '3d-simulator';
  onTabChange: (tab: 'dashboard' | '3d-simulator') => void;
  onOpenGuide: () => void;
  onOpenGlossary: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  wsConnected,
  currentTab,
  onTabChange,
  onOpenGuide,
  onOpenGlossary
}) => {
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
            Educational reverse-parking sensor offset calibration, residual monitoring, and 3D digital twin
          </p>
        </div>
      </div>

      {/* Navigation View Switcher */}
      <div className="view-switcher-tabs">
        <button
          onClick={() => onTabChange('dashboard')}
          className={`nav-tab-btn ${currentTab === 'dashboard' ? 'active-tab' : ''}`}
        >
          <LayoutDashboard size={16} />
          <span>Telemetry Dashboard</span>
        </button>
        <button
          onClick={() => onTabChange('3d-simulator')}
          className={`nav-tab-btn ${currentTab === '3d-simulator' ? 'active-tab' : ''}`}
        >
          <Box size={16} />
          <span>3D Simulator Twin</span>
        </button>
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

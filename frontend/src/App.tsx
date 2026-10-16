import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { StatusCard } from './components/StatusCard';
import { ParkingBumperVisualizer } from './components/ParkingBumperVisualizer';
import { LiveReadingsPanel } from './components/LiveReadingsPanel';
import { LiveChart } from './components/LiveChart';
import { CalibrationHistoryTable } from './components/CalibrationHistoryTable';
import { DataTable } from './components/DataTable';
import { Glossary } from './components/Glossary';
import { SimulationGuide } from './components/SimulationGuide';
import { ThreeDSimulator } from './components/three/ThreeDSimulator';

import {
  fetchDeviceStatus,
  fetchReadingsHistory,
  fetchCalibrationEvents,
  createWebSocketConnection
} from './api';
import type { Reading, CalibrationEvent, DeviceStatus, HistoryFilter } from './types';

export const App: React.FC = () => {
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [liveReadings, setLiveReadings] = useState<Reading[]>([]);
  const [calibrationEvents, setCalibrationEvents] = useState<CalibrationEvent[]>([]);
  const [historyReadings, setHistoryReadings] = useState<Reading[]>([]);
  const [historyTotal, setHistoryTotal] = useState<number>(0);
  const [filter, setFilter] = useState<HistoryFilter>({ page: 1, limit: 10 });

  const [currentTab, setCurrentTab] = useState<'dashboard' | '3d-simulator'>('dashboard');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [isGlossaryOpen, setIsGlossaryOpen] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);

  // 1. Initial State Hydration via REST
  const refreshHistory = async () => {
    try {
      const data = await fetchReadingsHistory(filter);
      setHistoryReadings(data.items);
      setHistoryTotal(data.total_count);
    } catch (e) {
      console.warn('Could not fetch historical readings:', e);
    }
  };

  const refreshCalibrationEvents = async () => {
    try {
      const data = await fetchCalibrationEvents(50);
      setCalibrationEvents(data.items);
    } catch (e) {
      console.warn('Could not fetch calibration events:', e);
    }
  };

  const refreshDevice = async () => {
    try {
      const data = await fetchDeviceStatus();
      setDeviceStatus(data);
    } catch (e) {
      console.warn('Could not fetch device status:', e);
    }
  };

  useEffect(() => {
    refreshDevice();
    refreshCalibrationEvents();
    refreshHistory();
  }, [filter]);

  // 2. WebSocket Connection Lifecycle
  useEffect(() => {
    let reconnectTimeout: any = null;

    const connect = () => {
      wsRef.current = createWebSocketConnection(
        (data) => {
          if (data.type === 'init') {
            if (data.device) setDeviceStatus(data.device);
            if (data.recent_readings) setLiveReadings(data.recent_readings);
          } else if (data.type === 'telemetry') {
            const reading: Reading = data.reading;
            setLiveReadings((prev) => {
              const updated = [...prev, reading];
              return updated.slice(-40); // Keep last 40 rolling points
            });

            if (data.device) {
              setDeviceStatus((prev) => ({
                ...(prev || {}),
                ...data.device,
                last_seen: reading.received_at,
                last_timestamp_ms: reading.timestamp_ms
              }));
            }

            if (data.calibration_event) {
              setCalibrationEvents((prev) => [
                {
                  id: Date.now(),
                  device_id: reading.device_id,
                  received_at: reading.received_at,
                  timestamp_ms: reading.timestamp_ms,
                  ...data.calibration_event
                },
                ...prev
              ]);
            }
          }
        },
        (connected) => {
          setWsConnected(connected);
          if (!connected) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        }
      );
    };

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const latestReading = liveReadings.length > 0 ? liveReadings[liveReadings.length - 1] : null;

  return (
    <div className="app-layout">
      {/* Educational Banner */}
      <div className="disclaimer-banner">
        <span>
          <strong>EDUCATIONAL MODEL / REVERSE-PARKING ASSIST SIMULATION:</strong> This web prototype models ultrasonic sensor calibration behavior in a simplified lab context. It does not interface with real vehicle brakes, steering, or functional safety ECUs.
        </span>
      </div>

      {/* Main Header with View Switcher */}
      <Header
        wsConnected={wsConnected}
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenGlossary={() => setIsGlossaryOpen(true)}
      />

      <main className="main-content">
        {currentTab === 'dashboard' ? (
          <>
            {/* Top: Controller Status Summary */}
            <StatusCard status={deviceStatus} latestReading={latestReading} />

            {/* Center: Interactive Parking Visualizer */}
            <ParkingBumperVisualizer reading={latestReading} />

            {/* Live Metric Readout Cards */}
            <LiveReadingsPanel reading={latestReading} />

            {/* Rolling Time-Series Dual Chart */}
            <LiveChart readings={liveReadings} />

            {/* Calibration & Adaptation History Table */}
            <CalibrationHistoryTable events={calibrationEvents} />

            {/* Persistent Telemetry Log & Filter Table */}
            <DataTable
              readings={historyReadings}
              totalCount={historyTotal}
              filter={filter}
              onFilterChange={setFilter}
              onRefresh={refreshHistory}
            />
          </>
        ) : (
          /* 3D Digital Twin Simulation View */
          <ThreeDSimulator
            latestReading={latestReading}
            deviceStatus={deviceStatus}
            wsConnected={wsConnected}
          />
        )}
      </main>

      {/* Educational Modals */}
      <Glossary isOpen={isGlossaryOpen} onClose={() => setIsGlossaryOpen(false)} />
      <SimulationGuide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      {/* Footer */}
      <footer className="footer-container">
        <p>
          ESP32 Self-Calibrating Sensor Educational Platform • Compliant with ISO 17386 Low-Speed Manoeuvring Concept Model
        </p>
      </footer>
    </div>
  );
};

export default App;

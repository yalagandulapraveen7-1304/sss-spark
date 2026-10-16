import type { DeviceStatus, Reading, CalibrationEvent, HistoryFilter } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export async function fetchHealth(): Promise<{ status: string; database: string }> {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchDeviceStatus(): Promise<DeviceStatus> {
  const res = await fetch(`${API_BASE_URL}/api/v1/device`);
  if (!res.ok) throw new Error('Failed to fetch device status');
  return res.json();
}

export async function fetchReadingsHistory(filter: HistoryFilter): Promise<{
  total_count: number;
  page: number;
  limit: number;
  items: Reading[];
}> {
  const params = new URLSearchParams({
    page: filter.page.toString(),
    limit: filter.limit.toString(),
  });
  if (filter.startTime) params.append('start_time', filter.startTime);
  if (filter.endTime) params.append('end_time', filter.endTime);

  const res = await fetch(`${API_BASE_URL}/api/v1/readings?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch readings history');
  return res.json();
}

export async function fetchCalibrationEvents(limit: number = 50): Promise<{
  total_count: number;
  items: CalibrationEvent[];
}> {
  const res = await fetch(`${API_BASE_URL}/api/v1/calibration-events?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch calibration events');
  return res.json();
}

export function getExportReadingsUrl(): string {
  return `${API_BASE_URL}/api/v1/export/readings.csv`;
}

export function getExportCalibrationEventsUrl(): string {
  return `${API_BASE_URL}/api/v1/export/calibration-events.csv`;
}

export function createWebSocketConnection(
  onMessage: (data: any) => void,
  onStatusChange: (connected: boolean) => void
): WebSocket {
  const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + '/api/v1/ws';
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    onStatusChange(true);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (e) {
      console.warn('WS non-json frame:', event.data);
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    onStatusChange(false);
  };

  ws.onclose = () => {
    onStatusChange(false);
  };

  return ws;
}

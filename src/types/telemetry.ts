export interface TelemetryChannel {
  id: string;
  label: string;
  color: string;
  unit: string;
  enabled: boolean;
}

export interface TelemetrySample {
  distancePct: number;
  speed: number;
  throttle: number;
  brake: number;
  steering: number;
  gear: number;
  lapTime: number;
  rpm?: number;
  lap?: number;
  yaw?: number;
}

export interface SessionInfo {
  trackName: string;
  carName: string;
  driverName: string;
  bestLapTime: string;
  setupName?: string;
  trackDisplayName?: string;
  driverCarEngName?: string;
}

export interface LapData {
  lapNumber: number;
  lapTimeFormatted: string;
  lapTimeSeconds: number;
  samples: TelemetrySample[];
}

export interface ParsedSession {
  sessionInfo: SessionInfo;
  laps: LapData[];
  totalTickCount: number;
  tickRate: number;
}

export const DEFAULT_CHANNELS: TelemetryChannel[] = [
  { id: 'speed', label: 'Speed', color: '#38bdf8', unit: 'km/h', enabled: true },
  { id: 'throttle', label: 'Throttle', color: '#22c55e', unit: '%', enabled: true },
  { id: 'brake', label: 'Brake', color: '#ef4444', unit: '%', enabled: true },
  { id: 'steering', label: 'Steering', color: '#eab308', unit: 'deg', enabled: true },
  { id: 'gear', label: 'Gear', color: '#ec4899', unit: 'N-6', enabled: true },
];

/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';
import { parseIbt } from '../services/ibtParser';
import type {
  LapData,
  ParsedSession,
  TelemetrySample,
} from '../types/telemetry';

export interface TelemetryContextType {
  parsedSession: ParsedSession | null;
  selectedBaseLap: number | null;
  selectedRefLap: number | null;
  cursorDistance: number;
  activeSample: TelemetrySample | null;
  isLoading: boolean;
  error: string | null;
  loadFile: (file: File) => Promise<void>;
  loadSample: (samplePath: string) => Promise<void>;
  selectLap: (lapNumber: number, role: 'base' | 'reference') => void;
  setCursorDistance: (pct: number) => void;
}

export const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

function findNearestSample(samples: TelemetrySample[], pct: number): TelemetrySample | null {
  if (!samples || samples.length === 0) return null;
  let closest = samples[0];
  let minDiff = Math.abs(closest.distancePct - pct);

  for (let i = 1; i < samples.length; i++) {
    const diff = Math.abs(samples[i].distancePct - pct);
    if (diff < minDiff) {
      minDiff = diff;
      closest = samples[i];
    }
  }
  return closest;
}

function findFastestLapNumber(laps: LapData[]): number | null {
  if (laps.length === 0) return null;
  const flyingLaps = laps.filter((l) => {
    const distSpan =
      l.samples.length > 0
        ? l.samples[l.samples.length - 1].distancePct - l.samples[0].distancePct
        : 0;
    return (
      l.lapNumber > 0 &&
      l.samples.length >= 200 &&
      l.lapTimeSeconds >= 15 &&
      distSpan >= 80
    );
  });
  const candidates = flyingLaps.length > 0 ? flyingLaps : laps;
  const fastest = candidates.reduce((best, curr) =>
    curr.lapTimeSeconds < best.lapTimeSeconds ? curr : best
  );
  return fastest.lapNumber;
}

export const TelemetryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [parsedSession, setParsedSession] = useState<ParsedSession | null>(null);
  const [selectedBaseLap, setSelectedBaseLap] = useState<number | null>(null);
  const [selectedRefLap, setSelectedRefLap] = useState<number | null>(null);
  const [cursorDistance, setCursorDistanceState] = useState<number>(0);
  const [activeSample, setActiveSample] = useState<TelemetrySample | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const setCursorDistance = useCallback(
    (pct: number) => {
      const clamped = Math.max(0, Math.min(100, pct));
      setCursorDistanceState(clamped);

      if (!parsedSession || selectedBaseLap === null) return;

      const baseLap = parsedSession.laps.find((l) => l.lapNumber === selectedBaseLap);
      if (baseLap && baseLap.samples.length > 0) {
        const nearest = findNearestSample(baseLap.samples, clamped);
        setActiveSample(nearest);
      }
    },
    [parsedSession, selectedBaseLap]
  );

  const selectLap = useCallback(
    (lapNumber: number, role: 'base' | 'reference') => {
      if (role === 'base') {
        setSelectedBaseLap(lapNumber);

        if (parsedSession) {
          const baseLap = parsedSession.laps.find((l) => l.lapNumber === lapNumber);
          if (baseLap && baseLap.samples.length > 0) {
            const nearest = findNearestSample(baseLap.samples, cursorDistance);
            setActiveSample(nearest);
          }
        }
      } else {
        setSelectedRefLap((prev) => (prev === lapNumber ? null : lapNumber));
      }
    },
    [cursorDistance, parsedSession]
  );

  const applyParsedSession = useCallback((session: ParsedSession) => {
    setParsedSession(session);

    const fastestLapNum = findFastestLapNumber(session.laps);
    setSelectedBaseLap(fastestLapNum);
    setSelectedRefLap(null);

    if (fastestLapNum !== null) {
      const baseLap = session.laps.find((l) => l.lapNumber === fastestLapNum);
      if (baseLap && baseLap.samples.length > 0) {
        const nearest = findNearestSample(baseLap.samples, 0);
        setActiveSample(nearest);
      }
    } else if (session.laps[0]?.samples[0]) {
      setActiveSample(session.laps[0].samples[0]);
    }
    setCursorDistanceState(0);
    setError(null);
  }, []);

  const loadFile = useCallback(
    async (file: File): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const parsed = parseIbt(arrayBuffer);
        applyParsedSession(parsed);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to parse telemetry file';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [applyParsedSession]
  );

  const loadSample = useCallback(
    async (samplePath: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(samplePath);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch sample telemetry at ${samplePath} (${response.status} ${response.statusText})`
          );
        }
        const arrayBuffer = await response.arrayBuffer();
        const parsed = parseIbt(arrayBuffer);
        applyParsedSession(parsed);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load sample telemetry';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [applyParsedSession]
  );

  return (
    <TelemetryContext.Provider
      value={{
        parsedSession,
        selectedBaseLap,
        selectedRefLap,
        cursorDistance,
        activeSample,
        isLoading,
        error,
        loadFile,
        loadSample,
        selectLap,
        setCursorDistance,
      }}
    >
      {children}
    </TelemetryContext.Provider>
  );
};

export function useTelemetry(): TelemetryContextType {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error('useTelemetry must be used within a TelemetryProvider');
  }
  return context;
}

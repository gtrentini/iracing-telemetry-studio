import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTelemetry } from '../../context/TelemetryContext';
import { DEFAULT_CHANNELS, type TelemetryChannel } from '../../types/telemetry';
import CornerAnalysis from '../telemetry/CornerAnalysis';
import DeltaBand from '../telemetry/DeltaBand';
import TelemetryCanvas from '../telemetry/TelemetryCanvas';
import TrackMap from '../telemetry/TrackMap';
import styles from './TelemetryStage.module.scss';

export interface TelemetryStageProps {
  channels?: TelemetryChannel[];
}

interface SampleOption {
  id: string;
  label: string;
  path: string;
}

const SAMPLE_OPTIONS: SampleOption[] = [
  { id: 'openwheel', label: 'Open-Wheel Telemetry', path: '/samples/real_openwheel.ibt' },
  { id: 'gt3', label: 'GT3 Telemetry', path: '/samples/real_gt3.ibt' },
];

export const TelemetryStage: React.FC<TelemetryStageProps> = ({
  channels = DEFAULT_CHANNELS,
}) => {
  const {
    parsedSession,
    selectedBaseLap,
    selectedRefLap,
    cursorDistance,
    setCursorDistance,
    loadFile,
    loadSample,
    isLoading,
    error,
  } = useTelemetry();

  const [isDragOver, setIsDragOver] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      loadFile(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadFile(file);
      e.target.value = '';
    }
  };

  // Scrubber drag / click logic
  const updateCursorFromEvent = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
      setCursorDistance(pct);
    },
    [setCursorDistance]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsScrubbing(true);
    updateCursorFromEvent(e.clientX);
  };

  useEffect(() => {
    if (!isScrubbing) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateCursorFromEvent(e.clientX);
    };

    const handleMouseUp = () => {
      setIsScrubbing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, updateCursorFromEvent]);

  // Active base and reference lap
  const baseLap = parsedSession?.laps.find((l) => l.lapNumber === selectedBaseLap);
  const refLap = selectedRefLap != null
    ? parsedSession?.laps.find((l) => l.lapNumber === selectedRefLap)
    : null;

  const hasActiveSession = Boolean(parsedSession && baseLap);

  return (
    <main
      className={styles.stage}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        accept=".ibt"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {!hasActiveSession ? (
        <div className={styles.gridArea}>
          <div
            className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ''}`}
            onClick={() => fileInputRef.current?.click()}
            role="region"
            aria-label="Telemetry file drop zone"
          >
            <div className={styles.iconWrapper}>
              <svg
                className={styles.icon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>

            <h2 className={styles.title}>Drop iRacing Telemetry (.ibt) File Here</h2>
            <p className={styles.description}>
              Drag and drop any binary <code>.ibt</code> session telemetry file to parse
              high-frequency channel traces, synchronize laps, and analyze performance.
            </p>

            {error && <div className={styles.errorBanner}>{error}</div>}

            <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
              <div className={styles.sampleBar}>
                {SAMPLE_OPTIONS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    className={styles.sampleBtn}
                    onClick={() => loadSample(sample.path)}
                    disabled={isLoading}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    {sample.label}
                  </button>
                ))}
              </div>
              <span className={styles.browseHint}>or click anywhere in the box to browse files</span>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.plotArea}>
          {/* Main Area: TelemetryCanvas, DeltaBand, CornerAnalysis stat bar */}
          <div className={styles.mainTraceArea}>
            <TelemetryCanvas
              baseSamples={baseLap!.samples}
              refSamples={refLap ? refLap.samples : null}
              cursorPct={cursorDistance}
              onCursorChange={setCursorDistance}
              activeChannels={channels}
            />
            <DeltaBand
              baseSamples={baseLap!.samples}
              refSamples={refLap ? refLap.samples : null}
              cursorPct={cursorDistance}
              onCursorChange={setCursorDistance}
            />
            <CornerAnalysis
              baseSamples={baseLap!.samples}
              refSamples={refLap ? refLap.samples : null}
              cursorPct={cursorDistance}
            />
          </div>

          {/* Clean Map toggle button */}
          <button
            type="button"
            className={`${styles.mapToggleBtn} ${isMapOpen ? styles.mapToggleActive : ''}`}
            onClick={() => setIsMapOpen((prev) => !prev)}
            title={isMapOpen ? 'Hide Track Map' : 'Show Track Map'}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            <span>{isMapOpen ? 'Hide Map' : 'Map'}</span>
          </button>

          {/* Side Panel: Collapsible TrackMap widget */}
          {isMapOpen && (
            <aside className={styles.sideMapPanel}>
              <TrackMap
                samples={baseLap!.samples}
                cursorPct={cursorDistance}
                onCursorChange={setCursorDistance}
              />
            </aside>
          )}
        </div>
      )}

      <div className={styles.scrubberContainer}>
        <div
          ref={trackRef}
          className={styles.scrubberTrack}
          onMouseDown={handleMouseDown}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(cursorDistance)}
          aria-label="Lap distance scrubber"
        >
          <div
            className={styles.scrubberProgress}
            style={{ width: `${cursorDistance}%` }}
          />
          <div
            className={styles.scrubberCursor}
            style={{ left: `${cursorDistance}%` }}
          />
        </div>

        <div className={styles.axisLabels}>
          <span>0.0% Lap Distance</span>
          <span>25.0%</span>
          <span>50.0% (Cursor: {cursorDistance.toFixed(2)}%)</span>
          <span>75.0%</span>
          <span>100.0%</span>
        </div>
      </div>
    </main>
  );
};

export default TelemetryStage;

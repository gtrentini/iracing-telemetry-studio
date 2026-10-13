import React, { useMemo } from 'react';
import type { TelemetrySample } from '../../types/telemetry';
import styles from './CornerAnalysis.module.scss';

export interface CornerAnalysisProps {
  baseSamples: TelemetrySample[];
  refSamples: TelemetrySample[] | null;
  cursorPct: number;
}

interface CornerApex {
  index: number;
  apexDistPct: number;
  baseMinSpeed: number;
  brakeStartPct: number;
  peakBrakePct: number;
  exitThrottlePct: number;
}

export const CornerAnalysis: React.FC<CornerAnalysisProps> = ({
  baseSamples,
  refSamples,
  cursorPct,
}) => {
  // Detect corner apexes in base lap
  const corners: CornerApex[] = useMemo(() => {
    if (!baseSamples || baseSamples.length < 50) return [];

    const detected: CornerApex[] = [];
    const windowSize = 15; // window on either side to check local minimum
    let lastApexDist = -10;

    for (let i = windowSize; i < baseSamples.length - windowSize; i++) {
      const current = baseSamples[i];
      if (current.speed >= 175) continue; // Only consider speeds below 175 km/h for corner apexes
      if (current.distancePct - lastApexDist < 4.0) continue; // Min 4% distance between apexes

      // Check if current is local minimum in window
      let isMin = true;
      for (let j = i - windowSize; j <= i + windowSize; j++) {
        if (baseSamples[j].speed < current.speed) {
          isMin = false;
          break;
        }
      }

      if (isMin) {
        lastApexDist = current.distancePct;

        // Search backward for brake application point and peak brake
        let brakeStart = current.distancePct;
        let peakBrake = 0;
        for (let b = i; b >= Math.max(0, i - 120); b--) {
          const bs = baseSamples[b];
          if (bs.brake > peakBrake) peakBrake = bs.brake;
          if (bs.brake > 5) {
            brakeStart = bs.distancePct;
          } else if (bs.throttle > 50 && b < i - 15) {
            break;
          }
        }

        // Search forward for full throttle exit point
        let exitThrottle = current.distancePct;
        for (let f = i; f < Math.min(baseSamples.length, i + 120); f++) {
          const fs = baseSamples[f];
          if (fs.throttle >= 90) {
            exitThrottle = fs.distancePct;
            break;
          }
        }

        detected.push({
          index: detected.length + 1,
          apexDistPct: Number(current.distancePct.toFixed(1)),
          baseMinSpeed: Number(current.speed.toFixed(1)),
          brakeStartPct: Number(brakeStart.toFixed(1)),
          peakBrakePct: Math.round(peakBrake),
          exitThrottlePct: Number(exitThrottle.toFixed(1)),
        });
      }
    }

    return detected;
  }, [baseSamples]);

  // Find nearest corner to cursorPct
  const activeCorner = useMemo(() => {
    if (corners.length === 0) return null;
    let closest = corners[0];
    let minDiff = Math.abs(corners[0].apexDistPct - cursorPct);

    for (let i = 1; i < corners.length; i++) {
      const diff = Math.abs(corners[i].apexDistPct - cursorPct);
      if (diff < minDiff) {
        minDiff = diff;
        closest = corners[i];
      }
    }
    return closest;
  }, [corners, cursorPct]);

  // Find ref speed at the active corner's apex
  const refMinSpeed = useMemo(() => {
    if (!activeCorner || !refSamples || refSamples.length === 0) return null;
    let nearest = refSamples[0];
    let minDiff = Math.abs(nearest.distancePct - activeCorner.apexDistPct);

    for (let i = 1; i < refSamples.length; i++) {
      const diff = Math.abs(refSamples[i].distancePct - activeCorner.apexDistPct);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = refSamples[i];
      }
    }
    return nearest.speed;
  }, [activeCorner, refSamples]);

  if (!activeCorner) {
    return (
      <div className={styles.cornerBar}>
        <span className={styles.zoneBadge}>Track Straightaway</span>
        <div className={styles.metricsPills}>
          <div className={styles.statPill}>
            <span className={styles.label}>Zone:</span>
            <span className={styles.value}>Full Throttle Segment</span>
          </div>
        </div>
      </div>
    );
  }

  const speedDelta = refMinSpeed != null ? activeCorner.baseMinSpeed - refMinSpeed : null;

  return (
    <div className={styles.cornerBar}>
      <div className={styles.zoneGroup}>
        <span className={styles.zoneBadge}>
          Turn {activeCorner.index} (Apex @ {activeCorner.apexDistPct}%)
        </span>
      </div>

      <div className={styles.metricsPills}>
        <div className={styles.statPill}>
          <span className={styles.label}>Min Speed:</span>
          <span className={styles.value}>{activeCorner.baseMinSpeed} km/h</span>
          {speedDelta != null && (
            <span
              className={speedDelta >= 0 ? styles.deltaPositive : styles.deltaNegative}
              title={`Delta vs Reference (${refMinSpeed?.toFixed(1)} km/h)`}
            >
              ({speedDelta >= 0 ? '+' : ''}
              {speedDelta.toFixed(1)} km/h)
            </span>
          )}
        </div>

        <div className={styles.statPill}>
          <span className={styles.label}>Brake Zone:</span>
          <span className={styles.value}>
            {activeCorner.brakeStartPct}% dist (Peak {activeCorner.peakBrakePct}%)
          </span>
        </div>

        <div className={styles.statPill}>
          <span className={styles.label}>Full Throttle Exit:</span>
          <span className={styles.value}>{activeCorner.exitThrottlePct}% dist</span>
        </div>
      </div>
    </div>
  );
};

export default CornerAnalysis;

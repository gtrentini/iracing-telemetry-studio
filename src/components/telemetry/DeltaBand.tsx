import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { TelemetrySample } from '../../types/telemetry';
import { calculateLapDelta } from '../../utils/deltaMath';
import styles from './DeltaBand.module.scss';

export interface DeltaBandProps {
  baseSamples: TelemetrySample[];
  refSamples: TelemetrySample[] | null;
  cursorPct: number;
  onCursorChange?: (pct: number) => void;
}

const PADDING = {
  left: 64,
  right: 24,
  top: 6,
  bottom: 6,
};

export const DeltaBand: React.FC<DeltaBandProps> = ({
  baseSamples,
  refSamples,
  cursorPct,
  onCursorChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);

  const deltas = useMemo(() => {
    if (!refSamples || refSamples.length < 10) return [];
    return calculateLapDelta(baseSamples, refSamples);
  }, [baseSamples, refSamples]);

  // Find active delta value at cursorPct
  const activeDelta = useMemo(() => {
    if (deltas.length === 0) return null;
    const index = Math.max(0, Math.min(deltas.length - 1, Math.round(cursorPct / 0.2)));
    return deltas[index]?.deltaSeconds ?? 0;
  }, [deltas, cursorPct]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const plotWidth = Math.max(1, width - PADDING.left - PADDING.right);
    const plotHeight = Math.max(1, height - PADDING.top - PADDING.bottom);
    const midY = PADDING.top + plotHeight / 2;

    // Background panel
    ctx.fillStyle = '#121820';
    ctx.fillRect(PADDING.left, PADDING.top, plotWidth, plotHeight);
    ctx.strokeStyle = '#263244';
    ctx.lineWidth = 1;
    ctx.strokeRect(PADDING.left, PADDING.top, plotWidth, plotHeight);

    // Center Zero Line
    // High-contrast Center Zero Line
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, midY);
    ctx.lineTo(PADDING.left + plotWidth, midY);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    // Viewport title label
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b949e';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('LAP DELTA (Base vs Ref)', PADDING.left + 8, PADDING.top + 6);

    // Y Axis zero label
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#e6edf3';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('0.00s', PADDING.left - 8, midY);

    if (deltas.length > 0) {
      // Find max abs delta for dynamic vertical scaling (minimum range 0.5s)
      let maxAbs = 0.5;
      for (const d of deltas) {
        if (Math.abs(d.deltaSeconds) > maxAbs) {
          maxAbs = Math.abs(d.deltaSeconds);
        }
      }
      // Add slight headroom
      maxAbs = Math.min(10, maxAbs * 1.15);

      const getX = (distPct: number) =>
        PADDING.left + (Math.max(0, Math.min(100, distPct)) / 100) * plotWidth;

      const getY = (deltaSec: number) => {
        const clampedDelta = Math.max(-maxAbs, Math.min(maxAbs, deltaSec));
        // delta > 0 is base faster (top), delta < 0 is ref faster (bottom)
        return midY - (clampedDelta / maxAbs) * (plotHeight / 2);
      };

      // Draw rich filled segments with gradients
      ctx.save();
      ctx.beginPath();
      ctx.rect(PADDING.left, PADDING.top, plotWidth, plotHeight);
      ctx.clip();

      const greenGrad = ctx.createLinearGradient(0, midY, 0, PADDING.top);
      greenGrad.addColorStop(0, 'rgba(34, 197, 94, 0.25)');
      greenGrad.addColorStop(1, 'rgba(34, 197, 94, 0.75)');

      const redGrad = ctx.createLinearGradient(0, midY, 0, PADDING.top + plotHeight);
      redGrad.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
      redGrad.addColorStop(1, 'rgba(239, 68, 68, 0.75)');

      for (let i = 0; i < deltas.length - 1; i++) {
        const d0 = deltas[i];
        const d1 = deltas[i + 1];

        const x0 = getX(d0.distancePct);
        const y0 = getY(d0.deltaSeconds);
        const x1 = getX(d1.distancePct);
        const y1 = getY(d1.deltaSeconds);

        const avgDelta = (d0.deltaSeconds + d1.deltaSeconds) / 2;

        ctx.fillStyle = avgDelta >= 0 ? greenGrad : redGrad;
        ctx.beginPath();
        ctx.moveTo(x0, midY);
        ctx.lineTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1, midY);
        ctx.closePath();
        ctx.fill();
      }

      // Draw delta outline curve with high contrast
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < deltas.length; i++) {
        const x = getX(deltas[i].distancePct);
        const y = getY(deltas[i].deltaSeconds);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // Top & Bottom scale limits with larger font size
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#22c55e';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`+${maxAbs.toFixed(1)}s`, PADDING.left - 8, PADDING.top + 4);

      ctx.fillStyle = '#ef4444';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`-${maxAbs.toFixed(1)}s`, PADDING.left - 8, PADDING.top + plotHeight - 4);
    }

    // Vertical crosshair line matching main canvas
    const cursorX = PADDING.left + (Math.max(0, Math.min(100, cursorPct)) / 100) * plotWidth;
    ctx.save();
    ctx.strokeStyle = '#e6edf3';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cursorX, PADDING.top);
    ctx.lineTo(cursorX, PADDING.top + plotHeight);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }, [deltas, cursorPct]);

  // Handle ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      draw();
    });
    ro.observe(container);

    draw();

    return () => {
      ro.disconnect();
    };
  }, [draw]);

  // Scrub handler
  const handlePointerCoord = useCallback(
    (clientX: number) => {
      if (!onCursorChange) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const plotWidth = rect.width - PADDING.left - PADDING.right;
      if (plotWidth <= 0) return;

      const clickX = clientX - rect.left - PADDING.left;
      const pct = Math.max(0, Math.min(100, (clickX / plotWidth) * 100));
      onCursorChange(pct);
    },
    [onCursorChange]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handlePointerCoord(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      handlePointerCoord(e.clientX);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
    }
  };

  const deltaText = activeDelta != null
    ? `${activeDelta >= 0 ? '+' : ''}${activeDelta.toFixed(3)}s`
    : null;

  const deltaStatusClass = activeDelta == null
    ? styles.neutral
    : activeDelta > 0.001
      ? styles.faster
      : activeDelta < -0.001
        ? styles.slower
        : styles.neutral;

  return (
    <div ref={containerRef} className={styles.deltaContainer}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {(!refSamples || refSamples.length < 10) && (
        <div className={styles.emptyNotice}>
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
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Select a Reference Lap in the sidebar to compare deltas</span>
        </div>
      )}

      {deltaText && (
        <div className={`${styles.deltaBadge} ${deltaStatusClass}`}>
          <span>Δ {deltaText}</span>
        </div>
      )}
    </div>
  );
};

export default DeltaBand;

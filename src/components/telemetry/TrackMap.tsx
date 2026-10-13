import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { TelemetrySample } from '../../types/telemetry';
import { generateTrackCoordinates, type TrackPoint } from '../../utils/trackProjection';
import styles from './TrackMap.module.scss';

export interface TrackMapProps {
  samples: TelemetrySample[];
  cursorPct: number;
  onCursorChange: (pct: number) => void;
}

export const TrackMap: React.FC<TrackMapProps> = ({
  samples,
  cursorPct,
  onCursorChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);

  const trackPoints = useMemo(() => generateTrackCoordinates(samples), [samples]);

  // Interpolate car coordinate in 0-1000 space for cursorPct
  const carPos = useMemo(() => {
    if (trackPoints.length === 0) return null;
    if (trackPoints.length === 1) return trackPoints[0];

    // Find bounding points around cursorPct
    const target = Math.max(0, Math.min(100, cursorPct));
    let i = 0;
    while (i < trackPoints.length - 2 && trackPoints[i + 1].distPct < target) {
      i++;
    }

    const p0 = trackPoints[i];
    const p1 = trackPoints[i + 1];
    const span = p1.distPct - p0.distPct;
    if (span <= 0.0001) {
      return { x: p0.x, y: p0.y };
    }

    const t = Math.max(0, Math.min(1, (target - p0.distPct) / span));
    return {
      x: p0.x + t * (p1.x - p0.x),
      y: p0.y + t * (p1.y - p0.y),
    };
  }, [trackPoints, cursorPct]);

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

    if (trackPoints.length < 2) {
      ctx.restore();
      return;
    }

    // Fit 1000x1000 into (width, height) preserving aspect ratio with margin
    const fitScale = Math.min(width / 1000, height / 1000) * 0.92;
    const ox = (width - 1000 * fitScale) / 2;
    const oy = (height - 1000 * fitScale) / 2;

    const toCanvasX = (x: number) => ox + x * fitScale;
    const toCanvasY = (y: number) => oy + y * fitScale;

    // 1. Draw outer track line (#263244, 6px)
    ctx.save();
    ctx.strokeStyle = '#263244';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(toCanvasX(trackPoints[0].x), toCanvasY(trackPoints[0].y));
    for (let i = 1; i < trackPoints.length; i++) {
      ctx.lineTo(toCanvasX(trackPoints[i].x), toCanvasY(trackPoints[i].y));
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 2. Draw inner racing groove (#38bdf8, 2px)
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(toCanvasX(trackPoints[0].x), toCanvasY(trackPoints[0].y));
    for (let i = 1; i < trackPoints.length; i++) {
      ctx.lineTo(toCanvasX(trackPoints[i].x), toCanvasY(trackPoints[i].y));
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 3. Start/Finish line checkered marker at distPct = 0%
    const p0 = trackPoints[0];
    const p1 = trackPoints[Math.min(10, trackPoints.length - 1)];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    // Normal vector perpendicular to track tangent
    const nx = (-dy / len) * 10;
    const ny = (dx / len) * 10;

    const sfX = toCanvasX(p0.x);
    const sfY = toCanvasY(p0.y);

    ctx.save();
    // Checkered / contrasting Start-Finish bar
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sfX - nx * fitScale, sfY - ny * fitScale);
    ctx.lineTo(sfX + nx * fitScale, sfY + ny * fitScale);
    ctx.stroke();

    // Red-white checkered accent
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sfX - nx * fitScale, sfY - ny * fitScale);
    ctx.lineTo(sfX + nx * fitScale, sfY + ny * fitScale);
    ctx.stroke();
    ctx.restore();

    // 4. Car position indicator at cursorPct
    if (carPos) {
      const cx = toCanvasX(carPos.x);
      const cy = toCanvasY(carPos.y);

      ctx.save();
      // Outer glow
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fill();

      // Middle ring
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.stroke();

      // Center bright dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }, [trackPoints, carPos]);

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

  // Pointer scrubbing: Find nearest track point to click
  const handlePointerCoord = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || trackPoints.length === 0) return;

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) return;

      const fitScale = Math.min(width / 1000, height / 1000) * 0.92;
      const ox = (width - 1000 * fitScale) / 2;
      const oy = (height - 1000 * fitScale) / 2;

      const clickX = (clientX - rect.left - ox) / fitScale;
      const clickY = (clientY - rect.top - oy) / fitScale;

      // Find closest track point
      let closestPoint: TrackPoint = trackPoints[0];
      let minDistSq = Infinity;

      for (let i = 0; i < trackPoints.length; i++) {
        const p = trackPoints[i];
        const distSq = (p.x - clickX) ** 2 + (p.y - clickY) ** 2;
        if (distSq < minDistSq) {
          minDistSq = distSq;
          closestPoint = p;
        }
      }

      onCursorChange(closestPoint.distPct);
    },
    [trackPoints, onCursorChange]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handlePointerCoord(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      handlePointerCoord(e.clientX, e.clientY);
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

  return (
    <div ref={containerRef} className={styles.trackMapContainer}>
      <div className={styles.mapHeader}>
        <div className={styles.titleGroup}>
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
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <span>Track Map & GPS</span>
        </div>
        <span className={styles.posBadge}>{cursorPct.toFixed(1)}%</span>
      </div>

      <div className={styles.canvasWrapper}>
        {trackPoints.length < 2 ? (
          <div className={styles.emptyState}>No track projection available</div>
        ) : (
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        )}
      </div>
    </div>
  );
};

export default TrackMap;

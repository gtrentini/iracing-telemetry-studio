import React, { useCallback, useEffect, useRef } from 'react';
import type { TelemetryChannel, TelemetrySample } from '../../types/telemetry';
import styles from './TelemetryCanvas.module.scss';

export interface TelemetryCanvasProps {
  baseSamples: TelemetrySample[];
  refSamples: TelemetrySample[] | null;
  cursorPct: number;
  onCursorChange: (pct: number) => void;
  activeChannels: TelemetryChannel[];
}

const PADDING = {
  top: 14,
  bottom: 16,
  left: 64,
  right: 24,
  gap: 12,
};

interface ViewportDef {
  key: 'speed' | 'gear' | 'pedals' | 'steering';
  title: string;
  min: number;
  max: number;
  ticks: { val: number; label: string }[];
}

export const TelemetryCanvas: React.FC<TelemetryCanvasProps> = ({
  baseSamples,
  refSamples,
  cursorPct,
  onCursorChange,
  activeChannels,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);

  // Active channel checks
  const isSpeedEnabled = activeChannels.find((c) => c.id === 'speed')?.enabled ?? true;
  const isGearEnabled = activeChannels.find((c) => c.id === 'gear')?.enabled ?? true;
  const isThrottleEnabled = activeChannels.find((c) => c.id === 'throttle')?.enabled ?? true;
  const isBrakeEnabled = activeChannels.find((c) => c.id === 'brake')?.enabled ?? true;
  const isSteeringEnabled = activeChannels.find((c) => c.id === 'steering')?.enabled ?? true;
  const isPedalsEnabled = isThrottleEnabled || isBrakeEnabled;

  // Render loop
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

    // Build active viewports dynamically based on enabled channels
    const activeVps: ViewportDef[] = [];
    if (isSpeedEnabled) {
      activeVps.push({
        key: 'speed',
        title: 'SPEED (km/h)',
        min: 0,
        max: 280,
        ticks: [
          { val: 0, label: '0' },
          { val: 50, label: '50' },
          { val: 100, label: '100' },
          { val: 150, label: '150' },
          { val: 200, label: '200' },
          { val: 250, label: '250' },
          { val: 280, label: '280' },
        ],
      });
    }
    if (isGearEnabled) {
      activeVps.push({
        key: 'gear',
        title: 'GEAR (Shift Trace)',
        min: 0,
        max: 7,
        ticks: [
          { val: 0, label: 'N' },
          { val: 1, label: '1' },
          { val: 2, label: '2' },
          { val: 3, label: '3' },
          { val: 4, label: '4' },
          { val: 5, label: '5' },
          { val: 6, label: '6' },
          { val: 7, label: '7' },
        ],
      });
    }
    if (isPedalsEnabled) {
      activeVps.push({
        key: 'pedals',
        title: 'PEDALS (Throttle / Brake %)',
        min: 0,
        max: 100,
        ticks: [
          { val: 0, label: '0%' },
          { val: 50, label: '50%' },
          { val: 100, label: '100%' },
        ],
      });
    }
    if (isSteeringEnabled) {
      activeVps.push({
        key: 'steering',
        title: 'STEERING (deg)',
        min: -180,
        max: 180,
        ticks: [
          { val: -180, label: '-180°' },
          { val: -90, label: '-90°' },
          { val: 0, label: '0°' },
          { val: 90, label: '+90°' },
          { val: 180, label: '+180°' },
        ],
      });
    }

    if (activeVps.length === 0) {
      // Fallback empty message
      ctx.font = '14px "JetBrains Mono", monospace';
      ctx.fillStyle = '#8b949e';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('All telemetry channels disabled. Enable channels in the sidebar.', width / 2, height / 2);
      ctx.restore();
      return;
    }

    const activeCount = activeVps.length;
    const availableHeight = Math.max(1, height - PADDING.top - PADDING.bottom - (activeCount - 1) * PADDING.gap);
    const vpHeight = availableHeight / activeCount;

    const getX = (pct: number) => PADDING.left + (Math.max(0, Math.min(100, pct)) / 100) * plotWidth;

    // Helper: Draw viewport background and grid lines
    const drawViewportBg = (
      vp: { top: number; bottom: number },
      ticks: { val: number; label: string }[],
      min: number,
      max: number,
      title: string
    ) => {
      // Panel background
      ctx.fillStyle = '#121820';
      ctx.fillRect(PADDING.left, vp.top, plotWidth, vpHeight);
      ctx.strokeStyle = '#263244';
      ctx.lineWidth = 1;
      ctx.strokeRect(PADDING.left, vp.top, plotWidth, vpHeight);

      // Viewport title label
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#8b949e';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(title, PADDING.left + 8, vp.top + 6);

      // Horizontal grid lines and tick labels
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (const tick of ticks) {
        const ratio = (tick.val - min) / (max - min);
        const y = vp.bottom - ratio * vpHeight;

        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PADDING.left, y);
        ctx.lineTo(PADDING.left + plotWidth, y);
        ctx.stroke();

        ctx.fillStyle = '#8b949e';
        ctx.fillText(tick.label, PADDING.left - 8, y);
      }
    };

    // Helper: Plot smooth continuous line trace
    const plotTrace = (
      samples: TelemetrySample[],
      getValue: (s: TelemetrySample) => number,
      min: number,
      max: number,
      vp: { top: number; bottom: number },
      color: string,
      lineWidth = 2,
      isDashed = false
    ) => {
      if (samples.length === 0) return;

      ctx.save();
      ctx.beginPath();
      ctx.rect(PADDING.left, vp.top, plotWidth, vpHeight);
      ctx.clip();

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (isDashed) {
        ctx.setLineDash([5, 4]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      let started = false;

      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const x = getX(s.distancePct);
        const val = Math.max(min, Math.min(max, getValue(s)));
        const ratio = (val - min) / (max - min);
        const y = vp.bottom - ratio * vpHeight;

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.restore();
    };

    // Helper: Plot stepped discrete line trace (for Gear shifts)
    const plotSteppedTrace = (
      samples: TelemetrySample[],
      getValue: (s: TelemetrySample) => number,
      min: number,
      max: number,
      vp: { top: number; bottom: number },
      color: string,
      lineWidth = 2,
      isDashed = false
    ) => {
      if (samples.length === 0) return;

      ctx.save();
      ctx.beginPath();
      ctx.rect(PADDING.left, vp.top, plotWidth, vpHeight);
      ctx.clip();

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';
      if (isDashed) {
        ctx.setLineDash([5, 4]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      const prevX = getX(samples[0].distancePct);
      const prevVal = Math.max(min, Math.min(max, getValue(samples[0])));
      let prevY = vp.bottom - ((prevVal - min) / (max - min)) * vpHeight;
      ctx.moveTo(prevX, prevY);

      for (let i = 1; i < samples.length; i++) {
        const s = samples[i];
        const currX = getX(s.distancePct);
        const currVal = Math.max(min, Math.min(max, getValue(s)));
        const currY = vp.bottom - ((currVal - min) / (max - min)) * vpHeight;

        // Step horizontal to new distance, then jump vertical to new gear
        ctx.lineTo(currX, prevY);
        ctx.lineTo(currX, currY);

        prevY = currY;
      }

      ctx.stroke();
      ctx.restore();
    };

    const hasRef = Boolean(refSamples && refSamples.length > 0);

    // Render each active viewport
    for (let k = 0; k < activeVps.length; k++) {
      const def = activeVps[k];
      const vpBounds = {
        top: PADDING.top + k * (vpHeight + PADDING.gap),
        bottom: PADDING.top + k * (vpHeight + PADDING.gap) + vpHeight,
      };

      drawViewportBg(vpBounds, def.ticks, def.min, def.max, def.title);

      if (def.key === 'speed') {
        if (hasRef) {
          plotTrace(refSamples!, (s) => s.speed, def.min, def.max, vpBounds, '#a855f7', 1.5, true);
        }
        if (baseSamples.length > 0) {
          plotTrace(baseSamples, (s) => s.speed, def.min, def.max, vpBounds, '#38bdf8', 2, false);
        }
      } else if (def.key === 'gear') {
        // Gear channel stepped plot
        if (hasRef) {
          plotSteppedTrace(refSamples!, (s) => s.gear, def.min, def.max, vpBounds, '#a855f7', 1.5, true);
        }
        if (baseSamples.length > 0) {
          plotSteppedTrace(baseSamples, (s) => s.gear, def.min, def.max, vpBounds, '#ec4899', 2, false);
        }
      } else if (def.key === 'pedals') {
        // Pedals: Reference dashed first, then Base solid
        if (hasRef) {
          if (isThrottleEnabled) {
            plotTrace(refSamples!, (s) => s.throttle, def.min, def.max, vpBounds, 'rgba(34, 197, 94, 0.5)', 1.5, true);
          }
          if (isBrakeEnabled) {
            plotTrace(refSamples!, (s) => s.brake, def.min, def.max, vpBounds, 'rgba(239, 68, 68, 0.5)', 1.5, true);
          }
        }
        if (isThrottleEnabled && baseSamples.length > 0) {
          plotTrace(baseSamples, (s) => s.throttle, def.min, def.max, vpBounds, '#22c55e', 2, false);
        }
        if (isBrakeEnabled && baseSamples.length > 0) {
          plotTrace(baseSamples, (s) => s.brake, def.min, def.max, vpBounds, '#ef4444', 2, false);
        }
      } else if (def.key === 'steering') {
        // Steering: Center line guide at 0 deg
        const steeringZeroY = vpBounds.bottom - 0.5 * vpHeight;
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#38bdf8';
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(PADDING.left, steeringZeroY);
        ctx.lineTo(PADDING.left + plotWidth, steeringZeroY);
        ctx.stroke();
        ctx.restore();

        if (hasRef) {
          plotTrace(refSamples!, (s) => s.steering, def.min, def.max, vpBounds, '#a855f7', 1.5, true);
        }
        if (baseSamples.length > 0) {
          plotTrace(baseSamples, (s) => s.steering, def.min, def.max, vpBounds, '#eab308', 2, false);
        }
      }
    }

    // Vertical Crosshair Line at cursorPct spanning entire canvas
    const cursorX = getX(cursorPct);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cursorX, PADDING.top);
    ctx.lineTo(cursorX, height - PADDING.bottom);
    ctx.strokeStyle = '#e6edf3';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([3, 3]);
    ctx.stroke();

    // Crosshair glowing heads
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(cursorX, PADDING.top, 3, 0, Math.PI * 2);
    ctx.arc(cursorX, height - PADDING.bottom, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }, [
    baseSamples,
    refSamples,
    cursorPct,
    isSpeedEnabled,
    isGearEnabled,
    isThrottleEnabled,
    isBrakeEnabled,
    isSteeringEnabled,
    isPedalsEnabled,
  ]);

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

  // Pointer event scrub helpers
  const handlePointerCoord = useCallback(
    (clientX: number) => {
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
        // Ignored if already released
      }
    }
  };

  return (
    <div ref={containerRef} className={styles.canvasContainer}>
      <div className={styles.legendBar}>
        <div className={styles.legendGroup}>
          <div className={styles.legendItem}>
            <span className={styles.legendLineSolid} />
            <span className={styles.boldText}>Solid:</span>
            <span>Base Lap</span>
          </div>
          {refSamples && refSamples.length > 0 && (
            <div className={styles.legendItem}>
              <span className={styles.legendLineDashed} />
              <span className={styles.boldText}>Dashed:</span>
              <span>Ref Lap (Purple/Translucent)</span>
            </div>
          )}
        </div>
        <div className={styles.legendDivider} />
        <div className={styles.legendGroup}>
          <div className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.speed}`} />
            <span>Speed</span>
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.gear}`} />
            <span>Gear</span>
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.throttle}`} />
            <span>Throttle</span>
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.brake}`} />
            <span>Brake</span>
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.steering}`} />
            <span>Steering</span>
          </div>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
};

export default TelemetryCanvas;

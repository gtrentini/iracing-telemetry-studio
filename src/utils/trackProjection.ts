import type { TelemetrySample } from '../types/telemetry';

export interface TrackPoint {
  x: number;
  y: number;
  distPct: number;
}

/**
 * Generates a 2D track map layout from telemetry samples using Cartesian dead reckoning
 * with native vehicle Yaw (or fallback steering ratio), loop closure correction,
 * and 1000x1000 coordinate normalization.
 */
export function generateTrackCoordinates(samples: TelemetrySample[]): TrackPoint[] {
  if (!samples || samples.length === 0) {
    return [];
  }

  if (samples.length === 1) {
    return [{ x: 500, y: 500, distPct: samples[0]?.distancePct ?? 0 }];
  }

  const rawPoints: { x: number; y: number; distPct: number }[] = [];
  let currentX = 0;
  let currentY = 0;

  // Initial sample point
  rawPoints.push({
    x: currentX,
    y: currentY,
    distPct: samples[0].distancePct,
  });

  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    const prev = samples[i - 1];

    const dt = s.lapTime > prev.lapTime ? s.lapTime - prev.lapTime : 0.0166;
    const speedMs = s.speed / 3.6;
    const heading =
      s.yaw !== undefined
        ? s.yaw
        : (s.steering * (Math.PI / 180)) / 14;

    currentX += speedMs * Math.cos(heading) * dt;
    currentY -= speedMs * Math.sin(heading) * dt; // Invert Y for canvas coordinate system

    rawPoints.push({
      x: currentX,
      y: currentY,
      distPct: s.distancePct,
    });
  }

  const N = rawPoints.length;

  // Loop closure correction:
  // Calculate drift between end and start, and subtract linearly across all points
  const startX = rawPoints[0].x;
  const startY = rawPoints[0].y;
  const endX = rawPoints[N - 1].x;
  const endY = rawPoints[N - 1].y;
  const driftX = endX - startX;
  const driftY = endY - startY;

  const closedPoints: { x: number; y: number; distPct: number }[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < N; i++) {
    const frac = i / (N - 1);
    const cx = rawPoints[i].x - frac * driftX;
    const cy = rawPoints[i].y - frac * driftY;

    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;

    closedPoints.push({
      x: cx,
      y: cy,
      distPct: rawPoints[i].distPct,
    });
  }

  // Center and scale the closed track path into a 1000x1000 coordinate space with 50px padding
  const PADDING = 50;
  const TARGET_SIZE = 1000 - 2 * PADDING; // 900

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = TARGET_SIZE / Math.max(spanX, spanY);

  const offsetX = PADDING + (TARGET_SIZE - spanX * scale) / 2;
  const offsetY = PADDING + (TARGET_SIZE - spanY * scale) / 2;

  return closedPoints.map((p) => ({
    x: Number((offsetX + (p.x - minX) * scale).toFixed(2)),
    y: Number((offsetY + (p.y - minY) * scale).toFixed(2)),
    distPct: p.distPct,
  }));
}

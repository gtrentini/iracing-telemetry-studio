import type { TelemetrySample } from '../types/telemetry';

export interface LapDeltaPoint {
  distancePct: number;
  deltaSeconds: number;
}

function interpolateLapTime(
  samples: TelemetrySample[],
  targetDistPct: number,
  pointer: { idx: number }
): number {
  const len = samples.length;
  if (len === 0) return 0;
  if (targetDistPct <= samples[0].distancePct) return samples[0].lapTime;
  if (targetDistPct >= samples[len - 1].distancePct) return samples[len - 1].lapTime;

  let i = pointer.idx;
  // Ensure we don't start beyond bounds
  if (i >= len - 1) i = len - 2;

  // Advance pointer while next sample is still before target
  while (i < len - 2 && samples[i + 1].distancePct < targetDistPct) {
    i++;
  }
  pointer.idx = i;

  const s0 = samples[i];
  const s1 = samples[i + 1];
  const distSpan = s1.distancePct - s0.distancePct;

  if (distSpan <= 0.000001) {
    return s0.lapTime;
  }

  const t = Math.max(0, Math.min(1, (targetDistPct - s0.distancePct) / distSpan));
  return s0.lapTime + t * (s1.lapTime - s0.lapTime);
}

/**
 * Calculates time delta between base and reference laps at regular 0.2% distance intervals.
 * deltaSeconds = refLapTime - baseLapTime
 * (negative means ref lap is ahead, positive means base lap is ahead).
 */
export function calculateLapDelta(
  baseSamples: TelemetrySample[],
  refSamples: TelemetrySample[]
): LapDeltaPoint[] {
  if (!baseSamples || !refSamples || baseSamples.length < 10 || refSamples.length < 10) {
    return [];
  }

  // Ensure samples are sorted by distancePct
  const sortedBase = [...baseSamples].sort((a, b) => a.distancePct - b.distancePct);
  const sortedRef = [...refSamples].sort((a, b) => a.distancePct - b.distancePct);

  const basePointer = { idx: 0 };
  const refPointer = { idx: 0 };
  const results: LapDeltaPoint[] = [];

  const STEPS = 500; // 0% to 100% in 0.2% increments (501 points)

  for (let step = 0; step <= STEPS; step++) {
    const distPct = Number((step * 0.2).toFixed(2));
    const baseLapTime = interpolateLapTime(sortedBase, distPct, basePointer);
    const refLapTime = interpolateLapTime(sortedRef, distPct, refPointer);
    const deltaSeconds = refLapTime - baseLapTime;

    results.push({
      distancePct: distPct,
      deltaSeconds: Number(deltaSeconds.toFixed(4)),
    });
  }

  return results;
}

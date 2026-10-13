import type { LapData, ParsedSession, SessionInfo, TelemetrySample } from '../types/telemetry';

export interface VarHeader {
  type: number;
  offset: number;
  name: string;
}

export function formatLapTime(seconds: number): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) {
    return '--:--.---';
  }
  const mins = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const wholeSecs = Math.floor(remainder).toString().padStart(2, '0');
  const millis = Math.floor((remainder - Math.floor(remainder)) * 1000)
    .toString()
    .padStart(3, '0');
  return `${mins}:${wholeSecs}.${millis}`;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function readCString(uint8: Uint8Array, start: number, maxLength: number): string {
  let end = start;
  const max = Math.min(start + maxLength, uint8.byteLength);
  while (end < max && uint8[end] !== 0) {
    end++;
  }
  return new TextDecoder('ascii').decode(uint8.subarray(start, end)).trim();
}

function extractYamlField(yaml: string, fieldName: string): string {
  const regex = new RegExp(
    `(?:^|\\n)\\s*${fieldName}\\s*:\\s*(?:'([^']*)'|"([^"]*)"|([^\\r\\n#]+))`,
    'm'
  );
  const match = yaml.match(regex);
  if (!match) return '';
  return (match[1] ?? match[2] ?? match[3] ?? '').trim();
}

function readVarValue(view: DataView, offset: number, type: number): number {
  switch (type) {
    case 1: // bool
      return view.getUint8(offset);
    case 2: // int32
      return view.getInt32(offset, true);
    case 3: // bitField (int32)
      return view.getUint32(offset, true);
    case 4: // float32
      return view.getFloat32(offset, true);
    case 5: // float64
      return view.getFloat64(offset, true);
    case 0: // char
      return view.getUint8(offset);
    default:
      return view.getFloat32(offset, true);
  }
}

export function parseIbt(buffer: ArrayBuffer): ParsedSession {
  if (buffer.byteLength < 64) {
    throw new Error('Invalid .ibt file: Buffer is too small to contain an iRacing header.');
  }

  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  // 1. Parse Header offsets
  const tickRate = view.getInt32(8, true) || 60;
  const sessionInfoLen = view.getInt32(16, true);
  const sessionInfoOffset = view.getInt32(20, true);
  const numVars = view.getInt32(24, true);
  const varHeaderOffset = view.getInt32(28, true);
  const bufLen = view.getInt32(36, true);

  // Strictly read record buffer start from byte 52
  const varBufOffset = view.getInt32(52, true);

  // 2. Extract Session YAML
  let sessionYaml = '';
  if (
    sessionInfoOffset > 0 &&
    sessionInfoLen > 0 &&
    sessionInfoOffset + sessionInfoLen <= buffer.byteLength
  ) {
    const yamlBytes = uint8.subarray(sessionInfoOffset, sessionInfoOffset + sessionInfoLen);
    sessionYaml = new TextDecoder('iso-8859-1').decode(yamlBytes);
  }

  const trackDisplayName = extractYamlField(sessionYaml, 'TrackDisplayName');
  const driverCarScreenName =
    extractYamlField(sessionYaml, 'DriverCarScreenName') ||
    extractYamlField(sessionYaml, 'CarScreenName');
  const driverCarEngName = extractYamlField(sessionYaml, 'DriverCarEngName');
  const driverSetupName = extractYamlField(sessionYaml, 'DriverSetupName');

  // Search session YAML for UserName or DriverHeadName. If not found or empty, return 'N/A'
  const rawUserName = extractYamlField(sessionYaml, 'UserName');
  const rawDriverHeadName = extractYamlField(sessionYaml, 'DriverHeadName');
  const userName =
    (rawUserName && rawUserName.trim()) ||
    (rawDriverHeadName && rawDriverHeadName.trim()) ||
    'N/A';

  // 3. Parse Variable Headers (144 bytes each)
  const varMap = new Map<string, VarHeader>();
  const VAR_HEADER_SIZE = 144;

  if (varHeaderOffset > 0 && numVars > 0) {
    for (let i = 0; i < numVars; i++) {
      const headerStart = varHeaderOffset + i * VAR_HEADER_SIZE;
      if (headerStart + VAR_HEADER_SIZE > buffer.byteLength) break;

      const type = view.getInt32(headerStart, true);
      const offset = view.getInt32(headerStart + 4, true);
      const name = readCString(uint8, headerStart + 16, 32);

      varMap.set(name, { type, offset, name });
    }
  }

  const speedVar = varMap.get('Speed');
  const throttleVar = varMap.get('Throttle');
  const brakeVar = varMap.get('Brake');
  const steeringVar = varMap.get('SteeringWheelAngle');
  const gearVar = varMap.get('Gear');
  const rpmVar = varMap.get('RPM');
  const lapVar = varMap.get('Lap');
  const lapDistPctVar = varMap.get('LapDistPct');
  const lapCurrentLapTimeVar = varMap.get('LapCurrentLapTime');
  const yawVar = varMap.get('Yaw') || varMap.get('YawNorth');

  // 4. Parse Record Data (Ensure varBufOffset > 0 and varBufOffset < buffer.byteLength)
  const samples: TelemetrySample[] = [];
  const effectiveBufLen = bufLen > 0 ? bufLen : 0;
  let totalTickCount = 0;

  if (
    effectiveBufLen > 0 &&
    varBufOffset > 0 &&
    varBufOffset < buffer.byteLength
  ) {
    for (
      let offset = varBufOffset;
      offset + effectiveBufLen <= buffer.byteLength;
      offset += effectiveBufLen
    ) {
      totalTickCount++;

      const rawLapDistPct = lapDistPctVar
        ? readVarValue(view, offset + lapDistPctVar.offset, lapDistPctVar.type)
        : 0;

      const rawSpeed = speedVar
        ? readVarValue(view, offset + speedVar.offset, speedVar.type)
        : 0;

      const rawThrottle = throttleVar
        ? readVarValue(view, offset + throttleVar.offset, throttleVar.type)
        : 0;

      const rawBrake = brakeVar
        ? readVarValue(view, offset + brakeVar.offset, brakeVar.type)
        : 0;

      const rawSteering = steeringVar
        ? readVarValue(view, offset + steeringVar.offset, steeringVar.type)
        : 0;

      const rawGear = gearVar
        ? readVarValue(view, offset + gearVar.offset, gearVar.type)
        : 0;

      const rawRPM = rpmVar
        ? readVarValue(view, offset + rpmVar.offset, rpmVar.type)
        : 0;

      const rawLap = lapVar
        ? readVarValue(view, offset + lapVar.offset, lapVar.type)
        : 0;

      const rawLapCurrentLapTime = lapCurrentLapTimeVar
        ? readVarValue(view, offset + lapCurrentLapTimeVar.offset, lapCurrentLapTimeVar.type)
        : 0;

      const rawYaw = yawVar
        ? readVarValue(view, offset + yawVar.offset, yawVar.type)
        : undefined;

      const sample: TelemetrySample = {
        distancePct: clamp(rawLapDistPct * 100, 0, 100),
        speed: rawSpeed * 3.6, // m/s to km/h
        throttle: rawThrottle * 100,
        brake: rawBrake * 100,
        steering: rawSteering * (180 / Math.PI), // radians to degrees
        gear: rawGear,
        rpm: rawRPM,
        lap: rawLap,
        lapTime: rawLapCurrentLapTime,
        yaw: rawYaw !== undefined ? rawYaw : undefined,
      };

      samples.push(sample);
    }
  }

  // 5. Group parsed samples into indexed laps
  const lapsMap = new Map<number, TelemetrySample[]>();
  for (const sample of samples) {
    const lapNumber = sample.lap ?? 0;
    let lapList = lapsMap.get(lapNumber);
    if (!lapList) {
      lapList = [];
      lapsMap.set(lapNumber, lapList);
    }
    lapList.push(sample);
  }

  // If only 1 single out-lap or ongoing lap exists without lap markers (rawLap === 0),
  // group all samples into Lap 1 with lapTimeSeconds = samples.length / tickRate
  if (samples.length > 0 && lapsMap.size === 1 && lapsMap.has(0)) {
    lapsMap.clear();
    lapsMap.set(1, samples);
  }

  const allLaps: LapData[] = [];
  for (const [lapNumber, lapSamples] of lapsMap.entries()) {
    const lastSampleTime = lapSamples[lapSamples.length - 1]?.lapTime ?? 0;
    const firstSampleTime = lapSamples[0]?.lapTime ?? 0;
    let lapTimeSeconds = lastSampleTime > firstSampleTime ? lastSampleTime - firstSampleTime : lastSampleTime;

    if (lapTimeSeconds <= 0) {
      lapTimeSeconds = lapSamples.length / tickRate;
    }

    allLaps.push({
      lapNumber,
      lapTimeSeconds,
      lapTimeFormatted: formatLapTime(lapTimeSeconds),
      samples: lapSamples,
    });
  }

  // Filter out laps with fewer than 50 samples or invalid time boundaries (< 5 seconds)
  let validLaps = allLaps.filter(
    (lap) => lap.samples.length >= 50 && lap.lapTimeSeconds >= 5
  );

  // Robust Lap Fallback:
  // If strict filtering leaves 0 laps, preserve all laps with >= 30 samples.
  if (validLaps.length === 0 && allLaps.length > 0) {
    validLaps = allLaps.filter((l) => l.samples.length >= 30);
  }

  // If still 0 laps but samples exist, group all samples into Lap 1
  if (validLaps.length === 0 && samples.length > 0) {
    const fallbackLapSeconds = samples.length / tickRate;
    validLaps = [
      {
        lapNumber: 1,
        lapTimeSeconds: fallbackLapSeconds,
        lapTimeFormatted: formatLapTime(fallbackLapSeconds),
        samples,
      },
    ];
  }

  // Sort laps by lapNumber
  validLaps.sort((a, b) => a.lapNumber - b.lapNumber);

  // Determine fastest lap (prioritizing full completed flying laps over partial in/outlaps)
  let bestLapTimeFormatted = '--:--.---';
  if (validLaps.length > 0) {
    const flyingLaps = validLaps.filter((l) => {
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
    const candidateLaps = flyingLaps.length > 0 ? flyingLaps : validLaps;
    const fastest = candidateLaps.reduce((best, curr) =>
      curr.lapTimeSeconds < best.lapTimeSeconds ? curr : best
    );
    bestLapTimeFormatted = fastest.lapTimeFormatted;
  }

  const sessionInfo: SessionInfo = {
    trackName: trackDisplayName || 'N/A',
    carName: driverCarScreenName || driverCarEngName || 'N/A',
    driverName: userName,
    bestLapTime: bestLapTimeFormatted,
    setupName: driverSetupName || undefined,
    trackDisplayName: trackDisplayName || undefined,
    driverCarEngName: driverCarEngName || undefined,
  };

  return {
    sessionInfo,
    laps: validLaps,
    totalTickCount,
    tickRate,
  };
}

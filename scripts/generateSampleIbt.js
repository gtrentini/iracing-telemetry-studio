import fs from 'node:fs';
import path from 'node:path';

const tickRate = 60;

const sampleConfigs = [
  {
    fileName: 'sample_openwheel.ibt',
    trackName: 'silverstone',
    trackDisplayName: 'Silverstone Circuit - Grand Prix',
    carScreenName: 'Dallara F3 Open Wheel',
    carEngName: 'dallaraf3',
    setupName: 'high_downforce_race.sto',
    driverName: 'Alex Albon',
    topSpeedMs: 82,
    baseDuration: 62.15,
    lapsSpec: [
      { lapNum: 1, duration: 65.50 },
      { lapNum: 2, duration: 62.15 },
      { lapNum: 3, duration: 61.42 }, // Fastest
    ],
  },
  {
    fileName: 'sample_gt3.ibt',
    trackName: 'spa',
    trackDisplayName: 'Circuit de Spa-Francorchamps',
    carScreenName: 'Ferrari 296 GT3',
    carEngName: 'ferrari296gt3',
    setupName: 'spa_endurance_qual.sto',
    driverName: 'Antonio Fuoco',
    topSpeedMs: 76,
    baseDuration: 138.45,
    lapsSpec: [
      { lapNum: 1, duration: 142.20 },
      { lapNum: 2, duration: 138.45 },
      { lapNum: 3, duration: 137.92 }, // Fastest
    ],
  },
  {
    fileName: 'sample_stock.ibt',
    trackName: 'daytona',
    trackDisplayName: 'Daytona International Speedway - Road Course',
    carScreenName: 'NASCAR Cup Next Gen Chevrolet Camaro ZL1',
    carEngName: 'chevycamarocup',
    setupName: 'daytona_road_baseline.sto',
    driverName: 'Kyle Larson',
    topSpeedMs: 86,
    baseDuration: 106.85,
    lapsSpec: [
      { lapNum: 1, duration: 109.40 },
      { lapNum: 2, duration: 106.85 },
      { lapNum: 3, duration: 105.74 }, // Fastest
    ],
  },
];

const varDefs = [
  { name: 'Speed', type: 4, offset: 0 },
  { name: 'Throttle', type: 4, offset: 4 },
  { name: 'Brake', type: 4, offset: 8 },
  { name: 'SteeringWheelAngle', type: 4, offset: 12 },
  { name: 'Gear', type: 2, offset: 16 },
  { name: 'RPM', type: 4, offset: 20 },
  { name: 'Lap', type: 2, offset: 24 },
  { name: 'LapDistPct', type: 4, offset: 28 },
  { name: 'LapCurrentLapTime', type: 4, offset: 32 },
];

const numVars = varDefs.length;
const VAR_HEADER_SIZE = 144;
const bufLen = 36;

for (const config of sampleConfigs) {
  const yamlString = `---
WeekendInfo:
  TrackName: ${config.trackName}
  TrackDisplayName: ${config.trackDisplayName}
DriverInfo:
  DriverCarIdx: 0
  DriverHeadName: ${config.driverName}
  UserName: ${config.driverName}
  DriverCarScreenName: ${config.carScreenName}
  DriverCarEngName: ${config.carEngName}
  DriverSetupName: ${config.setupName}
...
`;

  const yamlBytes = Buffer.from(yamlString, 'latin1');
  const sessionInfoLen = yamlBytes.length;
  const sessionInfoOffset = 112;
  const varHeaderOffset = Math.ceil((sessionInfoOffset + sessionInfoLen) / 16) * 16;
  const dataStartOffset = varHeaderOffset + numVars * VAR_HEADER_SIZE;

  let totalTicks = 0;
  for (const spec of config.lapsSpec) {
    totalTicks += Math.round(spec.duration * tickRate);
  }

  const totalFileSize = dataStartOffset + totalTicks * bufLen;
  const buffer = Buffer.alloc(totalFileSize);

  // Header (irsdk_header)
  buffer.writeInt32LE(2, 0); // ver
  buffer.writeInt32LE(1, 4); // status
  buffer.writeInt32LE(tickRate, 8); // tickRate
  buffer.writeInt32LE(1, 12); // sessionInfoUpdate
  buffer.writeInt32LE(sessionInfoLen, 16); // sessionInfoLen
  buffer.writeInt32LE(sessionInfoOffset, 20); // sessionInfoOffset
  buffer.writeInt32LE(numVars, 24); // numVars
  buffer.writeInt32LE(varHeaderOffset, 28); // varHeaderOffset
  buffer.writeInt32LE(1, 32); // numBuf
  buffer.writeInt32LE(bufLen, 36); // bufLen

  // varBuf[0]: tickCount at 48, bufOffset strictly at 52
  buffer.writeInt32LE(0, 48); // tickCount
  buffer.writeInt32LE(dataStartOffset, 52); // bufOffset

  // Write YAML
  yamlBytes.copy(buffer, sessionInfoOffset);

  // Write VarHeaders
  for (let i = 0; i < numVars; i++) {
    const vd = varDefs[i];
    const hOffset = varHeaderOffset + i * VAR_HEADER_SIZE;
    buffer.writeInt32LE(vd.type, hOffset);
    buffer.writeInt32LE(vd.offset, hOffset + 4);
    buffer.writeInt32LE(1, hOffset + 8);
    buffer.write(vd.name, hOffset + 16, 32, 'ascii');
  }

  // Generate record telemetry samples
  let currentOffset = dataStartOffset;

  for (const spec of config.lapsSpec) {
    const lapTicks = Math.round(spec.duration * tickRate);
    for (let t = 0; t < lapTicks; t++) {
      const distPct = t / lapTicks; // 0.0 to 1.0
      const lapTime = t / tickRate;

      const cornerFactor = Math.sin(distPct * Math.PI * 6);
      const isBraking = cornerFactor < -0.4;
      const isAccelerating = cornerFactor > 0.2;

      let throttle = isAccelerating ? 0.95 + 0.05 * Math.sin(t * 0.1) : (isBraking ? 0 : 0.4);
      let brake = isBraking ? 0.85 : 0;
      let steering = Math.sin(distPct * Math.PI * 8) * 0.35; // radians
      let speedMs = (35 + (config.topSpeedMs - 40) * (0.5 + 0.5 * Math.sin(distPct * Math.PI * 4 - 0.5))) + (isBraking ? -12 : 12);
      if (speedMs < 15) speedMs = 15;
      if (speedMs > config.topSpeedMs) speedMs = config.topSpeedMs;

      let gear = Math.min(6, Math.max(2, Math.floor(speedMs / (config.topSpeedMs / 6))));
      let rpm = 6500 + (speedMs % 15) * 350;

      buffer.writeFloatLE(speedMs, currentOffset + 0);
      buffer.writeFloatLE(throttle, currentOffset + 4);
      buffer.writeFloatLE(brake, currentOffset + 8);
      buffer.writeFloatLE(steering, currentOffset + 12);
      buffer.writeInt32LE(gear, currentOffset + 16);
      buffer.writeFloatLE(rpm, currentOffset + 20);
      buffer.writeInt32LE(spec.lapNum, currentOffset + 24);
      buffer.writeFloatLE(distPct, currentOffset + 28);
      buffer.writeFloatLE(lapTime, currentOffset + 32);

      currentOffset += bufLen;
    }
  }

  const outputPath = path.resolve(`public/samples/${config.fileName}`);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Generated ${config.fileName} (${buffer.length} bytes, ${totalTicks} ticks)`);
}

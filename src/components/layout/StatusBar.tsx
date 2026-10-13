import React from 'react';
import { useTelemetry } from '../../context/TelemetryContext';
import styles from './StatusBar.module.scss';

export const StatusBar: React.FC = () => {
  const { activeSample, cursorDistance, parsedSession } = useTelemetry();

  const cursorText = activeSample
    ? `${activeSample.distancePct.toFixed(2)}%`
    : `${cursorDistance.toFixed(2)}%`;

  const speedText = activeSample != null
    ? `${activeSample.speed.toFixed(1)} km/h`
    : '-- km/h';

  const throttleText = activeSample != null
    ? `${activeSample.throttle.toFixed(0)}%`
    : '--%';

  const brakeText = activeSample != null
    ? `${activeSample.brake.toFixed(0)}%`
    : '--%';

  const gearText = activeSample != null
    ? activeSample.gear === 0
      ? 'N'
      : activeSample.gear < 0
        ? 'R'
        : String(activeSample.gear)
    : '--';

  const steeringText = activeSample != null
    ? `${activeSample.steering.toFixed(1)}°`
    : '--°';

  return (
    <footer className={styles.statusBar}>
      <div className={styles.metricsGroup}>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Distance:</span>
          <span className={styles.metricValue}>{cursorText}</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Speed:</span>
          <span className={`${styles.metricValue} ${styles.speed}`}>{speedText}</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Throttle:</span>
          <span className={`${styles.metricValue} ${styles.throttle}`}>{throttleText}</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Brake:</span>
          <span className={`${styles.metricValue} ${styles.brake}`}>{brakeText}</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Gear:</span>
          <span className={`${styles.metricValue} ${styles.gear}`}>{gearText}</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Steering:</span>
          <span className={`${styles.metricValue} ${styles.steering}`}>{steeringText}</span>
        </div>
      </div>

      <div className={styles.statusIndicator}>
        <span className={styles.dot} />
        <span>
          {parsedSession
            ? `${parsedSession.tickRate}Hz Engine Synchronized`
            : 'Telemetry Engine Ready'}
        </span>
      </div>
    </footer>
  );
};

export default StatusBar;

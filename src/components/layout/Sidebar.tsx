import React from 'react';
import { useTelemetry } from '../../context/TelemetryContext';
import { DEFAULT_CHANNELS, type TelemetryChannel } from '../../types/telemetry';
import styles from './Sidebar.module.scss';

export interface SidebarProps {
  channels?: TelemetryChannel[];
  onToggleChannel?: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  channels = DEFAULT_CHANNELS,
  onToggleChannel,
}) => {
  const {
    parsedSession,
    selectedBaseLap,
    selectedRefLap,
    selectLap,
  } = useTelemetry();

  const laps = parsedSession?.laps ?? [];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.section}>
        <h2 className={styles.title}>Telemetry Channels</h2>
        <ul className={styles.channelList}>
          {channels.map((channel) => {
            const indicatorClass =
              channel.id in styles
                ? styles[channel.id as keyof typeof styles]
                : '';

            return (
              <li
                key={channel.id}
                className={`${styles.channelItem} ${!channel.enabled ? styles.disabled : ''}`}
                onClick={() => onToggleChannel?.(channel.id)}
              >
                <div className={styles.channelLabelGroup}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={channel.enabled}
                    onChange={() => onToggleChannel?.(channel.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Toggle ${channel.label} channel`}
                  />
                  <span
                    className={`${styles.indicator} ${indicatorClass}`}
                    style={!indicatorClass ? { backgroundColor: channel.color } : undefined}
                    aria-hidden="true"
                  />
                  <span className={styles.channelName}>{channel.label}</span>
                </div>
                <span className={styles.channelUnit}>{channel.unit}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.section}>
        <h2 className={styles.title}>Session Laps</h2>
        {laps.length === 0 ? (
          <div className={styles.emptyLaps}>No laps recorded. Load a telemetry file to view laps.</div>
        ) : (
          <ul className={styles.lapList}>
            {laps.map((lap) => {
              const isBase = selectedBaseLap === lap.lapNumber;
              const isRef = selectedRefLap === lap.lapNumber;
              const itemClass = `${styles.lapItem} ${isBase && isRef ? styles.isBoth : isBase ? styles.isBase : isRef ? styles.isRef : ''}`;

              return (
                <li key={lap.lapNumber} className={itemClass}>
                  <div className={styles.lapRow}>
                    <span className={styles.lapNumber}>Lap {lap.lapNumber}</span>
                    <span className={styles.lapTime}>{lap.lapTimeFormatted}</span>
                  </div>
                  <div className={styles.badgeGroup}>
                    <button
                      type="button"
                      className={`${styles.roleBtn} ${isBase ? styles.activeBase : ''}`}
                      onClick={() => selectLap(lap.lapNumber, 'base')}
                      title="Set as Base Lap"
                    >
                      {isBase ? '● BASE' : 'Base'}
                    </button>
                    <button
                      type="button"
                      className={`${styles.roleBtn} ${isRef ? styles.activeRef : ''}`}
                      onClick={() => selectLap(lap.lapNumber, 'reference')}
                      title="Toggle Reference Lap"
                    >
                      {isRef ? '● REF' : 'Ref'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;

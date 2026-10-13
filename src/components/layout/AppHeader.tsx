import React, { useRef, useState } from 'react';
import { useTelemetry } from '../../context/TelemetryContext';
import ModalPortal from '../common/ModalPortal';
import styles from './AppHeader.module.scss';

export const AppHeader: React.FC = () => {
  const { parsedSession, loadFile, loadSample, isLoading } = useTelemetry();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const session = parsedSession?.sessionInfo;
  const tagText = session
    ? `${session.carName} @ ${session.trackName}`
    : 'No Session Loaded';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadFile(file);
      // Reset input value so re-selecting same file triggers change
      e.target.value = '';
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <svg
          className={styles.logoIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <h1 className={styles.title}>iRacing Telemetry Studio</h1>
      </div>

      <div className={styles.metaGroup}>
        <div className={styles.sampleButtonGroup}>
          <button
            type="button"
            className={styles.sampleHeaderBtn}
            onClick={() => void loadSample('/samples/real_openwheel.ibt')}
            disabled={isLoading}
            title="Load Real Open-Wheel / GT4 .ibt dataset"
          >
            Open-Wheel
          </button>
          <button
            type="button"
            className={styles.sampleHeaderBtn}
            onClick={() => void loadSample('/samples/real_gt3.ibt')}
            disabled={isLoading}
            title="Load Real Ferrari 296 GT3 .ibt dataset"
          >
            GT3
          </button>
        </div>

        <div className={styles.sessionTag}>{tagText}</div>

        <input
          type="file"
          ref={fileInputRef}
          accept=".ibt"
          style={{ display: 'none' }}
          onChange={handleFileChange}
          aria-label="Upload .ibt file"
        />

        <button
          type="button"
          className={styles.openBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {isLoading ? 'Loading...' : 'Open .ibt'}
        </button>

        <button
          type="button"
          className={styles.inspectBtn}
          onClick={() => setIsModalOpen(true)}
        >
          Inspect Session
        </button>
      </div>

      <ModalPortal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Session Details"
      >
        <div className={styles.modalHeader}>
          <h3>Session Inspection</h3>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setIsModalOpen(false)}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.sessionItem}>
            <span className={styles.label}>Track</span>
            <span className={styles.value}>{session?.trackName ?? 'N/A'}</span>
          </div>
          <div className={styles.sessionItem}>
            <span className={styles.label}>Vehicle</span>
            <span className={styles.value}>{session?.carName ?? 'N/A'}</span>
          </div>
          <div className={styles.sessionItem}>
            <span className={styles.label}>Driver</span>
            <span className={styles.value}>{session?.driverName ?? 'N/A'}</span>
          </div>
          <div className={styles.sessionItem}>
            <span className={styles.label}>Best Lap Time</span>
            <span className={styles.value}>{session?.bestLapTime ?? '--:--.---'}</span>
          </div>
          <div className={styles.sessionItem}>
            <span className={styles.label}>Setup File</span>
            <span className={styles.value}>{session?.setupName ?? 'N/A'}</span>
          </div>
          {parsedSession && (
            <>
              <div className={styles.sessionItem}>
                <span className={styles.label}>Total Ticks</span>
                <span className={styles.value}>{parsedSession.totalTickCount.toLocaleString()}</span>
              </div>
              <div className={styles.sessionItem}>
                <span className={styles.label}>Sample Rate</span>
                <span className={styles.value}>{parsedSession.tickRate} Hz</span>
              </div>
              <div className={styles.sessionItem}>
                <span className={styles.label}>Valid Laps</span>
                <span className={styles.value}>{parsedSession.laps.length}</span>
              </div>
            </>
          )}
          <div className={styles.sessionItem}>
            <span className={styles.label}>Portal Target</span>
            <span className={styles.value}>Mounted to document.body</span>
          </div>
        </div>
      </ModalPortal>
    </header>
  );
};

export default AppHeader;

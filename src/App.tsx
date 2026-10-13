import React, { useState } from 'react';
import AppHeader from './components/layout/AppHeader';
import Sidebar from './components/layout/Sidebar';
import StatusBar from './components/layout/StatusBar';
import TelemetryStage from './components/layout/TelemetryStage';
import { TelemetryProvider } from './context/TelemetryContext';
import { DEFAULT_CHANNELS, type TelemetryChannel } from './types/telemetry';
import styles from './App.module.scss';

const TelemetryStudioLayout: React.FC = () => {
  const [channels, setChannels] = useState<TelemetryChannel[]>(DEFAULT_CHANNELS);

  const handleToggleChannel = (id: string) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.id === id ? { ...ch, enabled: !ch.enabled } : ch))
    );
  };

  return (
    <div className={styles.appContainer}>
      <div className={styles.headerWrapper}>
        <AppHeader />
      </div>
      <div className={styles.sidebarWrapper}>
        <Sidebar channels={channels} onToggleChannel={handleToggleChannel} />
      </div>
      <div className={styles.stageWrapper}>
        <TelemetryStage channels={channels} />
      </div>
      <div className={styles.footerWrapper}>
        <StatusBar />
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <TelemetryProvider>
      <TelemetryStudioLayout />
    </TelemetryProvider>
  );
};

export default App;

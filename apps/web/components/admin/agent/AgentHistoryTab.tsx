'use client';

import React, { memo } from 'react';
import dynamic from 'next/dynamic';

const ScanHistoryChart = dynamic(() => import('./ScanHistoryChart'), {
  loading: () => <div className="h-80 animate-pulse bg-slate-200 dark:bg-slate-700 rounded" />,
});
const ScanControlPanel = dynamic(() => import('./ScanControlPanel'), {
  loading: () => <div className="h-48 animate-pulse bg-slate-200 dark:bg-slate-700 rounded" />,
});
const ScanLogTable = dynamic(() => import('./ScanLogTable'), {
  loading: () => <div className="h-64 animate-pulse bg-slate-200 dark:bg-slate-700 rounded" />,
});

export default memo(function AgentHistoryTab() {
  return (
    <div className="space-y-6">
      <ScanControlPanel />
      <ScanHistoryChart />
      <ScanLogTable />
    </div>
  );
});

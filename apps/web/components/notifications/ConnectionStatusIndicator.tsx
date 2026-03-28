'use client';

import { memo, useState, useEffect } from 'react';
import { notificationSocketIO } from '@/services/notification-socketio.singleton';
import { cn } from '@/lib/utils';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export const ConnectionStatusIndicator = memo(function ConnectionStatusIndicator() {
  const [status, setStatus] = useState<ConnectionStatus>(() => {
    const { isConnected, isConnecting } = notificationSocketIO.getConnectionStatus();
    if (isConnected) return 'connected';
    if (isConnecting) return 'connecting';
    return 'disconnected';
  });

  useEffect(() => {
    const unsubConnect = notificationSocketIO.onConnect(() => {
      setStatus('connected');
    });

    const unsubDisconnect = notificationSocketIO.onDisconnect(() => {
      setStatus('disconnected');
    });

    return () => {
      unsubConnect();
      unsubDisconnect();
    };
  }, []);

  const statusConfig = {
    connected: {
      color: 'bg-green-500',
      title: 'Connected',
    },
    connecting: {
      color: 'bg-orange-500 animate-pulse',
      title: 'Reconnecting...',
    },
    disconnected: {
      color: 'bg-red-500',
      title: 'Disconnected',
    },
  };

  const config = statusConfig[status];

  if (status === 'connected') return null;

  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full', config.color)}
      title={config.title}
      role="status"
      aria-label={config.title}
    />
  );
});

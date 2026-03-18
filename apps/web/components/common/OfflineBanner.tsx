'use client';

import { memo } from 'react';
import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/use-network-status';

export const OfflineBanner = memo(function OfflineBanner() {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>Vous êtes hors ligne — les messages seront envoyés à la reconnexion</span>
    </div>
  );
});

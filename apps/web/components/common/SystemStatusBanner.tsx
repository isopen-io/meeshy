'use client';

import { useState, useEffect, memo, useCallback } from 'react';
import { WifiOff, RefreshCcw, X } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { activateWaitingServiceWorker } from '@/utils/service-worker';

export const SystemStatusBanner = memo(function SystemStatusBanner() {
  const isOnline = useNetworkStatus();
  const { t } = useI18n('common');
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState(false);

  useEffect(() => {
    const handleUpdateAvailable = (event: any) => {
      console.log('[Banner] Update available event received');
      setUpdateRegistration(event.detail.registration);
      setDismissedUpdate(false);
    };

    window.addEventListener('sw-update-available', handleUpdateAvailable);
    return () => {
      window.removeEventListener('sw-update-available', handleUpdateAvailable);
    };
  }, []);

  const handleUpdate = useCallback(() => {
    if (updateRegistration) {
      console.log('[Banner] Triggering update...');
      activateWaitingServiceWorker(updateRegistration);
    }
  }, [updateRegistration]);

  const handleDismiss = useCallback(() => {
    setDismissedUpdate(true);
  }, []);

  // Priorité 1 : Offline (Message critique)
  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-md animate-in fade-in slide-in-from-top duration-300"
      >
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>{t('offlineMessage') || 'Vous êtes hors ligne — les messages seront envoyés à la reconnexion'}</span>
      </div>
    );
  }

  // Priorité 2 : Mise à jour disponible
  if (updateRegistration && !dismissedUpdate) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-between gap-4 bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg animate-in fade-in slide-in-from-top duration-300"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <RefreshCcw className="h-4 w-4 shrink-0 animate-spin-slow" />
          <span className="truncate">
            {t('updateAvailable') || 'Une nouvelle version de Meeshy est disponible !'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 bg-white text-blue-600 hover:bg-blue-50 border-none font-bold"
            onClick={handleUpdate}
          >
            {t('updateNow') || 'Mettre à jour'}
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-white hover:bg-blue-700"
            onClick={handleDismiss}
            aria-label={t('wait') || 'Attendre'}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
});

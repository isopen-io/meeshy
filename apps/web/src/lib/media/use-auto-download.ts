import { useSyncExternalStore } from 'react';

import { browserConnection, onConnectionChange } from '@/lib/device/capability-tier';

import { networkConditionOf, shouldAutoDownload, type AutoDownloadKind, type NetworkCondition } from './auto-download-policy';
import { useMediaDownloadPreferences } from './media-download-preferences';

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  const stopConnection = onConnectionChange(onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
    stopConnection();
  };
};

const snapshot = (): NetworkCondition => {
  const connection = browserConnection();
  return networkConditionOf({ online: navigator.onLine, ...(connection === null ? {} : { connection }) });
};

/** Le réseau tel que la politique le lit (la connexion par le lecteur unique, `lib/device`) — une chaîne, donc un rendu seulement quand il CHANGE de classe. */
export const useNetworkCondition = (): NetworkCondition => useSyncExternalStore(subscribe, snapshot, () => 'goodCellular');

/**
 * **CE MÉDIA PART-IL SEUL ?** (#6333) — vrai : le fil le télécharge comme
 * avant ; faux en ligne : la bulle DEMANDE (un toucher, la taille dite).
 */
export function useAutoDownload(kind: AutoDownloadKind, sizeBytes: number | undefined): boolean {
  const preferences = useMediaDownloadPreferences();
  const condition = useNetworkCondition();
  return shouldAutoDownload({ kind, condition, preferences, sizeBytes });
}

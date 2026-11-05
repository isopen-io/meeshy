import { useStore } from 'zustand/react';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

import {
  AUTO_DOWNLOAD_POLICIES,
  DEFAULT_MEDIA_DOWNLOAD_PREFERENCES,
  type AutoDownloadKind,
  type AutoDownloadPolicy,
  type MediaDownloadPreferences,
} from './auto-download-policy';

/**
 * **LA POLITIQUE TENUE PAR L'APPAREIL** (#6333) — comme
 * `MediaDownloadPreferencesStore` d'iOS : aucune passerelle, un choix par
 * appareil, relu au démarrage. Une valeur illisible ou inconnue rend le défaut
 * de son type, jamais une politique inventée.
 */
export const MEDIA_DOWNLOAD_STORAGE_KEY = 'meeshy.media-download.v1';

const isPolicy = (value: unknown): value is AutoDownloadPolicy =>
  typeof value === 'string' && (AUTO_DOWNLOAD_POLICIES as readonly string[]).includes(value);

export function parseMediaDownloadPreferences(raw: string | null): MediaDownloadPreferences {
  const parsed = ((): unknown => {
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })();
  const record = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  return {
    image: isPolicy(record.image) ? record.image : DEFAULT_MEDIA_DOWNLOAD_PREFERENCES.image,
    video: isPolicy(record.video) ? record.video : DEFAULT_MEDIA_DOWNLOAD_PREFERENCES.video,
  };
}

export type MediaDownloadStore = StoreApi<MediaDownloadPreferences> & {
  readonly setPolicy: (kind: AutoDownloadKind, policy: AutoDownloadPolicy) => void;
};

export function createMediaDownloadStore(storage: SafeStorage): MediaDownloadStore {
  const store = createStore<MediaDownloadPreferences>(() => parseMediaDownloadPreferences(storage.getItem(MEDIA_DOWNLOAD_STORAGE_KEY)));
  const setPolicy = (kind: AutoDownloadKind, policy: AutoDownloadPolicy): void => {
    const next = { ...store.getState(), [kind]: policy };
    store.setState(next, true);
    storage.setItem(MEDIA_DOWNLOAD_STORAGE_KEY, JSON.stringify(next));
  };
  return { ...store, setPolicy };
}

const lazyStore = (() => {
  const holder: { store: MediaDownloadStore | null } = { store: null };
  return (): MediaDownloadStore => {
    holder.store ??= createMediaDownloadStore(safeLocalStorage());
    return holder.store;
  };
})();

export const mediaDownloadStore = (): MediaDownloadStore => lazyStore();

export const useMediaDownloadPreferences = (store: MediaDownloadStore = mediaDownloadStore()): MediaDownloadPreferences => useStore(store);

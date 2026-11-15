import type { QueryClient } from '@tanstack/react-query';

import type { PhotoInvitations } from '@meeshy/shared/types/game-photo-settings';

import type { HttpTransport } from '@/lib/api/http';
import { createOfflineQueue, type OfflineQueue } from '@/lib/offline-queue';
import type { SafeStorage } from '@/lib/storage';

import { acknowledgePresented, parsePhotoWriteJob, setInvitations, signalKept, watchPhotoWrites, type PhotoWriteDeps, type PhotoWriteJob } from './alert-acks';

/**
 * LES ÉCRITURES PHOTO, TELLES QUE L'APPLICATION LES TIENT (#10174, L18) — une file PAR COMPTE, gardée sur l'appareil
 * (un onglet fermé hors ligne ne perd ni l'accusé, ni le signal « immortalisée », ni le réglage), rejouée seule dès la
 * création : au début de la séance, au retour du réseau, à chaque lecture fraîche du jeu (`watchPhotoWrites`). Le
 * compte est relu à chaque écriture et à chaque rejeu : ce qu'un compte a mis en file ne part jamais sous un autre.
 */
export type AppPhotoWritesDeps = {
  readonly transport: HttpTransport;
  readonly client: QueryClient;
  readonly storage: SafeStorage;
  readonly viewer: () => string;
  readonly isOnline: () => boolean;
  readonly requestId: () => string;
  readonly target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  readonly now?: () => Date;
};

export type AppPhotoWrites = {
  readonly acknowledgePresented: (stepIds: readonly string[]) => void;
  readonly signalKept: (stepIds: readonly string[]) => void;
  readonly setInvitations: (invitations: PhotoInvitations) => void;
  readonly stop: () => void;
};

const STORAGE_KEY = (viewer: string): string => `meeshy.game.photo-writes.${viewer}`;

export function createAppPhotoWrites(app: AppPhotoWritesDeps): AppPhotoWrites {
  const queues = new Map<string, OfflineQueue<PhotoWriteJob>>();
  const queueOf = (viewer: string): OfflineQueue<PhotoWriteJob> => {
    const known = queues.get(viewer);
    if (known !== undefined) return known;
    const queue = createOfflineQueue<PhotoWriteJob>({ storage: app.storage, key: STORAGE_KEY(viewer), parse: parsePhotoWriteJob });
    queues.set(viewer, queue);
    return queue;
  };
  const deps = (): PhotoWriteDeps => ({
    transport: app.transport,
    client: app.client,
    queue: queueOf(app.viewer()),
    isOnline: app.isOnline,
    requestId: app.requestId,
    ...(app.now === undefined ? {} : { now: app.now }),
  });
  const stop = watchPhotoWrites(deps, app.target);
  return {
    acknowledgePresented: (stepIds) => acknowledgePresented(stepIds, deps()),
    signalKept: (stepIds) => signalKept(stepIds, deps()),
    setInvitations: (invitations) => setInvitations(invitations, deps()),
    stop,
  };
}

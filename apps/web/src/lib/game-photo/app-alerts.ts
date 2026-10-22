import type { PhotoInvitations } from '@meeshy/shared/types/game-photo-settings';

import { httpTransport } from '@/lib/api/client';
import { newClientMessageId } from '@/lib/api/client-message-id';
import { appQueryClient } from '@/lib/api/query-client';
import { createOfflineQueue } from '@/lib/offline-queue';
import { safeLocalStorage } from '@/lib/storage';

import { acknowledgePresented, flushPhotoWrites, setInvitations, signalKept, type PhotoWriteDeps } from './alert-acks';
import { createPhotoAlerts, type PhotoAlerts } from './alerts';
import type { KeepOutcome, KeptPhoto, Notebook } from './notebook';
import type { PhotoEnv } from './env';
import type { PhotoMoment } from './moments';

/**
 * LE COORDINATEUR DES INVITATIONS, CÂBLÉ SUR L'APPLICATION (#10174, L18) — UNE instance pour toutes les
 * routes : la bande du haut l'observe, Progression lui remet ses célébrations, le carnet éteint sa pastille.
 * Ses écritures (accusé, signal « immortalisée », réglage) passent par UNE file hors ligne, vidée au retour du
 * réseau. Le début de session est l'instant où ce module est chargé : il l'est au repos, après la première
 * peinture, par le premier écran qui en a besoin.
 */
const queue = createOfflineQueue<Parameters<PhotoWriteDeps['queue']['enqueue']>[1]>();

const deps = (): PhotoWriteDeps => ({
  transport: httpTransport,
  client: appQueryClient,
  queue,
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
  requestId: newClientMessageId,
});

export const acknowledgePhotoPresented = (stepIds: readonly string[]): void => acknowledgePresented(stepIds, deps());
export const signalPhotoKept = (stepIds: readonly string[]): void => signalKept(stepIds, deps());
export const setPhotoInvitations = (invitations: PhotoInvitations): void => setInvitations(invitations, deps());
export const flushPhotoWriteQueue = (): Promise<void> => flushPhotoWrites(deps());

export const appPhotoAlerts: PhotoAlerts = createPhotoAlerts({
  storage: safeLocalStorage(),
  sessionStartedAt: Date.now(),
  acknowledge: acknowledgePhotoPresented,
});

/** Les identités que le carnet connaît : gardées, et toutes (en attente comprises). */
export async function notebookIds(notebook: Pick<Notebook, 'list'>): Promise<{ readonly kept: readonly string[]; readonly known: readonly string[] }> {
  const entries = await notebook.list().catch(() => []);
  return { kept: entries.filter((entry) => entry.status === 'kept').map((entry) => entry.momentId), known: entries.map((entry) => entry.momentId) };
}

/** Garder une photo SIGNALE l'étape immortalisée (D22 b) : l'identifiant seul part, après l'écriture locale. */
export const withKeptSignal = (env: PhotoEnv, signal: (stepIds: readonly string[]) => void = signalPhotoKept): PhotoEnv => ({
  ...env,
  notebook: {
    ...env.notebook,
    keep: async (moment: PhotoMoment, photo: KeptPhoto): Promise<KeepOutcome> => {
      const outcome = await env.notebook.keep(moment, photo);
      if (outcome === 'kept') signal([moment.id]);
      return outcome;
    },
  },
});

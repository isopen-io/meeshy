import type { PhotoInvitations } from '@meeshy/shared/types/game-photo-settings';

import { httpTransport } from '@/lib/api/client';
import { newClientMessageId } from '@/lib/api/client-message-id';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { safeLocalStorage } from '@/lib/storage';

import { createPhotoAlerts, type PhotoAlerts } from './alerts';
import type { KeepOutcome, KeptPhoto, Notebook } from './notebook';
import type { PhotoEnv } from './env';
import type { PhotoMoment } from './moments';
import { createAppPhotoWrites } from './photo-writes';

/**
 * LE COORDINATEUR DES INVITATIONS, CÂBLÉ SUR L'APPLICATION (#10174, L18) — UNE instance pour toutes les
 * routes : la bande du haut l'observe, Progression lui remet ses célébrations, le carnet éteint sa pastille.
 * Ses écritures (accusé, signal « immortalisée », réglage) passent par UNE file hors ligne par compte, gardée sur
 * l'appareil et rejouée seule (`photo-writes.ts`) : au chargement de ce module (le début de la séance — il l'est
 * au repos, après la première peinture, par le premier écran qui en a besoin), au retour du réseau, et à chaque
 * lecture fraîche du jeu.
 */
const currentViewer = (): string => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? 'anonymous';

const writes = createAppPhotoWrites({
  transport: httpTransport,
  client: appQueryClient,
  storage: safeLocalStorage(),
  viewer: currentViewer,
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
  requestId: newClientMessageId,
  target: typeof window === 'undefined' ? new EventTarget() : window,
});

export const acknowledgePhotoPresented = (stepIds: readonly string[]): void => writes.acknowledgePresented(stepIds);
export const signalPhotoKept = (stepIds: readonly string[]): void => writes.signalKept(stepIds);
export const setPhotoInvitations = (invitations: PhotoInvitations): void => writes.setInvitations(invitations);

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

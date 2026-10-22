import type { QueryClient } from '@tanstack/react-query';

import type { GameBlock } from '@meeshy/shared/types/game';
import type { GamePhotoBlock, GamePhotoMoment } from '@meeshy/shared/types/game-photo';
import { DEFAULT_PHOTO_INVITATIONS, PHOTO_KEPT_MAX, PHOTO_PRESENTED_MAX, type PhotoInvitations } from '@meeshy/shared/types/game-photo-settings';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { postPhotoMomentsKept, postPhotoMomentsPresented, putPhotoInvitations } from '@/lib/api/game-photo';
import type { ApiResult, HttpTransport } from '@/lib/api/http';
import type { OfflineQueue } from '@/lib/offline-queue';
import { onGame } from '@/lib/view/game-optimistic-v2';

/**
 * LES ÉCRITURES DU REGISTRE PARTAGÉ (#10174, L18 ; § 5.16.2 ; D22 b de #10182) — trois gestes, une discipline :
 * le cache du bloc `game` se pose AVANT la réponse (un autre crochet de la même séance voit l'étape présentée,
 * immortalisée ou le réglage changé), l'écriture part si le réseau est là, sinon elle entre dans UNE file par
 * geste rejouée au retour du réseau (`flushPhotoWrites`), et un ancien serveur (404) l'abandonne sans bruit.
 *
 *  - l'ACCUSÉ : TOUT affichage d'une étape l'émet (bannière, feuille, carte, carnet), par lots d'au plus 64 ;
 *  - le SIGNAL « immortalisée » : l'identifiant d'étape seul, pour que les autres appareils la sortent de
 *    « À rattraper » ; la photo ne quitte jamais l'appareil ;
 *  - le RÉGLAGE « Me proposer d'immortaliser », une préférence de compte.
 */
export type PhotoWriteJob =
  | { readonly kind: 'presented'; readonly stepIds: readonly string[]; readonly requestId: string }
  | { readonly kind: 'kept'; readonly stepIds: readonly string[]; readonly requestId: string }
  | { readonly kind: 'invitations'; readonly invitations: PhotoInvitations; readonly requestId: string };

export type PhotoWriteDeps = {
  readonly transport: HttpTransport;
  readonly client: QueryClient;
  readonly queue: OfflineQueue<PhotoWriteJob>;
  readonly isOnline: () => boolean;
  readonly requestId: () => string;
  readonly now?: () => Date;
};

const EMPTY_PHOTO: GamePhotoBlock = { atmosphere: null, invitations: DEFAULT_PHOTO_INVITATIONS, baselineAt: null, baseline: null, treasuryPeakTier: null, moments: [] };

const stamp = (moments: readonly GamePhotoMoment[], stepIds: readonly string[], field: 'presentedAt' | 'keptAt', at: string): readonly GamePhotoMoment[] => {
  const known = new Set(moments.map((moment) => moment.stepId));
  const touched = moments.map((moment) => (stepIds.includes(moment.stepId) && moment[field] === null ? { ...moment, [field]: at } : moment));
  const fresh = stepIds.filter((id) => !known.has(id)).map((stepId): GamePhotoMoment => ({ stepId, detectedAt: at, presentedAt: field === 'presentedAt' ? at : null, notifiedAt: null, keptAt: field === 'keptAt' ? at : null }));
  return [...touched, ...fresh];
};

const withPhoto = (view: EngagementWithGame, update: (photo: GamePhotoBlock) => GamePhotoBlock): EngagementWithGame =>
  onGame(view, (game: GameBlock) => ({ ...game, photo: update(game.photo ?? EMPTY_PHOTO) }));

const patchCache = (client: QueryClient, update: (photo: GamePhotoBlock) => GamePhotoBlock): void => {
  const snapshot = client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY);
  if (snapshot?.game !== undefined) client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, withPhoto(snapshot, update));
};

const chunks = <T,>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  items.length === 0 ? [] : [items.slice(0, size), ...chunks(items.slice(size), size)];

const retryable = (result: ApiResult<unknown>): boolean => !result.ok && (result.status === 0 || result.status >= 500 || result.status === 408 || result.status === 429);

/** `true` : le job est réglé (écrit, ou abandonné devant un ancien serveur ou un refus) ; `false` : à rejouer. */
async function send(job: PhotoWriteJob, deps: PhotoWriteDeps): Promise<boolean> {
  const result =
    job.kind === 'presented'
      ? await postPhotoMomentsPresented(deps.transport, job.requestId, job.stepIds)
      : job.kind === 'kept'
        ? await postPhotoMomentsKept(deps.transport, job.requestId, job.stepIds)
        : await putPhotoInvitations(deps.transport, job.requestId, job.invitations);
  return !retryable(result);
}

const dispatch = (job: PhotoWriteJob, key: string, deps: PhotoWriteDeps): void => {
  if (!deps.isOnline()) {
    deps.queue.enqueue(key, job);
    return;
  }
  void send(job, deps).then((settled) => {
    if (!settled) deps.queue.enqueue(key, job);
  });
};

export function acknowledgePresented(stepIds: readonly string[], deps: PhotoWriteDeps): void {
  const ids = [...new Set(stepIds)];
  if (ids.length === 0) return;
  const at = (deps.now ?? (() => new Date()))().toISOString();
  patchCache(deps.client, (photo) => ({ ...photo, moments: [...stamp(photo.moments, ids, 'presentedAt', at)] }));
  for (const lot of chunks(ids, PHOTO_PRESENTED_MAX)) dispatch({ kind: 'presented', stepIds: lot, requestId: deps.requestId() }, `presented:${lot.join(',')}`, deps);
}

export function signalKept(stepIds: readonly string[], deps: PhotoWriteDeps): void {
  const ids = [...new Set(stepIds)];
  if (ids.length === 0) return;
  const at = (deps.now ?? (() => new Date()))().toISOString();
  patchCache(deps.client, (photo) => ({ ...photo, moments: [...stamp(photo.moments, ids, 'keptAt', at)] }));
  for (const lot of chunks(ids, PHOTO_KEPT_MAX)) dispatch({ kind: 'kept', stepIds: lot, requestId: deps.requestId() }, `kept:${lot.join(',')}`, deps);
}

export function setInvitations(invitations: PhotoInvitations, deps: PhotoWriteDeps): void {
  patchCache(deps.client, (photo) => ({ ...photo, invitations }));
  dispatch({ kind: 'invitations', invitations, requestId: deps.requestId() }, 'invitations', deps);
}

/** Les étapes gardées sur cet appareil que le serveur ne connaît pas encore (première exécution du signal). */
export const keptToSignal = (localKept: readonly string[], served: readonly GamePhotoMoment[]): readonly string[] => {
  const known = new Set(served.filter((moment) => moment.keptAt !== null).map((moment) => moment.stepId));
  return localKept.filter((id) => !known.has(id));
};

export const flushPhotoWrites = (deps: PhotoWriteDeps): Promise<void> => deps.queue.flush((job) => send(job, deps));

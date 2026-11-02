import type { QueryClient } from '@tanstack/react-query';

import type { GameBlock } from '@meeshy/shared/types/game';
import type { GamePhotoBlock, GamePhotoMoment } from '@meeshy/shared/types/game-photo';
import { DEFAULT_PHOTO_INVITATIONS, PHOTO_INVITATIONS, PHOTO_KEPT_MAX, PHOTO_PRESENTED_MAX, type PhotoInvitations } from '@meeshy/shared/types/game-photo-settings';
import { isKnownPhotoStepId } from '@meeshy/shared/utils/game/photo-step-ids';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { postPhotoMomentsKept, postPhotoMomentsPresented, putPhotoInvitations } from '@/lib/api/game-photo';
import type { ApiResult, HttpTransport } from '@/lib/api/http';
import type { OfflineQueue } from '@/lib/offline-queue';
import { onGame } from '@/lib/view/game-optimistic-v2';

/**
 * LES ÉCRITURES DU REGISTRE PARTAGÉ (#10174, L18 ; § 5.16.2 ; D22 b de #10182) — trois gestes, une discipline :
 * le cache du bloc `game` se pose AVANT la réponse (un autre crochet de la même séance voit l'étape présentée,
 * immortalisée ou le réglage changé), l'écriture part si le réseau est là, sinon elle entre dans UNE file par
 * geste rejouée au retour du réseau, à chaque lecture fraîche du jeu et au début de la séance (`watchPhotoWrites`),
 * et un ancien serveur (404) l'abandonne sans bruit. Tant qu'un job attend, son effet reste posé sur ce que le
 * serveur relit. Seules partent les identités que le registre accepte À L'INSTANT DE L'ENVOI
 * (`isKnownPhotoStepId`, le contrat partagé) : une seule refusée ferait tomber tout le lot en 400.
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

const nowOf = (deps: PhotoWriteDeps): Date => (deps.now ?? (() => new Date()))();

/** `true` : le job est réglé (écrit, abandonné devant un ancien serveur ou un refus, ou sans rien de recevable) ; `false` : à rejouer. */
async function send(job: PhotoWriteJob, deps: PhotoWriteDeps): Promise<boolean> {
  if (job.kind === 'invitations') return !retryable(await putPhotoInvitations(deps.transport, job.requestId, job.invitations));
  const at = nowOf(deps);
  const stepIds = job.stepIds.filter((id) => isKnownPhotoStepId(id, at));
  if (stepIds.length === 0) return true;
  const post = job.kind === 'presented' ? postPhotoMomentsPresented : postPhotoMomentsKept;
  return !retryable(await post(deps.transport, job.requestId, stepIds));
}

export const flushPhotoWrites = (deps: PhotoWriteDeps): Promise<void> => deps.queue.flush((job) => send(job, deps));

/** Une file qui attend déjà garde l'ordre : la nouvelle écriture passe derrière, jamais devant. */
const dispatch = (job: PhotoWriteJob, key: string, deps: PhotoWriteDeps): void => {
  if (!deps.isOnline() || deps.queue.size() > 0) {
    deps.queue.enqueue(key, job);
    if (deps.isOnline()) void flushPhotoWrites(deps);
    return;
  }
  void send(job, deps).then((settled) => {
    if (!settled) deps.queue.enqueue(key, job);
  });
};

const effectOf = (job: PhotoWriteJob, at: string) => (photo: GamePhotoBlock): GamePhotoBlock =>
  job.kind === 'invitations' ? { ...photo, invitations: job.invitations } : { ...photo, moments: [...stamp(photo.moments, job.stepIds, job.kind === 'presented' ? 'presentedAt' : 'keptAt', at)] };

const stampSteps = (kind: 'presented' | 'kept', stepIds: readonly string[], deps: PhotoWriteDeps): void => {
  const ids = [...new Set(stepIds)];
  if (ids.length === 0) return;
  const at = nowOf(deps).toISOString();
  patchCache(deps.client, effectOf({ kind, stepIds: ids, requestId: '' }, at));
  const max = kind === 'presented' ? PHOTO_PRESENTED_MAX : PHOTO_KEPT_MAX;
  for (const lot of chunks(ids, max)) dispatch({ kind, stepIds: lot, requestId: deps.requestId() }, `${kind}:${lot.join(',')}`, deps);
};

export const acknowledgePresented = (stepIds: readonly string[], deps: PhotoWriteDeps): void => stampSteps('presented', stepIds, deps);

export const signalKept = (stepIds: readonly string[], deps: PhotoWriteDeps): void => stampSteps('kept', stepIds, deps);

export function setInvitations(invitations: PhotoInvitations, deps: PhotoWriteDeps): void {
  const job: PhotoWriteJob = { kind: 'invitations', invitations, requestId: deps.requestId() };
  patchCache(deps.client, effectOf(job, nowOf(deps).toISOString()));
  dispatch(job, 'invitations', deps);
}

/** Les étapes gardées sur cet appareil que le serveur ne connaît pas encore (première exécution du signal). */
export const keptToSignal = (localKept: readonly string[], served: readonly GamePhotoMoment[]): readonly string[] => {
  const known = new Set(served.filter((moment) => moment.keptAt !== null).map((moment) => moment.stepId));
  return localKept.filter((id) => !known.has(id));
};

const isStepIds = (raw: unknown): raw is readonly string[] => Array.isArray(raw) && raw.every((id) => typeof id === 'string');
const isInvitations = (raw: unknown): raw is PhotoInvitations => PHOTO_INVITATIONS.some((value) => value === raw);
const isRecord = (raw: unknown): raw is Readonly<Record<string, unknown>> => typeof raw === 'object' && raw !== null;

/** Une écriture relue du stockage de l'appareil (frontière de confiance) : sa forme exacte, sinon rien. */
export function parsePhotoWriteJob(raw: unknown): PhotoWriteJob | null {
  if (!isRecord(raw) || typeof raw['requestId'] !== 'string') return null;
  const requestId = raw['requestId'];
  const kind = raw['kind'];
  if (kind === 'invitations') return isInvitations(raw['invitations']) ? { kind, invitations: raw['invitations'], requestId } : null;
  if (kind !== 'presented' && kind !== 'kept') return null;
  return isStepIds(raw['stepIds']) ? { kind, stepIds: [...raw['stepIds']], requestId } : null;
}

const isEngagementKey = (queryKey: readonly unknown[]): boolean =>
  queryKey.length === ENGAGEMENT_PROGRESS_QUERY_KEY.length && ENGAGEMENT_PROGRESS_QUERY_KEY.every((part, index) => queryKey[index] === part);

/**
 * LE REJEU, CÂBLÉ (#10174) — trois instants vident la file : le DÉBUT DE LA SÉANCE (l'appel), le RETOUR DU RÉSEAU
 * (`online` sur `target`), et chaque LECTURE FRAÎCHE du bloc `game` (une panne passagère ne fait basculer aucun
 * `offline`). Avant de vider, l'effet de chaque job encore en attente se repose sur ce que le serveur vient de relire :
 * ce que l'écran a promis (« ton choix partira avec la connexion ») reste vrai jusqu'à ce qu'il soit parti. `deps`
 * se relit à chaque instant (la file est celle du compte courant). Rend la fonction qui arrête l'écoute.
 */
export function watchPhotoWrites(deps: () => PhotoWriteDeps, target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>): () => void {
  const replay = (): void => {
    const current = deps();
    const pending = current.queue.pending();
    if (pending.length === 0) return;
    const at = nowOf(current).toISOString();
    patchCache(current.client, (photo) => pending.reduce((acc, job) => effectOf(job, at)(acc), photo));
    if (current.isOnline()) void flushPhotoWrites(current);
  };
  const unsubscribe = deps()
    .client.getQueryCache()
    .subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success' && event.action.manual !== true && isEngagementKey(event.query.queryKey)) replay();
    });
  target.addEventListener('online', replay);
  replay();
  return () => {
    unsubscribe();
    target.removeEventListener('online', replay);
  };
}

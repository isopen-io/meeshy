import type { QueryClient } from '@tanstack/react-query';

import type { GamePhotoBlock } from '@meeshy/shared/types/game-photo';
import { DEFAULT_PHOTO_INVITATIONS } from '@meeshy/shared/types/game-photo-settings';
import { DEFAULT_GLORY_ATMOSPHERE, GLORY_ATMOSPHERES, type GloryAtmosphere } from '@meeshy/shared/types/glory-atmospheres';
import { gloryFramesFor } from '@meeshy/shared/utils/game/glory-frames';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { setFrameAtmosphere } from '@/lib/api/game-photo';
import type { HttpTransport } from '@/lib/api/http';
import { packQueryKeys } from '@/lib/api/pack-query-keys';
import type { FramePackSummary } from '@/lib/api/packs-glory-frame';
import type { OfflineQueue } from '@/lib/offline-queue';
import type { SafeStorage } from '@/lib/storage';
import { onGame } from '@/lib/view/game-optimistic-v2';

/**
 * L'ATMOSPHÈRE DES CADRES DE GLOIRE (#10163, L10b ; D7, #10182 ; § 5.12 du prompt des Cadres de gloire).
 *
 * Une préférence de COMPTE (`GameProfile.frameAtmosphere`, lue dans l'extension `photo` du bloc `game`),
 * Afrique éternelle par défaut, changeable à tout moment dans les réglages du jeu. À Ambassadeur, la première
 * photo de rang ouvre l'écran de choix ; « Choisir plus tard » n'enregistre rien et l'écran se repropose UNE
 * fois, à la prochaine photo de rang, puis ne vit plus que dans les réglages — le compteur de reports vit en
 * mémoire APPAREIL, par compte (`localStorage`), jamais sur le serveur.
 *
 * CHOISIR = INSTALLER : la passerelle pose l'installation du pack dans la même écriture ; ici l'étagère des
 * packs installés et l'extension `photo` se posent AVANT la réponse (optimistes), un refus les défait, une
 * panne ou l'absence de réseau met l'écriture dans UNE file (dédoublonnée : le dernier choix gagne) rejouée au
 * retour du réseau, et un ancien serveur (404) laisse le choix local. Quand l'installation est confirmée,
 * `onInstalled` fait avancer l'époque du catalogue des cadres : le déroulé ouvert recompose son aperçu.
 */

/** L'écran se montre à la première photo de rang, puis UNE fois de plus après « Choisir plus tard ». */
export const ATMOSPHERE_SCREEN_SHOWINGS = 2;

const DEFERRED_KEY = (userId: string): string => `meeshy.game.atmosphere-deferred.${userId}`;

export function atmosphereDeferralsOf(storage: SafeStorage, userId: string): number {
  try {
    const raw = Number(storage.getItem(DEFERRED_KEY(userId)) ?? '0');
    return Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
  } catch {
    return 0;
  }
}

export function noteAtmosphereDeferred(storage: SafeStorage, userId: string): void {
  try {
    storage.setItem(DEFERRED_KEY(userId), String(atmosphereDeferralsOf(storage, userId) + 1));
  } catch {
    /* Stockage refusé : le report tient pour la séance. */
  }
}

/**
 * L'écran de choix se montre pour cette étape ? La loi partagée dit si l'étape a besoin d'une atmosphère
 * (`needsAtmosphere` : une étape de rang dès Ambassadeur tant que l'atmosphère est `null`, catalogue ou pas) ;
 * le compteur de reports borne les passages.
 */
export const shouldOfferAtmosphere = (input: { readonly stepId: string; readonly atmosphere: GloryAtmosphere | null; readonly deferrals: number }): boolean =>
  input.deferrals < ATMOSPHERE_SCREEN_SHOWINGS &&
  gloryFramesFor({ stepId: input.stepId, atmosphere: input.atmosphere, lastChosen: null, catalog: [], installed: new Set() }).needsAtmosphere;

const EMPTY_PHOTO: GamePhotoBlock = { atmosphere: null, invitations: DEFAULT_PHOTO_INVITATIONS, baselineAt: null, baseline: null, treasuryPeakTier: null, moments: [] };

/** L'atmosphère posée sur la vue, en créant l'extension avec ses défauts devant un serveur qui ne la sert pas. */
export const withAtmosphere = (view: EngagementWithGame, atmosphere: GloryAtmosphere): EngagementWithGame =>
  onGame(view, (game) => ({ ...game, photo: { ...(game.photo ?? EMPTY_PHOTO), atmosphere } }));

export type AtmosphereJob = { readonly atmosphere: GloryAtmosphere; readonly requestId: string };

export type AtmosphereDeps = {
  readonly transport: HttpTransport;
  readonly client: QueryClient;
  readonly queue: OfflineQueue<AtmosphereJob>;
  readonly isOnline: () => boolean;
  readonly requestId: () => string;
  /** Le serveur a confirmé : le catalogue des cadres se relit (époque). */
  readonly onInstalled: () => void;
};

export type AtmosphereOutcome =
  | { readonly status: 'saved'; readonly packInstalled: boolean }
  | { readonly status: 'queued' }
  | { readonly status: 'refused'; readonly code: string | undefined };

const FRAME_KEYS = packQueryKeys('glory-frame');
const QUEUE_KEY = 'atmosphere';

const installedLocally = (client: QueryClient, atmosphere: GloryAtmosphere): void => {
  const known = (client.getQueryData<readonly FramePackSummary[]>(FRAME_KEYS.catalogue) ?? []).find((pack) => pack.slug === atmosphere);
  if (known === undefined) return;
  client.setQueryData<readonly FramePackSummary[]>(FRAME_KEYS.installed, (list) => [...(list ?? []).filter((pack) => pack.slug !== atmosphere), { ...known, installed: true }]);
};

const afterServer = (deps: AtmosphereDeps): void => {
  void deps.client.invalidateQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
  void deps.client.invalidateQueries({ queryKey: FRAME_KEYS.installed });
  deps.onInstalled();
};

/** `true` : l'écriture a abouti (ou le serveur est ancien) ; `false` : panne, à rejouer ; un refus rend son code. */
async function send(job: AtmosphereJob, deps: AtmosphereDeps): Promise<{ readonly kind: 'done'; readonly packInstalled: boolean } | { readonly kind: 'retry' } | { readonly kind: 'refused'; readonly code: string | undefined }> {
  const result = await setFrameAtmosphere(deps.transport, job.requestId, job.atmosphere);
  if (result.ok) return { kind: 'done', packInstalled: result.data.packInstalled };
  return result.status === 0 || result.status >= 500 || result.status === 408 || result.status === 429 ? { kind: 'retry' } : { kind: 'refused', code: result.code };
}

export async function chooseAtmosphere(atmosphere: GloryAtmosphere, deps: AtmosphereDeps): Promise<AtmosphereOutcome> {
  const { client } = deps;
  await client.cancelQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
  const snapshot = client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY);
  const shelf = client.getQueryData<readonly FramePackSummary[]>(FRAME_KEYS.installed);
  if (snapshot !== undefined) client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, withAtmosphere(snapshot, atmosphere));
  installedLocally(client, atmosphere);

  const job: AtmosphereJob = { atmosphere, requestId: deps.requestId() };
  if (!deps.isOnline()) {
    deps.queue.enqueue(QUEUE_KEY, job);
    return { status: 'queued' };
  }
  const sent = await send(job, deps);
  if (sent.kind === 'retry') {
    deps.queue.enqueue(QUEUE_KEY, job);
    return { status: 'queued' };
  }
  if (sent.kind === 'refused') {
    if (snapshot !== undefined) client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, snapshot);
    if (shelf !== undefined) client.setQueryData(FRAME_KEYS.installed, shelf);
    deps.queue.remove(QUEUE_KEY);
    return { status: 'refused', code: sent.code };
  }
  deps.queue.remove(QUEUE_KEY);
  afterServer(deps);
  return { status: 'saved', packInstalled: sent.packInstalled };
}

/** Au retour du réseau : rejoue le dernier choix en attente ; une panne le garde, un refus l'abandonne (la relecture rend la vérité). */
export async function flushAtmosphereQueue(deps: AtmosphereDeps): Promise<void> {
  if (!deps.isOnline()) return;
  await deps.queue.flush(async (job) => {
    const sent = await send(job, deps);
    if (sent.kind === 'retry') return false;
    if (sent.kind === 'done') afterServer(deps);
    else void deps.client.invalidateQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
    return true;
  });
}

/**
 * Une tuile de l'écran de choix : la MÊME valeur de rangée que la boutique (présence, poids à télécharger,
 * couverture), lue dans les résumés du port `glory-frame`. Les slugs du registre SONT les clés d'atmosphère.
 * Sans résumé (ancien serveur, hors ligne), la tuile reste : nom et histoire seuls, présence inconnue.
 */
export type AtmosphereTile = {
  readonly atmosphere: GloryAtmosphere;
  readonly cover: string | null;
  readonly installed: boolean | null;
  readonly removable: boolean;
  readonly downloadBytes: number | null;
};

const onOrigin = (path: string, origin: string): string => {
  try {
    return new URL(path, origin).href;
  } catch {
    return path;
  }
};

export const atmosphereTilesOf = (input: {
  readonly catalogue: readonly FramePackSummary[];
  readonly installed: readonly FramePackSummary[];
  readonly origin: string;
}): readonly AtmosphereTile[] =>
  GLORY_ATMOSPHERES.map((atmosphere) => {
    const summary = input.catalogue.find((pack) => pack.slug === atmosphere);
    const shelved = input.installed.some((pack) => pack.slug === atmosphere);
    if (summary === undefined) return { atmosphere, cover: null, installed: shelved ? true : null, removable: atmosphere !== DEFAULT_GLORY_ATMOSPHERE, downloadBytes: null };
    return {
      atmosphere,
      cover: summary.coverUrl === null ? null : onOrigin(summary.coverUrl, input.origin),
      installed: summary.installed || shelved,
      removable: summary.removable,
      downloadBytes: summary.downloadBytes?.story ?? null,
    };
  });

/** Ce que le déroulé photo et les réglages reçoivent : l'atmosphère du compte, les tuiles, et les trois gestes. */
export type AtmosphereGate = {
  readonly current: GloryAtmosphere | null;
  readonly tiles: readonly AtmosphereTile[];
  /** L'écran de choix se montre pour cette étape (atmosphère absente, reports non épuisés). */
  readonly offers: (stepId: string) => boolean;
  readonly choose: (atmosphere: GloryAtmosphere) => Promise<AtmosphereOutcome>;
  /** « Choisir plus tard » : rien n'est enregistré, le compteur de reports avance. */
  readonly defer: () => void;
};

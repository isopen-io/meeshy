import type { QueryClient } from '@tanstack/react-query';

import type { GameBlock } from '@meeshy/shared/types/game';
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
 * retour du réseau, et un ancien serveur (404) laisse le choix local — SANS relecture auprès de lui ni époque :
 * sa relecture effacerait l'optimiste, et personne n'a installé de pack. Quand l'installation est confirmée,
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

/**
 * L'écran peut-il encore s'ouvrir pour CE compte ? Son rang doit photographier dans une atmosphère (dès Ambassadeur,
 * par la loi partagée) : avant, aucune étape de rang n'en a besoin, et Progression ne paie pas la boutique des cadres
 * pour un compte à qui l'écran ne se montrera jamais.
 */
export const atmosphereMayBeOffered = (input: { readonly game: GameBlock | null | undefined; readonly deferrals: number }): boolean => {
  const glory = input.game?.glory;
  if (glory === undefined) return false;
  const stepId = `rank:${glory.rank}:${glory.division5 ?? glory.division ?? 0}`;
  return shouldOfferAtmosphere({ stepId, atmosphere: input.game?.photo?.atmosphere ?? null, deferrals: input.deferrals });
};

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

/** Le pack de l'atmosphère posé installé sur l'étagère ET sur sa rangée du catalogue : la boutique ne se contredit pas (onglet présent, « Installer » offert). */
const installedLocally = (client: QueryClient, atmosphere: GloryAtmosphere): void => {
  const known = (client.getQueryData<readonly FramePackSummary[]>(FRAME_KEYS.catalogue) ?? []).find((pack) => pack.slug === atmosphere);
  if (known === undefined) return;
  client.setQueryData<readonly FramePackSummary[]>(FRAME_KEYS.catalogue, (list) => (list ?? []).map((pack) => (pack.slug === atmosphere ? { ...pack, installed: true } : pack)));
  client.setQueryData<readonly FramePackSummary[]>(FRAME_KEYS.installed, (list) => [...(list ?? []).filter((pack) => pack.slug !== atmosphere), { ...known, installed: true }]);
};

const afterServer = (deps: AtmosphereDeps): void => {
  void deps.client.invalidateQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
  void deps.client.invalidateQueries({ queryKey: FRAME_KEYS.installed });
  void deps.client.invalidateQueries({ queryKey: FRAME_KEYS.catalogue });
  deps.onInstalled();
};

/**
 * `done` : le serveur a écrit ; `local` : un ANCIEN serveur (404) — le choix ne vit que dans ce cache, et surtout
 * on ne le relit PAS auprès de lui (il rendrait l'extension absente et l'étagère sans le pack, effaçant l'optimiste
 * à l'instant) ; `retry` : panne, à rejouer ; un refus rend son code.
 */
type Sent = { readonly kind: 'done'; readonly packInstalled: boolean } | { readonly kind: 'local' } | { readonly kind: 'retry' } | { readonly kind: 'refused'; readonly code: string | undefined };

async function send(job: AtmosphereJob, deps: AtmosphereDeps): Promise<Sent> {
  const result = await setFrameAtmosphere(deps.transport, job.requestId, job.atmosphere);
  if (result.ok) return result.data.local ? { kind: 'local' } : { kind: 'done', packInstalled: result.data.packInstalled };
  return result.status === 0 || result.status >= 500 || result.status === 408 || result.status === 429 ? { kind: 'retry' } : { kind: 'refused', code: result.code };
}

export async function chooseAtmosphere(atmosphere: GloryAtmosphere, deps: AtmosphereDeps): Promise<AtmosphereOutcome> {
  const { client } = deps;
  await client.cancelQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
  const snapshot = client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY);
  const shelf = client.getQueryData<readonly FramePackSummary[]>(FRAME_KEYS.installed);
  const catalogue = client.getQueryData<readonly FramePackSummary[]>(FRAME_KEYS.catalogue);
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
    if (catalogue !== undefined) client.setQueryData(FRAME_KEYS.catalogue, catalogue);
    deps.queue.remove(QUEUE_KEY);
    return { status: 'refused', code: sent.code };
  }
  deps.queue.remove(QUEUE_KEY);
  if (sent.kind === 'local') return { status: 'saved', packInstalled: false };
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
    if (sent.kind === 'refused') void deps.client.invalidateQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
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

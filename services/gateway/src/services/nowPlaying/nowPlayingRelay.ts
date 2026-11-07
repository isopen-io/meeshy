/**
 * LE RELAIS DE L'ÉCOUTE PARTAGÉE (#13934, #16686 ; spec cercles § 1.3, § 1.5, § 4).
 *
 * L'émetteur publie UNE fois son état complet ; le relais le range scellé
 * (`nowPlayingStore.ts`) et sert à chaque lecteur la projection de SON accès :
 *
 * - `title` — la loi ouvre `listening.title` (Sang) ET l'émetteur a partagé le titre
 *   à ce lecteur au rituel : catégorie, titre, origine ;
 * - `category` — la loi ouvre `listening.category` (Proche) ET l'émetteur a accordé la
 *   catégorie à ce lecteur : la catégorie SEULE, sans clé `title` ni `source` ;
 * - `none` — rien ne part. Pas même un effacement : il trahirait une écoute.
 *
 * Le niveau, le blocage et l'âge passent par `pairAccessAmong` (site unique de la loi) ;
 * le consentement par `relationConsentGrantedAmong` / `relationConsentGrantedBy`, relus à
 * CHAQUE publication, jamais mis en cache. Chaque émission vise la room `user:<lecteur>`
 * avec SA charge : aucune room partagée ne sert à tous la charge du plus proche.
 *
 * `refreshNowPlayingBetween` rejoue la projection d'une paire quand son lien ou ses
 * consentements changent : une montée fait remonter le détail conservé (`raise` : rien
 * n'est dit si rien ne s'ouvre), une baisse, un blocage ou un retrait efface chez
 * l'autre (`cut`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  NOW_PLAYING_ERROR_CODES,
  NOW_PLAYING_TTL_SECONDS,
  nowPlayingUpdatePayloadSchema,
  type NowPlayingAck,
  type NowPlayingChangedEventData,
  type NowPlayingClearAck,
  type NowPlayingSnapshot,
} from '@meeshy/shared/types/now-playing';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { RelationFeature } from '@meeshy/shared/utils/relation-levels';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { comptesAuMoins } from '../friendship';
import { pairAccessAmong, type PairAccessDb, type PairAccessSubject } from '../relations/pairAccess';
import { relationConsentGrantedAmong, relationConsentGrantedBy, type ShareConsentFeature } from '../relations/relationConsent';
import {
  clearNowPlaying,
  readNowPlaying,
  storeNowPlaying,
  type NowPlayingCache,
  type NowPlayingState,
} from './nowPlayingStore';

export type NowPlayingDb = PairAccessDb & Pick<PrismaClient, 'relationFeatureSetting'>;

export type NowPlayingIo = ServerEmitIO;

export type NowPlayingRelayDeps = {
  readonly prisma: NowPlayingDb;
  readonly cache: NowPlayingCache;
  readonly io: NowPlayingIo | undefined;
  readonly now: () => number;
};

export type NowPlayingReaderAccess = 'none' | 'category' | 'title';

/** Au-delà, l'éventail s'arrête aux liens les plus proches (`comptesAuMoins` range du Sang au Proche). */
const AUDIENCE_LIMIT = 500;

const LEVELS: ReadonlyArray<readonly [Exclude<NowPlayingReaderAccess, 'none'>, ShareConsentFeature & RelationFeature]> = [
  ['title', 'listening.title'],
  ['category', 'listening.category'],
];

/** La projection d'UN lecteur : les clés absentes n'existent pas, ni vides ni nulles. */
export function projectNowPlaying(userId: string, state: NowPlayingState, access: NowPlayingReaderAccess): NowPlayingChangedEventData | null {
  if (access === 'none') return null;
  const base = { userId, category: state.category, updatedAt: state.updatedAt, expiresAt: state.expiresAt };
  if (access === 'category') return base;
  return { ...base, ...(state.title ? { title: state.title } : {}), ...(state.source ? { source: state.source } : {}) };
}

/**
 * L'accès de chaque autre personne à l'écoute de `emitterId` (`subjectIs: 'target'`), ou
 * de chaque émetteur pour le lecteur `subjectId` (`subjectIs: 'viewer'`).
 */
async function accessAmong(
  prisma: NowPlayingDb,
  params: { readonly subjectId: string; readonly otherIds: readonly string[]; readonly subjectIs: PairAccessSubject; readonly now: Date },
): Promise<ReadonlyMap<string, NowPlayingReaderAccess>> {
  const verdicts = await Promise.all(
    LEVELS.map(async ([access, feature]) => {
      const granted = params.subjectIs === 'target'
        ? await relationConsentGrantedAmong(prisma, { ownerId: params.subjectId, otherIds: params.otherIds, feature })
        : await relationConsentGrantedBy(prisma, { ownerIds: params.otherIds, otherId: params.subjectId, feature });
      const law = await pairAccessAmong(prisma, {
        feature,
        subjectId: params.subjectId,
        otherIds: params.otherIds,
        subjectIs: params.subjectIs,
        now: params.now,
        consentOf: (otherId) => (granted.has(otherId) ? 'granted' : 'refused'),
      });
      return [access, law] as const;
    }),
  );
  return new Map(
    params.otherIds.map((id) => {
      const opened = verdicts.find(([, law]) => law.get(id)?.allowed === true);
      return [id, opened ? opened[0] : 'none'];
    }),
  );
}

/** Un lecteur injoignable n'arrête pas l'éventail. */
const safely = (send: () => void): void => {
  try {
    send();
  } catch {
    /* rien : la publication est déjà rangée */
  }
};

const serve = (io: NowPlayingIo | undefined, readerId: string, data: NowPlayingChangedEventData): void =>
  safely(() => io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.NOW_PLAYING_CHANGED, data));

const unserve = (io: NowPlayingIo | undefined, readerId: string, emitterId: string): void =>
  safely(() => io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.NOW_PLAYING_CLEARED, { userId: emitterId }));

async function audienceOf(deps: NowPlayingRelayDeps, emitterId: string): Promise<ReadonlyMap<string, NowPlayingReaderAccess>> {
  const linked = await comptesAuMoins(deps.prisma, emitterId, 'CLOSE', { limit: AUDIENCE_LIMIT });
  if (linked.length === 0) return new Map();
  return accessAmong(deps.prisma, {
    subjectId: emitterId,
    otherIds: linked.map((link) => link.id),
    subjectIs: 'target',
    now: new Date(deps.now()),
  });
}

const failed = (code: (typeof NOW_PLAYING_ERROR_CODES)[keyof typeof NOW_PLAYING_ERROR_CODES], error: string) =>
  ({ success: false, error, code }) as const;

export async function publishNowPlaying(deps: NowPlayingRelayDeps, emitterId: string, payload: unknown): Promise<NowPlayingAck> {
  const parsed = nowPlayingUpdatePayloadSchema.safeParse(payload);
  if (!parsed.success) return failed(NOW_PLAYING_ERROR_CODES.INVALID, 'Écoute illisible');

  const now = deps.now();
  const state: NowPlayingState = {
    ...parsed.data,
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + NOW_PLAYING_TTL_SECONDS * 1000).toISOString(),
  };
  try {
    await storeNowPlaying(deps.cache, emitterId, state);
  } catch {
    return failed(NOW_PLAYING_ERROR_CODES.UNAVAILABLE, 'Écoute momentanément indisponible');
  }

  const audience = await audienceOf(deps, emitterId);
  audience.forEach((access, readerId) => {
    const served = projectNowPlaying(emitterId, state, access);
    if (served) serve(deps.io, readerId, served);
  });
  return { success: true, data: { expiresAt: state.expiresAt } };
}

export async function clearNowPlayingOf(deps: NowPlayingRelayDeps, emitterId: string): Promise<NowPlayingClearAck> {
  const had = await readNowPlaying(deps.cache, emitterId, deps.now());
  try {
    await clearNowPlaying(deps.cache, emitterId);
  } catch {
    return failed(NOW_PLAYING_ERROR_CODES.UNAVAILABLE, 'Écoute momentanément indisponible');
  }
  if (!had) return { success: true };
  const audience = await audienceOf(deps, emitterId);
  audience.forEach((access, readerId) => {
    if (access !== 'none') unserve(deps.io, readerId, emitterId);
  });
  return { success: true };
}

/**
 * Rejoue la projection d'une paire dans les DEUX sens après un changement de lien, de
 * consentement ou de blocage. `raise` ne dit rien quand rien ne s'ouvre ; `cut` efface
 * chez l'autre ce qui ne lui est plus servi.
 */
export async function refreshNowPlayingBetween(
  deps: NowPlayingRelayDeps,
  params: { readonly userA: string; readonly userB: string; readonly mode: 'raise' | 'cut' },
): Promise<void> {
  const now = deps.now();
  for (const [emitterId, readerId] of [[params.userA, params.userB], [params.userB, params.userA]] as const) {
    const state = await readNowPlaying(deps.cache, emitterId, now);
    if (!state) continue;
    const access = await accessAmong(deps.prisma, { subjectId: emitterId, otherIds: [readerId], subjectIs: 'target', now: new Date(now) });
    const served = projectNowPlaying(emitterId, state, access.get(readerId) ?? 'none');
    if (served) serve(deps.io, readerId, served);
    else if (params.mode === 'cut') unserve(deps.io, readerId, emitterId);
  }
}

/** Ce que `readerId` voit, à la connexion : les écoutes en cours de ses Proches et Sangs, tronquées. */
export async function nowPlayingSnapshotFor(deps: NowPlayingRelayDeps, readerId: string): Promise<NowPlayingSnapshot> {
  const now = deps.now();
  const linked = await comptesAuMoins(deps.prisma, readerId, 'CLOSE', { limit: AUDIENCE_LIMIT });
  const states = (await Promise.all(linked.map(async (link) => [link.id, await readNowPlaying(deps.cache, link.id, now)] as const)))
    .filter((entry): entry is readonly [string, NowPlayingState] => entry[1] !== null);
  if (states.length === 0) return { items: [] };

  const access = await accessAmong(deps.prisma, {
    subjectId: readerId,
    otherIds: states.map(([id]) => id),
    subjectIs: 'viewer',
    now: new Date(now),
  });
  const items = states
    .map(([emitterId, state]) => projectNowPlaying(emitterId, state, access.get(emitterId) ?? 'none'))
    .filter((item): item is NowPlayingChangedEventData => item !== null);
  return { items };
}

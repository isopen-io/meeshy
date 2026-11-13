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
 * consentements changent : une montée fait remonter le détail conservé (rien n'est dit
 * si rien ne s'ouvre) ; une baisse, un blocage ou un retrait effacent chez l'autre — à
 * condition qu'il VOYAIT quelque chose, capturé avant (`captureNowPlayingAccess`).
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
import {
  relationConsentCounterpartsOf,
  relationConsentGrantedAmong,
  relationConsentGrantedBy,
  type ShareConsentFeature,
} from '../relations/relationConsent';
import { ACCOUNT_STATE_SELECT, isUsableTeamAccount } from '../relations/usableAccount';
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
  const usable = await usableAccounts(prisma, [params.subjectId, ...params.otherIds]);
  return new Map(
    params.otherIds.map((id) => {
      const opened = usable.has(params.subjectId) && usable.has(id) ? verdicts.find(([, law]) => law.get(id)?.allowed === true) : undefined;
      return [id, opened ? opened[0] : 'none'];
    }),
  );
}

/** Un compte désactivé ou supprimé n'émet ni ne reçoit, même avec une socket encore ouverte. */
async function usableAccounts(prisma: NowPlayingDb, ids: readonly string[]): Promise<ReadonlySet<string>> {
  const rows = await prisma.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, isActive: true, deactivatedAt: true, deletedAt: true },
  });
  return new Set(rows.filter((row) => row.isActive !== false && !row.deactivatedAt && !row.deletedAt).map((row) => row.id));
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

/**
 * Les CANDIDATS de l'éventail de `subjectId` : ses Proches et Sangs liés et — pour un compte de
 * l'équipe, qui a l'écoute sans lien face à un collègue (#16623) — ceux avec qui un partage
 * d'écoute est consenti hors lien (#16642). La loi juge chacun ensuite ; un utilisateur
 * ordinaire garde ses seuls liens.
 */
async function candidatesOf(prisma: NowPlayingDb, subjectId: string, subjectIs: PairAccessSubject): Promise<readonly string[]> {
  const [linked, subject] = await Promise.all([
    comptesAuMoins(prisma, subjectId, 'CLOSE', { limit: AUDIENCE_LIMIT }),
    prisma.user.findUnique({ where: { id: subjectId }, select: { role: true, ...ACCOUNT_STATE_SELECT } }),
  ]);
  const consented = isUsableTeamAccount(subject)
    ? await relationConsentCounterpartsOf(prisma, { subjectId, subjectIs, features: LEVELS.map(([, feature]) => feature), limit: AUDIENCE_LIMIT })
    : [];
  return [...new Set([...linked.map((link) => link.id), ...consented])].filter((id) => id !== subjectId);
}

async function audienceOf(deps: NowPlayingRelayDeps, emitterId: string): Promise<ReadonlyMap<string, NowPlayingReaderAccess>> {
  const candidates = await candidatesOf(deps.prisma, emitterId, 'target');
  if (candidates.length === 0) return new Map();
  return accessAmong(deps.prisma, {
    subjectId: emitterId,
    otherIds: candidates,
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

/** L'accès de chaque sens d'une paire, pour les seuls émetteurs qui ont une écoute en cours. */
export type NowPlayingPairAccess = ReadonlyMap<string, NowPlayingReaderAccess>;

const directions = (userA: string, userB: string) => [[userA, userB], [userB, userA]] as const;
/** La clé d'un sens dans {@link NowPlayingPairAccess} : pour qui compose un `before` sans capture. */
export const nowPlayingDirectionKey = (emitterId: string, readerId: string): string => `${emitterId}>${readerId}`;
const directionKey = nowPlayingDirectionKey;

/**
 * Ce que chaque sens de la paire voit MAINTENANT. À capturer AVANT une baisse, un blocage
 * ou un retrait : l'effacement ne part ensuite que vers un lecteur qui VOYAIT quelque chose.
 */
export async function captureNowPlayingAccess(
  deps: NowPlayingRelayDeps,
  pair: { readonly userA: string; readonly userB: string },
): Promise<NowPlayingPairAccess> {
  const now = deps.now();
  const seen = new Map<string, NowPlayingReaderAccess>();
  for (const [emitterId, readerId] of directions(pair.userA, pair.userB)) {
    if (!(await readNowPlaying(deps.cache, emitterId, now))) continue;
    const access = await accessAmong(deps.prisma, { subjectId: emitterId, otherIds: [readerId], subjectIs: 'target', now: new Date(now) });
    seen.set(directionKey(emitterId, readerId), access.get(readerId) ?? 'none');
  }
  return seen;
}

/**
 * Rejoue la projection d'une paire dans les DEUX sens après un changement de lien, de
 * consentement ou de blocage. `changed` part vers un lecteur dont l'accès est ouvert et
 * a changé ; `cleared` SEULEMENT vers un lecteur qui voyait quelque chose AVANT (`before`)
 * et ne voit plus rien : à quiconque n'avait pas d'accès, rien ne part — un effacement
 * trahirait une écoute. Sans `before` (une montée), rien n'est jamais effacé.
 */
export async function refreshNowPlayingBetween(
  deps: NowPlayingRelayDeps,
  params: { readonly userA: string; readonly userB: string; readonly before?: NowPlayingPairAccess },
): Promise<void> {
  const now = deps.now();
  for (const [emitterId, readerId] of directions(params.userA, params.userB)) {
    const state = await readNowPlaying(deps.cache, emitterId, now);
    if (!state) continue;
    const access = await accessAmong(deps.prisma, { subjectId: emitterId, otherIds: [readerId], subjectIs: 'target', now: new Date(now) });
    const after = access.get(readerId) ?? 'none';
    const before = params.before?.get(directionKey(emitterId, readerId)) ?? 'none';
    const served = projectNowPlaying(emitterId, state, after);
    if (served && after !== before) serve(deps.io, readerId, served);
    else if (!served && before !== 'none') unserve(deps.io, readerId, emitterId);
  }
}

/** Ce que `readerId` voit, à la connexion : les écoutes en cours de ses Proches et Sangs (et de ses collègues consentants), tronquées. */
export async function nowPlayingSnapshotFor(deps: NowPlayingRelayDeps, readerId: string): Promise<NowPlayingSnapshot> {
  const now = deps.now();
  const candidates = await candidatesOf(deps.prisma, readerId, 'viewer');
  const states = (await Promise.all(candidates.map(async (id) => [id, await readNowPlaying(deps.cache, id, now)] as const)))
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

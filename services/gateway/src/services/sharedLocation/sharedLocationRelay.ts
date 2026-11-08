/**
 * LE RELAIS DU PARTAGE TEMPORAIRE DE POSITION À DES PERSONNES (#14109, #16980 ; spec
 * cercles § 1.3, § 1.5, § 4).
 *
 * L'émetteur publie sa position COMPLÈTE ; le relais la range scellée
 * (`sharedLocationStore.ts`) et sert à chaque destinataire la projection de SON accès :
 * la précision que l'émetteur lui a donnée (`exact`, `neighborhood`, `city`), si la loi
 * ouvre `location.temporary` (dès Ami, sans blocage, comptes utilisables) ET qu'il est
 * parmi les destinataires — le consentement de l'émetteur EST cette liste, bornée par
 * son terme. Sinon rien ne part, pas même un effacement : il trahirait un partage.
 *
 * Le niveau, le blocage et l'âge passent par `pairAccessAmong` (site unique de la loi),
 * relus à CHAQUE émission, jamais mis en cache. Chaque émission vise la room
 * `user:<destinataire>` avec SA charge.
 *
 * Le partage DANS une conversation (`LocationHandler`, `location:live-*`) est un autre
 * chemin, inchangé.
 *
 * `refreshSharedLocationBetween` rejoue la projection d'une paire quand son lien
 * change : une remontée fait revenir la dernière position conservée ; une baisse ou un
 * blocage effacent chez l'autre — à condition qu'il VOYAIT, capturé avant
 * (`captureSharedLocationAccess`).
 */
import {
  SHARED_LOCATION_BLUR_RADIUS_METERS,
  SHARED_LOCATION_DEFAULT_PRECISION,
  SHARED_LOCATION_ERROR_CODES,
  SHARED_LOCATION_EXACT_MIN_RADIUS_METERS,
  SHARED_LOCATION_GRID_DEGREES,
  sharedLocationStartPayloadSchema,
  sharedLocationUpdatePayloadSchema,
  type SharedLocationAck,
  type SharedLocationChangedEventData,
  type SharedLocationErrorCode,
  type SharedLocationPrecision,
  type SharedLocationSnapshot,
  type SharedLocationStopAck,
} from '@meeshy/shared/types/shared-location';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { comptesAuMoins } from '../friendship';
import { pairAccessAmong, type PairAccessDb } from '../relations/pairAccess';
import {
  clearSharedLocation,
  markSharedLocationStopped,
  readSharedLocation,
  stoppedSince,
  storeSharedLocation,
  type SharedLocationCache,
  type SharedLocationState,
} from './sharedLocationStore';

export type SharedLocationDb = PairAccessDb;

export type SharedLocationIo = ServerEmitIO;

export type SharedLocationRelayDeps = {
  readonly prisma: SharedLocationDb;
  readonly cache: SharedLocationCache;
  readonly io: SharedLocationIo | undefined;
  readonly now: () => number;
};

export type SharedLocationReaderAccess = 'none' | SharedLocationPrecision;

export type SharedLocationBbox = {
  readonly minLongitude: number;
  readonly minLatitude: number;
  readonly maxLongitude: number;
  readonly maxLatitude: number;
};

/** Au-delà, le rattrapage s'arrête aux liens les plus proches (`comptesAuMoins` range du Sang à l'Ami). */
const SNAPSHOT_LINK_LIMIT = 500;

const DECIMALS = 1e6;
const round = (value: number): number => Math.round(value * DECIMALS) / DECIMALS;

/** Le centre de la maille : le même point pour toute position de la maille. */
const snap = (value: number, step: number, bound: number): number =>
  round(Math.min(bound, Math.max(-bound, (Math.floor(value / step) + 0.5) * step)));

/** La projection d'UN destinataire : la position à sa précision, le rayon de son flou, rien d'autre. */
export function projectSharedLocation(
  userId: string,
  state: Pick<SharedLocationState, 'position' | 'updatedAt' | 'expiresAt'>,
  access: SharedLocationReaderAccess,
): SharedLocationChangedEventData | null {
  if (access === 'none') return null;
  const times = { updatedAt: state.updatedAt, expiresAt: state.expiresAt };
  if (access === 'exact') {
    const radiusMeters = Math.max(SHARED_LOCATION_EXACT_MIN_RADIUS_METERS, Math.round(state.position.accuracy ?? 0));
    return { userId, latitude: round(state.position.latitude), longitude: round(state.position.longitude), precision: 'exact', radiusMeters, ...times };
  }
  const step = SHARED_LOCATION_GRID_DEGREES[access];
  return {
    userId,
    latitude: snap(state.position.latitude, step, 90),
    longitude: snap(state.position.longitude, step, 180),
    precision: access,
    radiusMeters: SHARED_LOCATION_BLUR_RADIUS_METERS[access],
    ...times,
  };
}

/** Le compte peut-il encore émettre ou recevoir ? Un compte désactivé ou supprimé, non. */
async function usableAccounts(prisma: SharedLocationDb, ids: readonly string[]): Promise<ReadonlySet<string>> {
  const rows = await prisma.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, isActive: true, deactivatedAt: true, deletedAt: true },
  });
  return new Set(rows.filter((row) => row.isActive !== false && !row.deactivatedAt && !row.deletedAt).map((row) => row.id));
}

/** L'accès de chaque destinataire `readerIds` au partage de `emitterId`, relu maintenant. */
async function accessOf(
  deps: SharedLocationRelayDeps,
  emitterId: string,
  state: SharedLocationState,
  readerIds: readonly string[],
): Promise<ReadonlyMap<string, SharedLocationReaderAccess>> {
  const chosen = new Map(state.recipients.map((recipient) => [recipient.userId.toLowerCase(), recipient.precision]));
  const candidates = readerIds.filter((id) => chosen.has(id.toLowerCase()));
  if (candidates.length === 0) return new Map(readerIds.map((id) => [id, 'none']));
  const [law, usable] = await Promise.all([
    pairAccessAmong(deps.prisma, {
      feature: 'location.temporary',
      subjectId: emitterId,
      otherIds: candidates,
      subjectIs: 'target',
      now: new Date(deps.now()),
      consentOf: (otherId) => (chosen.has(otherId.toLowerCase()) ? 'granted' : 'refused'),
    }),
    usableAccounts(deps.prisma, [emitterId, ...candidates]),
  ]);
  return new Map(
    readerIds.map((id) => {
      const opened = usable.has(emitterId) && usable.has(id) && law.get(id)?.allowed === true;
      return [id, opened ? (chosen.get(id.toLowerCase()) ?? 'none') : 'none'];
    }),
  );
}

/** Un destinataire injoignable n'arrête pas l'éventail. */
const safely = (send: () => void): void => {
  try {
    send();
  } catch {
    /* rien : la position est déjà rangée */
  }
};

const serve = (io: SharedLocationIo | undefined, readerId: string, data: SharedLocationChangedEventData): void =>
  safely(() => io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.SHARED_LOCATION_CHANGED, data));

const unserve = (io: SharedLocationIo | undefined, readerId: string, emitterId: string): void =>
  safely(() => io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.SHARED_LOCATION_ENDED, { userId: emitterId }));

const failed = (code: SharedLocationErrorCode, error: string) => ({ success: false, error, code }) as const;
const UNAVAILABLE = failed(SHARED_LOCATION_ERROR_CODES.UNAVAILABLE, 'Position momentanément indisponible');

const recipientIdsOf = (state: SharedLocationState | null): readonly string[] => state?.recipients.map((recipient) => recipient.userId) ?? [];

const sameServed = (a: SharedLocationChangedEventData | null, b: SharedLocationChangedEventData | null): boolean =>
  a !== null && b !== null && a.latitude === b.latitude && a.longitude === b.longitude && a.precision === b.precision && a.radiusMeters === b.radiusMeters;

/**
 * Sert la projection de `state` à chaque destinataire ouvert ; rend l'accès de chacun et
 * ceux qui ont reçu. Avec `previous`, un destinataire dont la projection n'a pas bougé ne
 * reçoit rien : un lecteur flouté n'apprend pas quand l'appareil se déplace dans sa maille.
 */
async function fanOut(
  deps: SharedLocationRelayDeps,
  emitterId: string,
  state: SharedLocationState,
  previous?: SharedLocationState,
): Promise<{ readonly access: ReadonlyMap<string, SharedLocationReaderAccess>; readonly served: readonly string[] }> {
  const access = await accessOf(deps, emitterId, state, recipientIdsOf(state));
  const served: string[] = [];
  access.forEach((readerAccess, readerId) => {
    const projection = projectSharedLocation(emitterId, state, readerAccess);
    if (!projection) return;
    if (previous && sameServed(projection, projectSharedLocation(emitterId, previous, readerAccess))) return;
    serve(deps.io, readerId, projection);
    served.push(readerId);
  });
  return { access, served };
}

const STOPPED = failed(SHARED_LOCATION_ERROR_CODES.NOT_SHARING, 'Partage arrêté');

/**
 * Un arrêt survenu pendant le geste l'emporte : la valeur que le geste vient d'écrire est
 * retirée (rien ne revient à la connexion), et qui vient de recevoir apprend la fin.
 */
async function yieldToStop(deps: SharedLocationRelayDeps, emitterId: string, state: SharedLocationState, served: readonly string[]): Promise<boolean> {
  if (!(await stoppedSince(deps.cache, emitterId, state))) return false;
  const current = await readSharedLocation(deps.cache, emitterId, deps.now());
  if (current && current.startedAt === state.startedAt) await clearSharedLocation(deps.cache, emitterId);
  served.forEach((readerId) => unserve(deps.io, readerId, emitterId));
  return true;
}

/**
 * Démarre (ou remplace) le partage. Un destinataire qui VOYAIT le partage précédent et
 * ne le voit plus reçoit `ended` ; personne d'autre n'apprend rien.
 */
export async function startSharedLocation(deps: SharedLocationRelayDeps, emitterId: string, payload: unknown): Promise<SharedLocationAck> {
  const parsed = sharedLocationStartPayloadSchema.safeParse(payload);
  if (!parsed.success) return failed(SHARED_LOCATION_ERROR_CODES.INVALID, 'Partage illisible');

  const now = deps.now();
  const previous = await readSharedLocation(deps.cache, emitterId, now);
  const before = previous ? await accessOf(deps, emitterId, previous, recipientIdsOf(previous)) : new Map<string, SharedLocationReaderAccess>();
  const state: SharedLocationState = {
    startedAt: now,
    recipients: parsed.data.recipients
      .filter((recipient) => recipient.userId.toLowerCase() !== emitterId.toLowerCase())
      .map((recipient) => ({ userId: recipient.userId.toLowerCase(), precision: recipient.precision ?? SHARED_LOCATION_DEFAULT_PRECISION })),
    position: parsed.data.position,
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + parsed.data.durationMinutes * 60_000).toISOString(),
  };
  try {
    await storeSharedLocation(deps.cache, emitterId, state, now);
  } catch {
    return UNAVAILABLE;
  }
  if (await yieldToStop(deps, emitterId, state, [])) return STOPPED;

  const after = await fanOut(deps, emitterId, state);
  before.forEach((access, readerId) => {
    if (access !== 'none' && (after.access.get(readerId) ?? 'none') === 'none') unserve(deps.io, readerId, emitterId);
  });
  if (await yieldToStop(deps, emitterId, state, after.served)) return STOPPED;
  return { success: true, data: { expiresAt: state.expiresAt } };
}

/** Une nouvelle position du partage en cours ; le terme ne bouge pas. */
export async function updateSharedLocation(deps: SharedLocationRelayDeps, emitterId: string, payload: unknown): Promise<SharedLocationAck> {
  const parsed = sharedLocationUpdatePayloadSchema.safeParse(payload);
  if (!parsed.success) return failed(SHARED_LOCATION_ERROR_CODES.INVALID, 'Position illisible');

  const now = deps.now();
  const current = await readSharedLocation(deps.cache, emitterId, now);
  if (!current) return failed(SHARED_LOCATION_ERROR_CODES.NOT_SHARING, 'Aucun partage en cours');
  const state: SharedLocationState = { ...current, position: parsed.data, updatedAt: new Date(now).toISOString() };
  try {
    await storeSharedLocation(deps.cache, emitterId, state, now);
  } catch {
    return UNAVAILABLE;
  }
  if (await yieldToStop(deps, emitterId, state, [])) return STOPPED;
  const { served } = await fanOut(deps, emitterId, state, current);
  if (await yieldToStop(deps, emitterId, state, served)) return STOPPED;
  return { success: true, data: { expiresAt: state.expiresAt } };
}

/** Arrête le partage : il est effacé, et `ended` part vers ceux qui le voyaient, à eux seuls. */
export async function stopSharedLocation(deps: SharedLocationRelayDeps, emitterId: string): Promise<SharedLocationStopAck> {
  const now = deps.now();
  const had = await readSharedLocation(deps.cache, emitterId, now);
  const seen = had ? await accessOf(deps, emitterId, had, recipientIdsOf(had)) : new Map<string, SharedLocationReaderAccess>();
  try {
    await markSharedLocationStopped(deps.cache, emitterId, now);
    await clearSharedLocation(deps.cache, emitterId);
  } catch {
    return UNAVAILABLE;
  }
  seen.forEach((access, readerId) => {
    if (access !== 'none') unserve(deps.io, readerId, emitterId);
  });
  return { success: true };
}

/** L'accès de chaque sens d'une paire, pour les seuls émetteurs qui ont un partage en cours. */
export type SharedLocationPairAccess = ReadonlyMap<string, SharedLocationReaderAccess>;

const directions = (userA: string, userB: string) => [[userA, userB], [userB, userA]] as const;
const directionKey = (emitterId: string, readerId: string): string => `${emitterId}>${readerId}`;

/**
 * Ce que chaque sens de la paire voit MAINTENANT. À capturer AVANT une baisse ou un
 * blocage : l'effacement ne part ensuite que vers un destinataire qui VOYAIT.
 */
export async function captureSharedLocationAccess(
  deps: SharedLocationRelayDeps,
  pair: { readonly userA: string; readonly userB: string },
): Promise<SharedLocationPairAccess> {
  const now = deps.now();
  const seen = new Map<string, SharedLocationReaderAccess>();
  for (const [emitterId, readerId] of directions(pair.userA, pair.userB)) {
    const state = await readSharedLocation(deps.cache, emitterId, now);
    if (!state) continue;
    const access = await accessOf(deps, emitterId, state, [readerId]);
    seen.set(directionKey(emitterId, readerId), access.get(readerId) ?? 'none');
  }
  return seen;
}

/**
 * Rejoue la projection d'une paire dans les DEUX sens après un changement de lien ou de
 * blocage. `changed` part vers un destinataire dont l'accès est ouvert et a changé ;
 * `ended` SEULEMENT vers un destinataire qui voyait AVANT (`before`) et ne voit plus
 * rien. Sans `before` (une montée), rien n'est jamais effacé.
 */
export async function refreshSharedLocationBetween(
  deps: SharedLocationRelayDeps,
  params: { readonly userA: string; readonly userB: string; readonly before?: SharedLocationPairAccess },
): Promise<void> {
  const now = deps.now();
  for (const [emitterId, readerId] of directions(params.userA, params.userB)) {
    const state = await readSharedLocation(deps.cache, emitterId, now);
    if (!state) continue;
    const after = (await accessOf(deps, emitterId, state, [readerId])).get(readerId) ?? 'none';
    const before = params.before?.get(directionKey(emitterId, readerId)) ?? 'none';
    const served = projectSharedLocation(emitterId, state, after);
    if (served && after !== before) serve(deps.io, readerId, served);
    else if (!served && before !== 'none') unserve(deps.io, readerId, emitterId);
  }
}

const within = (item: SharedLocationChangedEventData, bbox: SharedLocationBbox | undefined): boolean =>
  !bbox ||
  (item.latitude >= bbox.minLatitude &&
    item.latitude <= bbox.maxLatitude &&
    item.longitude >= bbox.minLongitude &&
    item.longitude <= bbox.maxLongitude);

/**
 * Ce que `readerId` voit : les partages en cours de ses liens qui lui sont destinés,
 * tronqués, filtrés par l'emprise sur la position SERVIE — jamais sur la réelle.
 */
export async function sharedLocationSnapshotFor(
  deps: SharedLocationRelayDeps,
  readerId: string,
  options: { readonly bbox?: SharedLocationBbox },
): Promise<SharedLocationSnapshot> {
  const now = deps.now();
  const linked = await comptesAuMoins(deps.prisma, readerId, 'FRIEND', { limit: SNAPSHOT_LINK_LIMIT });
  const states = await Promise.all(linked.map(async (link) => [link.id, await readSharedLocation(deps.cache, link.id, now)] as const));
  const served = await Promise.all(
    states.map(async ([emitterId, state]) => {
      if (!state) return null;
      const access = (await accessOf(deps, emitterId, state, [readerId])).get(readerId) ?? 'none';
      return projectSharedLocation(emitterId, state, access);
    }),
  );
  return { items: served.filter((item): item is SharedLocationChangedEventData => item !== null && within(item, options.bbox)) };
}


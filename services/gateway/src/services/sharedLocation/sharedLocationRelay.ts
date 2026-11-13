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
 * relus à CHAQUE émission, jamais mis en cache. Le cercle servi (#17966) est le niveau
 * EFFECTIF de ce même verdict : le lecteur apprend de quel cercle vient l'émetteur pour
 * LUI (ce que `GET /relations/:userId` lui dit déjà), jamais rien de la loi d'un autre. Chaque émission vise la room
 * `user:<destinataire>` avec SA charge.
 *
 * Le partage DANS une conversation (`LocationHandler`, `location:live-*`) est un autre
 * chemin, inchangé.
 *
 * `refreshSharedLocationBetween` rejoue la projection d'une paire quand son lien
 * change : une remontée fait revenir la dernière position conservée ; une baisse ou un
 * blocage effacent chez l'autre — à condition que la session l'ait SERVI (l'ensemble de
 * ses servis, tenu par empreintes avant chaque envoi, rattrapage compris).
 */
import {
  SHARED_LOCATION_BLUR_RADIUS_METERS,
  SHARED_LOCATION_CIRCLES,
  SHARED_LOCATION_DEFAULT_PRECISION,
  SHARED_LOCATION_ERROR_CODES,
  SHARED_LOCATION_EXACT_MIN_RADIUS_METERS,
  SHARED_LOCATION_GRID_DEGREES,
  sharedLocationStartPayloadSchema,
  sharedLocationUpdatePayloadSchema,
  type SharedLocationAck,
  type SharedLocationChangedEventData,
  type SharedLocationCircle,
  type SharedLocationErrorCode,
  type SharedLocationPrecision,
  type SharedLocationSnapshot,
  type SharedLocationStopAck,
} from '@meeshy/shared/types/shared-location';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { comptesAuMoins } from '../friendship';
import { pairAccessAmong, type PairAccessDb } from '../relations/pairAccess';
import { randomUUID } from 'node:crypto';
import {
  advanceSharedLocationGeneration,
  claimSharedLocation,
  currentSharedLocationSession,
  dropSharedLocationSession,
  forgetRetiredSharedLocationSession,
  markSharedLocationSeen,
  readSharedLocation,
  readSharedLocationSession,
  retiringSharedLocationSessions,
  sharedLocationGeneration,
  sharedLocationSeenAmong,
  storeSharedLocation,
  storeSharedLocationIfCurrent,
  unmarkSharedLocationSeen,
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

/**
 * Ce qu'UN lecteur reçoit du partage : rien, ou la précision que l'émetteur lui a donnée
 * et le cercle que la loi vient de juger entre eux. Les deux se comparent ensemble : un
 * cercle qui change à précision égale se ressert.
 */
export type SharedLocationReaderAccess =
  | 'none'
  | { readonly precision: SharedLocationPrecision; readonly circle: SharedLocationCircle | null };

const circleOf = (level: RelationLevel | undefined): SharedLocationCircle | null =>
  SHARED_LOCATION_CIRCLES.find((circle) => circle === level) ?? null;

const sameAccess = (a: SharedLocationReaderAccess, b: SharedLocationReaderAccess): boolean =>
  a === 'none' || b === 'none' ? a === b : a.precision === b.precision && a.circle === b.circle;

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

/** La projection d'UN destinataire : la position à sa précision, le rayon de son flou, son cercle, rien d'autre. */
export function projectSharedLocation(
  userId: string,
  state: Pick<SharedLocationState, 'position' | 'updatedAt' | 'expiresAt'>,
  access: SharedLocationReaderAccess,
): SharedLocationChangedEventData | null {
  if (access === 'none') return null;
  const tail = { ...(access.circle ? { circle: access.circle } : {}), updatedAt: state.updatedAt, expiresAt: state.expiresAt };
  if (access.precision === 'exact') {
    const radiusMeters = Math.max(SHARED_LOCATION_EXACT_MIN_RADIUS_METERS, Math.round(state.position.accuracy ?? 0));
    return { userId, latitude: round(state.position.latitude), longitude: round(state.position.longitude), precision: 'exact', radiusMeters, ...tail };
  }
  const step = SHARED_LOCATION_GRID_DEGREES[access.precision];
  return {
    userId,
    latitude: snap(state.position.latitude, step, 90),
    longitude: snap(state.position.longitude, step, 180),
    precision: access.precision,
    radiusMeters: SHARED_LOCATION_BLUR_RADIUS_METERS[access.precision],
    ...tail,
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
    readerIds.map((id): [string, SharedLocationReaderAccess] => {
      const verdict = law.get(id);
      const precision = chosen.get(id.toLowerCase());
      const opened = usable.has(emitterId) && usable.has(id) && verdict?.allowed === true && precision !== undefined;
      return [id, opened ? { precision, circle: circleOf(verdict.effectiveLevel) } : 'none'];
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
  a !== null &&
  b !== null &&
  a.latitude === b.latitude &&
  a.longitude === b.longitude &&
  a.precision === b.precision &&
  a.radiusMeters === b.radiusMeters &&
  a.circle === b.circle;

/**
 * Sert la projection de `state` à chaque destinataire ouvert ; rend l'accès de chacun et
 * ceux qui ont reçu. Avec `previous`, un destinataire dont la projection n'a pas bougé ne
 * reçoit rien : un lecteur flouté n'apprend pas quand l'appareil se déplace dans sa maille.
 * Ceux qui vont recevoir sont notés servis AVANT l'envoi : la fin ne part que vers eux.
 */
async function fanOut(
  deps: SharedLocationRelayDeps,
  emitterId: string,
  state: SharedLocationState,
  previous?: SharedLocationState,
): Promise<{ readonly access: ReadonlyMap<string, SharedLocationReaderAccess>; readonly served: readonly string[] }> {
  const access = await accessOf(deps, emitterId, state, recipientIdsOf(state));
  const deliveries = [...access].flatMap(([readerId, readerAccess]) => {
    const projection = projectSharedLocation(emitterId, state, readerAccess);
    if (!projection) return [];
    if (previous && sameServed(projection, projectSharedLocation(emitterId, previous, readerAccess))) return [];
    return [{ readerId, projection }];
  });
  await markSharedLocationSeen(deps.cache, emitterId, state, deliveries.map((delivery) => delivery.readerId), deps.now());
  deliveries.forEach((delivery) => serve(deps.io, delivery.readerId, delivery.projection));
  return { access, served: deliveries.map((delivery) => delivery.readerId) };
}

const STOPPED = failed(SHARED_LOCATION_ERROR_CODES.NOT_SHARING, 'Partage arrêté');

/**
 * Ceux qui ont VU un partage qui n'est plus le bon reçoivent ce que le partage COURANT leur
 * doit : sa projection (notée servie), ou la fin (et ils cessent d'être des servis).
 */
async function reconcile(deps: SharedLocationRelayDeps, emitterId: string, readers: readonly string[]): Promise<void> {
  if (readers.length === 0) return;
  const now = deps.now();
  const current = await readSharedLocation(deps.cache, emitterId, now);
  const access = current ? await accessOf(deps, emitterId, current, readers) : new Map<string, SharedLocationReaderAccess>();
  const deliveries = readers.map((readerId) => ({ readerId, projection: current ? projectSharedLocation(emitterId, current, access.get(readerId) ?? 'none') : null }));
  const ended = deliveries.filter((delivery) => delivery.projection === null).map((delivery) => delivery.readerId);
  if (current) await markSharedLocationSeen(deps.cache, emitterId, current, deliveries.filter((delivery) => delivery.projection !== null).map((delivery) => delivery.readerId), now);
  deliveries.forEach((delivery) => (delivery.projection ? serve(deps.io, delivery.readerId, delivery.projection) : unserve(deps.io, delivery.readerId, emitterId)));
  if (current && ended.length > 0) await unmarkSharedLocationSeen(deps.cache, emitterId, current.sessionId, ended);
}

/**
 * Retire les sessions remplacées ou arrêtées : ceux qu'elles ont SERVIS reçoivent ce que le
 * partage courant leur doit ; qui n'a rien vu n'apprend rien. Une session ne quitte
 * l'ensemble « à retirer » qu'une fois ses lecteurs prévenus : un échec se rejoue au geste
 * suivant. Qui vient de recevoir le partage courant (`alreadyServed`) n'est pas servi deux fois.
 */
async function drainRetiring(deps: SharedLocationRelayDeps, emitterId: string, alreadyServed: readonly string[] = []): Promise<void> {
  for (const sessionId of await retiringSharedLocationSessions(deps.cache, emitterId)) {
    const orphan = await readSharedLocationSession(deps.cache, emitterId, sessionId, deps.now());
    if (orphan) {
      const saw = await sharedLocationSeenAmong(deps.cache, emitterId, sessionId, recipientIdsOf(orphan));
      await reconcile(deps, emitterId, saw.filter((readerId) => !alreadyServed.includes(readerId)));
    }
    await forgetRetiredSharedLocationSession(deps.cache, emitterId, sessionId);
  }
}

/**
 * Démarre (ou remplace) le partage. La prise du pointeur est ATOMIQUE et conditionnée à la
 * génération lue : un arrêt survenu pendant le démarrage l'emporte. La session remplacée
 * est retirée en prévenant ceux qu'elle servait. Une fois la prise faite, le partage EST
 * courant : un échec de l'éventail ne le dément pas (le rattrapage et la position suivante
 * serviront), et l'accusé le dit.
 */
export async function startSharedLocation(deps: SharedLocationRelayDeps, emitterId: string, payload: unknown): Promise<SharedLocationAck> {
  const parsed = sharedLocationStartPayloadSchema.safeParse(payload);
  if (!parsed.success) return failed(SHARED_LOCATION_ERROR_CODES.INVALID, 'Partage illisible');

  const now = deps.now();
  const state: SharedLocationState = {
    sessionId: randomUUID(),
    recipients: parsed.data.recipients
      .filter((recipient) => recipient.userId.toLowerCase() !== emitterId.toLowerCase())
      .map((recipient) => ({ userId: recipient.userId.toLowerCase(), precision: recipient.precision ?? SHARED_LOCATION_DEFAULT_PRECISION })),
    position: parsed.data.position,
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + parsed.data.durationMinutes * 60_000).toISOString(),
  };

  try {
    const generation = await sharedLocationGeneration(deps.cache, emitterId);
    await storeSharedLocation(deps.cache, emitterId, state, now);
    const claim = await claimSharedLocation(deps.cache, emitterId, generation, state, now);
    if (!claim.claimed) {
      await dropSharedLocationSession(deps.cache, emitterId, state.sessionId);
      return STOPPED;
    }
  } catch {
    return UNAVAILABLE;
  }

  const ack: SharedLocationAck = { success: true, data: { expiresAt: state.expiresAt } };
  try {
    const after = await fanOut(deps, emitterId, state);
    await drainRetiring(deps, emitterId, after.served);
    if ((await currentSharedLocationSession(deps.cache, emitterId)) === state.sessionId) return ack;
    await reconcile(deps, emitterId, after.served);
    return STOPPED;
  } catch {
    return ack;
  }
}

/**
 * Une nouvelle position du partage en cours ; le terme ne bouge pas. L'écriture est
 * ATOMIQUE et conditionnée à la session lue : arrêté ou remplacé entre-temps, rien n'est
 * écrit, rien ne part, et la réponse est `NOT_SHARING`. Une fois écrite, la position est
 * acquise : un échec de l'éventail ne la dément pas.
 */
export async function updateSharedLocation(deps: SharedLocationRelayDeps, emitterId: string, payload: unknown): Promise<SharedLocationAck> {
  const parsed = sharedLocationUpdatePayloadSchema.safeParse(payload);
  if (!parsed.success) return failed(SHARED_LOCATION_ERROR_CODES.INVALID, 'Position illisible');

  const now = deps.now();
  let current: SharedLocationState | null;
  let state: SharedLocationState;
  try {
    current = await readSharedLocation(deps.cache, emitterId, now);
    if (!current) return failed(SHARED_LOCATION_ERROR_CODES.NOT_SHARING, 'Aucun partage en cours');
    state = { ...current, position: parsed.data, updatedAt: new Date(now).toISOString() };
    if (!(await storeSharedLocationIfCurrent(deps.cache, emitterId, state, now))) return STOPPED;
  } catch {
    return UNAVAILABLE;
  }

  const ack: SharedLocationAck = { success: true, data: { expiresAt: state.expiresAt } };
  try {
    const { served } = await fanOut(deps, emitterId, state, current);
    if ((await currentSharedLocationSession(deps.cache, emitterId)) === state.sessionId) return ack;
    await reconcile(deps, emitterId, served);
    return STOPPED;
  } catch {
    return ack;
  }
}

/**
 * Arrête le partage : la génération avance et le pointeur part d'un seul geste atomique,
 * qui range la session éteinte « à retirer » ; ceux qu'elle servait reçoivent la fin, à eux
 * seuls. Une panne rend `UNAVAILABLE` : l'arrêt a pu prendre, et le nouvel essai finit
 * d'annoncer la fin, même si le pointeur est déjà parti.
 */
export async function stopSharedLocation(deps: SharedLocationRelayDeps, emitterId: string): Promise<SharedLocationStopAck> {
  try {
    await advanceSharedLocationGeneration(deps.cache, emitterId);
    await drainRetiring(deps, emitterId);
  } catch {
    return UNAVAILABLE;
  }
  return { success: true };
}

/** L'accès de chaque sens d'une paire, pour les seuls émetteurs qui ont un partage en cours. */
export type SharedLocationPairAccess = ReadonlyMap<string, SharedLocationReaderAccess>;

const directions = (userA: string, userB: string) => [[userA, userB], [userB, userA]] as const;
const directionKey = (emitterId: string, readerId: string): string => `${emitterId}>${readerId}`;

/**
 * Ce que chaque sens de la paire voit MAINTENANT. À capturer AVANT un changement de lien :
 * `changed` ne part ensuite que vers un destinataire dont l'accès a bougé.
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
 * blocage. `changed` part vers un destinataire dont l'accès est ouvert et a changé depuis
 * `before` — sa précision OU son cercle ; `ended` vers un destinataire qui ne voit plus rien et que la session a SERVI
 * — lui seul : à qui n'a jamais vu, la fin trahirait un partage. Une session remplacée ou
 * arrêtée pendant le rejeu est réconciliée, comme un geste qui a perdu la course.
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
    if (served && !sameAccess(after, before)) {
      await markSharedLocationSeen(deps.cache, emitterId, state, [readerId], now);
      serve(deps.io, readerId, served);
    }
    if (!served && (await sharedLocationSeenAmong(deps.cache, emitterId, state.sessionId, [readerId])).length > 0) {
      unserve(deps.io, readerId, emitterId);
      await unmarkSharedLocationSeen(deps.cache, emitterId, state.sessionId, [readerId]);
    }
    if (served && (await currentSharedLocationSession(deps.cache, emitterId)) !== state.sessionId) await reconcile(deps, emitterId, [readerId]);
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
      const projection = projectSharedLocation(emitterId, state, access);
      if (!projection) return null;
      await markSharedLocationSeen(deps.cache, emitterId, state, [readerId], now);
      return (await currentSharedLocationSession(deps.cache, emitterId)) === state.sessionId ? projection : null;
    }),
  );
  return { items: served.filter((item): item is SharedLocationChangedEventData => item !== null && within(item, options.bbox)) };
}


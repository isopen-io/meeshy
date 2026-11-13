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
 * relus à CHAQUE émission — et une fois encore APRÈS l'envoi, pour qu'un changement
 * de lien écrit pendant l'éventail ne laisse pas un point derrière sa fin —, jamais mis
 * en cache. Chaque émission vise la room
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
  SHARED_LOCATION_CELL_HOLD_MARGIN,
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
import { teamPeerCandidates } from '../relations/teamPeers';
import { randomUUID } from 'node:crypto';
import {
  advanceSharedLocationGeneration,
  claimSharedLocation,
  currentSharedLocationSession,
  currentSharedLocationSessions,
  dropSharedLocationSession,
  forgetRetiredSharedLocationSession,
  markSharedLocationSeen,
  purgeSharedLocationKeys,
  readSharedLocation,
  readSharedLocations,
  readSharedLocationSession,
  retiringSharedLocationSessions,
  sharedLocationGeneration,
  sharedLocationSeenAmong,
  storeSharedLocation,
  storeSharedLocationIfCurrent,
  unmarkSharedLocationSeen,
  type SharedLocationCache,
  type SharedLocationCell,
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

/** Un lecteur flouté n'a pas d'horloge fine : l'heure servie tombe sur le quart d'heure. */
const BLUR_CLOCK_BUCKET_MS = 15 * 60_000;

const roundedClock = (iso: string): string => new Date(Math.floor(Date.parse(iso) / BLUR_CLOCK_BUCKET_MS) * BLUR_CLOCK_BUCKET_MS).toISOString();

const cellOf = (position: Pick<SharedLocationState['position'], 'latitude' | 'longitude'>, step: number): SharedLocationCell => ({
  latitude: snap(position.latitude, step, 90),
  longitude: snap(position.longitude, step, 180),
});

/** La maille servie après un pas : la retenue tant que la position reste dans la maille élargie de la marge, sinon la nouvelle. */
const heldCell = (position: Pick<SharedLocationState['position'], 'latitude' | 'longitude'>, step: number, held: SharedLocationCell): SharedLocationCell => {
  const reach = step * (0.5 + SHARED_LOCATION_CELL_HOLD_MARGIN);
  return Math.abs(position.latitude - held.latitude) <= reach && Math.abs(position.longitude - held.longitude) <= reach ? held : cellOf(position, step);
};

/** Les destinataires d'une position qui bouge : chacun garde sa maille retenue, sauf si l'émetteur s'en est éloigné. */
const withHeldCells = (current: SharedLocationState, position: SharedLocationState['position']): SharedLocationState['recipients'] =>
  current.recipients.map((recipient) => {
    if (recipient.precision === 'exact') return recipient;
    const step = SHARED_LOCATION_GRID_DEGREES[recipient.precision];
    return { ...recipient, cell: heldCell(position, step, recipient.cell ?? cellOf(current.position, step)) };
  });

/**
 * La projection d'UN destinataire : la position à sa précision, le rayon de son flou, rien
 * d'autre. Un lecteur flouté reçoit la maille que `state` retient pour lui (`readerId`) et
 * une heure arrondie.
 */
export function projectSharedLocation(
  userId: string,
  state: Pick<SharedLocationState, 'position' | 'updatedAt' | 'expiresAt' | 'recipients'>,
  access: SharedLocationReaderAccess,
  readerId?: string,
): SharedLocationChangedEventData | null {
  if (access === 'none') return null;
  if (access === 'exact') {
    const radiusMeters = Math.max(SHARED_LOCATION_EXACT_MIN_RADIUS_METERS, Math.round(state.position.accuracy ?? 0));
    return { userId, latitude: round(state.position.latitude), longitude: round(state.position.longitude), precision: 'exact', radiusMeters, updatedAt: state.updatedAt, expiresAt: state.expiresAt };
  }
  const held = readerId === undefined ? undefined : state.recipients.find((recipient) => recipient.userId.toLowerCase() === readerId.toLowerCase())?.cell;
  const cell = held ?? cellOf(state.position, SHARED_LOCATION_GRID_DEGREES[access]);
  return {
    userId,
    latitude: cell.latitude,
    longitude: cell.longitude,
    precision: access,
    radiusMeters: SHARED_LOCATION_BLUR_RADIUS_METERS[access],
    updatedAt: roundedClock(state.updatedAt),
    expiresAt: state.expiresAt,
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
    const projection = projectSharedLocation(emitterId, state, readerAccess, readerId);
    if (!projection) return [];
    if (previous && sameServed(projection, projectSharedLocation(emitterId, previous, readerAccess, readerId))) return [];
    return [{ readerId, projection }];
  });
  const sent = deliveries.map((delivery) => delivery.readerId);
  await markSharedLocationSeen(deps.cache, emitterId, state, sent, deps.now());
  deliveries.forEach((delivery) => serve(deps.io, delivery.readerId, delivery.projection));
  await closeStaleReaders(deps, emitterId, state, access);
  const revoked = await revokedSince(deps, emitterId, state, sent);
  return { access, served: sent.filter((readerId) => !revoked.includes(readerId)) };
}

/**
 * Un lecteur SERVI dont l'accès est désormais fermé reçoit la fin à la position suivante,
 * même quand le chemin qui l'a fermé (un rôle qui redescend, une loi qui change) ne
 * rejoue rien (#16987, M2). Qui n'a jamais vu n'apprend rien.
 */
async function closeStaleReaders(
  deps: SharedLocationRelayDeps,
  emitterId: string,
  state: SharedLocationState,
  access: ReadonlyMap<string, SharedLocationReaderAccess>,
): Promise<void> {
  const closed = [...access].filter(([, readerAccess]) => readerAccess === 'none').map(([readerId]) => readerId);
  if (closed.length === 0) return;
  const stale = await sharedLocationSeenAmong(deps.cache, emitterId, state.sessionId, closed);
  if (stale.length === 0) return;
  stale.forEach((readerId) => unserve(deps.io, readerId, emitterId));
  await unmarkSharedLocationSeen(deps.cache, emitterId, state.sessionId, stale);
}

/**
 * La loi relue APRÈS l'envoi (#16987) : une baisse ou un blocage écrits pendant que
 * l'éventail lisait l'accès ont pu effacer chez le lecteur AVANT que le point parte.
 * Qui a perdu l'accès reçoit la fin APRÈS le point et cesse d'être un servi ; un
 * changement écrit après cette relecture trouve le lecteur noté servi et l'efface lui-même.
 */
async function revokedSince(deps: SharedLocationRelayDeps, emitterId: string, state: SharedLocationState, sent: readonly string[]): Promise<readonly string[]> {
  if (sent.length === 0) return [];
  const confirmed = await accessOf(deps, emitterId, state, sent);
  const revoked = sent.filter((readerId) => (confirmed.get(readerId) ?? 'none') === 'none');
  if (revoked.length === 0) return [];
  revoked.forEach((readerId) => unserve(deps.io, readerId, emitterId));
  await unmarkSharedLocationSeen(deps.cache, emitterId, state.sessionId, revoked);
  return revoked;
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
  const deliveries = readers.map((readerId) => ({ readerId, projection: current ? projectSharedLocation(emitterId, current, access.get(readerId) ?? 'none', readerId) : null }));
  const ended = deliveries.filter((delivery) => delivery.projection === null).map((delivery) => delivery.readerId);
  if (current) await markSharedLocationSeen(deps.cache, emitterId, current, deliveries.filter((delivery) => delivery.projection !== null).map((delivery) => delivery.readerId), now);
  deliveries.forEach((delivery) => (delivery.projection ? serve(deps.io, delivery.readerId, delivery.projection) : unserve(deps.io, delivery.readerId, emitterId)));
  if (current && ended.length > 0) await unmarkSharedLocationSeen(deps.cache, emitterId, current.sessionId, ended);
  if (current) await revokedSince(deps, emitterId, current, deliveries.filter((delivery) => delivery.projection !== null).map((delivery) => delivery.readerId));
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
    if (!(await usableAccounts(deps.prisma, [emitterId])).has(emitterId)) return STOPPED;
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
    state = { ...current, recipients: withHeldCells(current, parsed.data), position: parsed.data, updatedAt: new Date(now).toISOString() };
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
 * `before` ; `ended` vers un destinataire qui ne voit plus rien et que la session a SERVI
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
    const served = projectSharedLocation(emitterId, state, after, readerId);
    if (served && after !== before) {
      await markSharedLocationSeen(deps.cache, emitterId, state, [readerId], now);
      serve(deps.io, readerId, served);
      await revokedSince(deps, emitterId, state, [readerId]);
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
 * Termine le partage d'un compte qui part (désactivé, supprimé, purgé) : il s'arrête et
 * ceux qu'il servait reçoivent la fin, comme à `location:share-stop`. Avec `forget` (la
 * purge), la génération et l'ensemble « à retirer », sans durée de vie, partent aussi —
 * jamais avant que l'arrêt ait pris. Une panne rend `UNAVAILABLE` : on rejoue.
 */
export async function endSharedLocationOfAccount(
  deps: SharedLocationRelayDeps,
  accountId: string,
  options: { readonly forget: boolean },
): Promise<SharedLocationStopAck> {
  const stopped = await stopSharedLocation(deps, accountId);
  if (!stopped.success || !options.forget) return stopped;
  try {
    await purgeSharedLocationKeys(deps.cache, accountId);
  } catch {
    return UNAVAILABLE;
  }
  return stopped;
}

/** Les émetteurs à lire : les liens du lecteur dès Ami, et les collègues de l'équipe (la loi les ouvre sans lien). */
async function snapshotCandidates(deps: SharedLocationRelayDeps, readerId: string): Promise<readonly string[]> {
  const [linked, peers] = await Promise.all([
    comptesAuMoins(deps.prisma, readerId, 'FRIEND', { limit: SNAPSHOT_LINK_LIMIT }),
    teamPeerCandidates(deps.prisma, readerId),
  ]);
  return [...new Set([...linked.map((link) => link.id), ...peers])];
}

/**
 * Ce que `readerId` voit : les partages en cours de ses liens et de ses collègues qui lui
 * sont destinés, tronqués, filtrés par l'emprise sur la position SERVIE — jamais sur la
 * réelle. Lectures GROUPÉES : un `MGET` des pointeurs, un des états, une loi
 * (`pairAccessAmong`) pour tous les émetteurs, qui suit la même loi d'équipe que le direct.
 */
export async function sharedLocationSnapshotFor(
  deps: SharedLocationRelayDeps,
  readerId: string,
  options: { readonly bbox?: SharedLocationBbox },
): Promise<SharedLocationSnapshot> {
  const now = deps.now();
  const states = await readSharedLocations(deps.cache, await snapshotCandidates(deps, readerId), now);
  const addressed = [...states].filter(([, state]) => state.recipients.some((recipient) => recipient.userId.toLowerCase() === readerId.toLowerCase()));
  if (addressed.length === 0) return { items: [] };

  const allowed = await snapshotAllowed(deps, readerId, addressed.map(([emitterId]) => emitterId), now);
  const opened = addressed.flatMap(([emitterId, state]) => {
    const chosen = state.recipients.find((recipient) => recipient.userId.toLowerCase() === readerId.toLowerCase())?.precision ?? 'none';
    const projection = projectSharedLocation(emitterId, state, allowed.has(emitterId) ? chosen : 'none', readerId);
    return projection ? [{ emitterId, state, projection }] : [];
  });
  await Promise.all(opened.map(({ emitterId, state }) => markSharedLocationSeen(deps.cache, emitterId, state, [readerId], now)));
  const confirmed = opened.length > 0 ? await snapshotAllowed(deps, readerId, opened.map(({ emitterId }) => emitterId), now) : new Set<string>();
  const lost = opened.filter(({ emitterId }) => !confirmed.has(emitterId));
  await Promise.all(lost.map(({ emitterId, state }) => unmarkSharedLocationSeen(deps.cache, emitterId, state.sessionId, [readerId])));
  const kept = opened.filter(({ emitterId }) => confirmed.has(emitterId));
  const current = await currentSharedLocationSessions(deps.cache, kept.map(({ emitterId }) => emitterId));
  const items = kept.filter(({ emitterId, state }) => current.get(emitterId) === state.sessionId).map(({ projection }) => projection);
  return { items: items.filter((item) => within(item, options.bbox)) };
}

/**
 * Les émetteurs dont la loi ouvre le partage à `readerId`, en une lecture groupée. Le
 * rattrapage la relit APRÈS avoir noté le lecteur servi (#16987, M1) : une baisse écrite
 * pendant la première lecture a pu envoyer sa fin avant que le lecteur soit noté, et la
 * réponse HTTP ne la contredit pas ; une baisse écrite après la relecture le trouve noté.
 */
async function snapshotAllowed(deps: SharedLocationRelayDeps, readerId: string, emitterIds: readonly string[], now: number): Promise<ReadonlySet<string>> {
  const [law, usable] = await Promise.all([
    pairAccessAmong(deps.prisma, { feature: 'location.temporary', subjectId: readerId, otherIds: emitterIds, subjectIs: 'viewer', now: new Date(now), consentOf: () => 'granted' }),
    usableAccounts(deps.prisma, [readerId, ...emitterIds]),
  ]);
  return new Set(emitterIds.filter((emitterId) => usable.has(readerId) && usable.has(emitterId) && law.get(emitterId)?.allowed === true));
}

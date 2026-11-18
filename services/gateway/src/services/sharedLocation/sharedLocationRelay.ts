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
 * en cache. Le cercle servi (#17966) est le niveau EFFECTIF de ce même verdict : le
 * lecteur apprend de quel cercle vient l'émetteur pour LUI (ce que `GET /relations/:userId`
 * lui dit déjà), jamais rien de la loi d'un autre. Chaque émission vise la room
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
  SHARED_LOCATION_CIRCLES,
  SHARED_LOCATION_DEFAULT_PRECISION,
  SHARED_LOCATION_ERROR_CODES,
  SHARED_LOCATION_EXACT_MIN_RADIUS_METERS,
  SHARED_LOCATION_GRID_DEGREES,
  SHARED_LOCATION_PRECISIONS,
  sharedLocationStartPayloadSchema,
  sharedLocationUpdatePayloadSchema,
  type SharedLocationAck,
  type SharedLocationChangedEventData,
  type SharedLocationCircle,
  type SharedLocationEndedItem,
  type SharedLocationErrorCode,
  type SharedLocationOwnSnapshot,
  type SharedLocationPrecision,
  type SharedLocationSnapshot,
  type SharedLocationStopAck,
} from '@meeshy/shared/types/shared-location';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { RelationLevel } from '@meeshy/shared/types/relation';
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
import { forgetSharedLocationEnds, noteSharedLocationReaderServed, noteSharedLocationReadersServed, noteSharedLocationServed, noteSharedLocationStopped, sharedLocationEndsFor } from './sharedLocationEnds';

export type SharedLocationDb = PairAccessDb;

export type SharedLocationIo = ServerEmitIO;

/** « Prévenir » (#19204) : à qui, de qui, pour combien de temps — jamais une position. */
export type SharedLocationStartedNotice = {
  readonly emitterId: string;
  readonly readerId: string;
  readonly durationMinutes: number;
  readonly expiresAt: string;
};

export type SharedLocationRelayDeps = {
  readonly prisma: SharedLocationDb;
  readonly cache: SharedLocationCache;
  readonly io: SharedLocationIo | undefined;
  readonly now: () => number;
  /** Porte `location_share_started` (#19204) ; absente, personne n'est prévenu. Un échec n'arrête jamais le partage. */
  readonly notifyStarted?: (notices: readonly SharedLocationStartedNotice[]) => Promise<void>;
  /**
   * Rejoue la batterie de `readerIds` après un démarrage ou un arrêt qui change l'accord de batterie
   * du partage (#19204) ; absent, la batterie se recale au relevé suivant. Un échec n'arrête rien.
   */
  readonly refreshBattery?: (emitterId: string, readerIds: readonly string[]) => Promise<void>;
};

/**
 * Ce qu'UN lecteur reçoit du partage : rien, ou la précision que l'émetteur lui a donnée
 * et le cercle que la loi vient de juger entre eux (#17966). Les deux se comparent
 * ensemble : un cercle qui change à précision égale se ressert.
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

const recipientOf = (state: Pick<SharedLocationState, 'recipients'>, readerId: string) =>
  state.recipients.find((recipient) => recipient.userId.toLowerCase() === readerId.toLowerCase());

/** L'échéance de `readerId` : la sienne si elle est plus proche que le terme, sinon le terme (#18205). */
const deadlineOf = (state: Pick<SharedLocationState, 'recipients' | 'expiresAt'>, readerId: string | undefined): string => {
  const own = readerId === undefined ? undefined : recipientOf(state, readerId)?.expiresAt;
  return own !== undefined && Date.parse(own) < Date.parse(state.expiresAt) ? own : state.expiresAt;
};

/** Les destinataires dont l'échéance n'est pas passée : les seuls que la passerelle sert encore. */
export const liveRecipients = (state: SharedLocationState, now: number): SharedLocationState['recipients'] =>
  state.recipients.filter((recipient) => Date.parse(deadlineOf(state, recipient.userId)) > now);

/** Une position antérieure à la sortie du fantôme (#19203) ne se republie pas : seule la suivante repart. */
const heldSinceGhost = (state: Pick<SharedLocationState, 'updatedAt' | 'servableFrom'>): boolean =>
  state.servableFrom !== undefined && Date.parse(state.updatedAt) < Date.parse(state.servableFrom);

/**
 * La projection d'UN destinataire : la position à sa précision, le rayon de son flou, son
 * cercle, rien d'autre. Un lecteur flouté reçoit la maille que `state` retient pour lui (`readerId`) et
 * une heure arrondie.
 */
export function projectSharedLocation(
  userId: string,
  state: Pick<SharedLocationState, 'position' | 'updatedAt' | 'expiresAt' | 'recipients' | 'servableFrom'>,
  access: SharedLocationReaderAccess,
  readerId?: string,
): SharedLocationChangedEventData | null {
  if (access === 'none' || heldSinceGhost(state)) return null;
  const circle = access.circle ? { circle: access.circle } : {};
  if (access.precision === 'exact') {
    const radiusMeters = Math.max(SHARED_LOCATION_EXACT_MIN_RADIUS_METERS, Math.round(state.position.accuracy ?? 0));
    return { userId, latitude: round(state.position.latitude), longitude: round(state.position.longitude), precision: 'exact', radiusMeters, ...circle, updatedAt: state.updatedAt, expiresAt: deadlineOf(state, readerId) };
  }
  const held = readerId === undefined ? undefined : recipientOf(state, readerId)?.cell;
  const cell = held ?? cellOf(state.position, SHARED_LOCATION_GRID_DEGREES[access.precision]);
  return {
    userId,
    latitude: cell.latitude,
    longitude: cell.longitude,
    precision: access.precision,
    radiusMeters: SHARED_LOCATION_BLUR_RADIUS_METERS[access.precision],
    ...circle,
    updatedAt: roundedClock(state.updatedAt),
    expiresAt: deadlineOf(state, readerId),
  };
}

type AccountStates = {
  /** Le compte peut-il encore émettre ou recevoir ? Un compte désactivé ou supprimé, non. */
  readonly usable: ReadonlySet<string>;
  /** Le compte est-il en fantôme global (#19203) ? Il ne sert alors sa position à personne, et lit toujours. */
  readonly ghost: ReadonlySet<string>;
};

async function accountStates(prisma: SharedLocationDb, ids: readonly string[]): Promise<AccountStates> {
  const rows = await prisma.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, isActive: true, deactivatedAt: true, deletedAt: true, locationGhostAt: true },
  });
  return {
    usable: new Set(rows.filter((row) => row.isActive !== false && !row.deactivatedAt && !row.deletedAt).map((row) => row.id)),
    ghost: new Set(rows.filter((row) => row.locationGhostAt != null).map((row) => row.id)),
  };
}

/** L'émetteur sert-il sa position ? Utilisable et hors fantôme. */
const emitting = (accounts: AccountStates, emitterId: string): boolean => accounts.usable.has(emitterId) && !accounts.ghost.has(emitterId);

/** L'accès de chaque destinataire `readerIds` au partage de `emitterId`, relu maintenant. */
async function accessOf(
  deps: SharedLocationRelayDeps,
  emitterId: string,
  state: SharedLocationState,
  readerIds: readonly string[],
): Promise<ReadonlyMap<string, SharedLocationReaderAccess>> {
  const chosen = new Map(liveRecipients(state, deps.now()).map((recipient) => [recipient.userId.toLowerCase(), recipient.precision]));
  const candidates = readerIds.filter((id) => chosen.has(id.toLowerCase()));
  if (candidates.length === 0) return new Map(readerIds.map((id) => [id, 'none']));
  const [law, accounts] = await Promise.all([
    pairAccessAmong(deps.prisma, {
      feature: 'location.temporary',
      subjectId: emitterId,
      otherIds: candidates,
      subjectIs: 'target',
      now: new Date(deps.now()),
      consentOf: (otherId) => (chosen.has(otherId.toLowerCase()) ? 'granted' : 'refused'),
    }),
    accountStates(deps.prisma, [emitterId, ...candidates]),
  ]);
  return new Map(
    readerIds.map((id): [string, SharedLocationReaderAccess] => {
      const verdict = law.get(id);
      const precision = chosen.get(id.toLowerCase());
      const opened = emitting(accounts, emitterId) && accounts.usable.has(id) && verdict?.allowed === true && precision !== undefined;
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
): Promise<{ readonly access: ReadonlyMap<string, SharedLocationReaderAccess>; readonly served: readonly string[]; readonly fresh: readonly string[] }> {
  const access = await accessOf(deps, emitterId, state, recipientIdsOf(state));
  const deliveries = [...access].flatMap(([readerId, readerAccess]) => {
    const projection = projectSharedLocation(emitterId, state, readerAccess, readerId);
    if (!projection) return [];
    const before = previous ? projectSharedLocation(emitterId, previous, readerAccess, readerId) : null;
    if (sameServed(projection, before)) return [];
    return [{ readerId, projection, fresh: previous !== undefined && before === null }];
  });
  const sent = deliveries.map((delivery) => delivery.readerId);
  await markSharedLocationSeen(deps.cache, emitterId, state, sent, deps.now());
  deliveries.forEach((delivery) => serve(deps.io, delivery.readerId, delivery.projection));
  await closeStaleReaders(deps, emitterId, state, access);
  const revoked = await revokedSince(deps, emitterId, state, sent);
  const served = sent.filter((readerId) => !revoked.includes(readerId));
  return { access, served, fresh: deliveries.filter((delivery) => delivery.fresh && served.includes(delivery.readerId)).map((delivery) => delivery.readerId) };
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

const NOT_SHARING = failed(SHARED_LOCATION_ERROR_CODES.NOT_SHARING, 'Aucun partage en cours');

const coarser = (a: SharedLocationPrecision, b: SharedLocationPrecision): SharedLocationPrecision =>
  SHARED_LOCATION_PRECISIONS.indexOf(a) >= SHARED_LOCATION_PRECISIONS.indexOf(b) ? a : b;

const earlier = (a: string, b: string): string => (Date.parse(a) <= Date.parse(b) ? a : b);

/**
 * La LISTE SEULE (#19284, #18580) appliquée au partage `current` : elle ne fait que RETIRER.
 * Une personne que `current` ne sert plus (jamais choisie, retirée ailleurs, échue) est
 * ignorée — une liste périmée ne la fait pas revenir ; la précision ne peut que baisser ; le
 * terme et chaque échéance ne peuvent que se rapprocher. La position, son heure et la maille
 * retenue de qui garde sa précision viennent de `current` : le point n'est pas rafraîchi. Le
 * seuil de sortie du fantôme (`servableFrom`) suit le point qu'il garde ; la batterie ne peut
 * que se retirer (`shareBattery: false`), jamais s'ajouter.
 * `null` : personne ne reste.
 */
function listOnlyState(
  current: SharedLocationState,
  wanted: { readonly recipients: SharedLocationState['recipients']; readonly shareBattery: boolean | undefined },
  term: string,
  now: number,
): Omit<SharedLocationState, 'sessionId'> | null {
  const live = new Map(liveRecipients(current, now).map((recipient) => [recipient.userId.toLowerCase(), recipient]));
  const expiresAt = earlier(term, current.expiresAt);
  const recipients = wanted.recipients.flatMap((recipient) => {
    const kept = live.get(recipient.userId);
    if (!kept) return [];
    const precision = coarser(recipient.precision, kept.precision);
    const deadline = earlier(earlier(recipient.expiresAt ?? expiresAt, deadlineOf(current, kept.userId)), expiresAt);
    return [{
      userId: recipient.userId,
      precision,
      ...(kept.cell !== undefined && kept.precision === precision ? { cell: kept.cell } : {}),
      ...(Date.parse(deadline) < Date.parse(expiresAt) ? { expiresAt: deadline } : {}),
    }];
  });
  if (recipients.length === 0) return null;
  const servableFrom = current.servableFrom === undefined ? {} : { servableFrom: current.servableFrom };
  const shareBattery = current.shareBattery === true && wanted.shareBattery !== false ? { shareBattery: true as const } : {};
  return { recipients, position: current.position, updatedAt: current.updatedAt, expiresAt, ...servableFrom, ...shareBattery };
}

/** Plus rien à servir : la liste seule vaut un arrêt. */
async function stoppedByListOnly(deps: SharedLocationRelayDeps, emitterId: string): Promise<SharedLocationAck> {
  await advanceSharedLocationGeneration(deps.cache, emitterId);
  await drainRetiring(deps, emitterId);
  return NOT_SHARING;
}

/**
 * Démarre (ou remplace) le partage. La prise du pointeur est ATOMIQUE et conditionnée à la
 * génération lue : un arrêt survenu pendant le démarrage l'emporte. La session remplacée
 * est retirée en prévenant ceux qu'elle servait. Une fois la prise faite, le partage EST
 * courant : un échec de l'éventail ne le dément pas (le rattrapage et la position suivante
 * serviront), et l'accusé le dit.
 *
 * Sans position, c'est une liste seule ({@link listOnlyState}). Elle est rejouée APRÈS la
 * prise sur la session REMPLACÉE, relue : un démarrage ou une position écrits par un autre
 * appareil entre la première lecture et la prise ne sont ni défaits ni reculés — la session
 * remplacée ne peut plus changer, la prise l'ayant retirée du pointeur.
 */
export async function startSharedLocation(deps: SharedLocationRelayDeps, emitterId: string, payload: unknown): Promise<SharedLocationAck> {
  const parsed = sharedLocationStartPayloadSchema.safeParse(payload);
  if (!parsed.success) return failed(SHARED_LOCATION_ERROR_CODES.INVALID, 'Partage illisible');

  const now = deps.now();
  const term = now + parsed.data.durationMinutes * 60_000;
  const recipients: SharedLocationState['recipients'] = parsed.data.recipients
    .filter((recipient) => recipient.userId.toLowerCase() !== emitterId.toLowerCase())
    .map((recipient) => ({
      userId: recipient.userId.toLowerCase(),
      precision: recipient.precision ?? SHARED_LOCATION_DEFAULT_PRECISION,
      ...(recipient.expiresInSeconds === undefined ? {} : { expiresAt: new Date(Math.min(term, now + recipient.expiresInSeconds * 1000)).toISOString() }),
    }));
  const position = parsed.data.position;
  const termIso = new Date(term).toISOString();
  const shareBattery = parsed.data.shareBattery;

  let state: SharedLocationState;
  let previous: SharedLocationState | null;
  try {
    const generation = await sharedLocationGeneration(deps.cache, emitterId);
    if (!(await accountStates(deps.prisma, [emitterId])).usable.has(emitterId)) return STOPPED;
    previous = await readSharedLocation(deps.cache, emitterId, now);
    const sessionId = randomUUID();
    if (position) {
      state = { sessionId, recipients, position, updatedAt: new Date(now).toISOString(), expiresAt: termIso, ...(shareBattery === true ? { shareBattery: true as const } : {}) };
    } else {
      if (!previous) return NOT_SHARING;
      const listed = listOnlyState(previous, { recipients, shareBattery }, termIso, now);
      if (!listed) return await stoppedByListOnly(deps, emitterId);
      state = { sessionId, ...listed };
    }
    await storeSharedLocation(deps.cache, emitterId, state, now);
    const claim = await claimSharedLocation(deps.cache, emitterId, generation, state, now);
    if (!claim.claimed) {
      await dropSharedLocationSession(deps.cache, emitterId, state.sessionId);
      return STOPPED;
    }
    if (!position) {
      const displaced = claim.displaced === null ? null : await readSharedLocationSession(deps.cache, emitterId, claim.displaced, now);
      const listed = displaced ? listOnlyState(displaced, { recipients, shareBattery }, termIso, now) : null;
      if (!listed) return await stoppedByListOnly(deps, emitterId);
      previous = displaced;
      state = { sessionId: state.sessionId, ...listed };
      if (!(await storeSharedLocationIfCurrent(deps.cache, emitterId, state, now))) return STOPPED;
    }
  } catch {
    return UNAVAILABLE;
  }

  const ack: SharedLocationAck = { success: true, data: { expiresAt: state.expiresAt } };
  try {
    const after = await fanOut(deps, emitterId, state);
    await drainRetiring(deps, emitterId, after.served);
    if ((await currentSharedLocationSession(deps.cache, emitterId)) === state.sessionId) {
      await noteServedEnds(deps, emitterId, state, after.served);
      if (position && parsed.data.notifyRecipients === true) await notifyNewcomers(deps, emitterId, { state, previous, served: after.served });
      await refreshBatteryOf(deps, emitterId, [previous, state]);
      return ack;
    }
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
    if (!current) return NOT_SHARING;
    state = { ...current, recipients: withHeldCells(current, parsed.data), position: parsed.data, updatedAt: new Date(now).toISOString() };
    if (!(await storeSharedLocationIfCurrent(deps.cache, emitterId, state, now))) return STOPPED;
  } catch {
    return UNAVAILABLE;
  }

  const ack: SharedLocationAck = { success: true, data: { expiresAt: state.expiresAt } };
  try {
    const { served, fresh } = await fanOut(deps, emitterId, state, current);
    if ((await currentSharedLocationSession(deps.cache, emitterId)) === state.sessionId) {
      await noteFreshEnds(deps, emitterId, state, fresh);
      return ack;
    }
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
  const stopped = await readSharedLocation(deps.cache, emitterId, deps.now()).catch(() => null);
  try {
    await advanceSharedLocationGeneration(deps.cache, emitterId);
    await drainRetiring(deps, emitterId);
  } catch {
    return UNAVAILABLE;
  }
  await noteSharedLocationStopped(deps.cache, emitterId, deps.now()).catch(() => undefined);
  await refreshBatteryOf(deps, emitterId, [stopped]);
  return { success: true };
}

/**
 * Rejoue la batterie (#19204) de chaque destinataire vivant d'un partage qui l'accordait ou
 * l'accorde, une fois le changement pris : la batterie relit l'accord du partage COURANT. Jamais
 * bloquant ; sans partage avec batterie, rien n'est rejoué.
 */
async function refreshBatteryOf(deps: SharedLocationRelayDeps, emitterId: string, states: readonly (SharedLocationState | null)[]): Promise<void> {
  if (!deps.refreshBattery) return;
  const now = deps.now();
  const readers = [...new Set(states.flatMap((state) => (state?.shareBattery ? liveRecipients(state, now).map((recipient) => recipient.userId.toLowerCase()) : [])))];
  if (readers.length === 0) return;
  await deps.refreshBattery(emitterId, readers).catch(() => undefined);
}

/**
 * Le partage devenu courant note l'échéance de chacun de ceux qu'il a servis (#19202), pour que
 * sa fin leur soit dite un jour durant. Jamais bloquant : une panne laisse la fin non dite.
 */
async function noteServedEnds(deps: SharedLocationRelayDeps, emitterId: string, state: SharedLocationState, served: readonly string[]): Promise<void> {
  const ends = served.flatMap((readerId) => {
    const precision = recipientOf(state, readerId)?.precision;
    return precision ? [{ userId: readerId.toLowerCase(), endsAt: deadlineOf(state, readerId), precision }] : [];
  });
  await noteSharedLocationServed(deps.cache, emitterId, ends, deps.now()).catch(() => undefined);
}

/**
 * Une position qui se met à servir un lecteur qui ne voyait rien — à la sortie du fantôme global
 * (#19203), la position retenue ne servait personne — note son échéance (#19202), les autres
 * fins ne bougent pas. Jamais bloquant.
 */
async function noteFreshEnds(deps: SharedLocationRelayDeps, emitterId: string, state: SharedLocationState, fresh: readonly string[]): Promise<void> {
  const ends = fresh.flatMap((readerId) => {
    const precision = recipientOf(state, readerId)?.precision;
    return precision ? [{ userId: readerId.toLowerCase(), endsAt: deadlineOf(state, readerId), precision }] : [];
  });
  if (ends.length === 0) return;
  await noteSharedLocationReadersServed(deps.cache, emitterId, ends, deps.now()).catch(() => undefined);
}

/**
 * Prévient (#19204) chaque destinataire SERVI qui n'était pas un destinataire vivant du partage
 * remplacé : remplacer pour ajouter une personne ne réveille pas les autres. La durée annoncée est
 * celle du lecteur — son échéance propre quand elle précède le terme. Jamais bloquant.
 */
async function notifyNewcomers(
  deps: SharedLocationRelayDeps,
  emitterId: string,
  params: { readonly state: SharedLocationState; readonly previous: SharedLocationState | null; readonly served: readonly string[] },
): Promise<void> {
  if (!deps.notifyStarted) return;
  const now = deps.now();
  const before = new Set((params.previous ? liveRecipients(params.previous, now) : []).map((recipient) => recipient.userId.toLowerCase()));
  const notices = params.served
    .filter((readerId) => !before.has(readerId.toLowerCase()))
    .map((readerId) => {
      const expiresAt = deadlineOf(params.state, readerId);
      return { emitterId, readerId, durationMinutes: Math.max(1, Math.ceil((Date.parse(expiresAt) - now) / 60_000)), expiresAt };
    });
  if (notices.length === 0) return;
  await deps.notifyStarted(notices).catch(() => undefined);
}

/** Un lecteur servi en cours de partage (#19202) : sa fin lui sera dite comme aux autres. Jamais bloquant. */
async function noteReaderServedEnd(deps: SharedLocationRelayDeps, emitterId: string, state: SharedLocationState, readerId: string): Promise<void> {
  const precision = recipientOf(state, readerId)?.precision;
  if (!precision) return;
  await noteSharedLocationReaderServed(deps.cache, emitterId, { userId: readerId.toLowerCase(), endsAt: deadlineOf(state, readerId), precision }, deps.now()).catch(() => undefined);
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
    if (served && !sameAccess(after, before)) {
      await markSharedLocationSeen(deps.cache, emitterId, state, [readerId], now);
      serve(deps.io, readerId, served);
      const revoked = await revokedSince(deps, emitterId, state, [readerId]);
      if (revoked.length === 0) await noteReaderServedEnd(deps, emitterId, state, readerId);
    }
    if (!served && (await sharedLocationSeenAmong(deps.cache, emitterId, state.sessionId, [readerId])).length > 0) {
      unserve(deps.io, readerId, emitterId);
      await unmarkSharedLocationSeen(deps.cache, emitterId, state.sessionId, [readerId]);
    }
    if (served && (await currentSharedLocationSession(deps.cache, emitterId)) !== state.sessionId) await reconcile(deps, emitterId, [readerId]);
  }
}

/** Ce que le réglage du fantôme global vient de faire (#19203) : `writeLocationGhost` le rend. */
export type LocationGhostChange = 'entered' | 'left' | 'unchanged';

/**
 * Le partage en cours suit le fantôme global (#19203), comme un partage en pause. À l'ENTRÉE,
 * ceux que la session servait reçoivent la fin, eux seuls (l'accès relu est fermé pour tous),
 * et leur fin se range parmi les partages terminés comme à un arrêt : rien ne distingue le
 * fantôme d'un arrêt (#13937). Le partage reste rangé et les positions suivantes s'y écrivent sans partir. À la SORTIE, rien
 * ne part : la session est marquée, et seule une position postérieure se sert de nouveau — au
 * direct comme au rattrapage. Même sans cet appel, la position suivante relit le fantôme.
 */
export async function reflectSharedLocationGhost(deps: SharedLocationRelayDeps, emitterId: string, change: LocationGhostChange): Promise<void> {
  if (change === 'unchanged') return;
  const now = deps.now();
  const state = await readSharedLocation(deps.cache, emitterId, now);
  if (!state) return;
  if (change === 'entered') {
    await closeStaleReaders(deps, emitterId, state, await accessOf(deps, emitterId, state, recipientIdsOf(state)));
    await noteSharedLocationStopped(deps.cache, emitterId, now).catch(() => undefined);
    return;
  }
  await storeSharedLocationIfCurrent(deps.cache, emitterId, { ...state, servableFrom: new Date(now).toISOString() }, now);
}

/**
 * La batterie accordée par le partage en cours (#19204) se rejoue quand le fantôme global change
 * (#19203) : la batterie relit le fantôme. À appeler APRÈS l'écriture du compte. Jamais bloquant.
 */
export async function replaySharedLocationBatteryOf(deps: SharedLocationRelayDeps, emitterId: string): Promise<void> {
  await refreshBatteryOf(deps, emitterId, [await readSharedLocation(deps.cache, emitterId, deps.now())]);
}

/** Le point servi est-il dans l'emprise ? Absente : toute la carte. */
export const withinBbox = (item: { readonly latitude: number; readonly longitude: number }, bbox: SharedLocationBbox | undefined): boolean =>
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
    await forgetSharedLocationEnds(deps.cache, accountId);
  } catch {
    return UNAVAILABLE;
  }
  return stopped;
}

/**
 * MON partage, tel que mes appareils le relisent (#18389) : la passerelle ne connaît qu'un
 * partage par compte, et c'est lui qui fait foi. La liste CHOISIE, sans verdict de loi (le
 * filtrer par cercle ou blocage trahirait qu'un destinataire a bloqué), sans les personnes
 * échues, et sans rien de la position : chaque appareil a la sienne.
 */
export async function ownSharedLocationFor(deps: SharedLocationRelayDeps, emitterId: string): Promise<SharedLocationOwnSnapshot> {
  const state = await readSharedLocation(deps.cache, emitterId, deps.now());
  if (!state) return { recipients: [], expiresAt: null };
  const recipients = liveRecipients(state, deps.now())
    .map((recipient) => ({ userId: recipient.userId.toLowerCase(), precision: recipient.precision, expiresAt: deadlineOf(state, recipient.userId) }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
  if (recipients.length === 0) return { recipients, expiresAt: null };
  return { recipients, expiresAt: state.expiresAt, shareBattery: state.shareBattery === true };
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
  const addressed = [...states].filter(([, state]) => liveRecipients(state, now).some((recipient) => recipient.userId.toLowerCase() === readerId.toLowerCase()));
  if (addressed.length === 0) return { items: [] };

  const allowed = await snapshotAllowed(deps, readerId, addressed.map(([emitterId]) => emitterId), now);
  const opened = addressed.flatMap(([emitterId, state]) => {
    const precision = recipientOf(state, readerId)?.precision;
    const circle = allowed.get(emitterId);
    const projection = projectSharedLocation(emitterId, state, precision && circle !== undefined ? { precision, circle } : 'none', readerId);
    return projection ? [{ emitterId, state, projection }] : [];
  });
  const seenBefore = await Promise.all(opened.map(async ({ emitterId, state }) => (await sharedLocationSeenAmong(deps.cache, emitterId, state.sessionId, [readerId])).length > 0));
  await Promise.all(opened.map(({ emitterId, state }) => markSharedLocationSeen(deps.cache, emitterId, state, [readerId], now)));
  const confirmed: ReadonlyMap<string, SharedLocationCircle | null> = opened.length > 0 ? await snapshotAllowed(deps, readerId, opened.map(({ emitterId }) => emitterId), now) : new Map();
  const lost = opened.filter(({ emitterId }) => !confirmed.has(emitterId));
  lost.filter((entry) => seenBefore[opened.indexOf(entry)]).forEach(({ emitterId }) => unserve(deps.io, readerId, emitterId));
  await Promise.all(lost.map(({ emitterId, state }) => unmarkSharedLocationSeen(deps.cache, emitterId, state.sessionId, [readerId])));
  const kept = opened.filter(({ emitterId }) => confirmed.has(emitterId));
  const current = await currentSharedLocationSessions(deps.cache, kept.map(({ emitterId }) => emitterId));
  const items = kept.filter(({ emitterId, state }) => current.get(emitterId) === state.sessionId).map(({ projection }) => projection);
  return { items: items.filter((item) => withinBbox(item, options.bbox)) };
}

/**
 * « Pas sur la carte » (#19202) : les partages qui servaient `readerId`, terminés depuis moins
 * d'un jour — qui, quand, son cercle, jamais une position. La loi `location.temporary` est relue
 * maintenant : rien sous Ami, rien à un bloqueur, rien d'un compte parti. Le fantôme global
 * (#19203) n'y entre pas : aucune position n'y voyage, et une fin qui disparaîtrait à son entrée
 * dirait « il est passé en fantôme ». L'heure d'un lecteur flouté tombe sur le quart d'heure,
 * comme celle de ses points.
 */
export async function sharedLocationEndedFor(deps: SharedLocationRelayDeps, readerId: string): Promise<readonly SharedLocationEndedItem[]> {
  const now = deps.now();
  const ends = await sharedLocationEndsFor(deps.cache, readerId, await snapshotCandidates(deps, readerId), now);
  if (ends.size === 0) return [];
  const allowed = await snapshotAllowed(deps, readerId, [...ends.keys()], now, { ghostHides: false });
  return [...ends]
    .flatMap(([emitterId, end]): SharedLocationEndedItem[] => {
      if (!allowed.has(emitterId)) return [];
      const circle = allowed.get(emitterId);
      return [{ userId: emitterId, endedAt: end.precision === 'exact' ? end.endsAt : roundedClock(end.endsAt), ...(circle ? { circle } : {}) }];
    })
    .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
}

/**
 * Les émetteurs dont la loi ouvre le partage à `readerId`, en une lecture groupée. Le
 * rattrapage la relit APRÈS avoir noté le lecteur servi (#16987, M1) : une baisse écrite
 * pendant la première lecture a pu envoyer sa fin avant que le lecteur soit noté, et la
 * réponse HTTP ne la contredit pas ; une baisse écrite après la relecture le trouve noté.
 * Un lecteur qui avait déjà reçu le point en direct et que la relecture retire reçoit la
 * fin : la baisse ne le trouvera plus parmi les servis. Qui n'avait rien vu n'apprend rien.
 * Rend, pour chaque émetteur ouvert, le cercle que la loi vient de juger (#17966). `ghostHides` éteint :
 * l'émetteur en fantôme (#19203) reste ouvert — la liste des partages terminés, sans position, n'en dépend pas.
 */
async function snapshotAllowed(
  deps: SharedLocationRelayDeps,
  readerId: string,
  emitterIds: readonly string[],
  now: number,
  options: { readonly ghostHides: boolean } = { ghostHides: true },
): Promise<ReadonlyMap<string, SharedLocationCircle | null>> {
  const [law, accounts] = await Promise.all([
    pairAccessAmong(deps.prisma, { feature: 'location.temporary', subjectId: readerId, otherIds: emitterIds, subjectIs: 'viewer', now: new Date(now), consentOf: () => 'granted' }),
    accountStates(deps.prisma, [readerId, ...emitterIds]),
  ]);
  return new Map(
    emitterIds
      .filter((emitterId) => accounts.usable.has(readerId) && (options.ghostHides ? emitting(accounts, emitterId) : accounts.usable.has(emitterId)) && law.get(emitterId)?.allowed === true)
      .map((emitterId) => [emitterId, circleOf(law.get(emitterId)?.effectiveLevel)] as const),
  );
}

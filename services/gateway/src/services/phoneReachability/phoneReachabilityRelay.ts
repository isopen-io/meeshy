/**
 * LE RELAIS DU TÉLÉPHONE INJOIGNABLE (#18737, TEL-01) — sur le modèle de `battery/batteryRelay.ts`.
 *
 * Chaque signe de vie du téléphone SUIVI (socket authentifiée, relevé de batterie, réponse à une
 * sonde) remet son horloge à zéro. Le balayage fait avancer `phoneReachabilityStep` (partagé) :
 * sans signe de vie, il SONDE le téléphone par un push silencieux ; deux sondes sans réponse le
 * déclarent injoignable depuis son dernier signe de vie. Chaque lecteur autorisé
 * (`phoneReachabilityAccess.ts`) reçoit alors, dans `user:<lecteur>` et par SON canal :
 *
 * - `socket` (il est « en conversation » avec l'émetteur) : l'annonce dans `phone:unreachable` /
 *   `phone:reachable` — la SyncPill ;
 * - `push` (hors conversation, et le retour pour qui a reçu le push) : une notification dédiée,
 *   l'état en silence par socket ;
 * - `none` : l'état se met à jour en silence.
 *
 * Rien ne part vers un lecteur que la loi refuse — pas même un effacement. JAMAIS un message de
 * conversation : rien n'entre dans `Message`.
 */
import { BATTERY_CONFIG } from '@meeshy/shared/types/battery';
import type { PhoneReachabilityAnnouncement, PhoneReachabilitySnapshot, PhoneReachabilityState } from '@meeshy/shared/types/phone-reachability';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { batteryReaderInConversation } from '@meeshy/shared/utils/battery-episode';
import { phoneReachabilityReaderChannel, phoneReachabilityStep, type PhoneReachabilityInput } from '@meeshy/shared/utils/phone-reachability';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { batteryCandidatesOf } from '../battery/batteryAccess';
import type { BatteryContextReader, BatteryReaderContext } from '../battery/batteryRelay';
import { phoneReachabilityAllowedAmong, type PhoneReachabilityDb } from './phoneReachabilityAccess';
import {
  clearReachability,
  forgetPushedReaders,
  readPushedReaders,
  readReachability,
  rememberPushedReaders,
  storeReachability,
  watchReachability,
  watchedReachability,
  withReachabilityLock,
  type ReachabilityCache,
  type StoredReachability,
} from './phoneReachabilityStore';

export type PhoneReachabilityPush = {
  readonly readerId: string;
  readonly emitterId: string;
  readonly announcement: PhoneReachabilityAnnouncement;
  /** L'état au moment de l'annonce d'injoignabilité ; absent pour le retour. */
  readonly state?: PhoneReachabilityState;
};

/** Rend `true` quand la notification a été créée (une préférence ou un blocage peuvent l'arrêter). */
export type PhoneReachabilityPusher = (push: PhoneReachabilityPush) => Promise<boolean>;

export type PhoneReachabilityPair = { readonly emitterId: string; readonly readerId: string };

export type PhoneReachabilityRelayDeps = {
  readonly prisma: PhoneReachabilityDb;
  readonly cache: ReachabilityCache;
  readonly io: ServerEmitIO | undefined;
  readonly now: () => number;
  readonly context: BatteryContextReader;
  readonly push: PhoneReachabilityPusher;
  /** Le push SILENCIEUX qui demande au téléphone de répondre (`POST /me/device/alive`). */
  readonly probe: (emitterId: string) => Promise<void>;
  /** La session est-elle celle du téléphone suivi (le même que celui de la batterie) ? */
  readonly isTrackedDevice: (params: { readonly userId: string; readonly sessionId: string | null }) => Promise<boolean>;
  /** La session du téléphone suivi MAINTENANT ; nulle quand le compte n'a plus de téléphone reconnu. */
  readonly trackedSession: (userId: string) => Promise<string | null>;
  /** Le téléphone suivi a-t-il une socket OUVERTE ? Une connexion vivante est un signe de vie. */
  readonly trackedDeviceConnected: (userId: string) => Promise<boolean>;
  /** Le dernier épisode de batterie connu était-il critique ou éteint ? Il fait la cause probable. */
  readonly batteryLow: (userId: string) => Promise<boolean>;
  /** Retire chez chaque lecteur les notifications d'injoignabilité d'un émetteur qu'il ne voit plus. */
  readonly retractPushes?: (pairs: readonly PhoneReachabilityPair[]) => Promise<void>;
};

const safely = (send: () => void): void => {
  try {
    send();
  } catch {
    /* rien : l'état est déjà rangé */
  }
};

const iso = (deps: PhoneReachabilityRelayDeps): string => new Date(deps.now()).toISOString();

/** L'état servi de l'émetteur — le même pour tout lecteur autorisé ; `null` quand il est joignable. */
export const servedPhoneReachability = (userId: string, record: StoredReachability | null): PhoneReachabilityState | null =>
  record?.unreachableSince && record.cause ? { userId, unreachableSince: record.unreachableSince, cause: record.cause } : null;

const emitUnreachable = (deps: PhoneReachabilityRelayDeps, readerId: string, state: PhoneReachabilityState, announcement?: PhoneReachabilityAnnouncement): void =>
  safely(() => deps.io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.PHONE_UNREACHABLE, { userId: state.userId, state, ...(announcement ? { announcement } : {}) }));

const emitReachable = (deps: PhoneReachabilityRelayDeps, readerId: string, emitterId: string, announcement?: PhoneReachabilityAnnouncement): void =>
  safely(() => deps.io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.PHONE_REACHABLE, { userId: emitterId, ...(announcement ? { announcement } : {}) }));

async function audienceOf(deps: PhoneReachabilityRelayDeps, emitterId: string): Promise<ReadonlySet<string>> {
  const candidates = await batteryCandidatesOf(deps.prisma, emitterId);
  if (candidates.length === 0) return new Set();
  return phoneReachabilityAllowedAmong(deps.prisma, { subjectId: emitterId, otherIds: candidates, subjectIs: 'target', now: new Date(deps.now()) });
}

async function retract(deps: PhoneReachabilityRelayDeps, pairs: readonly PhoneReachabilityPair[]): Promise<void> {
  if (pairs.length === 0 || !deps.retractPushes) return;
  await deps.retractPushes(pairs).catch(() => undefined);
}

async function inConversation(deps: PhoneReachabilityRelayDeps, emitterId: string, readerIds: readonly string[]): Promise<ReadonlyMap<string, boolean>> {
  if (readerIds.length === 0) return new Map();
  const now = iso(deps);
  const contexts = await deps.context({ emitterId, readerIds, now: new Date(deps.now()) }).catch(() => new Map<string, BatteryReaderContext>());
  return new Map(readerIds.map((id) => {
    const context = contexts.get(id);
    return [id, batteryReaderInConversation({
      now,
      roomOpen: context?.roomOpen ?? false,
      lastExchangeAt: context?.lastExchangeAt ?? null,
      awaitingReply: context?.awaitingReply ?? false,
    }, BATTERY_CONFIG)] as const;
  }));
}

/** L'injoignabilité vers chaque lecteur, par SON canal. Rend ceux qui ont reçu le push. */
async function fanOutUnreachable(deps: PhoneReachabilityRelayDeps, state: PhoneReachabilityState, announcement: PhoneReachabilityAnnouncement, audience: readonly string[]): Promise<readonly string[]> {
  const conversing = await inConversation(deps, state.userId, audience);
  const pushed = await Promise.all(audience.map(async (readerId) => {
    const channel = phoneReachabilityReaderChannel({ kind: 'unreachable', inConversation: conversing.get(readerId) === true, receivedUnreachablePush: false });
    emitUnreachable(deps, readerId, state, channel === 'socket' ? announcement : undefined);
    if (channel !== 'push') return null;
    return (await deps.push({ readerId, emitterId: state.userId, announcement, state }).catch(() => false)) ? readerId : null;
  }));
  return pushed.filter((id): id is string => id !== null);
}

/** Le retour : l'effacement vers qui voyait, l'annonce par le canal de chacun parmi ceux qui voient encore. */
async function fanOutReachable(deps: PhoneReachabilityRelayDeps, emitterId: string, announcement: PhoneReachabilityAnnouncement, servedTo: readonly string[]): Promise<void> {
  const [audience, pushed] = await Promise.all([audienceOf(deps, emitterId), readPushedReaders(deps.cache, emitterId)]);
  const stillSeeing = servedTo.filter((id) => audience.has(id));
  const departed = servedTo.filter((id) => !audience.has(id));
  departed.forEach((readerId) => emitReachable(deps, readerId, emitterId));
  await retract(deps, departed.map((readerId) => ({ emitterId, readerId })));
  const conversing = await inConversation(deps, emitterId, stillSeeing);
  await Promise.all(stillSeeing.map(async (readerId) => {
    const channel = phoneReachabilityReaderChannel({ kind: 'reachable', inConversation: conversing.get(readerId) === true, receivedUnreachablePush: pushed.has(readerId) });
    emitReachable(deps, readerId, emitterId, channel === 'socket' ? announcement : undefined);
    if (channel === 'push') await deps.push({ readerId, emitterId, announcement }).catch(() => false);
  }));
  await forgetPushedReaders(deps.cache, emitterId);
}

const record = (previous: StoredReachability | null, state: Omit<StoredReachability, 'servedTo'>, servedTo?: readonly string[]): StoredReachability => ({
  ...state,
  servedTo: servedTo ?? previous?.servedTo ?? [],
});

/** La coupure globale ferme aussi la COLLECTE : rien n'est rangé de ce que l'émetteur ne partage plus. */
async function sharingDisabled(deps: PhoneReachabilityRelayDeps, emitterId: string): Promise<boolean> {
  const row = (await deps.prisma.user.findUnique({ where: { id: emitterId }, select: { unreachableSharingDisabledAt: true } })) as { readonly unreachableSharingDisabledAt?: Date | null } | null;
  return Boolean(row?.unreachableSharingDisabledAt);
}

async function stepAlive(deps: PhoneReachabilityRelayDeps, userId: string, input: Extract<PhoneReachabilityInput, { kind: 'alive' }>): Promise<void> {
  const back = await withReachabilityLock(deps.cache, userId, async () => {
    if (await sharingDisabled(deps, userId)) return null;
    const previous = await readReachability(deps.cache, userId);
    const { state, announcement } = phoneReachabilityStep(previous, input);
    await storeReachability(deps.cache, userId, record(previous, state, announcement ? [] : undefined));
    await watchReachability(deps.cache, userId, true);
    return announcement ? { announcement, servedTo: previous?.servedTo ?? [] } : null;
  });
  if (back) await fanOutReachable(deps, userId, back.announcement, back.servedTo);
}

/**
 * Un SIGNE DE VIE du téléphone suivi : une socket authentifiée, un relevé de batterie, ou la
 * réponse à une sonde (`answer`). Rend `false` quand la session n'est pas le téléphone suivi —
 * un ordinateur qui se connecte ne dit rien du téléphone. LÈVE si l'état ne se range pas.
 */
export async function notePhoneAlive(
  deps: PhoneReachabilityRelayDeps,
  params: { readonly userId: string; readonly sessionId: string | null; readonly answer?: boolean },
): Promise<boolean> {
  if (!(await deps.isTrackedDevice(params))) return false;
  await stepAlive(deps, params.userId, { kind: 'alive', at: iso(deps), answer: params.answer === true, sessionId: params.sessionId });
  return true;
}

/** Plus personne ne peut lire : l'état et la surveillance s'effacent, le prochain signe de vie les recrée. */
async function dropWatch(deps: PhoneReachabilityRelayDeps, emitterId: string): Promise<void> {
  await clearReachability(deps.cache, emitterId);
  await forgetPushedReaders(deps.cache, emitterId);
  await watchReachability(deps.cache, emitterId, false);
}

type TickOutcome = 'idle' | 'alive' | 'probed' | 'unreachable' | 'dropped';

/**
 * PENDANT la panne, l'audience se relit à chaque passe : qui a perdu l'accès par un chemin qu'aucun
 * crochet ne suit (suppression de compte, baisse future) reçoit l'effacement maintenant, et ses
 * notifications se retirent — il n'apprendra pas l'heure du retour.
 */
async function reconcileOutageLocked(deps: PhoneReachabilityRelayDeps, emitterId: string, previous: StoredReachability): Promise<{ readonly outcome: TickOutcome; readonly fanOut?: () => Promise<void> }> {
  if (previous.servedTo.length === 0) return { outcome: 'idle' };
  const audience = await audienceOf(deps, emitterId);
  const departed = previous.servedTo.filter((id) => !audience.has(id));
  if (departed.length === 0) return { outcome: 'idle' };
  await storeReachability(deps.cache, emitterId, { ...previous, servedTo: previous.servedTo.filter((id) => audience.has(id)) });
  return {
    outcome: 'idle',
    fanOut: async () => {
      departed.forEach((readerId) => emitReachable(deps, readerId, emitterId));
      await retract(deps, departed.map((readerId) => ({ emitterId, readerId })));
    },
  };
}

async function tickLocked(deps: PhoneReachabilityRelayDeps, emitterId: string): Promise<{ readonly outcome: TickOutcome; readonly fanOut?: () => Promise<void> }> {
  const previous = await readReachability(deps.cache, emitterId);
  if (!previous) {
    await watchReachability(deps.cache, emitterId, false);
    return { outcome: 'idle' };
  }
  if (previous.unreachableSince !== null) return reconcileOutageLocked(deps, emitterId, previous);
  const now = iso(deps);
  const due = phoneReachabilityStep(previous, { kind: 'tick', now, batteryLow: false });
  if (!due.probe && !due.announcement) return { outcome: 'idle' };
  const tracked = await deps.trackedSession(emitterId);
  if (tracked === null) {
    await dropWatch(deps, emitterId);
    return { outcome: 'dropped' };
  }
  if (await deps.trackedDeviceConnected(emitterId)) {
    const { state } = phoneReachabilityStep(previous, { kind: 'alive', at: now, sessionId: tracked });
    await storeReachability(deps.cache, emitterId, record(previous, state));
    return { outcome: 'alive' };
  }
  const proofHolder = tracked === previous.sessionId ? previous : { ...previous, lastAnsweredAt: null, sessionId: tracked };
  const blind = phoneReachabilityStep(proofHolder, { kind: 'tick', now, batteryLow: false });
  if (!blind.probe && !blind.announcement) {
    await storeReachability(deps.cache, emitterId, record(previous, blind.state));
    return { outcome: 'idle' };
  }
  const audience = await audienceOf(deps, emitterId);
  if (audience.size === 0) {
    await dropWatch(deps, emitterId);
    return { outcome: 'dropped' };
  }
  if (blind.probe) {
    await storeReachability(deps.cache, emitterId, record(previous, blind.state));
    return { outcome: 'probed', fanOut: () => deps.probe(emitterId).catch(() => undefined) };
  }
  const { state, announcement } = phoneReachabilityStep(proofHolder, { kind: 'tick', now, batteryLow: await deps.batteryLow(emitterId).catch(() => false) });
  const readers = [...audience];
  await storeReachability(deps.cache, emitterId, record(previous, state, readers));
  const served = servedPhoneReachability(emitterId, { ...state, servedTo: readers });
  if (!served || !announcement) return { outcome: 'idle' };
  return {
    outcome: 'unreachable',
    fanOut: async () => {
      if (!(await stillDeclared(deps, served))) return;
      await forgetPushedReaders(deps.cache, emitterId);
      const pushed = await fanOutUnreachable(deps, served, announcement, readers);
      if (await stillDeclared(deps, served)) {
        await rememberPushedReaders(deps.cache, emitterId, pushed);
        return;
      }
      readers.forEach((readerId) => emitReachable(deps, readerId, emitterId));
      await retract(deps, pushed.map((readerId) => ({ emitterId, readerId })));
    },
  };
}

/**
 * Un retour arrivé entre la déclaration et l'éventail l'annule : rien de périmé ne part ; s'il arrive
 * PENDANT l'éventail, le dernier mot chez chaque lecteur atteint est l'effacement, et les notifications
 * poussées se retirent.
 */
async function stillDeclared(deps: PhoneReachabilityRelayDeps, served: PhoneReachabilityState): Promise<boolean> {
  return servedPhoneReachability(served.userId, await readReachability(deps.cache, served.userId))?.unreachableSince === served.unreachableSince;
}

/**
 * Le BALAYAGE : chaque émetteur surveillé reçoit un `tick`. Idempotent — un téléphone déjà déclaré
 * injoignable ne ré-annonce rien, et un téléphone dont la socket est ouverte n'est jamais sondé.
 * Rend le nombre de téléphones déclarés injoignables par cette passe.
 */
export async function sweepPhoneReachability(deps: PhoneReachabilityRelayDeps): Promise<number> {
  const emitters = await watchedReachability(deps.cache);
  const outcomes = await Promise.all(emitters.map(async (emitterId) => {
    const step = await withReachabilityLock(deps.cache, emitterId, () => tickLocked(deps, emitterId));
    await step.fanOut?.();
    return step.outcome;
  }));
  return outcomes.filter((outcome) => outcome === 'unreachable').length;
}

/** Ce que `readerId` voit, à la connexion : les téléphones injoignables de ceux qui le lui partagent. */
/**
 * Ce que `readerId` voit, à la connexion : les téléphones injoignables de ceux qui le lui partagent.
 * La loi est jugée sur TOUS les candidats avant toute lecture d'état : le travail ne dit pas si un
 * lien est injoignable (aucun oracle de durée).
 */
export async function phoneReachabilitySnapshotFor(deps: PhoneReachabilityRelayDeps, readerId: string): Promise<PhoneReachabilitySnapshot> {
  const candidates = await batteryCandidatesOf(deps.prisma, readerId);
  if (candidates.length === 0) return { items: [] };
  const allowed = await phoneReachabilityAllowedAmong(deps.prisma, { subjectId: readerId, otherIds: candidates, subjectIs: 'viewer', now: new Date(deps.now()) });
  const states = await Promise.all([...allowed].map(async (id) => servedPhoneReachability(id, await readReachability(deps.cache, id))));
  return { items: states.filter((state): state is PhoneReachabilityState => state !== null) };
}

async function sees(deps: PhoneReachabilityRelayDeps, emitterId: string, readerId: string): Promise<boolean> {
  return (await phoneReachabilityAllowedAmong(deps.prisma, { subjectId: emitterId, otherIds: [readerId], subjectIs: 'target', now: new Date(deps.now()) })).has(readerId);
}

/** L'état de `emitterId` tel que `readerId` le voit — `null` quand il est joignable ou que la loi refuse. */
/** La loi est jugée AVANT la lecture de l'état, toujours : la durée ne dit rien de l'état. */
export async function phoneReachabilityStateFor(deps: PhoneReachabilityRelayDeps, params: { readonly readerId: string; readonly emitterId: string }): Promise<PhoneReachabilityState | null> {
  if (!(await sees(deps, params.emitterId, params.readerId))) return null;
  return servedPhoneReachability(params.emitterId, await readReachability(deps.cache, params.emitterId));
}

/** Ce que chaque sens d'une paire voit MAINTENANT (`émetteur>lecteur`), pour les seuls téléphones injoignables. */
export type PhoneReachabilityPairAccess = ReadonlyMap<string, boolean>;

const directions = (userA: string, userB: string) => [[userA, userB], [userB, userA]] as const;
const directionKey = (emitterId: string, readerId: string): string => `${emitterId}>${readerId}`;

/** À capturer AVANT une baisse, un blocage ou un retrait : l'effacement ne part que vers qui VOYAIT. */
export async function capturePhoneReachabilityAccess(deps: PhoneReachabilityRelayDeps, pair: { readonly userA: string; readonly userB: string }): Promise<PhoneReachabilityPairAccess> {
  const seen = new Map<string, boolean>();
  for (const [emitterId, readerId] of directions(pair.userA, pair.userB)) {
    const [allowed, stored] = await Promise.all([sees(deps, emitterId, readerId), readReachability(deps.cache, emitterId)]);
    if (servedPhoneReachability(emitterId, stored)) seen.set(directionKey(emitterId, readerId), allowed);
  }
  return seen;
}

async function adjustServed(deps: PhoneReachabilityRelayDeps, emitterId: string, change: { readonly add?: readonly string[]; readonly remove?: readonly string[] }): Promise<void> {
  await withReachabilityLock(deps.cache, emitterId, async () => {
    const stored = await readReachability(deps.cache, emitterId);
    if (!stored) return;
    const removed = new Set(change.remove ?? []);
    const servedTo = [...new Set([...stored.servedTo, ...(change.add ?? [])])].filter((id) => !removed.has(id));
    await storeReachability(deps.cache, emitterId, { ...stored, servedTo });
  });
}

/**
 * Rejoue la projection d'une paire dans les DEUX sens après un changement de lien, de consentement
 * ou de blocage : `phone:unreachable` vers qui gagne l'accès, `phone:reachable` (effacement) vers qui
 * voyait et ne voit plus. Qui perd l'accès perd aussi les notifications d'injoignabilité de l'autre.
 */
export async function refreshPhoneReachabilityBetween(
  deps: PhoneReachabilityRelayDeps,
  params: { readonly userA: string; readonly userB: string; readonly before?: PhoneReachabilityPairAccess },
): Promise<void> {
  for (const [emitterId, readerId] of directions(params.userA, params.userB)) {
    const after = await sees(deps, emitterId, readerId);
    if (!after) await retract(deps, [{ emitterId, readerId }]);
    await withReachabilityLock(deps.cache, emitterId, async () => {
      const stored = await readReachability(deps.cache, emitterId);
      const state = servedPhoneReachability(emitterId, stored);
      if (!state || !stored) return;
      const before = (params.before?.get(directionKey(emitterId, readerId)) ?? false) || stored.servedTo.includes(readerId);
      if (after && !before) {
        emitUnreachable(deps, readerId, state);
        await storeReachability(deps.cache, emitterId, { ...stored, servedTo: [...new Set([...stored.servedTo, readerId])] });
      } else if (!after && before) {
        emitReachable(deps, readerId, emitterId);
        await storeReachability(deps.cache, emitterId, { ...stored, servedTo: stored.servedTo.filter((id) => id !== readerId) });
      }
    });
  }
}

/** Les lecteurs qui voient l'état de `emitterId` MAINTENANT — à capturer avant une coupure globale. */
export async function capturePhoneReachabilityAudience(deps: PhoneReachabilityRelayDeps, emitterId: string): Promise<ReadonlySet<string>> {
  if (!servedPhoneReachability(emitterId, await readReachability(deps.cache, emitterId))) return new Set();
  return audienceOf(deps, emitterId);
}

/** Rejoue l'audience ENTIÈRE d'un émetteur après sa coupure ou sa reprise globale, sous son verrou. */
export async function refreshPhoneReachabilityAudience(deps: PhoneReachabilityRelayDeps, params: { readonly emitterId: string; readonly before: ReadonlySet<string> }): Promise<void> {
  const after = await audienceOf(deps, params.emitterId);
  const candidates = await batteryCandidatesOf(deps.prisma, params.emitterId);
  await retract(deps, candidates.filter((id) => !after.has(id)).map((readerId) => ({ emitterId: params.emitterId, readerId })));
  await withReachabilityLock(deps.cache, params.emitterId, async () => {
    const stored = await readReachability(deps.cache, params.emitterId);
    const state = servedPhoneReachability(params.emitterId, stored);
    if (!state || !stored) return;
    const seen = new Set([...params.before, ...stored.servedTo]);
    [...after].filter((id) => !seen.has(id)).forEach((id) => emitUnreachable(deps, id, state));
    [...seen].filter((id) => !after.has(id)).forEach((id) => emitReachable(deps, id, params.emitterId));
    await storeReachability(deps.cache, params.emitterId, { ...stored, servedTo: [...after] });
  });
}

/** La COUPURE GLOBALE (le fantôme) ferme aussi ce qui est rangé : l'horloge, la mémoire des pushs, la surveillance. */
export async function forgetPhoneReachabilityOf(deps: PhoneReachabilityRelayDeps, emitterId: string): Promise<void> {
  await withReachabilityLock(deps.cache, emitterId, () => dropWatch(deps, emitterId));
}

/**
 * Un compte a perdu des accès HORS des routes de lien (rôle d'équipe retiré, compte désactivé) :
 * comme émetteur, qui voyait son état et ne le voit plus reçoit son effacement ; comme lecteur,
 * chaque émetteur qui le lui servait le lui retire.
 */
export async function reconcilePhoneReachabilityOfAccount(deps: PhoneReachabilityRelayDeps, userId: string): Promise<void> {
  const own = await readReachability(deps.cache, userId);
  if (own && own.servedTo.length > 0) {
    const audience = await audienceOf(deps, userId);
    const departed = own.servedTo.filter((id) => !audience.has(id));
    departed.forEach((readerId) => emitReachable(deps, readerId, userId));
    await retract(deps, departed.map((readerId) => ({ emitterId: userId, readerId })));
    if (departed.length > 0) await adjustServed(deps, userId, { remove: departed });
  }
  const emitters = await batteryCandidatesOf(deps.prisma, userId);
  if (emitters.length === 0) return;
  const allowed = await phoneReachabilityAllowedAmong(deps.prisma, { subjectId: userId, otherIds: emitters, subjectIs: 'viewer', now: new Date(deps.now()) });
  const lost = emitters.filter((emitterId) => !allowed.has(emitterId));
  for (const emitterId of lost) {
    const stored = await readReachability(deps.cache, emitterId);
    if (!stored?.servedTo.includes(userId)) continue;
    emitReachable(deps, userId, emitterId);
    await adjustServed(deps, emitterId, { remove: [userId] });
  }
  await retract(deps, lost.map((emitterId) => ({ emitterId, readerId: userId })));
}

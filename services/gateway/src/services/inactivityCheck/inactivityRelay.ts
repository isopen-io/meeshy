/**
 * LE RELAIS DE LA VÉRIFICATION D'INACTIVITÉ (#18738, TEL-02) — sur le modèle du téléphone
 * injoignable (`phoneReachability/phoneReachabilityRelay.ts`).
 *
 * L'ACTIVITÉ est celle du téléphone SUIVI de la personne (sa socket authentifiée, ou ouverte au
 * balayage) et sa réponse « Je vais bien » (`POST /me/wellness/ok`, de n'importe lequel de ses
 * appareils). Les sondes silencieuses et les relevés de batterie, faits en arrière-plan sans elle,
 * n'en sont pas. Le balayage fait avancer `inactivityCheckStep` (partagé) :
 *
 * 1. après le délai choisi, la personne reçoit « Tout va bien ? » — une notification VISIBLE, à elle seule ;
 * 2. sans réponse dans la fenêtre, chaque Sang autorisé (`inactivityAccess.ts`) reçoit dans
 *    `user:<Sang>` l'état (`inactivity:alert`, avec l'annonce) et la notification poussée — une
 *    alerte de sécurité part par les deux canaux, en conversation ou non ;
 * 3. la première activité qui suit annonce le retour aux mêmes Sangs (`inactivity:cleared`).
 *
 * La dernière position et la dernière batterie ne sont servies qu'au Sang qui les reçoit DÉJÀ —
 * chacune est jugée par sa propre loi, lecteur par lecteur. Rien ne part vers un lecteur que la loi
 * refuse, pas même un effacement. JAMAIS un message de conversation.
 */
import type {
  InactivityAlertState,
  InactivityAnnouncement,
  InactivityLastBattery,
  InactivityLastPosition,
  InactivitySnapshot,
} from '@meeshy/shared/types/inactivity-check';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { inactivityCheckStep } from '@meeshy/shared/utils/inactivity-check';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { batteryCandidatesOf } from '../battery/batteryAccess';
import { inactivityAllowedAmong, type InactivityDb } from './inactivityAccess';
import { readInactivityDelay } from './inactivitySettings';
import {
  clearInactivity,
  readInactivity,
  storeInactivity,
  watchInactivity,
  watchedInactivity,
  withInactivityLock,
  type InactivityCache,
  type StoredInactivity,
} from './inactivityStore';

export type InactivityPush = {
  readonly readerId: string;
  readonly emitterId: string;
  readonly announcement: InactivityAnnouncement;
  /** L'état servi à CE lecteur au moment de l'alerte ; absent pour le retour. */
  readonly state?: InactivityAlertState;
};

export type InactivityPair = { readonly emitterId: string; readonly readerId: string };

export type InactivityRelayDeps = {
  readonly prisma: InactivityDb;
  readonly cache: InactivityCache;
  readonly io: ServerEmitIO | undefined;
  readonly now: () => number;
  /** La session est-elle celle du téléphone suivi (le même que celui de la batterie) ? */
  readonly isTrackedDevice: (params: { readonly userId: string; readonly sessionId: string | null }) => Promise<boolean>;
  /** La session du téléphone suivi MAINTENANT ; nulle quand le compte n'a plus de téléphone reconnu. */
  readonly trackedSession: (userId: string) => Promise<string | null>;
  /** Le téléphone suivi a-t-il une socket OUVERTE ? L'app au premier plan est une activité. */
  readonly trackedDeviceConnected: (userId: string) => Promise<boolean>;
  /** « Tout va bien ? » — la notification visible adressée à la personne. */
  readonly askWellness: (userId: string, params: { readonly inactiveSince: string; readonly delayHours: number }) => Promise<void>;
  /** Retire la question une fois répondue : la personne ne garde pas une question périmée. */
  readonly retractWellness: (userId: string) => Promise<void>;
  /** L'alerte ou le retour vers UN Sang ; rend `true` quand la notification a été créée. */
  readonly push: (push: InactivityPush) => Promise<boolean>;
  /** Retire chez chaque lecteur les notifications d'inactivité d'une personne qu'il ne voit plus. */
  readonly retractAlerts?: (pairs: readonly InactivityPair[]) => Promise<void>;
  /** La dernière position de `emitterId` telle que `readerId` la reçoit DÉJÀ ; `null` sinon. */
  readonly lastPositionFor: (emitterId: string, readerId: string) => Promise<InactivityLastPosition | null>;
  /** La dernière batterie de `emitterId` telle que `readerId` la reçoit DÉJÀ ; `null` sinon. */
  readonly lastBatteryFor: (emitterId: string, readerId: string) => Promise<InactivityLastBattery | null>;
};

const safely = (send: () => void): void => {
  try {
    send();
  } catch {
    /* rien : l'état est déjà rangé */
  }
};

const iso = (deps: InactivityRelayDeps): string => new Date(deps.now()).toISOString();

const emitAlert = (deps: InactivityRelayDeps, readerId: string, state: InactivityAlertState, announcement?: InactivityAnnouncement): void =>
  safely(() => deps.io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.INACTIVITY_ALERT, { userId: state.userId, state, ...(announcement ? { announcement } : {}) }));

const emitCleared = (deps: InactivityRelayDeps, readerId: string, emitterId: string, announcement?: InactivityAnnouncement): void =>
  safely(() => deps.io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.INACTIVITY_CLEARED, { userId: emitterId, ...(announcement ? { announcement } : {}) }));

async function audienceOf(deps: InactivityRelayDeps, emitterId: string): Promise<ReadonlySet<string>> {
  const candidates = await batteryCandidatesOf(deps.prisma, emitterId);
  if (candidates.length === 0) return new Set();
  return inactivityAllowedAmong(deps.prisma, { subjectId: emitterId, otherIds: candidates, subjectIs: 'target', now: new Date(deps.now()) });
}

async function sees(deps: InactivityRelayDeps, emitterId: string, readerId: string): Promise<boolean> {
  return (await inactivityAllowedAmong(deps.prisma, { subjectId: emitterId, otherIds: [readerId], subjectIs: 'target', now: new Date(deps.now()) })).has(readerId);
}

async function retract(deps: InactivityRelayDeps, pairs: readonly InactivityPair[]): Promise<void> {
  if (pairs.length === 0 || !deps.retractAlerts) return;
  await deps.retractAlerts(pairs).catch(() => undefined);
}

const alertedAtOf = (stored: StoredInactivity | null): string | null => (stored?.phase === 'alerted' ? stored.alertedAt ?? null : null);

/** L'état servi à UN lecteur : ce que sa loi de position et sa loi de batterie lui ouvrent déjà. */
async function servedStateFor(deps: InactivityRelayDeps, emitterId: string, readerId: string, stored: StoredInactivity | null): Promise<InactivityAlertState | null> {
  const alertedAt = alertedAtOf(stored);
  if (!stored?.lastActivityAt || !alertedAt) return null;
  const [position, battery] = await Promise.all([
    deps.lastPositionFor(emitterId, readerId).catch(() => null),
    deps.lastBatteryFor(emitterId, readerId).catch(() => null),
  ]);
  return {
    userId: emitterId,
    inactiveSince: stored.lastActivityAt,
    alertedAt,
    ...(position ? { lastPosition: position } : {}),
    ...(battery ? { lastBattery: battery } : {}),
  };
}

/** Plus personne ne peut être prévenu, ou la vérification est coupée : l'état et la surveillance s'effacent. */
async function dropWatch(deps: InactivityRelayDeps, userId: string): Promise<void> {
  await clearInactivity(deps.cache, userId);
  await watchInactivity(deps.cache, userId, false);
}

async function fanOutResponded(deps: InactivityRelayDeps, emitterId: string, announcement: InactivityAnnouncement, alertedTo: readonly string[]): Promise<void> {
  const audience = await audienceOf(deps, emitterId);
  const departed = alertedTo.filter((id) => !audience.has(id));
  departed.forEach((readerId) => emitCleared(deps, readerId, emitterId));
  await retract(deps, departed.map((readerId) => ({ emitterId, readerId })));
  await Promise.all(alertedTo.filter((id) => audience.has(id)).map(async (readerId) => {
    emitCleared(deps, readerId, emitterId, announcement);
    await deps.push({ readerId, emitterId, announcement }).catch(() => false);
  }));
}

/**
 * Une ACTIVITÉ de la personne. Rend `false` quand elle ne compte pas : une session qui n'est pas le
 * téléphone suivi, sauf `anyDevice` (« Je vais bien » répondu depuis n'importe lequel de ses
 * appareils). LÈVE si l'état ne se range pas.
 */
export async function noteInactivityActivity(
  deps: InactivityRelayDeps,
  params: { readonly userId: string; readonly sessionId: string | null; readonly anyDevice?: boolean },
): Promise<boolean> {
  if (params.anyDevice !== true && !(await deps.isTrackedDevice(params))) return false;
  const at = iso(deps);
  const outcome = await withInactivityLock(deps.cache, params.userId, async () => {
    if ((await readInactivityDelay(deps.prisma, params.userId)) === null) {
      await dropWatch(deps, params.userId);
      return null;
    }
    const previous = await readInactivity(deps.cache, params.userId);
    const { state, announcement } = inactivityCheckStep(previous, { kind: 'activity', at });
    await storeInactivity(deps.cache, params.userId, { ...state, alertedTo: announcement ? [] : previous?.alertedTo ?? [] });
    await watchInactivity(deps.cache, params.userId, true);
    return { wasAsked: previous !== null && previous.phase !== 'idle' && state.phase === 'idle', announcement, alertedTo: previous?.alertedTo ?? [] };
  });
  if (outcome?.wasAsked) await deps.retractWellness(params.userId).catch(() => undefined);
  if (outcome?.announcement) await fanOutResponded(deps, params.userId, outcome.announcement, outcome.alertedTo);
  return true;
}

type TickResult = { readonly alerted: boolean; readonly fanOut?: () => Promise<void> };
const IDLE: TickResult = { alerted: false };

async function tickLocked(deps: InactivityRelayDeps, userId: string): Promise<TickResult> {
  const previous = await readInactivity(deps.cache, userId);
  if (!previous) {
    await watchInactivity(deps.cache, userId, false);
    return IDLE;
  }
  const delayHours = await readInactivityDelay(deps.prisma, userId);
  if (delayHours === null) {
    await dropWatch(deps, userId);
    return IDLE;
  }
  const now = iso(deps);
  const due = inactivityCheckStep(previous, { kind: 'tick', now, delayHours });
  if (!due.ask && !due.announcement) return IDLE;
  if ((await deps.trackedSession(userId)) === null) {
    await dropWatch(deps, userId);
    return IDLE;
  }
  if (await deps.trackedDeviceConnected(userId)) {
    const { state } = inactivityCheckStep(previous, { kind: 'activity', at: now });
    await storeInactivity(deps.cache, userId, { ...state, alertedTo: previous.alertedTo });
    return previous.phase === 'asked' ? { alerted: false, fanOut: () => deps.retractWellness(userId).catch(() => undefined) } : IDLE;
  }
  const audience = await audienceOf(deps, userId);
  if (audience.size === 0) {
    await dropWatch(deps, userId);
    return IDLE;
  }
  if (due.ask) {
    await storeInactivity(deps.cache, userId, { ...due.state, alertedTo: [] });
    const inactiveSince = previous.lastActivityAt ?? now;
    return { alerted: false, fanOut: () => deps.askWellness(userId, { inactiveSince, delayHours }).catch(() => undefined) };
  }
  const announcement = due.announcement;
  if (!announcement) return IDLE;
  const readers = [...audience];
  const stored: StoredInactivity = { ...due.state, alertedAt: announcement.at, alertedTo: readers };
  await storeInactivity(deps.cache, userId, stored);
  return {
    alerted: true,
    fanOut: async () => {
      await Promise.all(readers.map(async (readerId) => {
        const state = await servedStateFor(deps, userId, readerId, stored);
        if (!state) return;
        emitAlert(deps, readerId, state, announcement);
        await deps.push({ readerId, emitterId: userId, announcement, state }).catch(() => false);
      }));
    },
  };
}

/**
 * Le BALAYAGE : chaque personne surveillée reçoit un `tick`. Idempotent — une question posée ne se
 * repose pas, une alerte partie ne repart pas. Rend le nombre d'alertes parties par cette passe.
 */
export async function sweepInactivity(deps: InactivityRelayDeps): Promise<number> {
  const users = await watchedInactivity(deps.cache);
  const results = await Promise.all(users.map(async (userId) => {
    const step = await withInactivityLock(deps.cache, userId, () => tickLocked(deps, userId));
    await step.fanOut?.();
    return step.alerted;
  }));
  return results.filter(Boolean).length;
}

/**
 * Ce que `readerId` voit, à la connexion : les alertes en cours de ceux qui le lui partagent. La loi
 * est jugée sur TOUS les candidats avant toute lecture d'état.
 */
export async function inactivitySnapshotFor(deps: InactivityRelayDeps, readerId: string): Promise<InactivitySnapshot> {
  const candidates = await batteryCandidatesOf(deps.prisma, readerId);
  if (candidates.length === 0) return { items: [] };
  const allowed = await inactivityAllowedAmong(deps.prisma, { subjectId: readerId, otherIds: candidates, subjectIs: 'viewer', now: new Date(deps.now()) });
  const states = await Promise.all([...allowed].map(async (id) => servedStateFor(deps, id, readerId, await readInactivity(deps.cache, id))));
  return { items: states.filter((state): state is InactivityAlertState => state !== null) };
}

const directions = (userA: string, userB: string) => [[userA, userB], [userB, userA]] as const;

/**
 * Rejoue une paire dans les DEUX sens après un changement de lien, de consentement ou de blocage :
 * l'alerte en cours vers qui gagne l'accès, l'effacement (et le retrait de la notification) vers qui
 * la voyait et ne la voit plus.
 */
export async function refreshInactivityBetween(deps: InactivityRelayDeps, params: { readonly userA: string; readonly userB: string }): Promise<void> {
  for (const [emitterId, readerId] of directions(params.userA, params.userB)) {
    const after = await sees(deps, emitterId, readerId);
    if (!after) await retract(deps, [{ emitterId, readerId }]);
    const gained = await withInactivityLock(deps.cache, emitterId, async () => {
      const stored = await readInactivity(deps.cache, emitterId);
      if (!alertedAtOf(stored) || !stored) return null;
      const before = stored.alertedTo.includes(readerId);
      if (after && !before) {
        await storeInactivity(deps.cache, emitterId, { ...stored, alertedTo: [...stored.alertedTo, readerId] });
        return stored;
      }
      if (!after && before) {
        emitCleared(deps, readerId, emitterId);
        await storeInactivity(deps.cache, emitterId, { ...stored, alertedTo: stored.alertedTo.filter((id) => id !== readerId) });
      }
      return null;
    });
    const state = gained ? await servedStateFor(deps, emitterId, readerId, gained) : null;
    if (state) emitAlert(deps, readerId, state);
  }
}

/**
 * Après la coupure ou la reprise globale de la personne : coupée, l'alerte s'efface chez tous ceux
 * qui la voyaient et l'état s'oublie ; reprise, rien n'est en cours, rien à rejouer.
 */
export async function refreshInactivityAudience(deps: InactivityRelayDeps, emitterId: string): Promise<void> {
  if ((await readInactivityDelay(deps.prisma, emitterId)) !== null) return;
  const alertedTo = await withInactivityLock(deps.cache, emitterId, async () => {
    const stored = await readInactivity(deps.cache, emitterId);
    await dropWatch(deps, emitterId);
    return alertedAtOf(stored) ? stored?.alertedTo ?? [] : [];
  });
  alertedTo.forEach((readerId) => emitCleared(deps, readerId, emitterId));
  await retract(deps, alertedTo.map((readerId) => ({ emitterId, readerId })));
  await deps.retractWellness(emitterId).catch(() => undefined);
}

async function removeReader(deps: InactivityRelayDeps, emitterId: string, readerIds: readonly string[]): Promise<readonly string[]> {
  return withInactivityLock(deps.cache, emitterId, async () => {
    const stored = await readInactivity(deps.cache, emitterId);
    if (!stored) return [];
    const removed = stored.alertedTo.filter((id) => readerIds.includes(id));
    if (removed.length > 0) await storeInactivity(deps.cache, emitterId, { ...stored, alertedTo: stored.alertedTo.filter((id) => !readerIds.includes(id)) });
    return alertedAtOf(stored) ? removed : [];
  });
}

/**
 * Un compte a perdu des accès HORS des routes de lien (rôle d'équipe retiré, compte désactivé) :
 * comme personne suivie, qui voyait son alerte et ne la voit plus reçoit l'effacement ; comme
 * lecteur, chaque alerte qu'on lui servait lui est retirée.
 */
export async function reconcileInactivityOfAccount(deps: InactivityRelayDeps, userId: string): Promise<void> {
  const own = await readInactivity(deps.cache, userId);
  if (own && own.alertedTo.length > 0) {
    const audience = await audienceOf(deps, userId);
    const departed = await removeReader(deps, userId, own.alertedTo.filter((id) => !audience.has(id)));
    departed.forEach((readerId) => emitCleared(deps, readerId, userId));
    await retract(deps, departed.map((readerId) => ({ emitterId: userId, readerId })));
  }
  const emitters = await batteryCandidatesOf(deps.prisma, userId);
  if (emitters.length === 0) return;
  const allowed = await inactivityAllowedAmong(deps.prisma, { subjectId: userId, otherIds: emitters, subjectIs: 'viewer', now: new Date(deps.now()) });
  const lost = emitters.filter((emitterId) => !allowed.has(emitterId));
  for (const emitterId of lost) {
    if ((await removeReader(deps, emitterId, [userId])).length > 0) emitCleared(deps, userId, emitterId);
  }
  await retract(deps, lost.map((emitterId) => ({ emitterId, readerId: userId })));
}

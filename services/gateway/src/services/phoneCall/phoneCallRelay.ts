/**
 * LE RELAIS « EN APPEL » (#18753, ACT-01) — sur le modèle du téléphone injoignable (#18737).
 *
 * Le téléphone SUIVI rapporte `active` ; `phoneCallStep` (partagé) ouvre, rafraîchit ou clôt l'état.
 * Chaque Sang autorisé (`phoneCallAccess.ts`) reçoit dans `user:<lecteur>` `phone-call:started`
 * avec l'état servi (début arrondi, expiration) — l'annonce SEULEMENT quand il est en conversation
 * avec l'émetteur, la SyncPill — puis `phone-call:ended`. AUCUN push : être en appel n'est pas une
 * alerte, et un Sang n'a pas à être dérangé à chaque appel de l'autre.
 *
 * Les envois partent HORS verrou : chacun relit l'état avant de partir et efface après si un autre
 * rapport l'a périmé entre-temps (leçon des deux audits de #18738). Rien ne part vers un lecteur que
 * la loi refuse, pas même un effacement. JAMAIS un message de conversation.
 */
import { BATTERY_CONFIG } from '@meeshy/shared/types/battery';
import type { PhoneCallAnnouncement, PhoneCallSnapshot, PhoneCallState } from '@meeshy/shared/types/phone-call';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { batteryReaderInConversation } from '@meeshy/shared/utils/battery-episode';
import { phoneCallStep, servedPhoneCall } from '@meeshy/shared/utils/phone-call';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { batteryCandidatesOf } from '../battery/batteryAccess';
import type { BatteryContextReader, BatteryReaderContext } from '../battery/batteryRelay';
import { phoneCallAllowedAmong, type PhoneCallDb } from './phoneCallAccess';
import { clearPhoneCall, readPhoneCall, storePhoneCall, withPhoneCallLock, type PhoneCallCache, type StoredPhoneCall } from './phoneCallStore';

export type PhoneCallRelayDeps = {
  readonly prisma: PhoneCallDb;
  readonly cache: PhoneCallCache;
  readonly io: ServerEmitIO | undefined;
  readonly now: () => number;
  readonly context: BatteryContextReader;
  /** La session est-elle celle du téléphone suivi (le même que celui de la batterie) ? */
  readonly isTrackedDevice: (params: { readonly userId: string; readonly sessionId: string | null }) => Promise<boolean>;
};

const safely = (send: () => void): void => {
  try {
    send();
  } catch {
    /* rien : l'état est déjà rangé */
  }
};

const iso = (deps: PhoneCallRelayDeps): string => new Date(deps.now()).toISOString();

/** L'état servi, ou `null` hors appel ou passé sa durée de vie (un téléphone qui n'a jamais dit la fin). */
const servedNow = (deps: PhoneCallRelayDeps, userId: string, stored: StoredPhoneCall | null): PhoneCallState | null => {
  const state = servedPhoneCall(userId, stored);
  return state && Date.parse(state.expiresAt) > deps.now() ? state : null;
};

const emitStarted = (deps: PhoneCallRelayDeps, readerId: string, state: PhoneCallState, announcement?: PhoneCallAnnouncement): void =>
  safely(() => deps.io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.PHONE_CALL_STARTED, { userId: state.userId, state, ...(announcement ? { announcement } : {}) }));

const emitEnded = (deps: PhoneCallRelayDeps, readerId: string, emitterId: string, announcement?: PhoneCallAnnouncement): void =>
  safely(() => deps.io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.PHONE_CALL_ENDED, { userId: emitterId, ...(announcement ? { announcement } : {}) }));

async function audienceOf(deps: PhoneCallRelayDeps, emitterId: string): Promise<ReadonlySet<string>> {
  const candidates = await batteryCandidatesOf(deps.prisma, emitterId);
  if (candidates.length === 0) return new Set();
  return phoneCallAllowedAmong(deps.prisma, { subjectId: emitterId, otherIds: candidates, subjectIs: 'target', now: new Date(deps.now()) });
}

async function sees(deps: PhoneCallRelayDeps, emitterId: string, readerId: string): Promise<boolean> {
  return (await phoneCallAllowedAmong(deps.prisma, { subjectId: emitterId, otherIds: [readerId], subjectIs: 'target', now: new Date(deps.now()) })).has(readerId);
}

async function inConversation(deps: PhoneCallRelayDeps, emitterId: string, readerIds: readonly string[]): Promise<ReadonlySet<string>> {
  if (readerIds.length === 0) return new Set();
  const now = iso(deps);
  const contexts = await deps.context({ emitterId, readerIds, now: new Date(deps.now()) }).catch(() => new Map<string, BatteryReaderContext>());
  return new Set(readerIds.filter((id) => {
    const context = contexts.get(id);
    return batteryReaderInConversation({ now, roomOpen: context?.roomOpen ?? false, lastExchangeAt: context?.lastExchangeAt ?? null, awaitingReply: context?.awaitingReply ?? false }, BATTERY_CONFIG);
  }));
}

/** L'état vers chaque lecteur, s'il est encore celui rangé ; s'il a été périmé PENDANT l'envoi, l'effacement suit. */
async function fanOutStarted(deps: PhoneCallRelayDeps, emitterId: string, stored: StoredPhoneCall, announcement?: PhoneCallAnnouncement): Promise<void> {
  const current = (record: StoredPhoneCall | null): boolean => record !== null && record.reportedAt === stored.reportedAt;
  const conversing = announcement ? await inConversation(deps, emitterId, stored.servedTo) : new Set<string>();
  const state = servedNow(deps, emitterId, stored);
  if (!state || !current(await readPhoneCall(deps.cache, emitterId))) return;
  stored.servedTo.forEach((readerId) => emitStarted(deps, readerId, state, conversing.has(readerId) ? announcement : undefined));
  if (!current(await readPhoneCall(deps.cache, emitterId))) {
    const after = await readPhoneCall(deps.cache, emitterId);
    if (after === null) stored.servedTo.forEach((readerId) => emitEnded(deps, readerId, emitterId));
  }
}

async function fanOutEnded(deps: PhoneCallRelayDeps, emitterId: string, servedTo: readonly string[], announcement: PhoneCallAnnouncement): Promise<void> {
  const [audience, conversing] = await Promise.all([audienceOf(deps, emitterId), inConversation(deps, emitterId, servedTo)]);
  servedTo.forEach((readerId) => emitEnded(deps, readerId, emitterId, audience.has(readerId) && conversing.has(readerId) ? announcement : undefined));
}

const hasReaders = (stored: StoredPhoneCall): boolean => stored.servedTo.length > 0;

const sharingDisabled = async (deps: PhoneCallRelayDeps, emitterId: string): Promise<boolean> => {
  const row = (await deps.prisma.user.findUnique({ where: { id: emitterId }, select: { callSharingDisabledAt: true } })) as { readonly callSharingDisabledAt?: Date | null } | null;
  return Boolean(row?.callSharingDisabledAt);
};

/**
 * Un RAPPORT du téléphone suivi. Rend `false` quand la session n'est pas le téléphone suivi. La
 * coupure globale ferme aussi la collecte : rien n'est rangé. LÈVE si l'état ne se range pas.
 */
export async function reportPhoneCall(deps: PhoneCallRelayDeps, params: { readonly userId: string; readonly sessionId: string | null; readonly active: boolean }): Promise<boolean> {
  if (!(await deps.isTrackedDevice(params))) return false;
  const at = iso(deps);
  const outcome = await withPhoneCallLock(deps.cache, params.userId, async () => {
    if (await sharingDisabled(deps, params.userId)) {
      await clearPhoneCall(deps.cache, params.userId);
      return null;
    }
    const previous = await readPhoneCall(deps.cache, params.userId);
    const { state, announcement } = phoneCallStep(previous, { kind: 'report', active: params.active, at });
    if (state === null) {
      await clearPhoneCall(deps.cache, params.userId);
      return announcement && previous ? { ended: { announcement, servedTo: previous.servedTo } } : null;
    }
    const audience = [...(await audienceOf(deps, params.userId))];
    const departed = (previous?.servedTo ?? []).filter((id) => !audience.includes(id));
    const stored: StoredPhoneCall = { ...state, servedTo: audience };
    await storePhoneCall(deps.cache, params.userId, stored);
    return { started: { stored, announcement, departed } };
  });
  if (outcome?.ended) await fanOutEnded(deps, params.userId, outcome.ended.servedTo, outcome.ended.announcement);
  if (outcome?.started) {
    outcome.started.departed.forEach((readerId) => emitEnded(deps, readerId, params.userId));
    if (hasReaders(outcome.started.stored)) await fanOutStarted(deps, params.userId, outcome.started.stored, outcome.started.announcement);
  }
  return true;
}


/** Ce que `readerId` voit, à la connexion. La loi est jugée sur TOUS les candidats avant toute lecture d'état. */
export async function phoneCallSnapshotFor(deps: PhoneCallRelayDeps, readerId: string): Promise<PhoneCallSnapshot> {
  const candidates = await batteryCandidatesOf(deps.prisma, readerId);
  if (candidates.length === 0) return { items: [] };
  const allowed = await phoneCallAllowedAmong(deps.prisma, { subjectId: readerId, otherIds: candidates, subjectIs: 'viewer', now: new Date(deps.now()) });
  const states = await Promise.all([...allowed].map(async (id) => servedNow(deps, id, await readPhoneCall(deps.cache, id))));
  return { items: states.filter((item): item is PhoneCallState => item !== null) };
}

const directions = (userA: string, userB: string) => [[userA, userB], [userB, userA]] as const;

/** Rejoue une paire dans les DEUX sens après un changement de lien, de consentement ou de blocage. */
export async function refreshPhoneCallBetween(deps: PhoneCallRelayDeps, params: { readonly userA: string; readonly userB: string }): Promise<void> {
  for (const [emitterId, readerId] of directions(params.userA, params.userB)) {
    const after = await sees(deps, emitterId, readerId);
    const change = await withPhoneCallLock(deps.cache, emitterId, async () => {
      const stored = await readPhoneCall(deps.cache, emitterId);
      if (!stored || !servedNow(deps, emitterId, stored)) return null;
      const before = stored.servedTo.includes(readerId);
      if (after === before) return null;
      const next: StoredPhoneCall = { ...stored, servedTo: after ? [...stored.servedTo, readerId] : stored.servedTo.filter((id) => id !== readerId) };
      await storePhoneCall(deps.cache, emitterId, next);
      return { gained: after, stored: next };
    });
    if (change && !change.gained) emitEnded(deps, readerId, emitterId);
    if (change?.gained) await fanOutStarted(deps, emitterId, { ...change.stored, servedTo: [readerId] });
  }
}

/** Après la coupure globale : l'état s'efface chez tous ceux qui le voyaient, et s'oublie. */
export async function refreshPhoneCallAudience(deps: PhoneCallRelayDeps, emitterId: string): Promise<void> {
  if (!(await sharingDisabled(deps, emitterId))) return;
  const servedTo = await withPhoneCallLock(deps.cache, emitterId, async () => {
    const stored = await readPhoneCall(deps.cache, emitterId);
    await clearPhoneCall(deps.cache, emitterId);
    return stored?.servedTo ?? [];
  });
  servedTo.forEach((readerId) => emitEnded(deps, readerId, emitterId));
}

async function dropReaders(deps: PhoneCallRelayDeps, emitterId: string, readerIds: readonly string[]): Promise<readonly string[]> {
  return withPhoneCallLock(deps.cache, emitterId, async () => {
    const stored = await readPhoneCall(deps.cache, emitterId);
    if (!stored) return [];
    const removed = stored.servedTo.filter((id) => readerIds.includes(id));
    if (removed.length > 0) await storePhoneCall(deps.cache, emitterId, { ...stored, servedTo: stored.servedTo.filter((id) => !readerIds.includes(id)) });
    return removed;
  });
}

/** Un compte a perdu des accès HORS des routes de lien (rôle retiré, compte désactivé), dans les deux rôles. */
export async function reconcilePhoneCallOfAccount(deps: PhoneCallRelayDeps, userId: string): Promise<void> {
  const own = await readPhoneCall(deps.cache, userId);
  if (own && own.servedTo.length > 0) {
    const audience = await audienceOf(deps, userId);
    const departed = await dropReaders(deps, userId, own.servedTo.filter((id) => !audience.has(id)));
    departed.forEach((readerId) => emitEnded(deps, readerId, userId));
  }
  const emitters = await batteryCandidatesOf(deps.prisma, userId);
  if (emitters.length === 0) return;
  const allowed = await phoneCallAllowedAmong(deps.prisma, { subjectId: userId, otherIds: emitters, subjectIs: 'viewer', now: new Date(deps.now()) });
  for (const emitterId of emitters.filter((id) => !allowed.has(id))) {
    if ((await dropReaders(deps, emitterId, [userId])).length > 0) emitEnded(deps, userId, emitterId);
  }
}

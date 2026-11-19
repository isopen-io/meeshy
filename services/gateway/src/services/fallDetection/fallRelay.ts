/**
 * LE RELAIS DE LA CHUTE DÉTECTÉE (#18748, SAN-01) — sur le modèle de l'alerte d'inactivité
 * (`inactivityCheck/inactivityRelay.ts`), dont il reprend l'éventail hors verrou.
 *
 * 1. L'iPhone rapporte une chute (`POST /me/health/fall`). Sans l'ACCORD EXPLICITE de la personne
 *    (`fallConsentGiven`), rien n'est rangé : la collecte elle-même est fermée.
 * 2. Une chute neuve ouvre l'épisode (`fallStep`, partagé) et part TOUT DE SUITE vers chaque Sang
 *    autorisé (`fallAccess.ts`) : `fall:detected` dans `user:<Sang>` et le push générique. La
 *    dernière position et la dernière batterie ne sont servies qu'au Sang qui les reçoit DÉJÀ.
 * 3. « Je vais bien » (`POST /me/health/fall/ok`) clôt l'épisode : `fall:cleared` (`responded`) et
 *    le push « a répondu » à qui a reçu l'alerte. L'expiration est silencieuse. Le retrait de
 *    l'accord ou de l'accès efface (`withdrawn`), sans push.
 *
 * Les envois partent HORS verrou : chacun relit l'épisode et ses lecteurs avant de partir, et le
 * dernier mot est corrigé après coup chez qui a été atteint pendant qu'il se périmait (leçons des
 * audits de #18738 et #18753). Rien ne part vers un lecteur que la loi refuse. Aucun journal ne
 * porte l'instant d'une chute. JAMAIS un message de conversation.
 */
import type { FallAnnouncement, FallClearedReason, FallSnapshot, FallState } from '@meeshy/shared/types/fall-detection';
import type { InactivityLastBattery, InactivityLastPosition } from '@meeshy/shared/types/inactivity-check';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { fallAnnouncementOf, fallReportVerdict, fallStep, isFallLive, servedFall } from '@meeshy/shared/utils/fall-detection';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { batteryCandidatesOf } from '../battery/batteryAccess';
import { fallAllowedAmong, fallConsentGiven, type FallDb } from './fallAccess';
import { clearFall, readFall, storeFall, withFallLock, type FallCache, type StoredFall } from './fallStore';

export type FallPush = {
  readonly readerId: string;
  readonly emitterId: string;
  readonly kind: 'detected' | 'responded';
  /** L'heure annoncée, tronquée à la minute : la chute, ou la réponse. */
  readonly at: string;
};

export type FallRelayDeps = {
  readonly prisma: FallDb;
  readonly cache: FallCache;
  readonly io: ServerEmitIO | undefined;
  readonly now: () => number;
  /** L'alerte ou la réponse vers UN Sang, par push seul ; rend `true` quand elle est partie. */
  readonly push: (push: FallPush) => Promise<boolean>;
  /** La dernière position de `emitterId` telle que `readerId` la reçoit DÉJÀ ; `null` sinon. */
  readonly lastPositionFor: (emitterId: string, readerId: string) => Promise<InactivityLastPosition | null>;
  /** La dernière batterie de `emitterId` telle que `readerId` la reçoit DÉJÀ ; `null` sinon. */
  readonly lastBatteryFor: (emitterId: string, readerId: string) => Promise<InactivityLastBattery | null>;
};

export type FallReportOutcome = { readonly kind: 'too-old' | 'in-future' | 'consent-required' | 'deduplicated' | 'recorded' };

const MINUTE_MS = 60_000;

const safely = (send: () => void): void => {
  try {
    send();
  } catch {
    /* rien : l'épisode est déjà rangé */
  }
};

const iso = (deps: FallRelayDeps): string => new Date(deps.now()).toISOString();
const minuteOf = (deps: FallRelayDeps): string => new Date(Math.floor(deps.now() / MINUTE_MS) * MINUTE_MS).toISOString();

const emitDetected = (deps: FallRelayDeps, readerId: string, state: FallState, announcement?: FallAnnouncement): void =>
  safely(() => deps.io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.FALL_DETECTED, { userId: state.userId, state, ...(announcement ? { announcement } : {}) }));

const emitCleared = (deps: FallRelayDeps, readerId: string, emitterId: string, reason: FallClearedReason): void =>
  safely(() => deps.io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.FALL_CLEARED, { userId: emitterId, reason }));

const liveOrNull = (deps: FallRelayDeps, stored: StoredFall | null): StoredFall | null => (stored && isFallLive(stored, iso(deps)) ? stored : null);

const sameEpisode = (a: StoredFall | null, b: StoredFall): boolean => a !== null && a.detectedAt === b.detectedAt && a.openedAt === b.openedAt;

async function audienceOf(deps: FallRelayDeps, emitterId: string): Promise<ReadonlySet<string>> {
  const candidates = await batteryCandidatesOf(deps.prisma, emitterId);
  if (candidates.length === 0) return new Set();
  return fallAllowedAmong(deps.prisma, { subjectId: emitterId, otherIds: candidates, subjectIs: 'target', now: new Date(deps.now()) });
}

async function sees(deps: FallRelayDeps, emitterId: string, readerId: string): Promise<boolean> {
  return (await fallAllowedAmong(deps.prisma, { subjectId: emitterId, otherIds: [readerId], subjectIs: 'target', now: new Date(deps.now()) })).has(readerId);
}

/** L'état servi à UN lecteur : ce que sa loi de position et sa loi de batterie lui ouvrent déjà. */
async function servedStateFor(deps: FallRelayDeps, emitterId: string, readerId: string, stored: StoredFall): Promise<FallState> {
  const [position, battery] = await Promise.all([
    deps.lastPositionFor(emitterId, readerId).catch(() => null),
    deps.lastBatteryFor(emitterId, readerId).catch(() => null),
  ]);
  return { ...servedFall(emitterId, stored), ...(position ? { lastPosition: position } : {}), ...(battery ? { lastBattery: battery } : {}) };
}

const pushSafely = (deps: FallRelayDeps, push: FallPush): Promise<boolean> => deps.push(push).catch(() => false);

/**
 * Une chute rapportée. Refusée trop vieille ou dans le futur avant toute lecture ; refusée sans
 * accord, sans rien ranger. Une chute de l'épisode en cours ne repousse rien. LÈVE si l'épisode ne
 * se range pas.
 */
export async function reportFall(deps: FallRelayDeps, params: { readonly userId: string; readonly detectedAt: string }): Promise<FallReportOutcome> {
  const at = iso(deps);
  const verdict = fallReportVerdict(params.detectedAt, at);
  if (verdict !== 'accepted') return { kind: verdict };
  const outcome = await withFallLock(deps.cache, params.userId, async () => {
    if (!(await fallConsentGiven(deps.prisma, params.userId))) {
      await clearFall(deps.cache, params.userId);
      return { kind: 'consent-required' as const };
    }
    const previous = liveOrNull(deps, await readFall(deps.cache, params.userId));
    const step = fallStep(previous, { detectedAt: params.detectedAt, at });
    if (!step.opened) return { kind: 'deduplicated' as const };
    const audience = await audienceOf(deps, params.userId);
    const stored: StoredFall = { ...step.state, servedTo: [...audience], deliveredTo: [] };
    await storeFall(deps.cache, params.userId, stored, deps.now());
    return { kind: 'recorded' as const, stored, departed: (previous?.servedTo ?? []).filter((id) => !audience.has(id)) };
  });
  if (outcome.kind !== 'recorded') return { kind: outcome.kind };
  outcome.departed.forEach((readerId) => emitCleared(deps, readerId, params.userId, 'withdrawn'));
  if (outcome.stored.servedTo.length > 0) await fanOutDetected(deps, params.userId, outcome.stored);
  return { kind: 'recorded' };
}

/**
 * L'éventail de l'alerte, HORS verrou (il lit la position et la batterie de chaque Sang). Il ne part
 * que si l'épisode est encore le sien ; et si une réponse, un retrait ou une perte d'accès est arrivé
 * PENDANT, le dernier mot chez chaque Sang atteint est corrigé (`correctAfterDetected`).
 */
async function fanOutDetected(deps: FallRelayDeps, userId: string, stored: StoredFall): Promise<void> {
  const announcement = fallAnnouncementOf(stored);
  const served = await Promise.all(stored.servedTo.map(async (readerId) => [readerId, await servedStateFor(deps, userId, readerId, stored)] as const));
  const before = await readFall(deps.cache, userId);
  if (!sameEpisode(before, stored)) return;
  const delivered = (await Promise.all(served.map(async ([readerId, state]) => {
    if (!before?.servedTo.includes(readerId)) return null;
    emitDetected(deps, readerId, state, announcement);
    await pushSafely(deps, { readerId, emitterId: userId, kind: 'detected', at: announcement.at });
    return readerId;
  }))).filter((id): id is string => id !== null);
  if (delivered.length === 0) return;
  const after = await withFallLock(deps.cache, userId, async () => {
    const current = await readFall(deps.cache, userId);
    if (!current || !sameEpisode(current, stored)) return { current, departed: [] as readonly string[] };
    const reached = delivered.filter((id) => current.servedTo.includes(id));
    await storeFall(deps.cache, userId, { ...current, deliveredTo: [...new Set([...current.deliveredTo, ...reached])] }, deps.now());
    return { current, departed: delivered.filter((id) => !current.servedTo.includes(id)) };
  });
  if (after.current && sameEpisode(after.current, stored)) {
    after.departed.forEach((readerId) => emitCleared(deps, readerId, userId, 'withdrawn'));
    return;
  }
  await correctAfterDetected(deps, userId, stored, delivered, after.current);
}

/**
 * L'alerte est partie, mais l'épisode s'est périmé PENDANT l'envoi — et ces Sangs n'étaient pas encore
 * dans `deliveredTo`, donc la clôture ne les a pas comptés. La raison se déduit de ce qui reste :
 * plus d'accord ou plus d'accès ⇒ `withdrawn` ; épisode passé ⇒ `expired` ; sinon la personne a
 * répondu ⇒ `responded` et son push. Un épisode NEUF rangé entre-temps garde ses lecteurs.
 */
async function correctAfterDetected(deps: FallRelayDeps, userId: string, stored: StoredFall, delivered: readonly string[], current: StoredFall | null): Promise<void> {
  const renewed = new Set(liveOrNull(deps, current)?.servedTo ?? []);
  const readers = delivered.filter((id) => !renewed.has(id));
  if (readers.length === 0) return;
  const [consented, audience] = await Promise.all([fallConsentGiven(deps.prisma, userId).catch(() => false), audienceOf(deps, userId).catch(() => new Set<string>())]);
  const expired = !isFallLive(stored, iso(deps));
  await Promise.all(readers.map(async (readerId) => {
    if (!consented || !audience.has(readerId)) return emitCleared(deps, readerId, userId, 'withdrawn');
    if (expired) return emitCleared(deps, readerId, userId, 'expired');
    emitCleared(deps, readerId, userId, 'responded');
    await pushSafely(deps, { readerId, emitterId: userId, kind: 'responded', at: minuteOf(deps) });
  }));
}

/**
 * « Je vais bien » : l'épisode est oublié ; « a répondu » (événement + push) à qui a REÇU l'alerte
 * et la voit encore ; un effacement sans push aux autres lecteurs servis. Rend `false` quand aucun
 * épisode n'était en cours.
 */
export async function respondFall(deps: FallRelayDeps, userId: string): Promise<boolean> {
  const previous = await withFallLock(deps.cache, userId, async () => {
    const stored = liveOrNull(deps, await readFall(deps.cache, userId));
    await clearFall(deps.cache, userId);
    return stored;
  });
  if (!previous) return false;
  const audience = await audienceOf(deps, userId).catch(() => new Set<string>());
  const delivered = new Set(previous.deliveredTo);
  const at = minuteOf(deps);
  await Promise.all(previous.servedTo.map(async (readerId) => {
    if (!audience.has(readerId)) return emitCleared(deps, readerId, userId, 'withdrawn');
    emitCleared(deps, readerId, userId, 'responded');
    if (delivered.has(readerId)) await pushSafely(deps, { readerId, emitterId: userId, kind: 'responded', at });
  }));
  return true;
}

/** Ce que `readerId` voit, à la connexion. La loi est jugée sur TOUS les candidats avant toute lecture d'épisode. */
export async function fallSnapshotFor(deps: FallRelayDeps, readerId: string): Promise<FallSnapshot> {
  const candidates = await batteryCandidatesOf(deps.prisma, readerId);
  if (candidates.length === 0) return { items: [] };
  const allowed = await fallAllowedAmong(deps.prisma, { subjectId: readerId, otherIds: candidates, subjectIs: 'viewer', now: new Date(deps.now()) });
  const states = await Promise.all([...allowed].map(async (id) => {
    const stored = liveOrNull(deps, await readFall(deps.cache, id));
    return stored ? servedStateFor(deps, id, readerId, stored) : null;
  }));
  return { items: states.filter((state): state is FallState => state !== null) };
}

/**
 * Un ÉTAT (sans annonce) vers un Sang, hors verrou : il ne part que si l'épisode est encore le même
 * et que ce Sang le voit encore ; périmé PENDANT l'envoi, l'effacement le suit.
 */
async function emitStateIfStillServed(deps: FallRelayDeps, userId: string, readerId: string, stored: StoredFall, state: FallState): Promise<void> {
  const fresh = (record: StoredFall | null): boolean => sameEpisode(liveOrNull(deps, record), stored) && Boolean(record?.servedTo.includes(readerId));
  if (!fresh(await readFall(deps.cache, userId))) return;
  emitDetected(deps, readerId, state);
  if (!fresh(await readFall(deps.cache, userId))) emitCleared(deps, readerId, userId, 'withdrawn');
}

const directions = (userA: string, userB: string) => [[userA, userB], [userB, userA]] as const;

/** Rejoue une paire dans les DEUX sens après un changement de lien, de consentement ou de blocage. */
export async function refreshFallBetween(deps: FallRelayDeps, params: { readonly userA: string; readonly userB: string }): Promise<void> {
  for (const [emitterId, readerId] of directions(params.userA, params.userB)) {
    const after = await sees(deps, emitterId, readerId);
    const gained = await withFallLock(deps.cache, emitterId, async () => {
      const stored = liveOrNull(deps, await readFall(deps.cache, emitterId));
      if (!stored) return null;
      const before = stored.servedTo.includes(readerId);
      if (after && !before) {
        const next: StoredFall = { ...stored, servedTo: [...stored.servedTo, readerId] };
        await storeFall(deps.cache, emitterId, next, deps.now());
        return next;
      }
      if (!after && before) {
        emitCleared(deps, readerId, emitterId, 'withdrawn');
        await storeFall(deps.cache, emitterId, { ...stored, servedTo: stored.servedTo.filter((id) => id !== readerId), deliveredTo: stored.deliveredTo.filter((id) => id !== readerId) }, deps.now());
      }
      return null;
    });
    if (gained) await emitStateIfStillServed(deps, emitterId, readerId, gained, await servedStateFor(deps, emitterId, readerId, gained));
  }
}

/**
 * Ce qui accompagne l'alerte a changé (position ou batterie retirée, fantôme de position, historique
 * effacé) : chaque Sang servi reçoit l'état re-jugé, sans nouvelle annonce.
 */
export async function refreshFallServedOf(deps: FallRelayDeps, emitterId: string): Promise<void> {
  const stored = liveOrNull(deps, await readFall(deps.cache, emitterId));
  if (!stored || stored.servedTo.length === 0) return;
  const audience = await audienceOf(deps, emitterId);
  await Promise.all(stored.servedTo.filter((id) => audience.has(id)).map(async (readerId) =>
    emitStateIfStillServed(deps, emitterId, readerId, stored, await servedStateFor(deps, emitterId, readerId, stored))));
}

/**
 * Après le RETRAIT de l'accord : l'épisode est purgé et s'efface chez tous ceux qui le voyaient
 * (`withdrawn`), sans push. Accord présent : rien à rejouer.
 */
export async function refreshFallAudience(deps: FallRelayDeps, emitterId: string): Promise<void> {
  if (await fallConsentGiven(deps.prisma, emitterId)) return;
  const servedTo = await withFallLock(deps.cache, emitterId, async () => {
    const stored = await readFall(deps.cache, emitterId);
    await clearFall(deps.cache, emitterId);
    return liveOrNull(deps, stored)?.servedTo ?? [];
  });
  servedTo.forEach((readerId) => emitCleared(deps, readerId, emitterId, 'withdrawn'));
}

async function dropReaders(deps: FallRelayDeps, emitterId: string, readerIds: readonly string[]): Promise<readonly string[]> {
  return withFallLock(deps.cache, emitterId, async () => {
    const stored = liveOrNull(deps, await readFall(deps.cache, emitterId));
    if (!stored) return [];
    const removed = stored.servedTo.filter((id) => readerIds.includes(id));
    const kept = (id: string): boolean => !readerIds.includes(id);
    if (removed.length > 0) await storeFall(deps.cache, emitterId, { ...stored, servedTo: stored.servedTo.filter(kept), deliveredTo: stored.deliveredTo.filter(kept) }, deps.now());
    return removed;
  });
}

/** Un compte a perdu des accès HORS des routes de lien (rôle d'équipe retiré, compte désactivé), dans les deux rôles. */
export async function reconcileFallOfAccount(deps: FallRelayDeps, userId: string): Promise<void> {
  const own = liveOrNull(deps, await readFall(deps.cache, userId));
  if (own && own.servedTo.length > 0) {
    const audience = await audienceOf(deps, userId);
    const departed = await dropReaders(deps, userId, own.servedTo.filter((id) => !audience.has(id)));
    departed.forEach((readerId) => emitCleared(deps, readerId, userId, 'withdrawn'));
  }
  const emitters = await batteryCandidatesOf(deps.prisma, userId);
  if (emitters.length === 0) return;
  const allowed = await fallAllowedAmong(deps.prisma, { subjectId: userId, otherIds: emitters, subjectIs: 'viewer', now: new Date(deps.now()) });
  for (const emitterId of emitters.filter((id) => !allowed.has(id))) {
    if ((await dropReaders(deps, emitterId, [userId])).length > 0) emitCleared(deps, userId, emitterId, 'withdrawn');
  }
}

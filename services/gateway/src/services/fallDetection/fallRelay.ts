/**
 * LE RELAIS DE LA CHUTE DÉTECTÉE (#18748, SAN-01) — sur le modèle de l'alerte d'inactivité
 * (`inactivityCheck/inactivityRelay.ts`), dont il reprend l'éventail hors verrou.
 *
 * 1. L'iPhone rapporte une chute (`POST /me/health/fall`). Sans l'ACCORD EXPLICITE de la personne,
 *    donné sur la version courante du texte et hors mineur déclaré (`fallConsentGiven`), rien n'est
 *    rangé : la collecte elle-même est fermée, et un épisode résiduel s'efface.
 * 2. Une chute neuve ouvre l'épisode (`fallStep`, partagé) et part TOUT DE SUITE vers chaque Sang
 *    autorisé (`fallAccess.ts`) : `fall:detected` dans `user:<Sang>` et le push générique, qui perce
 *    au plus trois fois par 24 h (`fallUrgencyStep`). La dernière position et la dernière batterie ne
 *    sont servies qu'au Sang qui les reçoit DÉJÀ.
 * 3. « Je vais bien » (`POST /me/health/fall/ok`) clôt l'épisode : `fall:cleared` (`responded`) et
 *    le push « a répondu » à qui a reçu l'alerte. L'expiration est silencieuse. Le retrait de
 *    l'accord ou de l'accès efface (`withdrawn`), et la bannière déjà livrée est REMPLACÉE par une
 *    levée neutre (`lifted`, même fil). Un épisode clos laisse une pierre tombale : le même rapport,
 *    rejoué, ne le rouvre pas.
 *
 * Les envois partent HORS verrou, un lecteur après l'autre : chacun relit l'épisode, ses lecteurs ET
 * la loi juste avant de partir, et le dernier mot est corrigé après coup chez qui a été atteint
 * pendant qu'il se périmait (leçons des audits de #18738 et #18753). Rien ne part vers un lecteur que
 * la loi refuse. Aucun journal ne porte l'instant d'une chute. JAMAIS un message de conversation.
 */
import type { FallAnnouncement, FallClearedReason, FallSnapshot, FallState } from '@meeshy/shared/types/fall-detection';
import type { InactivityLastBattery, InactivityLastPosition } from '@meeshy/shared/types/inactivity-check';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { fallAnnouncementOf, fallReportVerdict, fallStep, fallTombstoneCovers, fallUrgencyStep, isFallLive, servedFall } from '@meeshy/shared/utils/fall-detection';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { batteryCandidatesOf } from '../battery/batteryAccess';
import { teamAccountIds } from '../relations/teamPeers';
import { fallAllowedAmong, fallConsentGiven, type FallDb } from './fallAccess';
import {
  clearFall,
  readFall,
  readFallOpenings,
  readFallTombstone,
  storeFall,
  storeFallOpenings,
  storeFallTombstone,
  withFallLock,
  type FallCache,
  type StoredFall,
} from './fallStore';

export type FallPush = {
  readonly readerId: string;
  readonly emitterId: string;
  /** L'alerte, la réponse, ou la LEVÉE neutre chez qui perd l'accès (elle remplace la bannière). */
  readonly kind: 'detected' | 'responded' | 'lifted';
  /** L'heure annoncée, tronquée à la minute : la chute, ou la réponse. */
  readonly at: string;
  /** Une alerte qui PERCE (time-sensitive, Ne pas déranger traversé) ; `false` au-delà du plafond quotidien. */
  readonly urgent?: boolean;
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

/** Un lecteur qui sort de l'épisode, et s'il en avait reçu la bannière. */
type Departure = { readonly readerId: string; readonly delivered: boolean };

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
const nowDate = (deps: FallRelayDeps): Date => new Date(deps.now());

const emitDetected = (deps: FallRelayDeps, readerId: string, state: FallState, announcement?: FallAnnouncement): void =>
  safely(() => deps.io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.FALL_DETECTED, { userId: state.userId, state, ...(announcement ? { announcement } : {}) }));

const emitCleared = (deps: FallRelayDeps, readerId: string, emitterId: string, reason: FallClearedReason): void =>
  safely(() => deps.io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.FALL_CLEARED, { userId: emitterId, reason }));

const liveOrNull = (deps: FallRelayDeps, stored: StoredFall | null): StoredFall | null => (stored && isFallLive(stored, iso(deps)) ? stored : null);

const sameEpisode = (a: StoredFall | null, b: StoredFall): boolean => a !== null && a.detectedAt === b.detectedAt && a.openedAt === b.openedAt;

const departuresOf = (stored: StoredFall | null, leaving: (readerId: string) => boolean): readonly Departure[] =>
  (stored?.servedTo ?? []).filter(leaving).map((readerId) => ({ readerId, delivered: stored?.deliveredTo.includes(readerId) ?? false }));

async function audienceOf(deps: FallRelayDeps, emitterId: string): Promise<ReadonlySet<string>> {
  const candidates = await batteryCandidatesOf(deps.prisma, emitterId);
  if (candidates.length === 0) return new Set();
  return fallAllowedAmong(deps.prisma, { subjectId: emitterId, otherIds: candidates, subjectIs: 'target', now: nowDate(deps) });
}

async function sees(deps: FallRelayDeps, emitterId: string, readerId: string): Promise<boolean> {
  return (await fallAllowedAmong(deps.prisma, { subjectId: emitterId, otherIds: [readerId], subjectIs: 'target', now: nowDate(deps) })).has(readerId);
}

/** L'épisode est-il ENCORE le même, ce lecteur encore servi, et la loi le laisse-t-elle encore voir ? */
async function stillServed(deps: FallRelayDeps, emitterId: string, readerId: string, stored: StoredFall): Promise<boolean> {
  const current = liveOrNull(deps, await readFall(deps.cache, emitterId));
  if (!sameEpisode(current, stored) || !current?.servedTo.includes(readerId)) return false;
  return sees(deps, emitterId, readerId);
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

/** Qui sort de l'épisode : l'effacement `withdrawn`, et la levée neutre là où une bannière a été livrée. */
async function sendDepartures(deps: FallRelayDeps, emitterId: string, departures: readonly Departure[]): Promise<void> {
  const at = minuteOf(deps);
  for (const { readerId, delivered } of departures) {
    emitCleared(deps, readerId, emitterId, 'withdrawn');
    if (delivered) await pushSafely(deps, { readerId, emitterId, kind: 'lifted', at });
  }
}

/** Ferme l'épisode en cours sous le verrou : purgé, et sa pierre tombale rangée. Rend ce qui était servi. */
async function closeEpisodeLocked(deps: FallRelayDeps, userId: string): Promise<StoredFall | null> {
  const stored = liveOrNull(deps, await readFall(deps.cache, userId));
  await clearFall(deps.cache, userId);
  if (stored) await storeFallTombstone(deps.cache, userId, stored, deps.now());
  return stored;
}

type ReportStep =
  | { readonly kind: 'consent-required'; readonly departed: readonly Departure[] }
  | { readonly kind: 'deduplicated' }
  | { readonly kind: 'recorded'; readonly stored: StoredFall; readonly urgent: boolean; readonly departed: readonly Departure[] };

/**
 * Une chute rapportée. Refusée trop vieille ou dans le futur avant toute lecture ; refusée sans
 * accord valide, sans rien ranger (un épisode résiduel s'efface). Une chute de l'épisode en cours, ou
 * d'un épisode clos encore marqué par sa pierre tombale, ne repousse rien. LÈVE si l'épisode ne se range pas.
 */
export async function reportFall(deps: FallRelayDeps, params: { readonly userId: string; readonly detectedAt: string }): Promise<FallReportOutcome> {
  const at = iso(deps);
  const verdict = fallReportVerdict(params.detectedAt, at);
  if (verdict !== 'accepted') return { kind: verdict };
  const outcome = await withFallLock<ReportStep>(deps.cache, params.userId, async () => {
    if (!(await fallConsentGiven(deps.prisma, params.userId, nowDate(deps)))) {
      const residual = await closeEpisodeLocked(deps, params.userId);
      return { kind: 'consent-required', departed: departuresOf(residual, () => true) };
    }
    if (fallTombstoneCovers(await readFallTombstone(deps.cache, params.userId), params.detectedAt)) return { kind: 'deduplicated' };
    const previous = liveOrNull(deps, await readFall(deps.cache, params.userId));
    const step = fallStep(previous, { detectedAt: params.detectedAt, at });
    if (!step.opened) return { kind: 'deduplicated' };
    const audience = await audienceOf(deps, params.userId);
    const stored: StoredFall = { ...step.state, servedTo: [...audience], deliveredTo: [] };
    await storeFall(deps.cache, params.userId, stored, deps.now());
    const urgency = fallUrgencyStep(await readFallOpenings(deps.cache, params.userId), at);
    await storeFallOpenings(deps.cache, params.userId, urgency.openings);
    return { kind: 'recorded', stored, urgent: urgency.urgent, departed: departuresOf(previous, (id) => !audience.has(id)) };
  });
  if (outcome.kind === 'deduplicated') return { kind: 'deduplicated' };
  await sendDepartures(deps, params.userId, outcome.departed);
  if (outcome.kind === 'consent-required') return { kind: 'consent-required' };
  if (outcome.stored.servedTo.length > 0) await fanOutDetected(deps, params.userId, outcome.stored, outcome.urgent);
  return { kind: 'recorded' };
}

/**
 * L'éventail de l'alerte, HORS verrou et un lecteur après l'autre : juste avant chaque envoi,
 * l'épisode, ses lecteurs et la loi sont relus (`stillServed`). Si une réponse, un retrait ou une
 * perte d'accès est arrivé PENDANT, le dernier mot chez chaque Sang atteint est corrigé.
 */
async function fanOutDetected(deps: FallRelayDeps, userId: string, stored: StoredFall, urgent: boolean): Promise<void> {
  const announcement = fallAnnouncementOf(stored);
  const delivered: string[] = [];
  for (const readerId of stored.servedTo) {
    const state = await servedStateFor(deps, userId, readerId, stored);
    if (!(await stillServed(deps, userId, readerId, stored))) continue;
    emitDetected(deps, readerId, state, announcement);
    await pushSafely(deps, { readerId, emitterId: userId, kind: 'detected', at: announcement.at, urgent });
    delivered.push(readerId);
  }
  if (delivered.length === 0) return;
  const after = await withFallLock(deps.cache, userId, async () => {
    const current = await readFall(deps.cache, userId);
    if (!current || !sameEpisode(current, stored)) return { current, departed: [] as readonly string[] };
    const reached = delivered.filter((id) => current.servedTo.includes(id));
    await storeFall(deps.cache, userId, { ...current, deliveredTo: [...new Set([...current.deliveredTo, ...reached])] }, deps.now());
    return { current, departed: delivered.filter((id) => !current.servedTo.includes(id)) };
  });
  if (after.current && sameEpisode(after.current, stored)) {
    await sendDepartures(deps, userId, after.departed.map((readerId) => ({ readerId, delivered: true })));
    return;
  }
  await correctAfterDetected(deps, userId, stored, delivered, after.current);
}

/**
 * L'alerte est partie, mais l'épisode s'est périmé PENDANT l'envoi — et ces Sangs n'étaient pas encore
 * dans `deliveredTo`, donc la clôture ne les a pas comptés. La raison se déduit de ce qui reste :
 * plus d'accord ou plus d'accès ⇒ `withdrawn` et la levée ; épisode passé ⇒ `expired` ; sinon la
 * personne a répondu ⇒ `responded` et son push. Un épisode NEUF rangé entre-temps garde ses lecteurs.
 */
async function correctAfterDetected(deps: FallRelayDeps, userId: string, stored: StoredFall, delivered: readonly string[], current: StoredFall | null): Promise<void> {
  const renewed = new Set(liveOrNull(deps, current)?.servedTo ?? []);
  const readers = delivered.filter((id) => !renewed.has(id));
  if (readers.length === 0) return;
  const [consented, audience] = await Promise.all([
    fallConsentGiven(deps.prisma, userId, nowDate(deps)).catch(() => false),
    audienceOf(deps, userId).catch(() => new Set<string>()),
  ]);
  const expired = !isFallLive(stored, iso(deps));
  const lost = readers.filter((id) => !consented || !audience.has(id));
  await sendDepartures(deps, userId, lost.map((readerId) => ({ readerId, delivered: true })));
  for (const readerId of readers.filter((id) => !lost.includes(id))) {
    if (expired) {
      emitCleared(deps, readerId, userId, 'expired');
      continue;
    }
    emitCleared(deps, readerId, userId, 'responded');
    await pushSafely(deps, { readerId, emitterId: userId, kind: 'responded', at: minuteOf(deps) });
  }
}

/**
 * « Je vais bien » : l'épisode est oublié (sa pierre tombale reste) ; « a répondu » (événement +
 * push) à qui a REÇU l'alerte et la voit encore ; un effacement sans push aux autres lecteurs servis ;
 * à qui a perdu l'accès, `withdrawn` et la levée. Rend `false` quand aucun épisode n'était en cours.
 */
export async function respondFall(deps: FallRelayDeps, userId: string): Promise<boolean> {
  const previous = await withFallLock(deps.cache, userId, () => closeEpisodeLocked(deps, userId));
  if (!previous) return false;
  const audience = await audienceOf(deps, userId).catch(() => new Set<string>());
  await sendDepartures(deps, userId, departuresOf(previous, (id) => !audience.has(id)));
  const delivered = new Set(previous.deliveredTo);
  const at = minuteOf(deps);
  for (const readerId of previous.servedTo.filter((id) => audience.has(id))) {
    emitCleared(deps, readerId, userId, 'responded');
    if (delivered.has(readerId)) await pushSafely(deps, { readerId, emitterId: userId, kind: 'responded', at });
  }
  return true;
}

/**
 * Le RETRAIT de l'accord : sous le verrou, l'épisode est d'abord purgé (et marqué d'une pierre
 * tombale), PUIS l'accord est effacé (`write`) — un ré-accord rapide ne retrouve rien à servir. Hors
 * verrou, chaque lecteur servi reçoit `withdrawn` et la levée de sa bannière. Verrou resté pris :
 * LÈVE sans rien écrire (`isFallLockBusy`), et la route répond une erreur plutôt qu'un succès menteur.
 */
export async function withdrawFallConsent(deps: FallRelayDeps, emitterId: string, write: () => Promise<void>): Promise<void> {
  const previous = await withFallLock(deps.cache, emitterId, async () => {
    const stored = await closeEpisodeLocked(deps, emitterId);
    await write();
    return stored;
  });
  await sendDepartures(deps, emitterId, departuresOf(previous, () => true));
}

/** Ce que `readerId` voit, à la connexion. La loi est jugée sur TOUS les candidats avant toute lecture d'épisode. */
export async function fallSnapshotFor(deps: FallRelayDeps, readerId: string): Promise<FallSnapshot> {
  const candidates = await batteryCandidatesOf(deps.prisma, readerId);
  if (candidates.length === 0) return { items: [] };
  const allowed = await fallAllowedAmong(deps.prisma, { subjectId: readerId, otherIds: candidates, subjectIs: 'viewer', now: nowDate(deps) });
  const states = await Promise.all([...allowed].map(async (id) => {
    const stored = liveOrNull(deps, await readFall(deps.cache, id));
    return stored ? servedStateFor(deps, id, readerId, stored) : null;
  }));
  return { items: states.filter((state): state is FallState => state !== null) };
}

async function dropReaders(deps: FallRelayDeps, emitterId: string, readerIds: readonly string[]): Promise<readonly Departure[]> {
  return withFallLock(deps.cache, emitterId, async () => {
    const stored = liveOrNull(deps, await readFall(deps.cache, emitterId));
    if (!stored) return [];
    const departed = departuresOf(stored, (id) => readerIds.includes(id));
    const kept = (id: string): boolean => !readerIds.includes(id);
    if (departed.length > 0) await storeFall(deps.cache, emitterId, { ...stored, servedTo: stored.servedTo.filter(kept), deliveredTo: stored.deliveredTo.filter(kept) }, deps.now());
    return departed;
  });
}

/**
 * Un ÉTAT (sans annonce) vers un Sang, hors verrou : il ne part que si l'épisode est encore le même,
 * que ce Sang y est servi ET que la loi le laisse encore voir — jugée de nouveau ici, pas héritée de
 * l'appelant ; refusé, le lecteur sort de l'épisode. Périmé PENDANT l'envoi, l'effacement le suit.
 */
async function emitStateIfStillServed(deps: FallRelayDeps, userId: string, readerId: string, stored: StoredFall, state: FallState): Promise<void> {
  if (!(await stillServed(deps, userId, readerId, stored))) {
    await sendDepartures(deps, userId, await dropReaders(deps, userId, [readerId]));
    return;
  }
  emitDetected(deps, readerId, state);
  if (await stillServed(deps, userId, readerId, stored)) return;
  emitCleared(deps, readerId, userId, 'withdrawn');
  await sendDepartures(deps, userId, await dropReaders(deps, userId, [readerId]));
}

const directions = (userA: string, userB: string) => [[userA, userB], [userB, userA]] as const;

type PairChange = { readonly kind: 'gained'; readonly stored: StoredFall } | { readonly kind: 'lost'; readonly departure: Departure };

/** Rejoue une paire dans les DEUX sens après un changement de lien, de consentement ou de blocage. La loi est jugée DANS le verrou. */
export async function refreshFallBetween(deps: FallRelayDeps, params: { readonly userA: string; readonly userB: string }): Promise<void> {
  for (const [emitterId, readerId] of directions(params.userA, params.userB)) {
    const change = await withFallLock<PairChange | null>(deps.cache, emitterId, async () => {
      const stored = liveOrNull(deps, await readFall(deps.cache, emitterId));
      if (!stored) return null;
      const after = await sees(deps, emitterId, readerId);
      const before = stored.servedTo.includes(readerId);
      if (after && !before) {
        const next: StoredFall = { ...stored, servedTo: [...stored.servedTo, readerId] };
        await storeFall(deps.cache, emitterId, next, deps.now());
        return { kind: 'gained', stored: next };
      }
      if (!after && before) {
        await storeFall(deps.cache, emitterId, { ...stored, servedTo: stored.servedTo.filter((id) => id !== readerId), deliveredTo: stored.deliveredTo.filter((id) => id !== readerId) }, deps.now());
        return { kind: 'lost', departure: { readerId, delivered: stored.deliveredTo.includes(readerId) } };
      }
      return null;
    });
    if (change?.kind === 'lost') await sendDepartures(deps, emitterId, [change.departure]);
    if (change?.kind === 'gained') await emitStateIfStillServed(deps, emitterId, readerId, change.stored, await servedStateFor(deps, emitterId, readerId, change.stored));
  }
}

/**
 * Ce qui accompagne l'alerte a changé (position ou batterie retirée, fantôme de position, historique
 * effacé) : chaque Sang servi reçoit l'état re-jugé, sans nouvelle annonce ; qui n'est plus dans
 * l'audience sort de l'épisode.
 */
export async function refreshFallServedOf(deps: FallRelayDeps, emitterId: string): Promise<void> {
  const stored = liveOrNull(deps, await readFall(deps.cache, emitterId));
  if (!stored || stored.servedTo.length === 0) return;
  const audience = await audienceOf(deps, emitterId);
  const outside = stored.servedTo.filter((id) => !audience.has(id));
  if (outside.length > 0) await sendDepartures(deps, emitterId, await dropReaders(deps, emitterId, outside));
  for (const readerId of stored.servedTo.filter((id) => audience.has(id))) {
    await emitStateIfStillServed(deps, emitterId, readerId, stored, await servedStateFor(deps, emitterId, readerId, stored));
  }
}

/**
 * Un compte a perdu des accès HORS des routes de lien (rôle d'équipe retiré, compte désactivé), dans
 * les deux rôles. Comme LECTEUR, ses émetteurs possibles comptent les comptes de l'équipe même quand
 * il n'en est plus : c'est justement le rôle perdu qui les retire de ses candidats.
 */
export async function reconcileFallOfAccount(deps: FallRelayDeps, userId: string): Promise<void> {
  const own = liveOrNull(deps, await readFall(deps.cache, userId));
  if (own && own.servedTo.length > 0) {
    const audience = await audienceOf(deps, userId);
    await sendDepartures(deps, userId, await dropReaders(deps, userId, own.servedTo.filter((id) => !audience.has(id))));
  }
  const [linked, team] = await Promise.all([batteryCandidatesOf(deps.prisma, userId), teamAccountIds(deps.prisma)]);
  const emitters = [...new Set([...linked, ...team])].filter((id) => id !== userId);
  if (emitters.length === 0) return;
  const allowed = await fallAllowedAmong(deps.prisma, { subjectId: userId, otherIds: emitters, subjectIs: 'viewer', now: nowDate(deps) });
  for (const emitterId of emitters.filter((id) => !allowed.has(id))) {
    await sendDepartures(deps, emitterId, await dropReaders(deps, emitterId, [userId]));
  }
}

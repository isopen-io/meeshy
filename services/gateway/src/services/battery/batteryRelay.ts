/**
 * LE RELAIS DE LA BATTERIE (#14147 ; spec § 3 à § 5) — sur le modèle de `nowPlayingRelay.ts`.
 *
 * Le téléphone de l'émetteur envoie un relevé ; le relais fait avancer l'épisode
 * (`batteryEpisodeStep`, partagé), le range scellé (`batteryStore.ts`) et sert chaque lecteur
 * autorisé (`batteryAccess.ts`) dans `user:<lecteur>`, avec SON canal :
 *
 * - `socket` (il est « en conversation » avec l'émetteur) : l'annonce part dans
 *   `battery:changed` / `battery:cleared` — la SyncPill ;
 * - `push` (hors conversation : critique, extinction, retour, recharge — et la charge pour qui
 *   a reçu le critique) : une notification dédiée, l'état suivant en silence par socket ;
 * - `none` : l'état se met à jour en silence.
 *
 * Rien ne part vers un lecteur que la loi refuse — pas même un effacement. JAMAIS un message de
 * conversation : rien n'entre dans `Message`.
 */
import {
  BATTERY_CONFIG,
  BATTERY_ERROR_CODES,
  batteryReportSchema,
  type BatteryAnnouncement,
  type BatteryConfig,
  type BatteryReaderChannel,
  type BatteryReaderState,
  type BatteryReceiveMode,
  type BatteryReportAck,
  type BatterySnapshot,
} from '@meeshy/shared/types/battery';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  batteryEpisodeStep,
  batteryEstimatedMinutes,
  batteryReaderChannel,
  batteryReaderInConversation,
  batteryReaderState,
  type BatteryEpisodeState,
  type BatteryReading,
  type BatteryStepInput,
} from '@meeshy/shared/utils/battery-episode';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { comptesAuMoins } from '../friendship';
import { teamAccountIds } from '../relations/teamPeers';
import { BATTERY_AUDIENCE_LIMIT, batteryAccessAmong, batteryCandidatesOf, isServed, type BatteryDb, type BatteryReaderAccess } from './batteryAccess';
import {
  clearBatteryRecord,
  forgetCriticalReaders,
  readBatteryRecord,
  readCriticalReaders,
  rememberCriticalReaders,
  storeBatteryRecord,
  watchBatteryEmitter,
  watchedBatteryEmitters,
  withBatteryLock,
  type BatteryCache,
  type BatteryRecord,
} from './batteryStore';

/** Les trois faits qui disent qu'un lecteur est « en conversation » avec l'émetteur (§ 5). */
export type BatteryReaderContext = {
  readonly roomOpen: boolean;
  readonly lastExchangeAt: string | null;
  readonly awaitingReply: boolean;
};

export type BatteryContextReader = (params: {
  readonly emitterId: string;
  readonly readerIds: readonly string[];
  readonly now: Date;
}) => Promise<ReadonlyMap<string, BatteryReaderContext>>;

export type BatteryPush = { readonly readerId: string; readonly emitterId: string; readonly announcement: BatteryAnnouncement };

/** Rend `true` quand la notification a été créée (une préférence ou un blocage peuvent l'arrêter). */
export type BatteryPusher = (push: BatteryPush) => Promise<boolean>;

/** Un sens émetteur → lecteur dont la notification de batterie n'a plus lieu d'être. */
export type BatteryPushPair = { readonly emitterId: string; readonly readerId: string };

export type BatteryRelayDeps = {
  readonly prisma: BatteryDb;
  readonly cache: BatteryCache;
  readonly io: ServerEmitIO | undefined;
  readonly now: () => number;
  readonly context: BatteryContextReader;
  readonly push: BatteryPusher;
  /** Le téléphone suivi : la session qui relève est-elle l'appareil mobile le plus récemment actif ? */
  readonly isTrackedDevice: (params: { readonly userId: string; readonly sessionId: string | null }) => Promise<boolean>;
  /** Le téléphone suivi a-t-il une socket OUVERTE ? Une connexion vivante est un signe de vie (§ 4). */
  readonly trackedDeviceConnected?: (userId: string) => Promise<boolean>;
  /** Retire chez chaque lecteur les notifications de batterie d'un émetteur qu'il ne voit plus. */
  readonly retractPushes?: (pairs: readonly BatteryPushPair[]) => Promise<void>;
  /**
   * L'accord de batterie des partages de position en cours (#19204) : pour chaque émetteur
   * (minuscules), les lecteurs à qui son partage l'accorde. Absent : seuls les réglages durables valent.
   */
  readonly sharedBatteryGrants?: (emitterIds: readonly string[]) => Promise<ReadonlyMap<string, ReadonlySet<string>>>;
  readonly config?: BatteryConfig;
};

type AccessParams = Omit<Parameters<typeof batteryAccessAmong>[1], 'sharedGrants'>;

/**
 * La loi de la batterie, avec l'accord des partages de position en cours (#19204) lu MAINTENANT
 * pour les émetteurs en jeu. Une lecture ratée de l'accord n'ouvre rien : seuls les réglages durables valent.
 */
async function accessAmong(deps: BatteryRelayDeps, params: AccessParams): Promise<ReadonlyMap<string, BatteryReaderAccess>> {
  const emitterIds = params.subjectIs === 'target' ? [params.subjectId] : params.otherIds;
  const sharedGrants = deps.sharedBatteryGrants ? await deps.sharedBatteryGrants(emitterIds).catch(() => new Map<string, ReadonlySet<string>>()) : undefined;
  return batteryAccessAmong(deps.prisma, { ...params, ...(sharedGrants ? { sharedGrants } : {}) });
}

const configOf = (deps: BatteryRelayDeps): BatteryConfig => deps.config ?? BATTERY_CONFIG;

const MINUTE_MS = 60_000;

/**
 * L'horloge du téléphone n'est pas celle du serveur : au-delà de cet écart, le relevé est daté
 * à sa RÉCEPTION. Un téléphone en retard ne se fait plus présumer éteint juste après avoir
 * parlé, et un téléphone en avance ne fait plus ignorer ses relevés suivants.
 */
export const BATTERY_CLOCK_TOLERANCE_MS = 2 * MINUTE_MS;

const receivedAt = (measuredAt: string, now: number): string =>
  Math.abs(Date.parse(measuredAt) - now) > BATTERY_CLOCK_TOLERANCE_MS ? new Date(now).toISOString() : measuredAt;

/** Un lecteur injoignable n'arrête pas l'éventail. */
const safely = (send: () => void): void => {
  try {
    send();
  } catch {
    /* rien : l'épisode est déjà rangé */
  }
};

/**
 * Ce que le RÉGLAGE du lecteur fait du canal que le contexte a décidé : `critical` ne laisse
 * interrompre que le critique, `pill` jamais ; un push retenu devient SyncPill (app ouverte).
 */
export const batteryReceiveChannel = (channel: BatteryReaderChannel, receive: BatteryReceiveMode, kind: BatteryAnnouncement['kind']): BatteryReaderChannel => {
  if (channel !== 'push') return channel;
  if (receive === 'all') return 'push';
  if (receive === 'critical' && kind === 'critical') return 'push';
  return 'socket';
};

/** Un épisode NEUF s'ouvre (pas une reprise sous le délai) : la mémoire du critique repart de zéro. */
const opensFreshEpisode = (previous: BatteryEpisodeState | null, next: BatteryEpisodeState, at: string, config: BatteryConfig): boolean => {
  if (next.phase === 'normal' || (previous !== null && previous.phase !== 'normal')) return false;
  if (previous?.closedAt == null) return true;
  return Date.parse(at) - Date.parse(previous.closedAt) >= config.resumeWithinMinutes * MINUTE_MS;
};

/** L'ancre de la pente : le premier relevé en décharge, oubliée au branchement et hors épisode. */
const nextAnchor = (previous: BatteryRecord | null, episode: BatteryEpisodeState, reading: BatteryReading | null): BatteryReading | null => {
  if (episode.phase === 'normal') return null;
  if (reading === null) return previous?.anchor ?? null;
  if (reading.charging) return null;
  const kept = previous?.anchor;
  return kept && !kept.charging ? kept : reading;
};

/** L'état servi de l'émetteur — le même pour tout lecteur autorisé ; `null` hors épisode. */
export const servedBatteryState = (userId: string, record: BatteryRecord | null): BatteryReaderState | null => {
  if (!record) return null;
  const reading = record.episode.lastReading;
  const estimatedMinutes = reading ? batteryEstimatedMinutes(record.anchor, reading) : null;
  return batteryReaderState({ userId, state: record.episode, deviceLabel: record.deviceLabel, estimatedMinutes });
};

const emitChanged = (deps: BatteryRelayDeps, readerId: string, state: BatteryReaderState, announcement?: BatteryAnnouncement): void =>
  safely(() => deps.io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.BATTERY_CHANGED, { userId: state.userId, state, ...(announcement ? { announcement } : {}) }));

const emitCleared = (deps: BatteryRelayDeps, readerId: string, emitterId: string, announcement?: BatteryAnnouncement): void =>
  safely(() => deps.io?.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.BATTERY_CLEARED, { userId: emitterId, ...(announcement ? { announcement } : {}) }));

async function audienceOf(deps: BatteryRelayDeps, emitterId: string): Promise<ReadonlyMap<string, BatteryReaderAccess>> {
  const candidates = await batteryCandidatesOf(deps.prisma, emitterId);
  if (candidates.length === 0) return new Map();
  const access = await accessAmong(deps, { subjectId: emitterId, otherIds: candidates, subjectIs: 'target', now: new Date(deps.now()) });
  return new Map([...access].filter(([, a]) => isServed(a)));
}

type Step = {
  readonly emitterId: string;
  readonly previous: BatteryEpisodeState | null;
  readonly record: BatteryRecord;
  readonly announcements: readonly BatteryAnnouncement[];
  /** L'audience à servir, lue sous le verrou ; `null` quand ce pas ne sert personne. */
  readonly audience: ReadonlyMap<string, BatteryReaderAccess> | null;
  /** Qui voyait l'état et ne le voit plus (perte d'accès par n'importe quel chemin). */
  readonly departed: readonly string[];
  /** Qui avait reçu le push critique de l'épisode, lu avant qu'une clôture l'oublie. */
  readonly critical: ReadonlySet<string>;
};

/** UN lecteur : ses annonces routées, puis l'état (ou l'effacement) et ses pushs. Rend `true` s'il a reçu le push critique. */
async function serveReader(deps: BatteryRelayDeps, step: Step, readerId: string, access: BatteryReaderAccess, context: BatteryReaderContext | undefined): Promise<boolean> {
  const config = configOf(deps);
  const receivedCritical = step.critical.has(readerId);
  const inConversation = batteryReaderInConversation({
    now: new Date(deps.now()).toISOString(),
    roomOpen: context?.roomOpen ?? false,
    lastExchangeAt: context?.lastExchangeAt ?? null,
    awaitingReply: context?.awaitingReply ?? false,
  }, config);
  const routed = step.announcements.map((announcement) => ({
    announcement,
    channel: batteryReceiveChannel(batteryReaderChannel(announcement.kind, inConversation, receivedCritical), access.receive, announcement.kind),
  }));
  const pill = routed.filter((r) => r.channel === 'socket').map((r) => r.announcement);
  const state = servedBatteryState(step.emitterId, step.record);
  if (state) {
    if (pill.length === 0) emitChanged(deps, readerId, state);
    else pill.forEach((announcement) => emitChanged(deps, readerId, state, announcement));
  } else if (step.previous !== null && step.previous.phase !== 'normal') {
    if (pill.length === 0) emitCleared(deps, readerId, step.emitterId);
    else pill.forEach((announcement) => emitCleared(deps, readerId, step.emitterId, announcement));
  }
  let pushedCritical = false;
  for (const { announcement } of routed.filter((r) => r.channel === 'push')) {
    const pushed = await deps.push({ readerId, emitterId: step.emitterId, announcement }).catch(() => false);
    pushedCritical = pushedCritical || (pushed && announcement.kind === 'critical');
  }
  return pushedCritical;
}

/** Les notifications de batterie de qui a perdu l'accès se retirent ; un échec n'arrête rien. */
async function retract(deps: BatteryRelayDeps, pairs: readonly BatteryPushPair[]): Promise<void> {
  if (pairs.length === 0 || !deps.retractPushes) return;
  await deps.retractPushes(pairs).catch(() => undefined);
}

/** APRÈS l'écriture de l'état : les annonces partent seulement sur un état rangé. */
async function fanOut(deps: BatteryRelayDeps, step: Step): Promise<void> {
  step.departed.forEach((readerId) => emitCleared(deps, readerId, step.emitterId));
  await retract(deps, step.departed.map((readerId) => ({ emitterId: step.emitterId, readerId })));
  const audience = step.audience;
  if (audience === null || audience.size === 0) return;
  const readerIds = [...audience.keys()];
  const contexts = step.announcements.length > 0
    ? await deps.context({ emitterId: step.emitterId, readerIds, now: new Date(deps.now()) })
    : new Map<string, BatteryReaderContext>();
  const verdicts = await Promise.all(
    readerIds.map(async (readerId) => [readerId, await serveReader(deps, step, readerId, audience.get(readerId)!, contexts.get(readerId))] as const),
  );
  if (step.record.episode.phase === 'normal') return;
  await rememberCriticalReaders(deps.cache, step.emitterId, verdicts.filter(([, pushed]) => pushed).map(([id]) => id));
}

/** Le pas lui-même, SOUS le verrou de l'émetteur : lecture, calcul, audience, écriture. */
async function advanceLocked(deps: BatteryRelayDeps, emitterId: string, input: BatteryStepInput, deviceLabel?: string): Promise<Step> {
  const config = configOf(deps);
  const stored = await readBatteryRecord(deps.cache, emitterId);
  const previous = stored?.episode ?? null;
  const { state, announcements } = batteryEpisodeStep(previous, input, config);
  const reading = input.kind === 'reading' && state.lastReading?.measuredAt === input.measuredAt ? state.lastReading : null;
  const wasServed = previous !== null && previous.phase !== 'normal';
  const serves = (reading !== null || announcements.length > 0) && (state.phase !== 'normal' || wasServed);
  const audience = serves ? await audienceOf(deps, emitterId) : null;
  const shown = state.phase !== 'normal' && state.lastReading !== null;
  const servedBefore = stored?.servedTo ?? [];
  const record: BatteryRecord = {
    episode: state,
    anchor: nextAnchor(stored, state, reading),
    deviceLabel: deviceLabel ?? stored?.deviceLabel ?? null,
    servedTo: audience === null ? servedBefore : shown ? [...audience.keys()] : [],
  };
  const at = input.kind === 'tick' ? input.now : input.kind === 'alive' ? input.at : input.measuredAt;
  if (opensFreshEpisode(previous, state, at, config)) await forgetCriticalReaders(deps.cache, emitterId);
  const critical = serves ? await readCriticalReaders(deps.cache, emitterId) : new Set<string>();
  await storeBatteryRecord(deps.cache, emitterId, record);
  await watchBatteryEmitter(deps.cache, emitterId, state.phase !== 'normal');
  if (state.phase === 'normal' && wasServed) await forgetCriticalReaders(deps.cache, emitterId);
  const departed = audience === null ? [] : servedBefore.filter((id) => !audience.has(id));
  return { emitterId, previous, record, announcements, audience, departed, critical };
}

/**
 * Fait avancer l'épisode d'UN pas sous le verrou de l'émetteur (un relevé, un signe de vie et un
 * balayage qui se croisent ne s'écrasent jamais), puis sert les lecteurs. LÈVE si l'état ne se
 * range pas ou si le verrou reste pris.
 */
async function advance(deps: BatteryRelayDeps, emitterId: string, input: BatteryStepInput, deviceLabel?: string): Promise<Step> {
  const step = await withBatteryLock(deps.cache, emitterId, () => advanceLocked(deps, emitterId, input, deviceLabel));
  await fanOut(deps, step);
  return step;
}

const failed = (code: (typeof BATTERY_ERROR_CODES)[keyof typeof BATTERY_ERROR_CODES], error: string) => ({ success: false, error, code }) as const;

/** La coupure globale ferme aussi la COLLECTE : rien n'est rangé de ce que l'émetteur ne partage plus. */
async function sharingDisabled(deps: BatteryRelayDeps, emitterId: string): Promise<boolean> {
  const row = await deps.prisma.user.findUnique({ where: { id: emitterId }, select: { batterySharingDisabledAt: true } });
  return Boolean(row?.batterySharingDisabledAt);
}

/** `battery:report` et `POST /me/device/battery` : la MÊME charge, la MÊME porte. */
export async function reportBattery(
  deps: BatteryRelayDeps,
  params: { readonly emitterId: string; readonly sessionId: string | null; readonly payload: unknown },
): Promise<BatteryReportAck> {
  const parsed = batteryReportSchema.safeParse(params.payload);
  if (!parsed.success) return failed(BATTERY_ERROR_CODES.INVALID, 'Relevé illisible');
  if (!(await deps.isTrackedDevice({ userId: params.emitterId, sessionId: params.sessionId }))) return { success: true, data: { tracked: false } };
  if (await sharingDisabled(deps, params.emitterId)) return { success: true, data: { tracked: false } };
  const { deviceLabel, ...reading } = parsed.data;
  try {
    await advance(deps, params.emitterId, { kind: 'reading', ...reading, measuredAt: receivedAt(reading.measuredAt, deps.now()) }, deviceLabel);
  } catch {
    return failed(BATTERY_ERROR_CODES.UNAVAILABLE, 'Batterie momentanément indisponible');
  }
  return { success: true, data: { tracked: true } };
}

/** Une connexion est un signe de vie : l'extinction ne se présume plus depuis le dernier relevé. */
export async function markBatteryAlive(deps: BatteryRelayDeps, userId: string): Promise<void> {
  if (!(await readBatteryRecord(deps.cache, userId))) return;
  await advance(deps, userId, { kind: 'alive', at: new Date(deps.now()).toISOString() });
}

/**
 * Le BALAYAGE d'extinction : chaque épisode en cours reçoit un `tick`. Idempotent — un émetteur
 * déjà présumé éteint ne ré-annonce rien, un émetteur sans épisode cesse d'être surveillé. Un
 * téléphone critique dont la socket est OUVERTE n'est pas éteint : sa connexion est un signe de vie.
 */
export async function sweepBatteryOff(deps: BatteryRelayDeps): Promise<number> {
  const emitters = await watchedBatteryEmitters(deps.cache);
  const now = new Date(deps.now()).toISOString();
  const announced = await Promise.all(
    emitters.map(async (emitterId) => {
      const record = await readBatteryRecord(deps.cache, emitterId);
      if (!record) {
        await watchBatteryEmitter(deps.cache, emitterId, false);
        return 0;
      }
      if (record.episode.phase === 'critical' && (await deps.trackedDeviceConnected?.(emitterId))) {
        await advance(deps, emitterId, { kind: 'alive', at: now });
        return 0;
      }
      return (await advance(deps, emitterId, { kind: 'tick', now })).announcements.length;
    }),
  );
  return announced.filter((count) => count > 0).length;
}

/** Ce que `readerId` voit, à la connexion : les épisodes en cours de ceux qui le lui partagent. */
export async function batterySnapshotFor(deps: BatteryRelayDeps, readerId: string): Promise<BatterySnapshot> {
  const candidates = await batteryCandidatesOf(deps.prisma, readerId);
  const states = (await Promise.all(candidates.map(async (id) => servedBatteryState(id, await readBatteryRecord(deps.cache, id)))))
    .filter((state): state is BatteryReaderState => state !== null);
  if (states.length === 0) return { items: [] };
  const access = await accessAmong(deps, { subjectId: readerId, otherIds: states.map((s) => s.userId), subjectIs: 'viewer', now: new Date(deps.now()) });
  return { items: states.filter((state) => isServed(access.get(state.userId))) };
}

/** L'état de `emitterId` tel que `readerId` le voit — `null` hors épisode ou si la loi refuse. */
export async function batteryStateFor(deps: BatteryRelayDeps, params: { readonly readerId: string; readonly emitterId: string }): Promise<BatteryReaderState | null> {
  const state = servedBatteryState(params.emitterId, await readBatteryRecord(deps.cache, params.emitterId));
  if (!state) return null;
  const access = await accessAmong(deps, { subjectId: params.emitterId, otherIds: [params.readerId], subjectIs: 'target', now: new Date(deps.now()) });
  return isServed(access.get(params.readerId)) ? state : null;
}

/**
 * Le DERNIER RELEVÉ de `emitterId` tel que `readerId` le reçoit déjà (hors épisode compris) — pour
 * l'alerte d'inactivité (#18738). La loi est jugée AVANT la lecture ; `null` quand elle refuse.
 */
export async function batteryLastReadingFor(deps: BatteryRelayDeps, params: { readonly readerId: string; readonly emitterId: string }): Promise<{ readonly level: number; readonly measuredAt: string } | null> {
  const access = await accessAmong(deps, { subjectId: params.emitterId, otherIds: [params.readerId], subjectIs: 'target', now: new Date(deps.now()) });
  if (!isServed(access.get(params.readerId))) return null;
  const reading = (await readBatteryRecord(deps.cache, params.emitterId))?.episode.lastReading ?? null;
  return reading ? { level: reading.level, measuredAt: reading.measuredAt } : null;
}

/** Ce que chaque sens d'une paire voit MAINTENANT (`émetteur>lecteur`), pour les seuls épisodes en cours. */
export type BatteryPairAccess = ReadonlyMap<string, boolean>;

const directions = (userA: string, userB: string) => [[userA, userB], [userB, userA]] as const;
export const batteryDirectionKey = (emitterId: string, readerId: string): string => `${emitterId}>${readerId}`;

async function seesNow(deps: BatteryRelayDeps, emitterId: string, readerId: string): Promise<boolean> {
  const access = await accessAmong(deps, { subjectId: emitterId, otherIds: [readerId], subjectIs: 'target', now: new Date(deps.now()) });
  return isServed(access.get(readerId));
}

/** À capturer AVANT une baisse, un blocage ou un retrait : l'effacement ne part que vers qui VOYAIT. */
export async function captureBatteryAccess(deps: BatteryRelayDeps, pair: { readonly userA: string; readonly userB: string }): Promise<BatteryPairAccess> {
  const seen = new Map<string, boolean>();
  for (const [emitterId, readerId] of directions(pair.userA, pair.userB)) {
    if (!servedBatteryState(emitterId, await readBatteryRecord(deps.cache, emitterId))) continue;
    seen.set(batteryDirectionKey(emitterId, readerId), await seesNow(deps, emitterId, readerId));
  }
  return seen;
}

/** Le registre « à qui l'état a été servi », retouché sous le verrou de l'émetteur. */
async function adjustServed(deps: BatteryRelayDeps, emitterId: string, change: { readonly add?: readonly string[]; readonly remove?: readonly string[] }): Promise<void> {
  await withBatteryLock(deps.cache, emitterId, async () => {
    const record = await readBatteryRecord(deps.cache, emitterId);
    if (!record) return;
    const removed = new Set(change.remove ?? []);
    const servedTo = [...new Set([...record.servedTo, ...(change.add ?? [])])].filter((id) => !removed.has(id));
    await storeBatteryRecord(deps.cache, emitterId, { ...record, servedTo });
  });
}

/**
 * Rejoue la projection d'une paire dans les DEUX sens après un changement de lien, de
 * consentement, de réglage de réception ou de blocage. `changed` part vers qui gagne l'accès ;
 * `cleared` vers qui voyait AVANT (`before`, ou le registre des lecteurs servis) et ne voit plus.
 * Qui perd l'accès perd aussi les notifications de batterie de l'autre, épisode en cours ou non.
 */
export async function refreshBatteryBetween(
  deps: BatteryRelayDeps,
  params: { readonly userA: string; readonly userB: string; readonly before?: BatteryPairAccess },
): Promise<void> {
  for (const [emitterId, readerId] of directions(params.userA, params.userB)) {
    const after = await seesNow(deps, emitterId, readerId);
    if (!after) await retract(deps, [{ emitterId, readerId }]);
    const record = await readBatteryRecord(deps.cache, emitterId);
    const state = servedBatteryState(emitterId, record);
    if (!state || !record) continue;
    const before = (params.before?.get(batteryDirectionKey(emitterId, readerId)) ?? false) || record.servedTo.includes(readerId);
    if (after && !before) {
      emitChanged(deps, readerId, state);
      await adjustServed(deps, emitterId, { add: [readerId] });
    } else if (!after && before) {
      emitCleared(deps, readerId, emitterId);
      await adjustServed(deps, emitterId, { remove: [readerId] });
    }
  }
}

/** Les lecteurs qui voient l'épisode de `emitterId` MAINTENANT — à capturer avant une coupure globale. */
export async function captureBatteryAudience(deps: BatteryRelayDeps, emitterId: string): Promise<ReadonlySet<string>> {
  if (!servedBatteryState(emitterId, await readBatteryRecord(deps.cache, emitterId))) return new Set();
  return new Set((await audienceOf(deps, emitterId)).keys());
}

/**
 * Rejoue l'audience ENTIÈRE d'un émetteur après sa coupure ou sa reprise globale : `changed` vers
 * qui gagne l'accès, `cleared` vers qui voyait (`before`) et ne voit plus. Chaque candidat qui ne
 * voit plus perd les notifications de batterie de l'émetteur.
 */
export async function refreshBatteryAudience(deps: BatteryRelayDeps, params: { readonly emitterId: string; readonly before: ReadonlySet<string> }): Promise<void> {
  const after = await audienceOf(deps, params.emitterId);
  const candidates = await batteryCandidatesOf(deps.prisma, params.emitterId);
  await retract(deps, candidates.filter((id) => !after.has(id)).map((readerId) => ({ emitterId: params.emitterId, readerId })));
  const record = await readBatteryRecord(deps.cache, params.emitterId);
  const state = servedBatteryState(params.emitterId, record);
  if (!state || !record) return;
  const seen = new Set([...params.before, ...record.servedTo]);
  [...after.keys()].filter((id) => !seen.has(id)).forEach((id) => emitChanged(deps, id, state));
  [...seen].filter((id) => !after.has(id)).forEach((id) => emitCleared(deps, id, params.emitterId));
  await adjustServed(deps, params.emitterId, { add: [...after.keys()], remove: [...seen].filter((id) => !after.has(id)) });
}

/**
 * La COUPURE GLOBALE ferme aussi ce qui est rangé : l'épisode, la mémoire du critique et la
 * surveillance s'effacent, si bien qu'une reprise ne sert rien de mesuré pendant la coupure.
 */
export async function forgetBatteryOf(deps: BatteryRelayDeps, emitterId: string): Promise<void> {
  await withBatteryLock(deps.cache, emitterId, async () => {
    await clearBatteryRecord(deps.cache, emitterId);
    await forgetCriticalReaders(deps.cache, emitterId);
    await watchBatteryEmitter(deps.cache, emitterId, false);
  });
}

/**
 * Un compte a perdu des accès HORS des routes de lien (rôle d'équipe retiré, compte désactivé,
 * banni ou supprimé) : rien ne les avait capturés. Le registre des lecteurs servis le dit — dans
 * les deux sens : comme émetteur, qui le voyait et ne le voit plus reçoit son effacement ; comme
 * lecteur, chaque émetteur lié ou de l'équipe qui le lui servait le lui retire. Les notifications
 * de batterie suivent.
 */
export async function reconcileBatteryOfAccount(deps: BatteryRelayDeps, userId: string): Promise<void> {
  const own = await readBatteryRecord(deps.cache, userId);
  if (own && own.servedTo.length > 0) {
    const audience = await audienceOf(deps, userId);
    const departed = own.servedTo.filter((id) => !audience.has(id));
    departed.forEach((readerId) => emitCleared(deps, readerId, userId));
    await retract(deps, departed.map((readerId) => ({ emitterId: userId, readerId })));
    if (departed.length > 0) await adjustServed(deps, userId, { remove: departed });
  }
  const [linked, team] = await Promise.all([
    comptesAuMoins(deps.prisma, userId, 'CLOSE', { limit: BATTERY_AUDIENCE_LIMIT }),
    teamAccountIds(deps.prisma),
  ]);
  const emitters = [...new Set([...linked.map((link) => link.id), ...team])].filter((id) => id !== userId);
  if (emitters.length === 0) return;
  const access = await accessAmong(deps, { subjectId: userId, otherIds: emitters, subjectIs: 'viewer', now: new Date(deps.now()) });
  const lost = emitters.filter((emitterId) => !isServed(access.get(emitterId)));
  for (const emitterId of lost) {
    const record = await readBatteryRecord(deps.cache, emitterId);
    if (!record?.servedTo.includes(userId)) continue;
    emitCleared(deps, userId, emitterId);
    await adjustServed(deps, emitterId, { remove: [userId] });
  }
  await retract(deps, lost.map((emitterId) => ({ emitterId, readerId: userId })));
}

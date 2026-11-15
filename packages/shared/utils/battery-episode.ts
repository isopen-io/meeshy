/**
 * L'ÉPISODE DE BATTERIE — la fonction PURE qui décide, relevé après relevé, ce que les
 * Proches et les Sangs apprennent de la batterie d'une personne (#14147).
 *
 * Le serveur la fait tourner (relais `battery`) ; les miroirs Swift et Kotlin la rejouent
 * sur `fixtures/battery-episode-cases.json`. Aucun seuil n'est écrit ici : tout vient de
 * `BatteryConfig` (`BATTERY_CONFIG`). Spec : `docs/superpowers/specs/2026-11-15-batterie-proches-design.md` § 4 et § 5.
 */
import type { BatteryAnnouncement, BatteryReaderState, BatteryServedPhase } from '../types/battery.js';
import type {
  BatteryAnnouncementKind,
  BatteryConfig,
  BatteryPhase,
  BatteryReaderChannel,
} from '../types/battery-constants.js';

export type BatteryReading = {
  readonly level: number;
  readonly charging: boolean;
  readonly lowPower: boolean;
  readonly measuredAt: string;
};

/** L'état d'épisode d'UN émetteur, rangé côté serveur (Redis, TTL 24 h, aucun historique). */
export type BatteryEpisodeState = {
  readonly phase: BatteryPhase;
  /** Les seuils déjà annoncés dans l'épisode (le seuil d'alerte et les paliers). */
  readonly announcedThresholds: readonly number[];
  /** Le plus bas niveau critique déjà annoncé ; nul hors critique. */
  readonly criticalFloor: number | null;
  /** Quand l'épisode précédent s'est clos : un épisode rouvert avant `resumeWithinMinutes` le reprend. */
  readonly closedAt: string | null;
  readonly lastReading: BatteryReading | null;
  /** Dernier signe de vie (relevé ou connexion) : l'extinction se présume depuis lui. */
  readonly lastSeenAt: string | null;
};

export type BatteryStepInput =
  | ({ readonly kind: 'reading' } & BatteryReading)
  | { readonly kind: 'alive'; readonly at: string }
  | { readonly kind: 'tick'; readonly now: string };

export type BatteryStepResult = {
  readonly state: BatteryEpisodeState;
  readonly announcements: readonly BatteryAnnouncement[];
};

const INITIAL_STATE: BatteryEpisodeState = {
  phase: 'normal',
  announcedThresholds: [],
  criticalFloor: null,
  closedAt: null,
  lastReading: null,
  lastSeenAt: null,
};

const MINUTE_MS = 60_000;

const ms = (iso: string): number => Date.parse(iso);

const latest = (a: string | null, b: string): string => (a !== null && ms(a) > ms(b) ? a : b);

const announce = (kind: BatteryAnnouncementKind, reading: BatteryReading, threshold?: number): BatteryAnnouncement => ({
  kind,
  level: reading.level,
  ...(threshold === undefined ? {} : { threshold }),
  at: reading.measuredAt,
});

const result = (state: BatteryEpisodeState, announcements: readonly BatteryAnnouncement[] = []): BatteryStepResult => ({
  state,
  announcements,
});

const close = (state: BatteryEpisodeState, reading: BatteryReading, kind: 'ended' | 'recharged'): BatteryStepResult =>
  result({ ...state, phase: 'normal', closedAt: reading.measuredAt }, [announce(kind, reading)]);

const allThresholds = (config: BatteryConfig): readonly number[] => [config.lowThreshold, ...config.steps];

/** Un épisode rouvert avant le délai de reprise garde ses seuils annoncés et son plancher critique. */
const opened = (state: BatteryEpisodeState, reading: BatteryReading, config: BatteryConfig): BatteryEpisodeState => {
  const resumed = state.closedAt !== null && ms(reading.measuredAt) - ms(state.closedAt) < config.resumeWithinMinutes * MINUTE_MS;
  return resumed ? { ...state, phase: 'low' } : { ...state, phase: 'low', announcedThresholds: [], criticalFloor: null };
};

const enterCritical = (state: BatteryEpisodeState, reading: BatteryReading, config: BatteryConfig): BatteryStepResult => {
  const next: BatteryEpisodeState = {
    ...state,
    phase: 'critical',
    announcedThresholds: allThresholds(config),
    criticalFloor: Math.min(state.criticalFloor ?? reading.level, reading.level),
  };
  if (state.criticalFloor === null) return result(next, [announce('critical', reading)]);
  return result(next, reading.level < state.criticalFloor ? [announce('critical-drop', reading)] : []);
};

const stepLow = (state: BatteryEpisodeState, reading: BatteryReading, config: BatteryConfig): BatteryStepResult => {
  if (reading.charging) return close(state, reading, 'ended');
  if (reading.level > config.closeAbove) return close(state, reading, 'ended');
  if (reading.level <= config.criticalThreshold) return enterCritical(state, reading, config);
  const crossed = allThresholds(config).filter((t) => reading.level <= t && !state.announcedThresholds.includes(t));
  if (crossed.length === 0) return result(state);
  const next = { ...state, announcedThresholds: [...state.announcedThresholds, ...crossed] };
  return crossed.includes(config.lowThreshold)
    ? result(next, [announce('low', reading)])
    : result(next, [announce('threshold', reading, Math.min(...crossed))]);
};

const stepNormal = (state: BatteryEpisodeState, reading: BatteryReading, config: BatteryConfig): BatteryStepResult => {
  if (reading.charging || reading.level > config.lowThreshold) return result(state);
  return stepLow(opened(state, reading, config), reading, config);
};

const stepCharging = (state: BatteryEpisodeState, reading: BatteryReading, config: BatteryConfig): BatteryStepResult => {
  if (reading.charging) return reading.level >= config.fullLevel ? close(state, reading, 'recharged') : result(state);
  if (reading.level > config.rechargedUnpluggedAbove) return close(state, reading, 'recharged');
  if (reading.level > config.lowThreshold) return close(state, reading, 'ended');
  return stepNormal({ ...state, phase: 'normal' }, reading, config);
};

const stepCritical = (state: BatteryEpisodeState, reading: BatteryReading, config: BatteryConfig): BatteryStepResult => {
  if (reading.charging) {
    const charging: BatteryEpisodeState = { ...state, phase: 'charging', closedAt: reading.measuredAt };
    const plugged = result(charging, [announce('charging', reading)]);
    return reading.level >= config.fullLevel ? withPrefix(plugged.announcements, close(charging, reading, 'recharged')) : plugged;
  }
  if (reading.level > config.rechargedUnpluggedAbove) return close(state, reading, 'recharged');
  if (reading.level > config.closeAbove) return close(state, reading, 'ended');
  const floor = state.criticalFloor ?? reading.level;
  if (reading.level > config.criticalThreshold || reading.level >= floor) return result({ ...state, criticalFloor: floor });
  return result({ ...state, criticalFloor: reading.level }, [announce('critical-drop', reading)]);
};

const withPrefix = (prefix: readonly BatteryAnnouncement[], step: BatteryStepResult): BatteryStepResult =>
  result(step.state, [...prefix, ...step.announcements]);

/** Le premier relevé après une extinction présumée : le retour, puis la suite comme en critique (plancher repris en silence). */
const stepBackOn = (state: BatteryEpisodeState, reading: BatteryReading, config: BatteryConfig): BatteryStepResult => {
  const floor = reading.level <= config.criticalThreshold ? Math.min(state.criticalFloor ?? reading.level, reading.level) : state.criticalFloor;
  return withPrefix([announce('back-on', reading)], stepCritical({ ...state, phase: 'critical', criticalFloor: floor }, reading, config));
};

const PHASE_STEP: Readonly<Record<BatteryPhase, (s: BatteryEpisodeState, r: BatteryReading, c: BatteryConfig) => BatteryStepResult>> = {
  normal: stepNormal,
  low: stepLow,
  critical: stepCritical,
  off: stepBackOn,
  charging: stepCharging,
};

const stepReading = (state: BatteryEpisodeState, reading: BatteryReading, config: BatteryConfig): BatteryStepResult => {
  if (state.lastReading !== null && ms(reading.measuredAt) < ms(state.lastReading.measuredAt)) return result(state);
  const seen: BatteryEpisodeState = { ...state, lastReading: reading, lastSeenAt: latest(state.lastSeenAt, reading.measuredAt) };
  return PHASE_STEP[state.phase](seen, reading, config);
};

const stepTick = (state: BatteryEpisodeState, now: string, config: BatteryConfig): BatteryStepResult => {
  const silent = state.lastSeenAt !== null && ms(now) - ms(state.lastSeenAt) >= config.offAfterMinutes * MINUTE_MS;
  if (state.phase !== 'critical' || !silent) return result(state);
  return result({ ...state, phase: 'off' }, [{ kind: 'probably-off', level: state.lastReading?.level ?? null, at: now }]);
};

export const batteryEpisodeStep = (
  previous: BatteryEpisodeState | null,
  input: BatteryStepInput,
  config: BatteryConfig,
): BatteryStepResult => {
  const state = previous ?? INITIAL_STATE;
  switch (input.kind) {
    case 'reading':
      return stepReading(state, { level: input.level, charging: input.charging, lowPower: input.lowPower, measuredAt: input.measuredAt }, config);
    case 'alive':
      return result({ ...state, lastSeenAt: latest(state.lastSeenAt, input.at) });
    case 'tick':
      return stepTick(state, input.now, config);
  }
};

/** Les annonces qu'un lecteur HORS conversation reçoit par push, critique reçu ou non. */
const PUSHED_OUT_OF_CONVERSATION: ReadonlySet<BatteryAnnouncementKind> = new Set<BatteryAnnouncementKind>([
  'critical',
  'probably-off',
  'back-on',
  'recharged',
]);

/**
 * LE CONTEXTE DÉCIDE (§ 5) : en conversation, tout part dans la SyncPill (`socket`) ; hors
 * conversation, seuls le critique, l'extinction, le retour et la recharge interrompent,
 * par push — et la charge aussi, pour qui a reçu le push critique (il reçoit la suite).
 */
export const batteryReaderChannel = (
  kind: BatteryAnnouncementKind,
  inConversation: boolean,
  receivedCritical: boolean,
): BatteryReaderChannel => {
  if (inConversation) return 'socket';
  if (PUSHED_OUT_OF_CONVERSATION.has(kind)) return 'push';
  return kind === 'charging' && receivedCritical ? 'push' : 'none';
};

/**
 * Un lecteur est « en conversation » avec l'émetteur s'il a la conversation directe ouverte,
 * si un message a été échangé entre eux dans la fenêtre (bornes incluses), ou si son dernier
 * message à l'émetteur attend une réponse. Les trois faits sont lus par la passerelle.
 */
export const batteryReaderInConversation = (
  input: { readonly now: string; readonly roomOpen: boolean; readonly lastExchangeAt: string | null; readonly awaitingReply: boolean },
  config: BatteryConfig,
): boolean =>
  input.roomOpen ||
  input.awaitingReply ||
  (input.lastExchangeAt !== null && ms(input.now) - ms(input.lastExchangeAt) <= config.conversationWindowMinutes * MINUTE_MS);

/**
 * Les minutes restantes à la pente observée entre l'ANCRE (premier relevé en décharge de
 * l'épisode, choisi par la passerelle) et le relevé courant ; `null` dès que la pente
 * n'est pas une décharge mesurable. Une estimation, jamais une promesse : optionnelle.
 */
export const batteryEstimatedMinutes = (anchor: BatteryReading | null, current: BatteryReading): number | null => {
  if (anchor === null || anchor.charging || current.charging) return null;
  const elapsedMinutes = (ms(current.measuredAt) - ms(anchor.measuredAt)) / MINUTE_MS;
  const lost = anchor.level - current.level;
  if (elapsedMinutes <= 0 || lost <= 0) return null;
  return Math.round((current.level * elapsedMinutes) / lost);
};

/** Ce qu'UN lecteur autorisé voit de l'état : rien hors épisode ou sans relevé. */
export const batteryReaderState = (params: {
  readonly userId: string;
  readonly state: BatteryEpisodeState;
  readonly deviceLabel?: string | null;
  readonly estimatedMinutes?: number | null;
}): BatteryReaderState | null => {
  const { state } = params;
  if (state.phase === 'normal' || state.lastReading === null) return null;
  return {
    userId: params.userId,
    phase: state.phase satisfies BatteryServedPhase,
    level: state.lastReading.level,
    charging: state.lastReading.charging,
    lowPower: state.lastReading.lowPower,
    ...(params.estimatedMinutes === null || params.estimatedMinutes === undefined ? {} : { estimatedMinutes: params.estimatedMinutes }),
    measuredAt: state.lastReading.measuredAt,
    ...(params.deviceLabel ? { deviceLabel: params.deviceLabel } : {}),
  };
};

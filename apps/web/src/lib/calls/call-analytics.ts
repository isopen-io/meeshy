import type { CallAnalyticsEvent, CallQualityDistribution, ConnectionQualityLevel, ConnectionQualityStats } from '@meeshy/shared/types/video-call';

import { estimateCallMos } from '@meeshy/shared/utils/call-mos';

import { combineMediaQuality, type MediaQuality } from './call-analytics-stats';
import type { PeerQuality } from './call-quality';

/**
 * **CE QUE LE CLIENT RAPPORTE D'UN APPEL** (#8047) — `call:quality-report` à
 * chaque relevé, et l'accumulateur de `call:analytics`
 * (`CallAnalyticsEvent`, validé par `socketCallAnalyticsSchema`), émis une fois
 * au raccrochage. Le legacy l'émettait avec `codec: 'unknown'` et
 * `transcriptionUsed: false` codés en dur : ici chaque champ est LU — le codec
 * dans `getStats`, les sous-titres quand ils ont été affichés, les effets de ma
 * vidéo posés pendant l'appel (#8442) : `effectsUsed` les nomme
 * (`filter:warm`, `brightness`, `background-blur`), `filtersUsed` dit si la
 * couleur a été touchée.
 *
 * Mémoire bornée (un appel peut durer des heures) : des sommes et des
 * compteurs, jamais l'historique des échantillons.
 */

export type Telemetry = {
  readonly startedAt: number;
  readonly negotiatingAt: number | null;
  readonly connectedAt: number | null;
  readonly reconnections: number;
  readonly networkTransitions: number;
  readonly samples: number;
  readonly rttSum: number;
  readonly lossSum: number;
  readonly maxLoss: number;
  readonly levels: CallQualityDistribution;
  readonly codec: string | null;
  readonly captionsShown: boolean;
  readonly effects: readonly string[];
  /**
   * #19876 — le dernier relevé des compteurs cumulés de CHAQUE pair, par pair :
   * un pair parti ou dont le dernier `getStats` a échoué garde le sien ; un lien
   * reconstruit pour le même pair remplace son entrée. Borné par le nombre de pairs.
   */
  readonly peers: Readonly<Record<string, MediaQuality>>;
  readonly mediaSamples: number;
  readonly jitterSum: number;
  readonly limitations: Readonly<Record<LimitationReason, number>>;
};

const LIMITATION_REASONS = ['bandwidth', 'cpu', 'none', 'other'] as const;
type LimitationReason = (typeof LIMITATION_REASONS)[number];
const isLimitationReason = (reason: string | null): reason is LimitationReason => LIMITATION_REASONS.some((known) => known === reason);
const NO_LIMITATIONS: Readonly<Record<LimitationReason, number>> = { bandwidth: 0, cpu: 0, none: 0, other: 0 };

export type TelemetrySample = { readonly level: ConnectionQualityLevel; readonly rtt: number; readonly packetLoss: number };

export type AnalyticsContext = { readonly callId: string; readonly now: number; readonly isVideo: boolean; readonly endReason: string; readonly platform: string; readonly deviceModel: string };

const NO_LEVELS: CallQualityDistribution = { excellent: 0, good: 0, fair: 0, poor: 0 };

export function createTelemetry(startedAt: number): Telemetry {
  return { startedAt, negotiatingAt: null, connectedAt: null, reconnections: 0, networkTransitions: 0, samples: 0, rttSum: 0, lossSum: 0, maxLoss: 0, levels: NO_LEVELS, codec: null, captionsShown: false, effects: [], peers: {}, mediaSamples: 0, jitterSum: 0, limitations: NO_LIMITATIONS };
}

/** Le décroché, ou l'arrivée du pair : ce qui sépare la sonnerie humaine de la négociation WebRTC. */
export const markNegotiating = (telemetry: Telemetry, at: number): Telemetry => (telemetry.negotiatingAt === null ? { ...telemetry, negotiatingAt: at } : telemetry);

/** Le premier `connected` ancre l'établissement ; une reconnexion ne le déplace pas. */
export const markConnected = (telemetry: Telemetry, at: number): Telemetry => (telemetry.connectedAt === null ? { ...telemetry, connectedAt: at } : telemetry);

export const markReconnecting = (telemetry: Telemetry): Telemetry => ({ ...telemetry, reconnections: telemetry.reconnections + 1 });

export const markNetworkChange = (telemetry: Telemetry): Telemetry => ({ ...telemetry, networkTransitions: telemetry.networkTransitions + 1 });

export const markCaptions = (telemetry: Telemetry): Telemetry => (telemetry.captionsShown ? telemetry : { ...telemetry, captionsShown: true });

/** Les effets actifs à un instant : l'appel retient chacun, une fois. */
export function markEffects(telemetry: Telemetry, names: readonly string[]): Telemetry {
  const added = names.filter((name) => !telemetry.effects.includes(name));
  return added.length === 0 ? telemetry : { ...telemetry, effects: [...telemetry.effects, ...added] };
}

const isColorFilter = (name: string): boolean => name.startsWith('filter:') || name === 'brightness';

export const withCodec = (telemetry: Telemetry, codec: string | null): Telemetry => (codec === null || codec === telemetry.codec ? telemetry : { ...telemetry, codec });

export function withSample(telemetry: Telemetry, sample: TelemetrySample): Telemetry {
  return {
    ...telemetry,
    samples: telemetry.samples + 1,
    rttSum: telemetry.rttSum + sample.rtt,
    lossSum: telemetry.lossSum + sample.packetLoss,
    maxLoss: Math.max(telemetry.maxLoss, sample.packetLoss),
    levels: { ...telemetry.levels, [sample.level]: telemetry.levels[sample.level] + 1 },
  };
}

/**
 * #19876 — un relevé média (`CallAnalyticsRecorder.recordMedia`, iOS) : les
 * compteurs cumulés de chaque pair relevé remplacent les siens, la gigue s'ajoute pour le MOS,
 * et chaque pair compte sa cause de limitation.
 */
export function withMedia(telemetry: Telemetry, peers: Readonly<Record<string, MediaQuality>>, jitterMs: number): Telemetry {
  const read = Object.values(peers);
  if (read.length === 0) return telemetry;
  const limitations = read.map((peer) => peer.qualityLimitationReason).filter(isLimitationReason).reduce((counts, reason) => ({ ...counts, [reason]: counts[reason] + 1 }), telemetry.limitations);
  return { ...telemetry, peers: { ...telemetry.peers, ...peers }, mediaSamples: telemetry.mediaSamples + 1, jitterSum: telemetry.jitterSum + (Number.isFinite(jitterMs) ? Math.max(jitterMs, 0) : 0), limitations };
}

/** La cause la plus fréquente ; à égalité, la première dans l'ordre alphabétique, comme iOS. */
const dominantLimitation = (counts: Readonly<Record<LimitationReason, number>>): LimitationReason | null =>
  LIMITATION_REASONS.reduce<LimitationReason | null>((best, reason) => (counts[reason] > (best === null ? 0 : counts[best]) ? reason : best), null);

const present = <K extends string, V>(key: K, value: V | null): Partial<Record<K, V>> => (value === null ? {} : ({ [key]: value } as Record<K, V>));

const measure = (value: number | null): number | null => (value !== null && Number.isFinite(value) && value >= 0 ? value : null);

const count = (value: number | null): number | null => {
  const rounded = value === null ? null : Math.round(value);
  return rounded !== null && rounded >= 0 && rounded <= Number.MAX_SAFE_INTEGER ? rounded : null;
};

/** Les champs de qualité (#11277), chacun SEULEMENT s'il a été mesuré : un client n'invente aucune valeur. */
function mediaFields(telemetry: Telemetry, averageRtt: number, averagePacketLoss: number): Partial<CallAnalyticsEvent> {
  const { mediaSamples } = telemetry;
  const media = combineMediaQuality(Object.values(telemetry.peers));
  if (media === null || mediaSamples === 0) return {};
  const emitted = media.jitterBufferEmittedCount ?? 0;
  const mos = estimateCallMos({ roundTripTimeMs: averageRtt, jitterMs: telemetry.jitterSum / mediaSamples, packetLossPercent: averagePacketLoss });
  return {
    ...present('freezeCount', count(media.freezeCount)),
    ...present('totalFreezesDuration', measure(media.totalFreezesDuration)),
    ...present('qualityLimitationReason', dominantLimitation(telemetry.limitations)),
    ...present('jitterBufferDelay', media.jitterBufferDelay === null || emitted <= 0 ? null : measure((media.jitterBufferDelay * 1000) / emitted)),
    ...present('concealedSamples', count(media.concealedSamples)),
    ...present('nackCount', count(media.nackCount)),
    ...present('pliCount', count(media.pliCount)),
    mos: Math.round(mos * 100) / 100,
    ...present('candidateType', media.candidateType?.slice(0, 20) ?? null),
    ...present('relayProtocol', media.relayProtocol?.slice(0, 20) ?? null),
  };
}

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X/, 'macOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];

/** « Chrome · Android » : ce que `deviceModel` dit d'un navigateur, sans recopier l'agent entier (empreinte). */
export function deviceLabel(userAgent: string): string {
  const pick = (table: ReadonlyArray<readonly [RegExp, string]>): string | null => table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  const parts = [pick(BROWSERS), pick(SYSTEMS)].filter((part): part is string => part !== null);
  return parts.length === 0 ? 'web' : parts.join(' · ');
}

const share = (count: number, total: number): number => (total === 0 ? 0 : count / total);

export function analyticsPayload(telemetry: Telemetry, context: AnalyticsContext): CallAnalyticsEvent {
  const { samples, levels, connectedAt } = telemetry;
  const since = (from: number | null): number => (connectedAt === null || from === null ? -1 : Math.max(0, connectedAt - from));
  const averageRtt = share(telemetry.rttSum, samples);
  const averagePacketLoss = share(telemetry.lossSum, samples);
  return {
    callId: context.callId,
    setupTimeMs: since(telemetry.startedAt),
    negotiationTimeMs: since(telemetry.negotiatingAt ?? telemetry.startedAt),
    durationSeconds: connectedAt === null ? 0 : Math.max(0, Math.round((context.now - connectedAt) / 1000)),
    reconnectionCount: telemetry.reconnections,
    networkTransitions: telemetry.networkTransitions,
    averageRtt,
    averagePacketLoss,
    maxPacketLoss: telemetry.maxLoss,
    codec: telemetry.codec ?? 'unknown',
    effectsUsed: telemetry.effects,
    filtersUsed: telemetry.effects.some(isColorFilter),
    transcriptionUsed: telemetry.captionsShown,
    qualityDistribution: { excellent: share(levels.excellent, samples), good: share(levels.good, samples), fair: share(levels.fair, samples), poor: share(levels.poor, samples) },
    platform: context.platform,
    deviceModel: context.deviceModel.slice(0, 100),
    isVideo: context.isVideo,
    endReason: context.endReason,
    ...mediaFields(telemetry, averageRtt, averagePacketLoss),
  };
}

/** `CallQualityReportEvent` tel qu'il VOYAGE : l'horodatage part en ISO (`socketQualityReportSchema` refuse un nombre). */
export type QualityReportPayload = {
  readonly callId: string;
  readonly stats: Omit<ConnectionQualityStats, 'timestamp'> & { readonly timestamp: string };
};

export function qualityReport(callId: string, total: PeerQuality, at: number): QualityReportPayload {
  return {
    callId,
    stats: {
      level: total.level,
      packetLoss: total.packetLoss,
      rtt: Math.round(total.rtt),
      jitter: total.jitter,
      bitrate: { audio: total.audioKbps, video: total.videoKbps },
      bytesSent: total.bytesSent,
      bytesReceived: total.bytesReceived,
      timestamp: new Date(at).toISOString(),
    },
  };
}

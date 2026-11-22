import type { CallAnalyticsEvent } from '@meeshy/shared/types/video-call';

import { estimateCallMos } from '@meeshy/shared/utils/call-mos';

import type { AnalyticsContext, EngineAnalyticsContext, QualityReportPayload, Telemetry } from './call-analytics';
import { combineMediaQuality } from './call-analytics-stats';
import type { PeerQuality } from './call-quality';

/**
 * **LES RAPPORTS D'UN APPEL** (#8047, #19894) — `call:analytics`, composé
 * depuis l'accumulateur de `call-analytics.ts`, et `call:quality-report`.
 * Chunk à part (`budgets.json` › `call_analytics_report`), préchargé par
 * `engine-defaults.ts` dès que le moteur se charge, lu aux relevés et au
 * raccroché (`call-analytics-lazy.ts`) : le MOS, les champs de qualité et le
 * nom de l'appareil ne pèsent pas sur le moteur.
 */

const nonNegative = (value: number): number => (Number.isFinite(value) ? Math.max(value, 0) : 0);

const isColorFilter = (name: string): boolean => name.startsWith('filter:') || name === 'brightness';

/** La cause la plus fréquente ; à égalité, la première dans l'ordre alphabétique, comme iOS. */
const dominantLimitation = (counts: Telemetry['limitations']): string | null =>
  Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce<readonly [string, number] | null>((best, entry) => (entry[1] > (best?.[1] ?? 0) ? entry : best), null)?.[0] ?? null;

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

const share = (count: number, total: number): number => nonNegative(count / total);

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
    maxPacketLoss: nonNegative(telemetry.maxLoss),
    codec: (telemetry.codec ?? 'unknown').slice(0, 50),
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

/** Le rapport tel que le navigateur l'envoie : l'appareil nommé ici, jamais l'agent utilisateur brut. */
export function browserAnalyticsPayload(telemetry: Telemetry, context: EngineAnalyticsContext): CallAnalyticsEvent {
  return analyticsPayload(telemetry, { ...context, deviceModel: typeof navigator === 'undefined' ? 'web' : deviceLabel(navigator.userAgent) });
}

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

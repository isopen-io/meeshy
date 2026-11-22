import type { CallAnalyticsEvent, CallQualityDistribution, ConnectionQualityLevel, ConnectionQualityStats } from '@meeshy/shared/types/video-call';

import type { MediaQuality } from './call-analytics-stats';
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
 *
 * Ce module ne porte que l'ACCUMULATEUR, synchrone et résident du moteur ; la
 * COMPOSITION des deux rapports vit dans `call-analytics-report.ts`, chargé à
 * part (#19894).
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

/** Ce que le moteur sait d'un appel qui finit : l'appareil, c'est le rapport qui le nomme (#19894). */
export type EngineAnalyticsContext = Omit<AnalyticsContext, 'deviceModel'>;

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

const nonNegative = (value: number): number => (Number.isFinite(value) ? Math.max(value, 0) : 0);

/**
 * #19876 — un relevé média (`CallAnalyticsRecorder.recordMedia`, iOS) : les
 * compteurs cumulés de chaque pair relevé remplacent les siens, la gigue s'ajoute pour le MOS,
 * et chaque pair compte sa cause de limitation.
 */
export function withMedia(telemetry: Telemetry, peers: Readonly<Record<string, MediaQuality>>, jitterMs: number): Telemetry {
  const read = Object.values(peers);
  if (read.length === 0) return telemetry;
  const limitations = read.map((peer) => peer.qualityLimitationReason).filter(isLimitationReason).reduce((counts, reason) => ({ ...counts, [reason]: counts[reason] + 1 }), telemetry.limitations);
  return { ...telemetry, peers: { ...telemetry.peers, ...peers }, mediaSamples: telemetry.mediaSamples + 1, jitterSum: telemetry.jitterSum + nonNegative(jitterMs), limitations };
}

/** `CallQualityReportEvent` tel qu'il VOYAGE : l'horodatage part en ISO (`socketQualityReportSchema` refuse un nombre). */
export type QualityReportPayload = {
  readonly callId: string;
  readonly stats: Omit<ConnectionQualityStats, 'timestamp'> & { readonly timestamp: string };
};

/**
 * Les rapports d'un appel (#19894) : `call:analytics` au raccroché et
 * `call:quality-report` à chaque relevé, composés par un chunk paresseux
 * (`call-analytics-report.ts`). Chacun part par `send` quand il est prêt —
 * jamais au prix de l'appel.
 */
export type CallReports = {
  readonly final: (telemetry: Telemetry, context: EngineAnalyticsContext, send: (payload: CallAnalyticsEvent) => void) => void;
  readonly quality: (callId: string, total: PeerQuality, at: number, send: (payload: QualityReportPayload) => void) => void;
};

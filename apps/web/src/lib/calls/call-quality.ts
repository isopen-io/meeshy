import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';

import type { SurvivalStage } from './call-survival';

/**
 * **LA QUALITÉ D'UN LIEN** (#8047) — ce que `getStats` dit d'une
 * `RTCPeerConnection`, réduit en taux et en niveau, et le palier d'encodage
 * vidéo qui en découle. Sans WebRTC : un relevé est un `forEach`, un palier une
 * table. Le niveau suit l'échelle d'iOS (`VideoQualityLevel.from`) : la perte
 * est le vrai signal de congestion, la latence est calibrée pour le mobile
 * (150–300 ms sans congestion en 4G).
 */

type StatsEntry = Readonly<Record<string, unknown>>;
export type StatsReportLike = { readonly forEach: (fn: (entry: StatsEntry) => void) => void };

export type StatsRead = {
  readonly at: number;
  readonly rtt: number;
  readonly jitter: number;
  readonly lost: number;
  readonly received: number;
  readonly audioBytes: number;
  readonly videoBytes: number;
  readonly bytesSent: number;
  readonly bytesReceived: number;
  readonly codec: string | null;
  /** Le chemin du média (#8698) : par un relais TURN, ou direct ; `null` avant qu'une paire soit élue. */
  readonly path: MediaPath | null;
  /** Ce que le navigateur estime pouvoir envoyer sur ce lien (b/s, TWCC/GCC) ; `null` quand il ne le dit pas (Firefox). */
  readonly availableOutgoingBitrate: number | null;
  /** La perte que le pair constate sur MA vidéo (%, `remote-inbound-rtp`) ; `null` avant son premier rapport. */
  readonly uplinkLoss: number | null;
};

export type MediaPath = 'direct' | 'relay';

export type PeerQuality = {
  readonly level: ConnectionQualityLevel;
  readonly packetLoss: number;
  readonly rtt: number;
  readonly jitter: number;
  readonly audioKbps: number;
  readonly videoKbps: number;
  readonly bytesSent: number;
  readonly bytesReceived: number;
};

export function qualityLevel({ packetLoss, rtt }: { readonly packetLoss: number; readonly rtt: number }): ConnectionQualityLevel {
  if (packetLoss < 1 && rtt < 100) return 'excellent';
  if (packetLoss < 3 && rtt < 300) return 'good';
  if (packetLoss < 5 && rtt < 450) return 'fair';
  return 'poor';
}

export type MetricGrade = 'good' | 'medium' | 'poor';
export type GradedMetric = 'packetLoss' | 'rtt' | 'jitter';

/** Les seuils de `CallQualityRows.grade` (iOS) : un même relevé rend le même niveau sur les deux plateformes (#8209). */
const GRADE_THRESHOLDS: Readonly<Record<GradedMetric, { readonly medium: number; readonly poor: number }>> = {
  packetLoss: { medium: 3, poor: 5 },
  rtt: { medium: 300, poor: 450 },
  jitter: { medium: 30, poor: 50 },
};

export function metricGrade(metric: GradedMetric, value: number): MetricGrade {
  const { medium, poor } = GRADE_THRESHOLDS[metric];
  if (value >= poor) return 'poor';
  return value >= medium ? 'medium' : 'good';
}

const numberOf = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** La gigue de `CallStats.reduce` (iOS, #8209) : la moyenne des flux entrants non vidéo qui la rapportent, en ms. */
const audioJitterMs = (inbound: readonly StatsEntry[]): number => {
  const samples = inbound.filter((entry) => entry.kind !== 'video' && typeof entry.jitter === 'number' && Number.isFinite(entry.jitter)).map((entry) => numberOf(entry.jitter));
  return samples.length === 0 ? 0 : (samples.reduce((sum, value) => sum + value, 0) / samples.length) * 1000;
};

const subtype = (mimeType: unknown): string | null => (typeof mimeType === 'string' && mimeType.includes('/') ? (mimeType.split('/')[1] ?? null) : null);

export function readStats(report: StatsReportLike, at: number): StatsRead {
  const entries: StatsEntry[] = [];
  report.forEach((entry) => entries.push(entry));
  const inbound = entries.filter((entry) => entry.type === 'inbound-rtp');
  const outbound = entries.filter((entry) => entry.type === 'outbound-rtp');
  const pair = entries.find((entry) => entry.type === 'candidate-pair' && entry.nominated === true && entry.state === 'succeeded' && typeof entry.currentRoundTripTime === 'number');
  const remote = entries.find((entry) => entry.type === 'remote-inbound-rtp' && typeof entry.roundTripTime === 'number');
  const sum = (list: readonly StatsEntry[], field: string, kind?: string): number => list.filter((entry) => kind === undefined || entry.kind === kind).reduce((total, entry) => total + numberOf(entry[field]), 0);
  const sending = (kind: string): StatsEntry | undefined => outbound.find((entry) => entry.kind === kind && numberOf(entry.bytesSent) > 0);
  const codecEntry = (sending('video') ?? sending('audio'))?.codecId;
  const codec = entries.find((entry) => entry.type === 'codec' && entry.id === codecEntry);
  const local = pair === undefined ? undefined : entries.find((entry) => entry.type === 'local-candidate' && entry.id === pair.localCandidateId);
  const estimate = pair?.availableOutgoingBitrate;
  const uplink = entries.find((entry) => entry.type === 'remote-inbound-rtp' && entry.kind === 'video' && typeof entry.fractionLost === 'number');
  return {
    at,
    rtt: numberOf(pair?.currentRoundTripTime ?? remote?.roundTripTime) * 1000,
    jitter: audioJitterMs(inbound),
    lost: sum(inbound, 'packetsLost'),
    received: sum(inbound, 'packetsReceived'),
    audioBytes: sum(inbound, 'bytesReceived', 'audio'),
    videoBytes: sum(inbound, 'bytesReceived', 'video'),
    bytesSent: sum(outbound, 'bytesSent'),
    bytesReceived: sum(inbound, 'bytesReceived'),
    codec: subtype(codec?.mimeType),
    path: local === undefined ? null : local.candidateType === 'relay' ? 'relay' : 'direct',
    availableOutgoingBitrate: typeof estimate === 'number' && Number.isFinite(estimate) && estimate > 0 ? estimate : null,
    uplinkLoss: uplink === undefined ? null : numberOf(uplink.fractionLost) * 100,
  };
}

export function peerRate(current: StatsRead, previous: StatsRead | null): PeerQuality {
  const delta = (field: 'lost' | 'received' | 'audioBytes' | 'videoBytes'): number => (previous === null ? current[field] : Math.max(0, current[field] - previous[field]));
  const packets = delta('lost') + delta('received');
  const packetLoss = packets > 0 ? Math.min(100, (delta('lost') / packets) * 100) : 0;
  const elapsed = previous === null ? 0 : current.at - previous.at;
  const kbps = (field: 'audioBytes' | 'videoBytes'): number => (elapsed > 0 ? (delta(field) * 8) / elapsed : 0);
  return {
    level: qualityLevel({ packetLoss, rtt: current.rtt }),
    packetLoss,
    rtt: current.rtt,
    jitter: current.jitter,
    audioKbps: kbps('audioBytes'),
    videoKbps: kbps('videoBytes'),
    bytesSent: current.bytesSent,
    bytesReceived: current.bytesReceived,
  };
}

const RANK: Readonly<Record<ConnectionQualityLevel, number>> = { excellent: 0, good: 1, fair: 2, poor: 3 };

/** Le pire lien fait le niveau d'un maillage ; les débits et les octets s'additionnent. */
export function aggregateQuality(peers: readonly PeerQuality[]): PeerQuality | null {
  if (peers.length === 0) return null;
  const worst = (field: 'packetLoss' | 'rtt' | 'jitter'): number => Math.max(...peers.map((peer) => peer[field]));
  const total = (field: 'audioKbps' | 'videoKbps' | 'bytesSent' | 'bytesReceived'): number => peers.reduce((sum, peer) => sum + peer[field], 0);
  const level = peers.map((peer) => peer.level).reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
  return { level, packetLoss: worst('packetLoss'), rtt: worst('rtt'), jitter: worst('jitter'), audioKbps: total('audioKbps'), videoKbps: total('videoKbps'), bytesSent: total('bytesSent'), bytesReceived: total('bytesReceived') };
}

export type VideoTier = 'high' | 'medium' | 'low' | 'frozen' | 'suspended';

export type TierEncoding = { readonly active: boolean; readonly maxBitrate: number; readonly scaleResolutionDownBy: number; readonly maxFramerate: number };

/**
 * Les paliers d'`applyVideoQuality` d'iOS ; `high` va jusqu'au plafond d'Android
 * (2,5 Mb/s en 720p30, #19775), `frozen` `survivalFrozenFPS` au plancher
 * `minVideoBitrate`. Hors du palier bas, la taille n'est jamais réduite d'office :
 * l'encodeur (`balanced`) n'abaisse la résolution que si le débit l'y oblige.
 */
export const TIER_ENCODING: Readonly<Record<VideoTier, TierEncoding>> = {
  high: { active: true, maxBitrate: 2_500_000, scaleResolutionDownBy: 1, maxFramerate: 30 },
  medium: { active: true, maxBitrate: 1_200_000, scaleResolutionDownBy: 1, maxFramerate: 30 },
  low: { active: true, maxBitrate: 500_000, scaleResolutionDownBy: 1.5, maxFramerate: 20 },
  frozen: { active: true, maxBitrate: 100_000, scaleResolutionDownBy: 2, maxFramerate: 2 },
  suspended: { active: false, maxBitrate: 100_000, scaleResolutionDownBy: 2, maxFramerate: 2 },
};

export type SteadyTier = 'high' | 'medium' | 'low';

const STEADY_ORDER: readonly SteadyTier[] = ['high', 'medium', 'low'];

const levelTier = (level: ConnectionQualityLevel): SteadyTier => (level === 'excellent' || level === 'good' ? 'high' : level === 'fair' ? 'medium' : 'low');

/** Seuils d'iOS `VideoQualityLevel.from(availableOutgoingBitrateBps:)`, sous chaque cible pour garder de la marge. */
const estimateTier = (bps: number): SteadyTier => (bps >= 2_000_000 ? 'high' : bps >= 1_000_000 ? 'medium' : 'low');

const UPLINK_LOSS_STEP_DOWN = 10;

/**
 * Le palier que CE lien peut porter (#19775) : l'estimation de débit du navigateur
 * quand il la donne, sinon le niveau du lien ; une perte montante de 10 % en
 * retire un cran. La latence seule ne fait plus descendre l'image.
 */
export function linkTier(signal: { readonly level: ConnectionQualityLevel; readonly availableOutgoingBitrate: number | null; readonly uplinkLoss: number | null }): SteadyTier {
  const base = signal.availableOutgoingBitrate === null ? levelTier(signal.level) : estimateTier(signal.availableOutgoingBitrate);
  if ((signal.uplinkLoss ?? 0) < UPLINK_LOSS_STEP_DOWN) return base;
  return STEADY_ORDER[Math.min(STEADY_ORDER.indexOf(base) + 1, STEADY_ORDER.length - 1)] ?? 'low';
}

export type TierState = { readonly tier: SteadyTier; readonly pending: SteadyTier | null; readonly streak: number };

export const initialTierState = (): TierState => ({ tier: 'high', pending: null, streak: 0 });

const DOWN_CONFIRMATIONS = 2;
const UP_CONFIRMATIONS = 3;

/**
 * L'hystérésis du palier (#19775) : descendre après deux relevés concordants
 * (4 s), remonter après trois (6 s). Un relevé isolé ne fait pas clignoter la
 * netteté, et l'image ne remonte qu'une fois le lien vraiment revenu.
 */
export function stepTier(state: TierState, target: SteadyTier): TierState {
  if (target === state.tier) return { tier: state.tier, pending: null, streak: 0 };
  const streak = state.pending === target ? state.streak + 1 : 1;
  const needed = STEADY_ORDER.indexOf(target) > STEADY_ORDER.indexOf(state.tier) ? DOWN_CONFIRMATIONS : UP_CONFIRMATIONS;
  return streak >= needed ? { tier: target, pending: null, streak: 0 } : { tier: state.tier, pending: target, streak };
}

/** Sans hystérésis : un palier est un `setParameters`, sans renégociation — c'est la survie qui en porte une. */
export function appliedTier(level: ConnectionQualityLevel, stage: SurvivalStage): VideoTier {
  if (stage !== 'sending') return stage;
  return levelTier(level);
}

/** Le palier envoyé : la survie impose son plancher, sinon le palier stable du lien. */
export function sentTier(steady: SteadyTier, stage: SurvivalStage): VideoTier {
  return stage === 'sending' ? steady : stage;
}

export function encodingFor<T extends object>(encoding: T, tier: VideoTier): T & TierEncoding {
  return { ...encoding, ...TIER_ENCODING[tier] };
}

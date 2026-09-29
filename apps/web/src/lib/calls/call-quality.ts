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

const numberOf = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

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
  return {
    at,
    rtt: numberOf(pair?.currentRoundTripTime ?? remote?.roundTripTime) * 1000,
    jitter: inbound.reduce((worst, entry) => Math.max(worst, numberOf(entry.jitter) * 1000), 0),
    lost: sum(inbound, 'packetsLost'),
    received: sum(inbound, 'packetsReceived'),
    audioBytes: sum(inbound, 'bytesReceived', 'audio'),
    videoBytes: sum(inbound, 'bytesReceived', 'video'),
    bytesSent: sum(outbound, 'bytesSent'),
    bytesReceived: sum(inbound, 'bytesReceived'),
    codec: subtype(codec?.mimeType),
    path: local === undefined ? null : local.candidateType === 'relay' ? 'relay' : 'direct',
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

/** Les paliers d'`applyVideoQuality` d'iOS ; `high` est le plafond Wi-Fi du barème (`call-data-profile.ts`), `frozen` `survivalFrozenFPS` au plancher `minVideoBitrate`. */
export const TIER_ENCODING: Readonly<Record<VideoTier, TierEncoding>> = {
  high: { active: true, maxBitrate: 1_200_000, scaleResolutionDownBy: 1, maxFramerate: 30 },
  medium: { active: true, maxBitrate: 600_000, scaleResolutionDownBy: 1.5, maxFramerate: 24 },
  low: { active: true, maxBitrate: 250_000, scaleResolutionDownBy: 2, maxFramerate: 15 },
  frozen: { active: true, maxBitrate: 100_000, scaleResolutionDownBy: 2, maxFramerate: 2 },
  suspended: { active: false, maxBitrate: 100_000, scaleResolutionDownBy: 2, maxFramerate: 2 },
};

/** Sans hystérésis : un palier est un `setParameters`, sans renégociation — c'est la survie qui en porte une. */
export function appliedTier(level: ConnectionQualityLevel, stage: SurvivalStage): VideoTier {
  if (stage !== 'sending') return stage;
  if (level === 'excellent' || level === 'good') return 'high';
  return level === 'fair' ? 'medium' : 'low';
}

export function encodingFor<T extends object>(encoding: T, tier: VideoTier): T & TierEncoding {
  return { ...encoding, ...TIER_ENCODING[tier] };
}

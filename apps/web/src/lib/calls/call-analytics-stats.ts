import type { StatsReportLike } from './call-quality';

/**
 * **CE QUE `getStats` DIT DES GELS, DE LA LIMITATION ET DU RELAIS** (#19876) —
 * la projection web de `CallMediaQuality.reduce` (iOS, #11294) : gels, NACK et
 * PLI de la vidéo reçue ; tampon de gigue et échantillons masqués de l'audio
 * reçu ; cause de limitation de l'émission vidéo ; type du candidat local de la
 * paire élue et son transport vers le relais.
 *
 * Les compteurs sont CUMULÉS par WebRTC depuis l'ouverture du lien : le dernier
 * relevé les porte tous, et rien n'est lu au raccrochage (les liens y sont
 * fermés). Une mesure que le navigateur ne donne pas reste `null`, jamais 0 —
 * Firefox et Safari ne connaissent pas `freezeCount`.
 */

type StatsEntry = Readonly<Record<string, unknown>>;

export type MediaQuality = {
  readonly freezeCount: number | null;
  /** Secondes. */
  readonly totalFreezesDuration: number | null;
  /** Secondes cumulées des seuls flux qui portent aussi un compte émis positif ; divisées par `jitterBufferEmittedCount` au rapport. */
  readonly jitterBufferDelay: number | null;
  readonly jitterBufferEmittedCount: number | null;
  readonly concealedSamples: number | null;
  readonly nackCount: number | null;
  readonly pliCount: number | null;
  readonly qualityLimitationReason: string | null;
  readonly candidateType: string | null;
  readonly relayProtocol: string | null;
};

type Counter = 'freezeCount' | 'totalFreezesDuration' | 'jitterBufferDelay' | 'jitterBufferEmittedCount' | 'concealedSamples' | 'nackCount' | 'pliCount';

const COUNTERS: readonly Counter[] = ['freezeCount', 'totalFreezesDuration', 'jitterBufferDelay', 'jitterBufferEmittedCount', 'concealedSamples', 'nackCount', 'pliCount'];

const measured = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

/** La somme des flux qui PORTENT la mesure ; `null` quand aucun ne la porte. */
const sumOf = (entries: readonly StatsEntry[], field: string): number | null => {
  const values = entries.map((entry) => entry[field]).filter(measured);
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0);
};

const addMeasured = (a: number | null, b: number | null): number | null => (a === null ? b : b === null ? a : a + b);

/** La paire élue : celle du transport, sinon la paire nominée réussie (`CallStats.relayedRoute`, iOS). */
const selectedPair = (entries: readonly StatsEntry[]): StatsEntry | undefined => {
  const selectedId = entries.find((entry) => entry.type === 'transport' && typeof entry.selectedCandidatePairId === 'string')?.selectedCandidatePairId;
  const byTransport = selectedId === undefined ? undefined : entries.find((entry) => entry.type === 'candidate-pair' && entry.id === selectedId);
  return byTransport ?? entries.find((entry) => entry.type === 'candidate-pair' && entry.state === 'succeeded' && entry.nominated === true);
};

export function readMediaQuality(report: StatsReportLike): MediaQuality {
  const entries: StatsEntry[] = [];
  report.forEach((entry) => entries.push(entry));
  const video = entries.filter((entry) => entry.type === 'inbound-rtp' && entry.kind === 'video');
  const audio = entries.filter((entry) => entry.type === 'inbound-rtp' && entry.kind !== 'video');
  const buffered = audio.filter((entry) => measured(entry.jitterBufferDelay) && measured(entry.jitterBufferEmittedCount) && entry.jitterBufferEmittedCount > 0);
  const pair = selectedPair(entries);
  const local = pair === undefined ? undefined : entries.find((entry) => entry.type === 'local-candidate' && entry.id === pair.localCandidateId);
  const candidateType = text(local?.candidateType);
  return {
    freezeCount: sumOf(video, 'freezeCount'),
    totalFreezesDuration: sumOf(video, 'totalFreezesDuration'),
    jitterBufferDelay: sumOf(buffered, 'jitterBufferDelay'),
    jitterBufferEmittedCount: sumOf(buffered, 'jitterBufferEmittedCount'),
    concealedSamples: sumOf(audio, 'concealedSamples'),
    nackCount: sumOf(video, 'nackCount'),
    pliCount: sumOf(video, 'pliCount'),
    qualityLimitationReason: text(entries.find((entry) => entry.type === 'outbound-rtp' && entry.kind === 'video' && text(entry.qualityLimitationReason) !== null)?.qualityLimitationReason),
    candidateType,
    relayProtocol: candidateType === 'relay' ? text(local?.relayProtocol) : null,
  };
}

/** Un maillage : les compteurs s'additionnent sur les pairs, un relais l'emporte sur un lien direct. */
export function combineMediaQuality(peers: readonly MediaQuality[]): MediaQuality | null {
  const [first, ...rest] = peers;
  if (first === undefined) return null;
  const route = peers.find((peer) => peer.candidateType === 'relay') ?? peers.find((peer) => peer.candidateType !== null);
  const counters = rest.reduce((sum, peer) => COUNTERS.reduce((next, field) => ({ ...next, [field]: addMeasured(next[field], peer[field]) }), sum), first);
  return {
    ...counters,
    qualityLimitationReason: peers.map((peer) => peer.qualityLimitationReason).find((reason) => reason !== null) ?? null,
    candidateType: route?.candidateType ?? null,
    relayProtocol: route?.relayProtocol ?? null,
  };
}

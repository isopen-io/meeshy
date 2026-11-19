import type { MediaQuality } from './call-analytics-stats';
import type { StatsReportLike } from './call-quality';

/**
 * La LECTURE de `getStats` (#19876), chargée avec la boucle de qualité : le moteur
 * n'en porte que la combinaison (`call-analytics-stats.ts`) et reste sous son budget.
 */

type StatsEntry = Readonly<Record<string, unknown>>;

const measured = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

/** La somme des flux qui PORTENT la mesure ; `null` quand aucun ne la porte. */
const sumOf = (entries: readonly StatsEntry[], field: string): number | null => {
  const values = entries.map((entry) => entry[field]).filter(measured);
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0);
};

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


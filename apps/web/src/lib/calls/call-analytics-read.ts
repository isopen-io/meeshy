import type { MediaQuality } from './call-analytics-stats';
import type { StatsReportLike } from './call-quality';
import { selectedCandidatePair, strongestLimitation, type StatsEntry } from './call-stats-election';

/**
 * La LECTURE de `getStats` (#19876), chargée avec la boucle de qualité : le moteur
 * n'en porte que la combinaison (`call-analytics-stats.ts`) et reste sous son budget.
 */

const measured = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

/** La somme des flux qui PORTENT la mesure ; `null` quand aucun ne la porte. */
const sumOf = (entries: readonly StatsEntry[], field: string): number | null => {
  const values = entries.map((entry) => entry[field]).filter(measured);
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0);
};

export function readMediaQuality(report: StatsReportLike): MediaQuality {
  const entries: StatsEntry[] = [];
  report.forEach((entry) => entries.push(entry));
  const video = entries.filter((entry) => entry.type === 'inbound-rtp' && entry.kind === 'video');
  const audio = entries.filter((entry) => entry.type === 'inbound-rtp' && entry.kind !== 'video');
  const buffered = audio.filter((entry) => measured(entry.jitterBufferDelay) && measured(entry.jitterBufferEmittedCount) && entry.jitterBufferEmittedCount > 0);
  const pair = selectedCandidatePair(entries);
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
    qualityLimitationReason: strongestLimitation(entries),
    candidateType,
    relayProtocol: candidateType === 'relay' ? text(local?.relayProtocol) : null,
  };
}


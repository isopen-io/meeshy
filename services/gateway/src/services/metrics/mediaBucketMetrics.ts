/**
 * L'ÉTAT DU BALAYAGE DU SEAU DES MÉDIAS (#11267, audit D2).
 *
 * Un balayage refusé (base vide, plus de la moitié du seau à effacer) se
 * rejoue à chaque heure : sans signal, il gèlerait l'effacement pour
 * toujours. Deux jauges qu'une alerte peut lire, sur le port interne
 * (`metricsServer.ts`) :
 * - `media_bucket_sweep_refused{reason}` vaut 1 tant que le dernier
 *   balayage a été refusé pour cette raison ;
 * - `media_bucket_sweep_last_success_timestamp_seconds` date le dernier
 *   balayage abouti.
 */
import { Gauge, Registry } from 'prom-client';
import type { SweepReport } from '../storage/objects/mediaBucketSweep';
import { processMediaStageMetrics } from './mediaStageMetrics';

const REFUSAL_REASONS = ['no-referenced-key', 'too-many-removals'] as const;

export type MediaBucketMetrics = {
  readonly registry: Registry;
  readonly refused: Gauge<'reason'>;
  readonly lastSuccess: Gauge;
};

export function mediaBucketMetrics(options: { readonly registry?: Registry } = {}): MediaBucketMetrics {
  const registry = options.registry ?? new Registry();
  const refused = new Gauge({
    name: 'media_bucket_sweep_refused',
    help: 'Vaut 1 tant que le dernier balayage du seau des médias a été refusé pour cette raison (#11267).',
    labelNames: ['reason'] as const,
    registers: [registry],
  });
  REFUSAL_REASONS.forEach((reason) => refused.set({ reason }, 0));
  const lastSuccess = new Gauge({
    name: 'media_bucket_sweep_last_success_timestamp_seconds',
    help: 'Horodatage du dernier balayage abouti du seau des médias (#11267).',
    registers: [registry],
  });
  return { registry, refused, lastSuccess };
}

export function recordSweepReport(metrics: MediaBucketMetrics, report: SweepReport, now: Date): void {
  REFUSAL_REASONS.forEach((reason) => metrics.refused.set({ reason }, report.kind === 'refused' && report.reason === reason ? 1 : 0));
  if (report.kind === 'swept') metrics.lastSuccess.set(now.getTime() / 1000);
}

/** L'instance du processus, dans le registre que le port interne sert déjà. */
export const processMediaBucketMetrics = mediaBucketMetrics({ registry: processMediaStageMetrics.registry });

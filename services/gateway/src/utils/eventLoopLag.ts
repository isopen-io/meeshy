import { monitorEventLoopDelay, type IntervalHistogram } from 'perf_hooks';

/**
 * LE RETARD DE LA BOUCLE D'ÉVÉNEMENTS (#8272) — ce qui sépare un délai Redis
 * dépassé par la boucle (rien ne s'exécute, ni la réponse ni le minuteur) d'un
 * délai dépassé dans la file de commandes ioredis.
 *
 * Un seul histogramme pour le processus, démarré par le premier client qui en
 * a besoin. Chaque lecture rend le retard DEPUIS la lecture précédente puis
 * remet l'histogramme à zéro : la ligne de journal qui le porte dit ce qui
 * s'est passé dans sa fenêtre, pas depuis le démarrage.
 */
export type EventLoopLag = { readonly meanMs: number; readonly p99Ms: number; readonly maxMs: number };

const RESOLUTION_MS = 20;

let histogram: IntervalHistogram | null = null;

const toMs = (nanoseconds: number): number => (Number.isFinite(nanoseconds) ? Math.round(nanoseconds / 1e6) : 0);

export function startEventLoopLagMonitor(): void {
  if (histogram) return;
  histogram = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  histogram.enable();
}

export function readEventLoopLag(): EventLoopLag | null {
  if (!histogram) return null;
  const lag = { meanMs: toMs(histogram.mean), p99Ms: toMs(histogram.percentile(99)), maxMs: toMs(histogram.max) };
  histogram.reset();
  return lag;
}

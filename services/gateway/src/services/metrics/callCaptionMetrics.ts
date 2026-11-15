/**
 * LE TEMPS D'UN SOUS-TITRE D'APPEL TRADUIT (#16548, critère de #3722).
 *
 * Deux séries, servies sur le port interne des mesures (`metricsServer.ts`) :
 *
 * - `call_caption_translation_seconds{outcome}` — de la demande de traduction
 *   au traducteur jusqu'à l'émission vers les auditeurs de CETTE langue, sur
 *   l'horloge MONOTONE de la passerelle. Jamais l'horloge du client
 *   (`capturedAtMs`) : deux appareils ne partagent pas d'heure, et la mesure
 *   doit séparer le temps du modèle de celui du réseau des clients.
 * - `call_caption_deliveries_total{path}` — une incrémentation par LANGUE servie
 *   (un groupe d'auditeurs), pour lire quelle part des sous-titres arrive
 *   réellement traduite.
 *
 * Étiquettes BORNÉES, nommées ici : aucun identifiant d'appel, aucune langue,
 * aucun texte n'entre dans une série.
 */
import { performance } from 'node:perf_hooks';
import { Counter, Histogram, Registry } from 'prom-client';
import { processMediaStageMetrics } from './mediaStageMetrics';

export const CALL_CAPTION_OUTCOMES = ['translated', 'timeout', 'error'] as const;
export type CallCaptionOutcome = (typeof CALL_CAPTION_OUTCOMES)[number];

export const CALL_CAPTION_PATHS = [...CALL_CAPTION_OUTCOMES, 'same_language', 'untranslated'] as const;
export type CallCaptionPath = (typeof CALL_CAPTION_PATHS)[number];

/** De 50 ms au délai de 10 s du relais : le critère de #3722 (2 s) tombe entre deux seaux. */
const BUCKETS_SECONDS = [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 7.5, 10, 15];

export type CallCaptionTranslationTimer = {
  readonly finish: (outcome: CallCaptionOutcome) => void;
};

export type CallCaptionMetrics = {
  readonly registry: Registry;
  readonly startTranslation: () => CallCaptionTranslationTimer;
  readonly delivered: (path: CallCaptionPath) => void;
};

export function callCaptionMetrics(
  options: { readonly clock?: () => number; readonly registry?: Registry } = {}
): CallCaptionMetrics {
  const clock = options.clock ?? (() => performance.now());
  const registry = options.registry ?? new Registry();
  const latency = new Histogram({
    name: 'call_caption_translation_seconds',
    help: 'Temps passerelle → traducteur → passerelle d’un sous-titre d’appel, par issue (#16548).',
    labelNames: ['outcome'] as const,
    buckets: BUCKETS_SECONDS,
    registers: [registry],
  });
  const deliveries = new Counter({
    name: 'call_caption_deliveries_total',
    help: 'Sous-titres d’appel servis, un par langue d’auditeurs, par chemin (#16548).',
    labelNames: ['path'] as const,
    registers: [registry],
  });
  return {
    registry,
    startTranslation: () => {
      const startedAt = clock();
      let done = false;
      return {
        finish: (outcome) => {
          if (done) return;
          done = true;
          latency.observe({ outcome }, Math.max(0, clock() - startedAt) / 1000);
          deliveries.inc({ path: outcome });
        },
      };
    },
    delivered: (path) => deliveries.inc({ path }),
  };
}

/** L'instance du processus, rangée dans le registre que le port interne sert déjà. */
export const processCallCaptionMetrics = callCaptionMetrics({ registry: processMediaStageMetrics.registry });

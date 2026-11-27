/**
 * CE QUE LA FILE HORS LIGNE N'A PAS PU SCELLER (#19945).
 *
 * #19827 garde dans le tas, EN CLAIR, l'entrée d'une conversation chiffrée au
 * repos qu'on n'a pas PU sceller, et détruit celle qu'on ne scellera jamais.
 * Sans série, un bug qui fait échouer CHAQUE scellement ne se voyait qu'à un
 * `logger.error` par entrée. Une série, servie sur le port interne
 * (`metricsServer.ts`) :
 *
 * - `delivery_queue_unsealed_entries_total{disposition}` — `kept_in_memory`
 *   (gardée en clair dans le tas), `dropped_unsealable` (rien ne la scellera
 *   jamais dans ce processus), `dropped_volume_cap` (le budget du clair gardé
 *   est plein : garder protège UNE livraison, pas la flotte),
 *   `dropped_multi_instance` (#19947 : l'instance unique n'est pas attestée,
 *   une autre réplique servirait la reconnexion).
 *
 * Étiquette BORNÉE, nommée ici : aucun identifiant, aucun texte n'entre dans la série.
 */
import { Counter, Registry } from 'prom-client';
import { processMediaStageMetrics } from './mediaStageMetrics';

export const UNSEALED_DISPOSITIONS = ['kept_in_memory', 'dropped_unsealable', 'dropped_volume_cap', 'dropped_multi_instance'] as const;
export type UnsealedDisposition = (typeof UNSEALED_DISPOSITIONS)[number];

export type DeliveryQueueSealMetrics = {
  readonly registry: Registry;
  readonly unsealed: (disposition: UnsealedDisposition) => void;
};

export function deliveryQueueSealMetrics(options: { readonly registry?: Registry } = {}): DeliveryQueueSealMetrics {
  const registry = options.registry ?? new Registry();
  const counter = new Counter({
    name: 'delivery_queue_unsealed_entries_total',
    help: 'Entrées de file hors ligne d’une conversation chiffrée au repos qui n’ont pas pu être scellées, par sort (#19945).',
    labelNames: ['disposition'] as const,
    registers: [registry],
  });
  UNSEALED_DISPOSITIONS.forEach((disposition) => counter.inc({ disposition }, 0));
  return { registry, unsealed: (disposition) => counter.inc({ disposition }) };
}

/** L'instance du processus, rangée dans le registre que le port interne sert déjà. */
export const processDeliveryQueueSealMetrics = deliveryQueueSealMetrics({ registry: processMediaStageMetrics.registry });

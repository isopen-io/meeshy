/**
 * L'ÉTAT DES SURCHARGES DU REGISTRE DES PACKS (#12329, R1).
 *
 * Tant qu'aucune lecture des surcharges n'a abouti, chaque pack du registre est
 * servi MASQUÉ (fail-closed, #11275). Sans signal, une base lente au démarrage
 * vidait la boutique sans que rien ne le dise. Deux jauges, lues au moment de
 * la collecte sur le port interne (`metricsServer.ts`) :
 * - `pack_registry_overrides_masked` vaut 1 tant que le registre est masqué ;
 * - `pack_registry_overrides_snapshot_age_seconds` dit l'âge de l'instantané
 *   servi (une relecture qui échoue en boucle le fait grandir).
 */
import { Gauge, Registry } from 'prom-client';
import type { PackRegistryOverrides } from '../packs/PackRegistryOverrides';
import { processMediaStageMetrics } from './mediaStageMetrics';

export type PackRegistryMetrics = { readonly registry: Registry };

export function packRegistryMetrics(overrides: Pick<PackRegistryOverrides, 'state'>, options: { readonly registry?: Registry } = {}): PackRegistryMetrics {
  const registry = options.registry ?? new Registry();
  new Gauge({
    name: 'pack_registry_overrides_masked',
    help: 'Vaut 1 tant qu’aucune lecture des surcharges du registre des packs n’a abouti : chaque pack est servi masqué (#12329).',
    registers: [registry],
    collect() {
      this.set(overrides.state().masked ? 1 : 0);
    },
  });
  new Gauge({
    name: 'pack_registry_overrides_snapshot_age_seconds',
    help: 'Âge de l’instantané des surcharges du registre des packs servi par cette passerelle (#12329).',
    registers: [registry],
    collect() {
      const { ageMs } = overrides.state();
      if (ageMs !== null) this.set(ageMs / 1000);
    },
  });
  return { registry };
}

let attached = false;

/** Branche les jauges de l'instance du processus sur le registre que le port interne sert, une seule fois. */
export function attachPackRegistryMetrics(overrides: Pick<PackRegistryOverrides, 'state'>): void {
  if (attached) return;
  attached = true;
  packRegistryMetrics(overrides, { registry: processMediaStageMetrics.registry });
}

/**
 * LA SURCHARGE D'UN PACK DU REGISTRE (#11275) — ce que l'administration peut
 * changer d'un pack officiel ou intégré SANS déploiement : le masquer (le
 * retirer de la boutique) ou le republier, son ordre éditorial, son prix, sa
 * fenêtre d'offre et son ciblage. Rien d'autre : ni identité, ni contenu, ni
 * version — ceux-là restent les données VERSIONNÉES du dépôt, toujours lues au
 * démarrage. Une surcharge ne crée donc jamais un pack.
 *
 * L'entrée fusionnée repasse par `PackIndexEntrySchema` : une surcharge ne
 * contourne aucune loi du registre (un prix sur un pack intégré, une fenêtre
 * inversée…). `null` RETIRE un champ optionnel ; absent, il est gardé.
 */
import * as z from 'zod/mini';
import { PACK_PRICE_MAX } from './content-pack.js';
import { PackAvailabilitySchema, PackIndexEntrySchema, PackTargetingSchema, type PackIndexEntry } from './content-pack-index.js';
import type { PackAvailability, PackTargeting } from './pack-availability.js';

export type PackRegistryOverride = {
  readonly hidden?: boolean;
  readonly order?: number;
  readonly price?: number | null;
  readonly availability?: PackAvailability | null;
  readonly targeting?: PackTargeting | null;
};

export const PackRegistryOverrideSchema: z.ZodMiniType<PackRegistryOverride> = z.strictObject({
  hidden: z.optional(z.boolean()),
  order: z.optional(z.int().check(z.minimum(0), z.maximum(10_000))),
  price: z.optional(z.nullable(z.int().check(z.minimum(1), z.maximum(PACK_PRICE_MAX)))),
  availability: z.optional(z.nullable(PackAvailabilitySchema)),
  targeting: z.optional(z.nullable(PackTargetingSchema)),
});

const OVERRIDE_KEYS = ['hidden', 'order', 'price', 'availability', 'targeting'] as const;

/** Un correctif sur une surcharge existante : une clé fournie remplace (y compris par `null`), une clé absente est gardée. */
export const mergePackOverrides = (current: PackRegistryOverride, patch: PackRegistryOverride): PackRegistryOverride =>
  OVERRIDE_KEYS.reduce<PackRegistryOverride>((merged, key) => (patch[key] === undefined ? merged : { ...merged, [key]: patch[key] }), current);

const withoutNulls = (entry: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== null && value !== undefined));

/** L'entrée telle que la surcharge la rend, ou `null` si la fusion viole une loi du registre (la surcharge est alors refusée). */
export function applyPackOverride(entry: PackIndexEntry, override: PackRegistryOverride): PackIndexEntry | null {
  const merged = withoutNulls({ ...entry, ...override, preview: undefined });
  const parsed = PackIndexEntrySchema.safeParse({ ...merged, preview: entry.preview });
  return parsed.success ? parsed.data : null;
}

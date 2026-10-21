import * as z from 'zod/mini';

import { PackAssetRefSchema } from '@meeshy/shared/types/content-pack-index';
import { PACK_LANGUAGES, PACK_ORIGINS, PACK_STATUSES } from '@meeshy/shared/types/content-pack';
import type { PackAssetRef, PackDomain, PackLanguage, PackNames, PackSummary } from '@meeshy/shared/types/content-pack';

/**
 * **LE RÉSUMÉ D'UN PACK DE DESIGNS** (#10632) — le décodeur commun aux
 * domaines `avatar-ring` et `banner` (`packs-avatar-ring.ts`,
 * `packs-banner.ts`). Fail-closed PAR PACK : un résumé malformé tombe seul, la
 * liste reste. `price` et `owned` sont additifs : absents (ancien serveur) =
 * gratuit et possédé.
 */

export type DesignPackSummary = PackSummary & { readonly contractSchema: number; readonly contract: PackAssetRef | null };

const NameSchema = z.object({ name: z.string(), description: z.string() });

const WireSummary = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  author: z.optional(z.string()),
  builtin: z.optional(z.boolean()),
  status: z.optional(z.enum(PACK_STATUSES)),
  itemCount: z.optional(z.number()),
  coverUrl: z.optional(z.nullable(z.string())),
  installed: z.boolean(),
  installCount: z.optional(z.number()),
  origin: z.optional(z.enum(PACK_ORIGINS)),
  version: z.optional(z.number()),
  downloadBytes: z.optional(z.nullable(z.object({ story: z.number(), square: z.nullable(z.number()) }))),
  removable: z.optional(z.boolean()),
  names: z.optional(z.record(z.string(), z.unknown())),
  preview: z.optional(z.unknown()),
  price: z.optional(z.nullable(z.number())),
  owned: z.optional(z.boolean()),
  contractSchema: z.optional(z.number()),
  contract: z.optional(z.unknown()),
});

const isPackLanguage = (value: string): value is PackLanguage => (PACK_LANGUAGES as readonly string[]).includes(value);

const namesOf = (raw: Readonly<Record<string, unknown>> | undefined): PackNames =>
  Object.fromEntries(
    Object.entries(raw ?? {}).flatMap(([language, value]) => {
      const parsed = NameSchema.safeParse(value);
      return isPackLanguage(language) && parsed.success ? [[language, parsed.data]] : [];
    }),
  );

const refOrNull = (raw: unknown): PackAssetRef | null => {
  const parsed = PackAssetRefSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

export const decodeDesignPackSummary =
  (domain: PackDomain) =>
  (raw: unknown): DesignPackSummary | null => {
    const parsed = WireSummary.safeParse(raw);
    if (!parsed.success) return null;
    const wire = parsed.data;
    return {
      slug: wire.slug,
      name: wire.name,
      description: wire.description,
      author: wire.author ?? 'Meeshy',
      builtin: wire.builtin ?? wire.origin === 'builtin',
      status: wire.status ?? 'approved',
      itemCount: wire.itemCount ?? 0,
      coverUrl: wire.coverUrl ?? null,
      installed: wire.installed,
      installCount: wire.installCount ?? 0,
      domain,
      origin: wire.origin ?? 'official',
      version: wire.version ?? 1,
      downloadBytes: wire.downloadBytes ?? null,
      removable: wire.removable ?? true,
      names: namesOf(wire.names),
      preview: refOrNull(wire.preview),
      ...(wire.price === undefined ? {} : { price: wire.price }),
      ...(wire.owned === undefined ? {} : { owned: wire.owned }),
      contractSchema: wire.contractSchema ?? 1,
      contract: refOrNull(wire.contract),
    };
  };

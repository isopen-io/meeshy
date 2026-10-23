/**
 * LE REGISTRE DES PACKS OFFICIELS ET INTÉGRÉS (#10148, LP0, § 5.10.2) — les
 * schémas `zod/mini` que la passerelle et les clients appliquent à la
 * frontière : fichiers adressés par contenu, entrées de registre (avec
 * l'usage des cadres, #10146). Séparé de `content-pack.ts` pour que les
 * chunks des stickers n'embarquent pas ces schémas.
 */
import * as z from 'zod/mini';
import { FrameUsageSchema, type FrameUsage, type FreeFrameSurface } from './frame-usage.js';
import { GLORY_ATMOSPHERES } from './glory-atmospheres.js';
import { type PackEligibilityRule } from './pack-ownership.js';
import { PACK_TARGETING_LIMITS, type PackAvailability, type PackTargeting } from './pack-availability.js';
import { GLORY_RANKS, type GloryRankKey } from '../utils/game/glory.js';
import { PACK_DOMAINS, PACK_PRICE_MAX, PACK_LANGUAGES, PACK_LIMITS, PACK_SLUG_PATTERN, type PackAssetRef, type PackDefault, type PackDomain } from './content-pack.js';

// ── Les fichiers adressés par contenu ───────────────────────────────────

export const PACK_ASSET_EXTENSIONS = ['webp', 'png', 'json', 'woff2'] as const;
const ASSET_SRC_PATTERN = new RegExp(`^[0-9a-f]{16}\\.(?:${PACK_ASSET_EXTENSIONS.join('|')})$`);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const PackAssetRefSchema: z.ZodMiniType<PackAssetRef> = z
  .object({
    src: z.string().check(z.regex(ASSET_SRC_PATTERN)),
    bytes: z.int().check(z.minimum(0)),
    sha256: z.string().check(z.regex(SHA256_PATTERN)),
  })
  .check(z.refine((ref) => ref.src.startsWith(ref.sha256.slice(0, 16))));

// ── Le registre d'un pack officiel ou intégré ───────────────────────────

const nameSchema = z.object({
  name: z.string().check(z.trim(), z.minLength(1), z.maxLength(PACK_LIMITS.maxNameLength)),
  description: z.string().check(z.trim(), z.minLength(1), z.maxLength(PACK_LIMITS.maxDescriptionLength)),
});

const collectionSchema = z.object({
  slug: z.string().check(z.regex(PACK_SLUG_PATTERN), z.maxLength(PACK_LIMITS.maxSlugLength)),
  /** Remplace l'usage du pack pour les cadres de cette collection. */
  usage: z.optional(FrameUsageSchema),
});

/** Les domaines dont les packs portent des cadres, donc un usage. */
const FRAME_DOMAINS: readonly PackDomain[] = ['glory-frame', 'capture-frame', 'avatar-ring', 'banner-frame'];

/** Les domaines dont les cadres ne servent jamais le JEU : leur usage est `free` (une surface), qu'ils soient gratuits, payants ou récompensés. */
const FREE_FRAME_DOMAINS: readonly PackDomain[] = ['capture-frame', 'avatar-ring', 'banner-frame'];

/** Les domaines qu'un jeu peut récompenser (#11273) : un contour d'avatar ou un cadre de bannière, jamais un cadre de capture. */
const REWARDABLE_FRAME_DOMAINS: readonly PackDomain[] = ['avatar-ring', 'banner-frame'];

const GLORY_RANK_KEYS = GLORY_RANKS.map((rank) => rank.key) as unknown as readonly [GloryRankKey, ...GloryRankKey[]];

/** La récompense d'un pack : le rang, le trophée ou la saison du jeu qui le donne (#11273). Même forme que l'éligibilité de la possession (#11272). */
export const PackEligibilityRuleSchema: z.ZodMiniType<PackEligibilityRule> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rank'), rank: z.enum(GLORY_RANK_KEYS) }),
  z.object({ kind: z.literal('trophy'), key: z.string().check(z.minLength(1), z.maxLength(96)) }),
  z.object({ kind: z.literal('season'), number: z.int().check(z.minimum(1)) }),
]);

/**
 * La fenêtre de disponibilité (#11274) : deux instants ISO optionnels,
 * `startsAt` inclus et `endsAt` exclu. Une fenêtre qui finit avant de
 * commencer est illisible : l'entrée tombe, jamais le registre.
 */
export const PackAvailabilitySchema: z.ZodMiniType<PackAvailability> = z
  .object({ startsAt: z.optional(z.iso.datetime()), endsAt: z.optional(z.iso.datetime()) })
  .check(z.refine((window) => window.startsAt === undefined || window.endsAt === undefined || Date.parse(window.startsAt) < Date.parse(window.endsAt)));

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/;

/** Le ciblage (#11274) : communautés (identifiants), pays (ISO alpha-2 en capitales), langues (ISO 639-1). */
export const PackTargetingSchema: z.ZodMiniType<PackTargeting> = z.object({
  communities: z.optional(z.array(z.string().check(z.regex(OBJECT_ID_PATTERN))).check(z.maxLength(PACK_TARGETING_LIMITS.communities))),
  countries: z.optional(z.array(z.string().check(z.regex(/^[A-Z]{2}$/))).check(z.maxLength(PACK_TARGETING_LIMITS.countries))),
  languages: z.optional(z.array(z.string().check(z.regex(/^[a-z]{2,3}$/))).check(z.maxLength(PACK_TARGETING_LIMITS.languages))),
});

/**
 * Les surfaces RÉSERVÉES : chacune n'est déclarée que par son domaine, et ce
 * domaine ne déclare qu'elle. Les anciens clients iOS rejetteraient une surface
 * inconnue : une surface neuve ne voyage donc que dans le domaine neuf.
 */
const CONFINED_SURFACES: readonly { readonly surface: FreeFrameSurface; readonly domain: PackDomain }[] = [
  { surface: 'avatar', domain: 'avatar-ring' },
  { surface: 'banner', domain: 'banner-frame' },
];

type DeclaredUsages = { readonly usage?: FrameUsage; readonly collections?: readonly { readonly usage?: FrameUsage }[] };

const declaredUsages = (entry: DeclaredUsages): readonly FrameUsage[] =>
  [entry.usage, ...(entry.collections ?? []).map((collection) => collection.usage)].filter((usage): usage is FrameUsage => usage !== undefined);

/** Un cadre de gloire récompense le jeu, jamais une capture libre ; un cadre de capture est libre, jamais une récompense du jeu. */
const usageFitsDomain = (entry: DeclaredUsages & { readonly domain: PackDomain }): boolean => {
  if (!FRAME_DOMAINS.includes(entry.domain)) return entry.domain === 'sticker' || declaredUsages(entry).length === 0;
  const freeDomain = FREE_FRAME_DOMAINS.includes(entry.domain);
  return declaredUsages(entry).every((usage) => (usage.kind === 'free') === freeDomain) && surfacesConfined(entry);
};

/**
 * Un pack de stickers n'a pas d'usage ; un pack de CAPTURE porte le sien ; un
 * pack de GLOIRE peut le laisser à ses cadres quand ils ne partagent pas le
 * même (l'Afrique éternelle sert cinq rangs, les moments quatre familles) :
 * chaque cadre de son contrat porte alors son usage, obligatoire et lu
 * fail-closed (`glory-frame-pack.ts`), et la boutique l'affiche cadre par
 * cadre (#10154). Jamais un usage de pack qui mentirait sur ses cadres.
 */
const packUsageDeclared = (entry: { readonly domain: PackDomain; readonly usage?: FrameUsage }): boolean => {
  if (!FRAME_DOMAINS.includes(entry.domain)) return entry.usage === undefined;
  return entry.domain === 'glory-frame' || entry.usage !== undefined;
};

/**
 * La règle PAR PACK (#11273) : l'usage dit OÙ un cadre se porte, la récompense
 * dit COMMENT on le possède. Un pack récompensé garde donc son usage (confiné à
 * sa surface) et se possède par une ligne `game` (`PackGrants`), jamais par
 * tout compte (`isPackOwned`). Seuls un contour d'avatar ou un cadre de bannière
 * OFFICIEL peuvent l'être, et jamais à prix : on le gagne, on ne l'achète pas.
 */
const rewardFitsPack = (entry: {
  readonly domain: PackDomain;
  readonly origin: 'builtin' | 'official';
  readonly price?: number;
  readonly reward?: PackEligibilityRule;
}): boolean =>
  entry.reward === undefined || (REWARDABLE_FRAME_DOMAINS.includes(entry.domain) && entry.origin === 'official' && entry.price === undefined);

const sameSurfaces = (surfaces: readonly string[], expected: readonly string[]): boolean =>
  surfaces.length === expected.length && expected.every((surface) => surfaces.includes(surface));

/** Un contour d'avatar sert l'avatar et rien d'autre, un cadre de bannière la bannière et rien d'autre ; aucun autre domaine ne déclare ces surfaces. */
const surfacesConfined = (entry: DeclaredUsages & { readonly domain: PackDomain }): boolean => {
  const own = CONFINED_SURFACES.find((confined) => confined.domain === entry.domain);
  return declaredUsages(entry).every((usage) => {
    if (usage.kind !== 'free') return own === undefined;
    if (own !== undefined) return sameSurfaces(usage.surfaces, [own.surface]);
    return CONFINED_SURFACES.every((confined) => !usage.surfaces.includes(confined.surface));
  });
};

/**
 * L'entrée de registre d'un pack officiel ou intégré. Un pack de CADRES porte
 * l'usage de ses cadres (`usage`, et par collection), que la loi d'usage lit :
 * un cadre sans usage lisible ne se propose nulle part.
 */
export const PackIndexEntrySchema = z
  .object({
    slug: z.string().check(z.regex(PACK_SLUG_PATTERN), z.maxLength(PACK_LIMITS.maxSlugLength)),
    domain: z.enum(PACK_DOMAINS),
    origin: z.enum(['builtin', 'official']),
    version: z.int().check(z.minimum(1)),
    order: z.int().check(z.minimum(0)),
    installedByDefault: z.boolean(),
    removable: z.boolean(),
    hidden: z.boolean(),
    /** La version de contrat qu'un client doit savoir lire ; sinon « Mettre à jour Meeshy », et rien ne se télécharge. */
    contractSchema: z.int().check(z.minimum(1)),
    cover: PackAssetRefSchema,
    preview: z.nullable(PackAssetRefSchema),
    contract: PackAssetRefSchema,
    strings: z.partialRecord(z.enum(PACK_LANGUAGES), PackAssetRefSchema),
    downloadBytes: z.object({ story: z.int().check(z.minimum(0)), square: z.nullable(z.int().check(z.minimum(0))) }),
    names: z.partialRecord(z.enum(PACK_LANGUAGES), nameSchema),
    usage: z.optional(FrameUsageSchema),
    /** La récompense du jeu qui donne le pack (#11273) : présente, le pack se possède par une ligne (`isPackOwned`), jamais par tout compte. */
    reward: z.optional(PackEligibilityRuleSchema),
    /** Le prix en Meeshes (#10632) : absent = gratuit, jamais 0 ; jamais sur un pack intégré. */
    price: z.optional(z.int().check(z.minimum(1), z.maximum(PACK_PRICE_MAX))),
    collections: z.optional(z.array(collectionSchema)),
    atmosphere: z.optional(z.enum(GLORY_ATMOSPHERES)),
    /** Quand le pack est OFFERT (#11274) ; la possession n'en dépend jamais. */
    availability: z.optional(PackAvailabilitySchema),
    /** À qui il est offert (#11274) : communautés, pays, langues. */
    targeting: z.optional(PackTargetingSchema),
  })
  .check(
    z.refine(packUsageDeclared),
    z.refine(usageFitsDomain),
    z.refine(rewardFitsPack),
    z.refine((entry) => entry.atmosphere === undefined || entry.domain === 'glory-frame'),
    z.refine((entry) => entry.removable || entry.installedByDefault),
    z.refine((entry) => entry.price === undefined || entry.origin !== 'builtin'),
    z.refine((entry) => entry.names.fr !== undefined),
  );

export type PackIndexEntry = z.infer<typeof PackIndexEntrySchema>;

/**
 * Lit un registre, fail-closed PAR ENTRÉE : une entrée illisible, ou qui
 * reprend le slug d'une entrée précédente du même domaine, tombe seule.
 */
export function parsePackIndex(input: unknown): { readonly entries: readonly PackIndexEntry[]; readonly rejected: number } {
  const raw: readonly unknown[] = Array.isArray(input) ? input : [];
  const entries = raw.reduce<PackIndexEntry[]>((kept, candidate) => {
    const parsed = PackIndexEntrySchema.safeParse(candidate);
    if (!parsed.success) return kept;
    const taken = kept.some((entry) => entry.domain === parsed.data.domain && entry.slug === parsed.data.slug);
    return taken ? kept : [...kept, parsed.data];
  }, []);
  return { entries, rejected: raw.length - entries.length };
}

/** L'usage d'un cadre d'un pack : celui de sa collection s'il en déclare un, sinon celui du pack ; `null` ⇒ ne se propose nulle part. */
export function frameUsageOf(entry: Pick<PackIndexEntry, 'usage' | 'collections'>, collection?: string): FrameUsage | null {
  const own = collection === undefined ? undefined : entry.collections?.find((c) => c.slug === collection)?.usage;
  return own ?? entry.usage ?? null;
}

/** Les défauts d'installation d'un registre lu, dans la forme que `isPackInstalled` attend. */
export const packDefaultsOf = (entries: readonly PackIndexEntry[], domain: PackDomain): readonly PackDefault[] =>
  entries.filter((entry) => entry.domain === domain).map(({ slug, installedByDefault }) => ({ slug, installedByDefault }));

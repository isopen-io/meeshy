/**
 * LE CONTRAT COMPLET D'UN CADRE DE GLOIRE (#10154, L3, § 5.2 de
 * `docs/product/cadres-de-gloire/PROMPT-developpement.md`) — ce qu'un peintre
 * et la loi de proposition (L4) lisent. Il ÉTEND le contrat de la boutique
 * (`glory-frame-pack.ts` : identifiant, usage, vignette, clés de nom) du
 * placement d'un cadre dans la loi et de ses formats ; un même fichier se lit
 * par les deux lecteurs, et la boutique ignore ce qu'elle ne connaît pas.
 *
 * Deux formes, un seul lecteur de cadre :
 *  - le CONTRAT D'UN PACK (`{ schema, frames }`, adressé par contenu,
 *    `GET /api/v1/pack-assets/<sha16>.json`) — les cadres de ses collections ;
 *  - le MANIFESTE NORMALISÉ d'une collection
 *    (`packages/shared/design/glory-frames/<collection>.json`), d'où
 *    `generate:glory-frames` assemble les contrats de packs.
 *
 * `appliesTo` porte les CLÉS de la loi, jamais un libellé : rang et division
 * (`null` : toutes les divisions, et le Mythe), palier (`LEVEL_TIER_KEYS`),
 * édition de Meesh, palier du trésor, seuil de Flamme, rareté de succès
 * (`null` : le cadre neutre, qui n'affirme aucune rareté). Elle doit dire la
 * même chose que `usage` (la loi d'usage, #10146) : un cadre qui se
 * contredit tombe.
 *
 * Fail-closed PAR CADRE : un cadre illisible, contradictoire ou qui reprend
 * l'identifiant d'un précédent tombe seul et se compte. Un `id` publié ne se
 * retire jamais : il se masque (`hidden`), parce qu'une entrée de carnet le cite.
 */
import * as z from 'zod/mini';
import { ACHIEVEMENT_RARITIES, GLORY_DIVISIONS, GLORY_RANKS } from '../utils/game/glory.js';
import { LEVEL_TIER_KEYS } from '../utils/game/levels.js';
import { PHOTO_FLAME_THRESHOLDS } from '../utils/game/photo-catch-up.js';
import { TREASURY_TIERS, type TreasuryTierKey } from '../utils/game/treasury.js';
import type { PackAssetRef } from './content-pack.js';
import type { FrameUsage } from './frame-usage.js';
import { GloryFrameFormatSchema, gloryFrameFormatAssets } from './glory-frame-format.js';
import { GLORY_FRAME_PACK_SCHEMA, readGloryFramePackFrame, type GloryFramePackFrame } from './glory-frame-pack.js';
import { GLORY_ATMOSPHERES, type GloryAtmosphere } from './glory-atmospheres.js';

export const GLORY_FRAME_FAMILIES = ['rank', 'tier', 'meesh', 'treasury', 'flame', 'day', 'achievement'] as const;
export type GloryFrameFamily = (typeof GLORY_FRAME_FAMILIES)[number];

/** La Meesh n° 1, puis l'édition de la pièce (argent, or à chaque centième, prisme à chaque millième). */
export const MEESH_FRAME_EDITIONS = ['first', 'silver', 'gold', 'prism'] as const;
export type MeeshFrameEdition = (typeof MEESH_FRAME_EDITIONS)[number];

export type PhotoFlameThreshold = (typeof PHOTO_FLAME_THRESHOLDS)[number];

export type GloryFrameContract = { readonly schema: typeof GLORY_FRAME_PACK_SCHEMA; readonly frames: readonly GloryFrame[] };

export type GloryFrameCollection = {
  readonly schema: typeof GLORY_FRAME_PACK_SCHEMA;
  readonly collection: string;
  /** `null` pour les collections hors atmosphère (`moments`, `tresor`, `mythologies`, `succes`). */
  readonly atmosphere: GloryAtmosphere | null;
  readonly frames: readonly GloryFrame[];
};

const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const slug = z.string().check(z.regex(SLUG), z.maxLength(24));
const RANK_KEYS = [...GLORY_RANKS.map((rank) => rank.key), 'mythe'] as const;

/**
 * La cible d'un cadre : rang et division (`null` : toutes les divisions, et le Mythe), palier, édition de Meesh,
 * palier du trésor, seuil de Flamme, réalisation du jour, rareté d'un succès (`null` : le cadre neutre).
 */
const appliesToSchema = z.discriminatedUnion('family', [
  z
    .object({ family: z.literal('rank'), rank: z.enum(RANK_KEYS), division: z.nullable(z.literal(GLORY_DIVISIONS)) })
    .check(z.refine((target) => target.rank !== 'mythe' || target.division === null)),
  z.object({ family: z.literal('tier'), tier: z.enum(LEVEL_TIER_KEYS) }),
  z.object({ family: z.literal('meesh'), edition: z.enum(MEESH_FRAME_EDITIONS) }),
  z.object({ family: z.literal('treasury'), treasury: z.enum(TREASURY_TIERS.map((tier) => tier.key) as [TreasuryTierKey, ...TreasuryTierKey[]]) }),
  z.object({ family: z.literal('flame'), days: z.literal(PHOTO_FLAME_THRESHOLDS) }),
  z.object({ family: z.literal('day') }),
  z.object({ family: z.literal('achievement'), rarity: z.nullable(z.enum(ACHIEVEMENT_RARITIES)) }),
]);

const placementSchema = z.object({
  collection: slug,
  appliesTo: appliesToSchema,
  /** La décoration dans sa famille (`V`…`I`, `A`/`B`/`C`, `a`/`b`/`c`) ; `null` quand il n'y en a qu'une. */
  option: z.nullable(z.string().check(z.regex(/^[A-Za-z0-9]{1,4}$/))),
  /** Ce que le cadre porte (`afrique`, `cosmos`…) : l'invariant « un peu d'Afrique dans chaque atmosphère ». */
  motifs: z.array(slug).check(z.maxLength(8)),
  /** Sorti des suggestions, jamais retiré : une photo gardée le cite encore. */
  hidden: z.boolean(),
  formats: z.object({ story: GloryFrameFormatSchema, square: z.nullable(GloryFrameFormatSchema) }),
});

/** Les types DÉRIVENT des schémas (la passerelle compile sans `strictNullChecks`, cf. `glory-frame-format.ts`). */
export type GloryFrameAppliesTo = z.infer<typeof appliesToSchema>;
export type GloryFrame = GloryFramePackFrame & z.infer<typeof placementSchema>;

/** La cible d'un cadre et son usage disent-ils la même chose ? Un cadre de rang ne sert que son rang, un cadre de moment que sa famille. */
export function usageFitsAppliesTo(usage: FrameUsage, target: GloryFrameAppliesTo): boolean {
  switch (target.family) {
    case 'rank':
      return usage.kind === 'rank' && usage.rank === target.rank && (usage.division === undefined || usage.division === target.division);
    case 'achievement':
      return usage.kind === 'achievement' && (usage.rarity ?? null) === target.rarity;
    default:
      return usage.kind === 'moment' && usage.family === target.family;
  }
}

/** Lit UN cadre complet ; `null` s'il est illisible ou s'il se contredit. */
export function readGloryFrame(candidate: unknown): GloryFrame | null {
  const base = readGloryFramePackFrame(candidate);
  const placement = placementSchema.safeParse(candidate);
  if (base === null || !placement.success) return null;
  const frame: GloryFrame = { ...base, ...placement.data };
  const ownCollection = frame.id.startsWith(`${frame.collection}.`);
  return ownCollection && usageFitsAppliesTo(frame.usage, frame.appliesTo) ? frame : null;
}

const readFrames = (raw: readonly unknown[], accept: (frame: GloryFrame) => boolean = () => true): readonly GloryFrame[] =>
  raw.reduce<GloryFrame[]>((kept, candidate) => {
    const frame = readGloryFrame(candidate);
    if (frame === null || !accept(frame) || kept.some((other) => other.id === frame.id)) return kept;
    return [...kept, frame];
  }, []);

const contractEnvelope = z.object({ schema: z.literal(GLORY_FRAME_PACK_SCHEMA), frames: z.array(z.unknown()) });

/** Lit le contrat COMPLET d'un pack. `null` pour une version inconnue ou une forme illisible. */
export function parseGloryFrameContract(input: unknown): { readonly contract: GloryFrameContract; readonly rejected: number } | null {
  const envelope = contractEnvelope.safeParse(input);
  if (!envelope.success) return null;
  const frames = readFrames(envelope.data.frames);
  return { contract: { schema: GLORY_FRAME_PACK_SCHEMA, frames }, rejected: envelope.data.frames.length - frames.length };
}

const collectionEnvelope = z.object({
  schema: z.literal(GLORY_FRAME_PACK_SCHEMA),
  collection: slug,
  atmosphere: z.nullable(z.enum(GLORY_ATMOSPHERES)),
  frames: z.array(z.unknown()),
});

/** Lit le manifeste normalisé d'une collection ; un cadre d'une autre collection tombe. */
export function parseGloryFrameCollection(input: unknown): { readonly collection: GloryFrameCollection; readonly rejected: number } | null {
  const envelope = collectionEnvelope.safeParse(input);
  if (!envelope.success) return null;
  const { collection, atmosphere } = envelope.data;
  const frames = readFrames(envelope.data.frames, (frame) => frame.collection === collection);
  return { collection: { schema: GLORY_FRAME_PACK_SCHEMA, collection, atmosphere, frames }, rejected: envelope.data.frames.length - frames.length };
}

/** Tous les fichiers qu'un cadre demande au magasin : sa vignette et ceux de chacun de ses formats. */
export function gloryFrameAssets(frame: GloryFrame): readonly PackAssetRef[] {
  const formats = [frame.formats.story, ...(frame.formats.square === null ? [] : [frame.formats.square])];
  return [frame.thumb, ...formats.flatMap(gloryFrameFormatAssets)];
}

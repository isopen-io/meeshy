/**
 * LE CONTRAT MINIMAL D'UN PACK DE CADRES DE GLOIRE (#10148, #10157) — le
 * fichier `contract` (adressé par contenu, `GET /api/v1/pack-assets/<sha16>.json`)
 * qu'une entrée de registre `glory-frame` référence, et les chaînes par
 * langue qu'elle référence sous `strings`.
 *
 * Il porte ce qu'une BOUTIQUE et une étagère ont besoin de montrer : chaque
 * cadre, son usage (la loi d'usage, #10146 — un cadre de gloire n'est JAMAIS
 * libre), sa vignette et la clé de son nom. Il grandit vers le contrat complet
 * du § 5.2 (`docs/product/cadres-de-gloire/PROMPT-developpement.md`, L3) sans
 * rupture : `zod/mini` IGNORE les champs qu'il ne connaît pas (`family`,
 * `formats`, `motifs`…), donc un client d'aujourd'hui lit le contrat de
 * demain, et le numéro `schema` ne bouge que pour une rupture.
 *
 * Fail-closed PAR CADRE : un cadre illisible (usage absent ou libre, vignette
 * non adressée par contenu, clé de nom absente) ou qui reprend l'identifiant
 * d'un cadre précédent tombe seul et se compte. Une version de contrat
 * inconnue ne se lit pas du tout : « Mettre à jour Meeshy ».
 *
 * Séparé de `content-pack-index.ts` pour que les chunks qui ne lisent que la
 * boutique n'embarquent pas ce schéma.
 */
import * as z from 'zod/mini';
import { FrameUsageSchema, type FrameUsage } from './frame-usage.js';
import { PackAssetRefSchema } from './content-pack-index.js';
import type { PackAssetRef } from './content-pack.js';

/** La seule version de contrat que ce client sait lire. */
export const GLORY_FRAME_PACK_SCHEMA = 1;

/** `<slug du pack>.<cadre>` ou toute suite de segments minuscules séparés par des points. */
export const GLORY_FRAME_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;
/** Une clé de chaîne : celle que le fichier `strings` de chaque langue traduit. */
export const PACK_STRING_KEY_PATTERN = /^[a-z0-9][a-zA-Z0-9._-]*$/;

const MAX_FRAME_ID_LENGTH = 64;
const MAX_STRING_KEY_LENGTH = 120;
const MAX_STRING_LENGTH = 2_000;

/** Un cadre de gloire n'est jamais libre : il récompense le jeu, la capture libre est l'affaire des cadres de capture. */
export type GloryFrameUsage = Exclude<FrameUsage, { readonly kind: 'free' }>;

export type GloryFramePackFrame = {
  readonly id: string;
  readonly usage: GloryFrameUsage;
  /** 270×480 au plus, WebP, adressée par contenu. */
  readonly thumb: PackAssetRef;
  /** Des CLÉS, que le fichier `strings` de la langue du lecteur traduit. */
  readonly i18n: { readonly name: string; readonly story?: string };
};

export type GloryFramePackContract = {
  readonly schema: typeof GLORY_FRAME_PACK_SCHEMA;
  readonly frames: readonly GloryFramePackFrame[];
};

/** Les chaînes d'un pack dans UNE langue : clé → texte. */
export type PackStrings = Readonly<Record<string, string>>;

const stringKey = z.string().check(z.regex(PACK_STRING_KEY_PATTERN), z.maxLength(MAX_STRING_KEY_LENGTH));

const frameSchema = z.object({
  id: z.string().check(z.regex(GLORY_FRAME_ID_PATTERN), z.maxLength(MAX_FRAME_ID_LENGTH)),
  usage: FrameUsageSchema.check(z.refine((usage) => usage.kind !== 'free')),
  thumb: PackAssetRefSchema,
  i18n: z.object({ name: stringKey, story: z.optional(stringKey) }),
});

const envelopeSchema = z.object({
  schema: z.literal(GLORY_FRAME_PACK_SCHEMA),
  frames: z.array(z.unknown()),
});

const isGloryFrameUsage = (usage: FrameUsage): usage is GloryFrameUsage => usage.kind !== 'free';

/** Lit UN cadre de la boutique ; `null` s'il est illisible. Le contrat complet (`glory-frames.ts`) part de lui. */
export const readGloryFramePackFrame = (candidate: unknown): GloryFramePackFrame | null => {
  const parsed = frameSchema.safeParse(candidate);
  if (!parsed.success || !isGloryFrameUsage(parsed.data.usage)) return null;
  const { story, name } = parsed.data.i18n;
  return { ...parsed.data, usage: parsed.data.usage, i18n: story === undefined ? { name } : { name, story } };
};

/**
 * Lit un contrat de pack de cadres. `null` pour une version inconnue ou une
 * forme illisible ; sinon les cadres lisibles, dans l'ordre, et le compte de
 * ceux qui sont tombés.
 */
export function parseGloryFramePackContract(input: unknown): { readonly contract: GloryFramePackContract; readonly rejected: number } | null {
  const envelope = envelopeSchema.safeParse(input);
  if (!envelope.success) return null;
  const raw = envelope.data.frames;
  const frames = raw.reduce<GloryFramePackFrame[]>((kept, candidate) => {
    const frame = readGloryFramePackFrame(candidate);
    if (frame === null || kept.some((other) => other.id === frame.id)) return kept;
    return [...kept, frame];
  }, []);
  return { contract: { schema: GLORY_FRAME_PACK_SCHEMA, frames }, rejected: raw.length - frames.length };
}

const isStringEntry = (entry: [string, unknown]): entry is [string, string] =>
  PACK_STRING_KEY_PATTERN.test(entry[0]) &&
  entry[0].length <= MAX_STRING_KEY_LENGTH &&
  typeof entry[1] === 'string' &&
  entry[1].trim().length > 0 &&
  entry[1].length <= MAX_STRING_LENGTH;

/** Lit le fichier de chaînes d'une langue ; une paire illisible tombe seule, une forme illisible rend une table vide. */
export function parsePackStrings(input: unknown): PackStrings {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(isStringEntry));
}

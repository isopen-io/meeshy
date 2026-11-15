/**
 * `ConversationAppearance` (#10631, § 5.4) — le fond ET l'accent PERSONNELS
 * d'une conversation : un choix du lecteur, stocké sur sa ligne
 * `UserConversationPreferences`, synchronisé entre SES appareils, jamais
 * partagé avec les autres membres.
 *
 * Deux lecteurs, deux régimes : `parseConversationAppearance` est STRICT (la
 * passerelle, à l'écriture) ; `readConversationAppearance` est TOLÉRANT PAR
 * CHAMP (les clients) — un fond d'une passerelle plus récente retombe sur
 * Signature sans perdre l'accent, et inversement. Absent ⇔ Signature.
 */
import * as z from 'zod/mini';
import { APPEARANCE_GAMUT, GAMUT_KEYS, isGamutKey, type GamutKey, type GamutScheme } from '../design/appearance/gamut.js';
import { conversationAccentPaletteFromPrimary, type ConversationAccentPalette } from '../utils/conversation-colors.js';
import { PACK_SLUG_PATTERN } from './content-pack.js';

export const APPEARANCE_VERSION = 1;

export const PHOTO_VEIL_MAX = 0.8;
export const PHOTO_VEIL_STEP = 0.05;
export const PHOTO_BLUR_MAX = 24;

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
const slug = z.string().check(z.regex(PACK_SLUG_PATTERN), z.maxLength(24));
const gamutKey = z.enum(GAMUT_KEYS);

const onVeilStep = (veil: number): boolean => Math.abs(veil / PHOTO_VEIL_STEP - Math.round(veil / PHOTO_VEIL_STEP)) < 1e-6;

const BACKGROUND_SHAPES = {
  signature: { kind: z.literal('signature') },
  design: { kind: z.literal('design'), pack: slug, design: slug },
  solid: { kind: z.literal('solid'), color: gamutKey },
  photo: {
    kind: z.literal('photo'),
    attachmentId: z.string().check(z.regex(OBJECT_ID_PATTERN)),
    veil: z.number().check(z.minimum(0), z.maximum(PHOTO_VEIL_MAX), z.refine(onVeilStep)),
    blur: z.int().check(z.minimum(0), z.maximum(PHOTO_BLUR_MAX)),
  },
} as const;

/** À l'écriture : un champ inconnu est refusé. */
const BackgroundSchema = z.discriminatedUnion('kind', [
  z.strictObject(BACKGROUND_SHAPES.signature),
  z.strictObject(BACKGROUND_SHAPES.design),
  z.strictObject(BACKGROUND_SHAPES.solid),
  z.strictObject(BACKGROUND_SHAPES.photo),
]);

/** À la lecture : un champ AJOUTÉ par une passerelle plus récente est ignoré, le fond connu reste servi. */
const TolerantBackgroundSchema = z.discriminatedUnion('kind', [
  z.object(BACKGROUND_SHAPES.signature),
  z.object(BACKGROUND_SHAPES.design),
  z.object(BACKGROUND_SHAPES.solid),
  z.object(BACKGROUND_SHAPES.photo),
]);
export type ConversationBackground = z.infer<typeof BackgroundSchema>;

const ConversationAppearanceSchema = z.strictObject({
  v: z.literal(APPEARANCE_VERSION),
  background: BackgroundSchema,
  /** `null` = l'accent calculé de la conversation (la loi actuelle). */
  accent: z.nullable(gamutKey),
  /** La couche Lottie ; ignorée sous « Réduire les animations ». */
  animate: z.boolean(),
});
export type ConversationAppearance = {
  readonly v: typeof APPEARANCE_VERSION;
  readonly background: ConversationBackground;
  readonly accent: GamutKey | null;
  readonly animate: boolean;
};

export const DEFAULT_APPEARANCE: ConversationAppearance = {
  v: APPEARANCE_VERSION,
  background: { kind: 'signature' },
  accent: null,
  animate: true,
};

/** STRICT : la passerelle, à l'écriture. `null` ⇒ 400 `INVALID_APPEARANCE`. */
export const parseConversationAppearance = (input: unknown): ConversationAppearance | null => {
  const parsed = ConversationAppearanceSchema.safeParse(input);
  if (!parsed.success) return null;
  // Reconstruit champ par champ : la passerelle compile ces sources avec
  // `strictNullChecks: false`, où zod infère CHAQUE clé optionnelle — rendre
  // `parsed.data` tel quel cassait la construction de son image Docker.
  const { v, background, accent, animate } = parsed.data;
  return { v, background, accent, animate };
};

const asRecord = (input: unknown): Readonly<Record<string, unknown>> | null =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Readonly<Record<string, unknown>>) : null;

/** TOLÉRANT PAR CHAMP : les clients. Jamais une conversation illisible. */
export function readConversationAppearance(input: unknown): ConversationAppearance {
  const record = asRecord(input);
  if (record === null) return DEFAULT_APPEARANCE;
  const background = TolerantBackgroundSchema.safeParse(record['background']);
  return {
    v: APPEARANCE_VERSION,
    background: background.success ? background.data : DEFAULT_APPEARANCE.background,
    accent: isGamutKey(record['accent']) ? record['accent'] : null,
    animate: typeof record['animate'] === 'boolean' ? record['animate'] : DEFAULT_APPEARANCE.animate,
  };
}

/** La projection depuis le tableau `userPreferences` du wire (entrée unique du lecteur, `take: 1`). */
export function appearanceFromPreferences(userPreferences: unknown): ConversationAppearance {
  if (!Array.isArray(userPreferences)) return DEFAULT_APPEARANCE;
  const [own] = userPreferences as readonly unknown[];
  return readConversationAppearance(asRecord(own)?.['appearance']);
}

/**
 * L'accent EFFECTIF : un accent personnel ⇒ sa primaire dans le schéma
 * courant, déclinée à ±30° ; sinon la palette calculée de la conversation,
 * inchangée. UNE fonction, appelée par le site qui calcule déjà l'accent.
 */
export function resolveAppearanceAccent(args: {
  readonly computedPrimary: string;
  readonly appearance: ConversationAppearance;
  readonly scheme: GamutScheme;
}): ConversationAccentPalette {
  const { appearance, computedPrimary, scheme } = args;
  return conversationAccentPaletteFromPrimary(appearance.accent === null ? computedPrimary : APPEARANCE_GAMUT[appearance.accent][scheme].accent);
}

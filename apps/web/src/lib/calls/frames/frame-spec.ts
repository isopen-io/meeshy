import * as z from 'zod/mini';

/**
 * **LE VOCABULAIRE DES CADRES DE CAPTURE** — le contrat de
 * `docs/superpowers/specs/2026-09-29-cadres-de-capture-d-appel-design.md` § 4,
 * en schéma. Un cadre est une DONNÉE (`packages/shared/design/call-capture-frames/`)
 * que le web et iOS interprètent avec ce même vocabulaire fermé : c'est ce
 * qui permet d'en tenir cent sans cent fonctions de dessin.
 */

export const FRAME_MOODS = ['signature', 'distingue', 'elegant', 'jovial', 'deconnecte', 'corporate', 'fantastique', 'futuriste', 'glauque', 'hors-norme', 'morbide', 'feerique'] as const;
export type FrameMood = (typeof FRAME_MOODS)[number];

export const FRAME_BUCKETS = ['duo', 'comite', 'groupe', 'tablee'] as const;
export type FrameBucket = (typeof FRAME_BUCKETS)[number];

/** Les personnes que sert chaque tranche, moi compris. */
export const BUCKET_PEOPLE: Readonly<Record<FrameBucket, readonly [number, number]>> = { duo: [2, 2], comite: [3, 4], groupe: [5, 6], tablee: [7, 12] };

export const FRAME_ARRANGEMENTS = ['split', 'diagonal', 'hero', 'grid', 'row', 'column', 'arch', 'orbit', 'scatter', 'tiers', 'mosaic', 'honeycomb', 'cascade'] as const;
export type FrameArrangement = (typeof FRAME_ARRANGEMENTS)[number];

/** Les dispositions qui n'ont de sens qu'à deux. */
export const DUO_ONLY_ARRANGEMENTS: ReadonlySet<FrameArrangement> = new Set(['split', 'diagonal']);

export const SLOT_SHAPES = ['rect', 'round', 'circle', 'oval', 'arch', 'hex', 'diamond', 'heart', 'star', 'ticket', 'stamp', 'blob'] as const;
export type SlotShape = (typeof SLOT_SHAPES)[number];

export const SLOT_TONES = ['color', 'mono', 'sepia', 'noir', 'warm', 'cool', 'faded', 'duotone'] as const;
export type SlotTone = (typeof SLOT_TONES)[number];

export const SLOT_TILTS = ['none', 'gentle', 'wild'] as const;

export const FRAME_PATTERNS = ['dots', 'stripes', 'grid', 'checker', 'halftone', 'scanlines', 'grain', 'stars', 'confetti', 'sunburst', 'waves', 'circuit', 'damask', 'hearts'] as const;
export type FramePatternKind = (typeof FRAME_PATTERNS)[number];

export const FRAME_BORDERS = ['hairline', 'double', 'deco', 'baroque', 'filmstrip', 'ticket', 'perforated', 'neon', 'brackets', 'torn', 'mourning', 'vines', 'bulbs', 'polaroid'] as const;
export type FrameBorderKind = (typeof FRAME_BORDERS)[number];

export const FRAME_ORNAMENTS = [
  'sparkles', 'bokeh', 'confetti', 'balloons', 'stars', 'hearts', 'fireflies', 'petals', 'leaves', 'bubbles', 'snow', 'rays',
  'glitch', 'scanlines', 'grain', 'vignette', 'lightleak', 'crown', 'ribbon', 'tape', 'rec', 'crosshair', 'orbits', 'runes',
  'cobwebs', 'drips', 'lightning', 'notes', 'candles', 'moon', 'clouds', 'bats', 'skulls', 'roses',
] as const;
export type FrameOrnamentKind = (typeof FRAME_ORNAMENTS)[number];

/** Les dix-huit `StoryTextStyle` — les polices des images de message et de commentaire (Imager). */
export const FRAME_FONTS = ['bold', 'neon', 'typewriter', 'handwriting', 'classic', 'calligraphy', 'cartoon', 'futuristic', 'fantasy', 'curve', 'tag', 'italic', 'retro', 'elegant', 'poster', 'bubble', 'note', 'brush'] as const;
export type FrameFont = (typeof FRAME_FONTS)[number];

export const BRAND_MARKS = ['logo', 'wordmark', 'both'] as const;
export const BRAND_PLACES = ['top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'watermark'] as const;
export const TEXT_SIZES = ['s', 'm', 'l'] as const;
export const NAME_SHOWS = ['none', 'name', 'handle', 'both'] as const;
export const NAME_STYLES = ['caption', 'plate', 'ribbon', 'badge', 'bubble', 'tag', 'list'] as const;
export const TITLE_SOURCES = ['group', 'names', 'brand', 'date', 'none'] as const;
export const TEXT_EFFECTS = ['none', 'shadow', 'glow', 'outline'] as const;

const Hex = z.string().check(z.regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/));
const Fraction = z.number().check(z.minimum(0), z.maximum(1));
const Font = z.enum(FRAME_FONTS);

const Layout = z.object({
  arrangement: z.enum(FRAME_ARRANGEMENTS),
  margin: Fraction,
  gap: Fraction,
  top: Fraction,
  bottom: Fraction,
});

const Slot = z.object({
  shape: z.enum(SLOT_SHAPES),
  radius: z.optional(Fraction),
  stroke: z.optional(z.object({ color: Hex, width: Fraction })),
  double: z.optional(z.boolean()),
  glow: z.optional(Hex),
  shadow: z.optional(z.boolean()),
  card: z.optional(z.object({ color: Hex, pad: Fraction, foot: Fraction })),
  tilt: z.enum(SLOT_TILTS),
  tone: z.enum(SLOT_TONES),
  duotone: z.optional(z.tuple([Hex, Hex])),
});

const Background = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('solid'), color: Hex }),
  z.object({ kind: z.literal('linear'), colors: z.array(Hex).check(z.minLength(2)), angle: z.number() }),
  z.object({ kind: z.literal('radial'), colors: z.array(Hex).check(z.minLength(2)) }),
  z.object({ kind: z.literal('accent') }),
]);

const Pattern = z.object({ kind: z.enum(FRAME_PATTERNS), color: Hex, opacity: Fraction });

const Border = z.object({ kind: z.enum(FRAME_BORDERS), color: Hex, width: Fraction, inset: Fraction });

const Ornament = z.object({ kind: z.enum(FRAME_ORNAMENTS), color: Hex, density: z.enum(['low', 'mid', 'high']), layer: z.enum(['back', 'front']) });

const Brand = z.object({ mark: z.enum(BRAND_MARKS), place: z.enum(BRAND_PLACES), color: Hex, size: z.enum(TEXT_SIZES), font: z.optional(Font) });

const Names = z.object({ show: z.enum(NAME_SHOWS), style: z.enum(NAME_STYLES), font: Font, color: Hex, fill: z.optional(Hex) });

const Title = z.object({
  source: z.enum(TITLE_SOURCES),
  font: Font,
  color: Hex,
  place: z.enum(['top', 'bottom']),
  size: z.enum(TEXT_SIZES),
  effect: z.optional(z.enum(TEXT_EFFECTS)),
  case: z.optional(z.enum(['upper', 'as-is'])),
});

/** L'apparence complète d'un cadre — ce qu'une variante surcharge, clé par clé. */
export const FrameLookSchema = z.object({
  layout: Layout,
  slot: Slot,
  background: Background,
  pattern: z.optional(Pattern),
  border: z.optional(Border),
  ornaments: z.array(Ornament),
  brand: Brand,
  names: Names,
  title: Title,
  subtitle: z.optional(Title),
});

export const FrameMotifSchema = z.object({
  id: z.string().check(z.regex(/^[a-z-]+\.[a-z0-9-]+$/)),
  mood: z.enum(FRAME_MOODS),
  name: z.string().check(z.minLength(1)),
  base: FrameLookSchema,
  variants: z.partialRecord(z.enum(FRAME_BUCKETS), z.partial(FrameLookSchema)),
});

export const FrameMoodFileSchema = z.object({ mood: z.enum(FRAME_MOODS), motifs: z.array(FrameMotifSchema) });

export type FrameLook = z.infer<typeof FrameLookSchema>;
export type FrameMotif = z.infer<typeof FrameMotifSchema>;
export type FrameMoodFile = z.infer<typeof FrameMoodFileSchema>;
export type FrameSlot = FrameLook['slot'];
export type FrameBackground = FrameLook['background'];
export type FrameBrand = FrameLook['brand'];
export type FrameNames = FrameLook['names'];
export type FrameTitle = FrameLook['title'];
export type FrameOrnament = FrameLook['ornaments'][number];

/** Un cadre : un motif servi à une tranche. `id` = `<ambiance>.<motif>.<tranche>`, stable. */
export type CaptureFrame = FrameLook & {
  readonly id: string;
  readonly motif: string;
  readonly mood: FrameMood;
  readonly name: string;
  readonly bucket: FrameBucket;
  readonly people: readonly [number, number];
};

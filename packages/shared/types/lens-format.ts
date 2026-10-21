/**
 * MEESHYLENS V1 — LE CONTRAT D'UNE LENS (#11270, S15).
 *
 * Une lens est un petit document déclaratif qu'un partenaire propose, que la
 * modération publie et que le peintre de chaque plateforme rend sur la caméra,
 * la photo, la vidéo et l'appel. Ce fichier est la SEULE définition du format :
 * le web l'importe, la passerelle l'applique à la frontière, et iOS en reçoit le
 * miroir Swift généré (`scripts/generate-lens-format-swift.ts`). Les vecteurs de
 * `fixtures/lens-v1/vectors.json` sont rejoués par vitest ET par ce Swift.
 *
 * Trois lois gouvernent la lecture, dans cet ordre (`parseLens`) :
 *  1. un schéma PLUS RÉCENT que celui qu'on connaît n'est pas lu, il demande la
 *     MISE À JOUR de l'application (`update-required`) ;
 *  2. v1 n'exécute rien et n'ouvre rien : ni shader, ni script, ni URL, ni
 *     réseau, ni 3D. Un document qui en porte est REFUSÉ en bloc (`forbidden`),
 *     jamais lu « moins ce qu'on ne sait pas faire » ;
 *  3. le reste est TOLÉRANT : une couche ou un déclencheur de genre inconnu, ou
 *     illisible, est IGNORÉ et compté, les autres restent. Un client publié avant
 *     une sixième primitive lit donc une lens récente en la jouant sans elle.
 *
 * Les longueurs de chaîne se mesurent en unités UTF-16 (JavaScript, et
 * `String.utf16.count` côté Swift) : la même mesure des deux côtés.
 */
import * as z from 'zod/mini';
import { APPEARANCE_LIMITS } from './appearance-design.js';
import { PACK_SLUG_PATTERN } from './content-pack.js';
import { GLORY_FRAME_FONTS } from './glory-frame-format.js';

/** La version que ce fichier sait lire. Un document `schema` supérieur demande la mise à jour. */
export const LENS_SCHEMA_VERSION = 1;

export const LENS_LIMITS = {
  maxLayers: 12,
  /** Au-delà, la liste est un abus, pas une lens : elle est refusée en bloc. */
  maxDeclaredLayers: 32,
  maxTriggers: 8,
  maxDeclaredTriggers: 24,
  maxNameLength: 80,
  maxTextLength: 80,
  maxAuthorLength: 80,
  maxCountries: 50,
  maxCommunities: 20,
  maxHidden: 12,
  maxDepth: 16,
  /** Un identifiant de couche ou de lens : la même borne que les clés d'apparence. */
  maxIdLength: APPEARANCE_LIMITS.maxKeyLength,
} as const;

/** Les mêmes listes que les cadres d'appel (`FRAME_SURFACES`, `FRAME_COSTS`) : un test les garde égales. */
export const LENS_SURFACES = ['capture', 'live'] as const;
export const LENS_COSTS = ['light', 'standard', 'rich'] as const;

/** Les cinq primitives de v1, et rien d'autre. */
export const LENS_LAYER_KINDS = ['lut', 'frame', 'sticker', 'text', 'particles'] as const;
export type LensLayerKind = (typeof LENS_LAYER_KINDS)[number];

export const LENS_ANCHOR_TYPES = ['screen', 'face'] as const;

/** Les points nommés du visage : chaque plateforme les fait correspondre à SES repères (76 points iOS, 478 web). */
export const LENS_FACE_POINTS = [
  'top-of-head', 'forehead', 'left-eyebrow', 'right-eyebrow', 'left-eye', 'right-eye', 'nose-tip',
  'mouth', 'chin', 'left-cheek', 'right-cheek', 'left-ear', 'right-ear',
] as const;

export const LENS_PARTICLE_PRESETS = ['sparkles', 'confetti', 'hearts', 'stars', 'snow', 'petals', 'bubbles', 'fireflies'] as const;
export const LENS_DENSITIES = ['low', 'mid', 'high'] as const;

export const LENS_TRIGGER_EVENTS = ['onTap', 'onSmile', 'onMouthOpen', 'onBrowRaise', 'onBlink', 'onTime', 'onSpeaking'] as const;
export const LENS_TRIGGER_ACTIONS = ['show', 'hide', 'burst', 'play', 'stop'] as const;

/** Les clés qu'aucun niveau d'un document v1 ne porte. */
export const LENS_FORBIDDEN_KEYS = ['shader', 'shaders', 'script', 'scripts', 'url', 'urls', 'href', 'endpoint', 'network', 'model3d', 'mesh', 'scene3d'] as const;
/** Les genres de couche qu'aucune lens v1 ne porte (ce ne sont pas des genres « inconnus » : ils sont REFUSÉS). */
export const LENS_FORBIDDEN_LAYER_KINDS = ['shader', 'script', 'model3d', 'mesh', 'scene3d', '3d', 'network'] as const;

/** Les schémas d'URL qui s'écrivent sans `://`. */
export const LENS_BARE_URL_SCHEMES = ['data:', 'javascript:', 'blob:', 'file:'] as const;

/** Les bornes numériques (incluses). Une seule table : le schéma zod ci-dessous et le Swift généré la lisent. */
export const LENS_RANGES = {
  fraction: [0, 1],
  offset: [-1, 1],
  stickerSize: [0.02, 2],
  rotation: [-180, 180],
  textSize: [0.02, 0.3],
  delay: [0, 60],
} as const;

/** Les motifs des identifiants, des fichiers et des codes. Le Swift généré les reprend (`^` → `\A`, `$` → `\z`). */
export const LENS_PATTERNS = {
  id: PACK_SLUG_PATTERN,
  asset: /^[0-9a-f]{16}\.(?:webp|png|json)$/,
  motif: /^[a-z-]+\.[a-z0-9-]+$/,
  color: /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/,
  country: /^[A-Z]{2}$/,
  community: /^[0-9a-f]{24}$/,
} as const;

// ── Les dates : le calendrier est vérifié À LA MAIN, des deux côtés (pas de `Date.parse`) ──

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const daysInMonth = (year: number, month: number): number => (month === 2 ? (isLeapYear(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31);

const isCalendarDay = (year: number, month: number, day: number): boolean => month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);

const isIsoDate = (value: string): boolean => {
  const match = ISO_DATE.exec(value);
  return match !== null && isCalendarDay(Number(match[1]), Number(match[2]), Number(match[3]));
};

const isIsoDateTime = (value: string): boolean => {
  const match = ISO_DATE_TIME.exec(value);
  return match !== null && isCalendarDay(Number(match[1]), Number(match[2]), Number(match[3])) && Number(match[4]) < 24 && Number(match[5]) < 60 && Number(match[6]) < 60;
};

// ── Les briques ─────────────────────────────────────────────────────────

const text = (max: number) => z.string().check(z.minLength(1), z.maxLength(max));
const between = ([min, max]: readonly [number, number]) => z.number().check(z.minimum(min), z.maximum(max));
const unit = between(LENS_RANGES.fraction);
const offset = between(LENS_RANGES.offset);
const slugSchema = z.string().check(z.regex(LENS_PATTERNS.id), z.maxLength(LENS_LIMITS.maxIdLength));

/** Un fichier DU pack, adressé par son contenu (16 hexadécimaux + extension) : jamais un chemin, jamais une URL. */
const assetSchema = z.string().check(z.regex(LENS_PATTERNS.asset));

const distinct = (items: readonly string[]): boolean => new Set(items).size === items.length;

/** Le texte d'une lens dans chacune des sept langues du Prisme ; le français est la langue de repli et il est obligatoire. */
const localizedText = z.object({
  fr: text(LENS_LIMITS.maxTextLength),
  en: z.optional(text(LENS_LIMITS.maxTextLength)),
  es: z.optional(text(LENS_LIMITS.maxTextLength)),
  pt: z.optional(text(LENS_LIMITS.maxTextLength)),
  it: z.optional(text(LENS_LIMITS.maxTextLength)),
  de: z.optional(text(LENS_LIMITS.maxTextLength)),
  ar: z.optional(text(LENS_LIMITS.maxTextLength)),
});

/** Le nom de la lens dans les langues où il est traduit (le français est le champ `name`). */
const localizedNames = z.object({
  en: z.optional(text(LENS_LIMITS.maxNameLength)),
  es: z.optional(text(LENS_LIMITS.maxNameLength)),
  pt: z.optional(text(LENS_LIMITS.maxNameLength)),
  it: z.optional(text(LENS_LIMITS.maxNameLength)),
  de: z.optional(text(LENS_LIMITS.maxNameLength)),
  ar: z.optional(text(LENS_LIMITS.maxNameLength)),
});

/** Où se pose une couche : un point de l'ÉCRAN (fractions) ou un point nommé du VISAGE, décalé en largeurs de visage. */
const anchorSchema = z.union([
  z.object({ type: z.literal('screen'), x: unit, y: unit }),
  z.object({ type: z.literal('face'), point: z.enum(LENS_FACE_POINTS), dx: z.optional(offset), dy: z.optional(offset) }),
]);

const lutLayer = z.object({ kind: z.literal('lut'), id: slugSchema, asset: assetSchema, intensity: z.optional(unit) });
const frameLayer = z.object({ kind: z.literal('frame'), id: slugSchema, motif: z.string().check(z.regex(LENS_PATTERNS.motif)), opacity: z.optional(unit) });
const stickerLayer = z.object({
  kind: z.literal('sticker'),
  id: slugSchema,
  asset: assetSchema,
  anchor: anchorSchema,
  size: between(LENS_RANGES.stickerSize),
  rotation: z.optional(between(LENS_RANGES.rotation)),
});
const textLayer = z.object({
  kind: z.literal('text'),
  id: slugSchema,
  text: localizedText,
  font: z.enum(GLORY_FRAME_FONTS),
  color: z.string().check(z.regex(LENS_PATTERNS.color)),
  size: between(LENS_RANGES.textSize),
  anchor: anchorSchema,
});
const particlesLayer = z.object({
  kind: z.literal('particles'),
  id: slugSchema,
  preset: z.enum(LENS_PARTICLE_PRESETS),
  density: z.enum(LENS_DENSITIES),
  anchor: z.optional(anchorSchema),
});

export const LensLayerSchema = z.discriminatedUnion('kind', [lutLayer, frameLayer, stickerLayer, textLayer, particlesLayer]);
export type LensLayer = z.infer<typeof LensLayerSchema>;

export const LensTriggerSchema = z.object({
  on: z.enum(LENS_TRIGGER_EVENTS),
  action: z.enum(LENS_TRIGGER_ACTIONS),
  /** L'identifiant de la couche visée ; un déclencheur vers une couche absente est ignoré. */
  target: slugSchema,
  delay: z.optional(between(LENS_RANGES.delay)),
});
export type LensTrigger = z.infer<typeof LensTriggerSchema>;

const fallbackTier = z.object({ hide: z.array(slugSchema).check(z.maxLength(LENS_LIMITS.maxHidden)) });
const fallbacksSchema = z.object({ reduced: z.optional(fallbackTier), minimal: z.optional(fallbackTier) });

const windowSchema = z
  .object({
    startsAt: z.string().check(z.refine(isIsoDateTime)),
    endsAt: z.string().check(z.refine(isIsoDateTime)),
    geo: z.optional(
      z.object({
        countries: z.array(z.string().check(z.regex(LENS_PATTERNS.country))).check(z.minLength(1), z.maxLength(LENS_LIMITS.maxCountries), z.refine(distinct)),
      }),
    ),
    communities: z.optional(z.array(z.string().check(z.regex(LENS_PATTERNS.community))).check(z.minLength(1), z.maxLength(LENS_LIMITS.maxCommunities), z.refine(distinct))),
  })
  .check(z.refine((window) => window.endsAt > window.startsAt));

const envelopeSchema = z.object({
  schema: z.literal(LENS_SCHEMA_VERSION),
  id: slugSchema,
  name: text(LENS_LIMITS.maxNameLength),
  names: z.optional(localizedNames),
  credits: z.object({ author: text(LENS_LIMITS.maxAuthorLength), createdAt: z.string().check(z.refine(isIsoDate)), updatedAt: z.optional(z.string().check(z.refine(isIsoDate))) }),
  surfaces: z.array(z.enum(LENS_SURFACES)).check(z.minLength(1), z.refine(distinct)),
  cost: z.enum(LENS_COSTS),
  window: windowSchema,
  layers: z.array(z.unknown()).check(z.minLength(1), z.maxLength(LENS_LIMITS.maxDeclaredLayers)),
  triggers: z.optional(z.array(z.unknown()).check(z.maxLength(LENS_LIMITS.maxDeclaredTriggers))),
  fallbacks: z.optional(fallbacksSchema),
});
type Envelope = z.infer<typeof envelopeSchema>;

/** Une lens lue : les couches et les déclencheurs sont ceux que ce client sait jouer. */
export type Lens = Omit<Envelope, 'layers' | 'triggers' | 'fallbacks'> & {
  readonly layers: readonly LensLayer[];
  readonly triggers: readonly LensTrigger[];
  readonly fallbacks?: Envelope['fallbacks'];
};

export type LensParseOutcome =
  | { readonly status: 'ok'; readonly lens: Lens; readonly ignoredLayers: number; readonly ignoredTriggers: number }
  | { readonly status: 'update-required'; readonly schema: number }
  | { readonly status: 'forbidden'; readonly reasons: readonly string[] }
  | { readonly status: 'invalid' };

const INVALID: LensParseOutcome = { status: 'invalid' };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);

const childrenOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : []);

const exceedsDepth = (value: unknown, levelsLeft: number): boolean => {
  if (!Array.isArray(value) && !isRecord(value)) return false;
  return levelsLeft <= 0 || childrenOf(value).some((child) => exceedsDepth(child, levelsLeft - 1));
};

const isAsciiWord = (char: string | undefined): boolean => char !== undefined && /[A-Za-z0-9_]/.test(char);

/** `data:` ne compte que s'il ouvre un mot : « metadata: » n'est pas une URL. */
const hasBareScheme = (value: string, scheme: string): boolean =>
  Array.from(value, (_, index) => index).some((index) => value.startsWith(scheme, index) && !isAsciiWord(value[index - 1]));

const containsUrl = (raw: string): boolean => {
  const value = raw.toLowerCase();
  return value.startsWith('//') || value.includes('://') || LENS_BARE_URL_SCHEMES.some((scheme) => hasBareScheme(value, scheme));
};

const forbiddenReasons = (value: unknown): readonly string[] => {
  if (typeof value === 'string') return containsUrl(value) ? ['url'] : [];
  if (Array.isArray(value)) return value.flatMap(forbiddenReasons);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...((LENS_FORBIDDEN_KEYS as readonly string[]).includes(key) ? [`key:${key}`] : []),
    ...forbiddenReasons(child),
  ]);
};

const forbiddenLayerReasons = (layers: unknown): readonly string[] =>
  (Array.isArray(layers) ? layers : []).flatMap((layer) =>
    isRecord(layer) && typeof layer.kind === 'string' && (LENS_FORBIDDEN_LAYER_KINDS as readonly string[]).includes(layer.kind) ? [`layer:${layer.kind}`] : [],
  );

const readable = <T>(schema: z.ZodMiniType<T>, items: readonly unknown[]): readonly T[] =>
  items.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });

const withoutHidden = (tier: { readonly hide: readonly string[] } | undefined, known: ReadonlySet<string>) =>
  tier === undefined ? undefined : { hide: tier.hide.filter((id) => known.has(id)) };

/**
 * Lit un document MeeshyLens. Pure : ne mute jamais son entrée, ne lève jamais.
 * `ok` porte la lens ET ce qui a été ignoré, pour que le client sache qu'il joue une version réduite.
 */
export const parseLens = (input: unknown): LensParseOutcome => {
  if (!isRecord(input) || exceedsDepth(input, LENS_LIMITS.maxDepth)) return INVALID;
  const { schema } = input;
  if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1) return INVALID;
  if (schema > LENS_SCHEMA_VERSION) return { status: 'update-required', schema };
  const reasons = [...new Set([...forbiddenReasons(input), ...forbiddenLayerReasons(input.layers)])].sort();
  if (reasons.length > 0) return { status: 'forbidden', reasons };
  const envelope = envelopeSchema.safeParse(input);
  if (!envelope.success) return INVALID;
  const { layers: declaredLayers, triggers: declaredTriggers, fallbacks, ...rest } = envelope.data;
  const layers = readable(LensLayerSchema, declaredLayers);
  const ids = layers.map((layer) => layer.id);
  if (layers.length > LENS_LIMITS.maxLayers || !distinct(ids)) return INVALID;
  const known: ReadonlySet<string> = new Set(ids);
  const triggers = readable(LensTriggerSchema, declaredTriggers ?? []).filter((trigger) => known.has(trigger.target));
  if (triggers.length > LENS_LIMITS.maxTriggers) return INVALID;
  const reduced = withoutHidden(fallbacks?.reduced, known);
  const minimal = withoutHidden(fallbacks?.minimal, known);
  const lens: Lens = {
    ...rest,
    layers,
    triggers,
    ...(fallbacks === undefined ? {} : { fallbacks: { ...(reduced === undefined ? {} : { reduced }), ...(minimal === undefined ? {} : { minimal }) } }),
  };
  return { status: 'ok', lens, ignoredLayers: declaredLayers.length - layers.length, ignoredTriggers: (declaredTriggers ?? []).length - triggers.length };
};

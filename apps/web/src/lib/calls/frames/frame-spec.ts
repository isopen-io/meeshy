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

export const SLOT_SHAPES = ['rect', 'round', 'circle', 'oval', 'arch', 'hex', 'diamond', 'heart', 'star', 'ticket', 'stamp', 'blob', 'torn', 'polaroid', 'frame-oval'] as const;
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
export const TITLE_SOURCES = ['group', 'names', 'brand', 'date', 'none', 'time', 'datetime', 'place', 'landmark', 'emotion'] as const;
export type TitleSource = (typeof TITLE_SOURCES)[number];
export const TEXT_EFFECTS = ['none', 'shadow', 'glow', 'outline'] as const;

/*
 * **L'EXTENSION DU FORMAT** (#9197, doc 06 § 3, étape 3.1) — les clés des frames en
 * direct et des packs. Toutes FACULTATIVES : un cadre qui ne les porte pas se lit et
 * se rend comme avant. Ce sont des listes fermées que les moteurs interprètent ;
 * aucune ne porte de code.
 */

/** La bibliothèque de looks Meeshy (spec 02 § 1.2) : le cadre choisit et règle, il n'écrit pas de shader. */
export const SLOT_LOOKS = ['instant-film', 'film-grain', 'oil-paint', 'scratch-film', 'halftone', 'vignette', 'bloom'] as const;
export const MAX_SLOT_LOOKS = 2;

/** `still` (défaut) ; `loop` et `onAppear` ne s'animent qu'en direct. */
export const ORNAMENT_MOTIONS = ['still', 'loop', 'onAppear'] as const;

/** Les formes d'un texte (spec 01 § 2), chacune réservée à SA source (`TEXT_FORMS_BY_SOURCE`). */
export const TEXT_FORMS = [
  'digital', 'digital-seconds', 'analog', 'words', 'moment',
  'short', 'long', 'day-month', 'calendar-tile', 'roman',
  'inline', 'stacked', 'stamp',
  'city', 'city-country', 'neighborhood', 'street', 'address', 'country-flag', 'coordinates', 'pin', 'map-silhouette',
  'name', 'line-art', 'badge', 'skyline',
  'emoji', 'word', 'color-aura', 'particles', 'sticker',
] as const;
export type TextForm = (typeof TEXT_FORMS)[number];

export const TEXT_FORMS_BY_SOURCE: Readonly<Record<TitleSource, readonly TextForm[]>> = {
  group: [],
  names: [],
  brand: [],
  date: ['short', 'long', 'day-month', 'calendar-tile', 'roman'],
  none: [],
  time: ['digital', 'digital-seconds', 'analog', 'words', 'moment'],
  datetime: ['inline', 'stacked', 'stamp'],
  place: ['city', 'city-country', 'neighborhood', 'street', 'address', 'country-flag', 'coordinates', 'pin', 'map-silhouette'],
  landmark: ['name', 'line-art', 'badge', 'skyline'],
  emotion: ['emoji', 'word', 'color-aura', 'particles', 'sticker'],
};

/** Les zones d'un élément libre : le pourtour de la zone des visages, jamais son centre. */
export const ELEMENT_PLACES = ['top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center-left', 'center-right'] as const;
export const MAX_ELEMENTS = 6;

/** Le filigrane des Imager (« Meeshy @pseudo » en quinconce), orientable (spec 04 § 5.3). */
export const WATERMARK_CONTENTS = ['brand', 'brand-handle'] as const;
export const WATERMARK_ORIENTATIONS = ['diagonal-up', 'diagonal-down', 'horizontal', 'vertical', 'cross'] as const;
/** Plafond d'opacité d'un filigrane posé sur la vidéo (spec 04 § 3). */
export const MAX_WATERMARK_OPACITY = 0.08;

export const FRAME_SURFACES = ['capture', 'live'] as const;
export type FrameSurface = (typeof FRAME_SURFACES)[number];
export const FRAME_COSTS = ['light', 'standard', 'rich'] as const;

/** Les couches d'une scène (spec 02 § 1.1), qui pointent vers les fichiers du pack. */
export const SCENE_LAYER_KINDS = ['image', 'lottie', 'sprite', 'video-loop', 'particles', 'light'] as const;
export const SCENE_DEPTHS = ['back', 'front', 'effects'] as const;
/** Plafonds de rendu d'une scène (spec 02 § 3.3). */
export const MAX_SCENE_LAYERS = 12;
export const MAX_SCENE_VIDEO_LOOPS = 2;
export const MAX_SCENE_LIGHTS = 2;
export const MAX_SCENE_PARTICLES = 150;

export const BEHAVIOR_TRIGGERS = ['onTap', 'onShake', 'onTilt', 'onSmile', 'onEmotion', 'onTime', 'onSpeaking', 'onCallEvent'] as const;
export type BehaviorTrigger = (typeof BEHAVIOR_TRIGGERS)[number];
export const BEHAVIOR_ACTIONS = ['burst', 'calm', 'tint', 'play', 'stop', 'show', 'hide', 'shake'] as const;
/** La palette d'émotions de base (spec 01 § 2.6) : un pack ajoute ses illustrations, pas ses émotions. */
export const FRAME_EMOTIONS = ['joy', 'love', 'pride', 'calm', 'surprise', 'nostalgia', 'party', 'gratitude'] as const;
export const DAY_MOMENTS = ['morning', 'day', 'evening', 'night'] as const;
export const CALL_EVENTS = ['start', 'end'] as const;
/** Ce que précise `when`, réservé à SON déclencheur : l'émotion, le moment du jour, l'événement d'appel. */
export const BEHAVIOR_CONDITIONS = ['joy', 'love', 'pride', 'calm', 'surprise', 'nostalgia', 'party', 'gratitude', 'morning', 'day', 'evening', 'night', 'start', 'end'] as const;
export type BehaviorCondition = (typeof BEHAVIOR_CONDITIONS)[number];

export const CONDITIONS_BY_TRIGGER: Readonly<Record<BehaviorTrigger, readonly BehaviorCondition[]>> = {
  onTap: [],
  onShake: [],
  onTilt: [],
  onSmile: [],
  onEmotion: FRAME_EMOTIONS,
  onTime: DAY_MOMENTS,
  onSpeaking: [],
  onCallEvent: CALL_EVENTS,
};
export const MAX_BEHAVIOR_SECONDS = 10;

const Hex = z.string().check(z.regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/));
const Fraction = z.number().check(z.minimum(0), z.maximum(1));
const Font = z.enum(FRAME_FONTS);
const Slug = z.string().check(z.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/));
const IsoDate = z.string().check(
  z.regex(/^\d{4}-\d{2}-\d{2}$/),
  z.refine((value) => !Number.isNaN(Date.parse(value))),
);
/** Un fichier DU pack : sous `assets/`, sans schéma d'URL ni remontée (`..`). */
const AssetPath = z.string().check(z.regex(/^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/));

const Layout = z.object({
  arrangement: z.enum(FRAME_ARRANGEMENTS),
  margin: Fraction,
  gap: Fraction,
  top: Fraction,
  bottom: Fraction,
});

const SlotLook = z.object({ id: z.enum(SLOT_LOOKS), amount: z.optional(Fraction), size: z.optional(Fraction) });

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
  look: z.optional(z.array(SlotLook).check(z.maxLength(MAX_SLOT_LOOKS))),
});

const Background = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('solid'), color: Hex }),
  z.object({ kind: z.literal('linear'), colors: z.array(Hex).check(z.minLength(2)), angle: z.number() }),
  z.object({ kind: z.literal('radial'), colors: z.array(Hex).check(z.minLength(2)) }),
  z.object({ kind: z.literal('accent') }),
]);

const Pattern = z.object({ kind: z.enum(FRAME_PATTERNS), color: Hex, opacity: Fraction });

const Border = z.object({ kind: z.enum(FRAME_BORDERS), color: Hex, width: Fraction, inset: Fraction });

const Ornament = z.object({
  kind: z.enum(FRAME_ORNAMENTS),
  color: Hex,
  density: z.enum(['low', 'mid', 'high']),
  layer: z.enum(['back', 'front']),
  motion: z.optional(z.enum(ORNAMENT_MOTIONS)),
});

const Watermark = z.object({
  content: z.enum(WATERMARK_CONTENTS),
  orientation: z.enum(WATERMARK_ORIENTATIONS),
  opacity: z.number().check(z.minimum(0), z.maximum(MAX_WATERMARK_OPACITY)),
});

/** `watermark` ne règle que le placement `watermark` : ailleurs, il ne voudrait rien dire. */
const Brand = z
  .object({ mark: z.enum(BRAND_MARKS), place: z.enum(BRAND_PLACES), color: Hex, size: z.enum(TEXT_SIZES), font: z.optional(Font), watermark: z.optional(Watermark) })
  .check(z.refine((brand) => brand.watermark === undefined || brand.place === 'watermark'));

const Names = z.object({ show: z.enum(NAME_SHOWS), style: z.enum(NAME_STYLES), font: Font, color: Hex, fill: z.optional(Hex) });

const formFitsSource = (text: { readonly source: TitleSource; readonly form?: TextForm | undefined }): boolean =>
  text.form === undefined || TEXT_FORMS_BY_SOURCE[text.source].includes(text.form);

const textFields = {
  source: z.enum(TITLE_SOURCES),
  form: z.optional(z.enum(TEXT_FORMS)),
  font: Font,
  color: Hex,
  size: z.enum(TEXT_SIZES),
  effect: z.optional(z.enum(TEXT_EFFECTS)),
  case: z.optional(z.enum(['upper', 'as-is'])),
};

const Title = z.object({ ...textFields, place: z.enum(['top', 'bottom']) }).check(z.refine(formFitsSource));

/** Un texte ou un pictogramme posé librement, au-delà du titre et du sous-titre. */
const Element = z.object({ ...textFields, place: z.enum(ELEMENT_PLACES) }).check(z.refine(formFitsSource));

const ASSET_KINDS: ReadonlySet<string> = new Set(['image', 'lottie', 'sprite', 'video-loop']);

const SceneLayer = z
  .object({
    id: Slug,
    kind: z.enum(SCENE_LAYER_KINDS),
    depth: z.enum(SCENE_DEPTHS),
    src: z.optional(AssetPath),
    preset: z.optional(z.enum(FRAME_ORNAMENTS)),
    color: z.optional(Hex),
    amount: z.optional(Fraction),
    max: z.optional(z.number().check(z.int(), z.minimum(1), z.maximum(MAX_SCENE_PARTICLES))),
  })
  .check(
    z.refine((layer) => !ASSET_KINDS.has(layer.kind) || layer.src !== undefined),
    z.refine((layer) => layer.kind !== 'particles' || layer.preset !== undefined),
    z.refine((layer) => layer.kind !== 'light' || layer.color !== undefined),
  );

type SceneLayerValue = z.infer<typeof SceneLayer>;

const countOf = (layers: readonly SceneLayerValue[], kind: SceneLayerValue['kind']): number => layers.filter((layer) => layer.kind === kind).length;

/** La scène tient les plafonds de rendu : 2 boucles vidéo, 2 lumières, 150 particules, des identifiants uniques. */
const Scene = z.array(SceneLayer).check(
  z.maxLength(MAX_SCENE_LAYERS),
  z.refine((layers) => new Set(layers.map((layer) => layer.id)).size === layers.length),
  z.refine((layers) => countOf(layers, 'video-loop') <= MAX_SCENE_VIDEO_LOOPS && countOf(layers, 'light') <= MAX_SCENE_LIGHTS),
  z.refine((layers) => layers.reduce((sum, layer) => sum + (layer.max ?? 0), 0) <= MAX_SCENE_PARTICLES),
);

const Behavior = z
  .object({
    trigger: z.enum(BEHAVIOR_TRIGGERS),
    when: z.optional(z.enum(BEHAVIOR_CONDITIONS)),
    target: z.optional(Slug),
    action: z.enum(BEHAVIOR_ACTIONS),
    duration: z.optional(z.number().check(z.positive(), z.maximum(MAX_BEHAVIOR_SECONDS))),
    color: z.optional(Hex),
  })
  .check(z.refine((behavior) => behavior.when === undefined || CONDITIONS_BY_TRIGGER[behavior.trigger].includes(behavior.when)));

/** Un palier de repli ne déclare que ses substitutions ; le reste (particules divisées, looks réduits) est la règle du moteur (spec 02 § 3.2). */
const FallbackTier = z.object({
  hide: z.optional(z.array(Slug)),
  still: z.optional(z.array(z.object({ layer: Slug, src: AssetPath }))),
});

const Fallbacks = z.object({ reduced: z.optional(FallbackTier), minimal: z.optional(FallbackTier) });

/** Qui a fait le cadre et quand — affiché au tap sur la signature, ou à l'appui long sur le cadre. */
const Credits = z.object({ author: z.string().check(z.minLength(1), z.maxLength(80)), createdAt: IsoDate, updatedAt: z.optional(IsoDate) });

const Surfaces = z.array(z.enum(FRAME_SURFACES)).check(
  z.minLength(1),
  z.refine((surfaces) => new Set(surfaces).size === surfaces.length),
);

/** L'apparence complète d'un cadre — ce qu'une variante surcharge, clé par clé. */
export const FrameLookSchema = z.object({
  layout: Layout,
  slot: Slot,
  background: Background,
  pattern: z.optional(Pattern),
  border: z.optional(Border),
  ornaments: z.array(Ornament),
  brand: z.optional(Brand),
  names: Names,
  title: Title,
  subtitle: z.optional(Title),
  elements: z.optional(z.array(Element).check(z.maxLength(MAX_ELEMENTS))),
  scene: z.optional(Scene),
  behaviors: z.optional(z.array(Behavior)),
  fallbacks: z.optional(Fallbacks),
});

export const FrameMotifSchema = z.object({
  id: z.string().check(z.regex(/^[a-z-]+\.[a-z0-9-]+$/)),
  mood: z.enum(FRAME_MOODS),
  name: z.string().check(z.minLength(1)),
  credits: z.optional(Credits),
  surfaces: z.optional(Surfaces),
  cost: z.optional(z.enum(FRAME_COSTS)),
  base: FrameLookSchema,
  variants: z.partialRecord(z.enum(FRAME_BUCKETS), z.partial(FrameLookSchema)),
});

export const FrameMoodFileSchema = z.object({ mood: z.enum(FRAME_MOODS), motifs: z.array(FrameMotifSchema) });

export type FrameLook = z.infer<typeof FrameLookSchema>;
export type FrameMotif = z.infer<typeof FrameMotifSchema>;
export type FrameMoodFile = z.infer<typeof FrameMoodFileSchema>;
export type FrameSlot = FrameLook['slot'];
export type FrameBackground = FrameLook['background'];
export type FrameBrand = NonNullable<FrameLook['brand']>;
export type FrameNames = FrameLook['names'];
export type FrameTitle = FrameLook['title'];
export type FrameElement = NonNullable<FrameLook['elements']>[number];
export type FrameOrnament = FrameLook['ornaments'][number];
export type FrameCredits = NonNullable<FrameMotif['credits']>;
export type FrameCost = NonNullable<FrameMotif['cost']>;

/** Un cadre : un motif servi à une tranche. `id` = `<ambiance>.<motif>.<tranche>`, stable. */
export type CaptureFrame = FrameLook & {
  readonly id: string;
  readonly motif: string;
  readonly mood: FrameMood;
  readonly name: string;
  readonly bucket: FrameBucket;
  readonly people: readonly [number, number];
  readonly credits?: FrameCredits;
  readonly surfaces?: readonly FrameSurface[];
  readonly cost?: FrameCost;
};

/** Où le cadre se propose : la capture seule, sauf s'il déclare aussi le direct. */
export const servedSurfaces = (frame: Pick<CaptureFrame, 'surfaces'>): readonly FrameSurface[] => frame.surfaces ?? ['capture'];

/**
 * LES PACKS DE STICKERS (#9141) — le format qu'un TIERS remplit pour proposer
 * des stickers à Meeshy, et que chaque utilisateur installe ou retire.
 *
 * Trois GENRES de sticker, et ce qui les distingue :
 * - `static` : une image fixe ;
 * - `cinematic` : une image ANIMÉE (GIF ou WebP animé) — le genre se vérifie
 *   dans les octets, jamais dans la déclaration ;
 * - `instant` : une image (fixe ou animée) portant une ou plusieurs ZONES DE
 *   TEXTE que l'expéditeur remplit au moment d'envoyer (un prénom, un lieu,
 *   un mot). Le texte ne DÉBORDE JAMAIS de sa zone, et c'est une garantie,
 *   pas une intention : `layoutStickerText` est l'unique mise en page des trois
 *   sites (validation, éditeur, rendu) ; la validation d'un pack PROUVE que le
 *   texte par défaut ET le plus long texte admis tiennent à la taille
 *   minimale ; au rendu, un texte que la métrique n'a pas su prévoir est
 *   tronqué avec « … », et la zone est en plus découpée.
 *
 * La métrique est CONSERVATRICE : elle ne connaît pas la police du lecteur,
 * elle majore donc la chasse de chaque caractère. Un texte qu'elle déclare
 * tenir tient dans toute police système courante.
 *
 * Mee, Meo et « Mee & Meo » sont les trois premiers packs : des packs
 * INTÉGRÉS, dessinés par le client (`BUILTIN_STICKER_PACKS`), qui s'installent
 * et se retirent exactement comme ceux des tiers.
 *
 * @see schema.prisma — `StickerPack`, `StickerPackItem`, `UserStickerPack`
 */
import * as z from 'zod/mini';
import {
  PACK_LIMITS,
  PACK_SLUG_PATTERN,
  PACK_STATUSES,
  isPackInstalled,
  isReservedPackSlug,
  type PackAssetRef,
  type PackLanguage,
  type PackNames,
  type PackRegistries,
  type PackStatus,
  type PackSummaryBase,
} from './content-pack.js';

export const STICKER_KINDS = ['static', 'cinematic', 'instant'] as const;
export type StickerKind = (typeof STICKER_KINDS)[number];

/** Les statuts d'une proposition — ceux du moteur des packs (`content-pack.ts`), sous leur nom historique. */
export const STICKER_PACK_STATUSES = PACK_STATUSES;
export type StickerPackStatus = PackStatus;

export const STICKER_TEXT_WEIGHTS = ['regular', 'bold', 'black'] as const;
export type StickerTextWeight = (typeof STICKER_TEXT_WEIGHTS)[number];

export const STICKER_TEXT_ALIGNS = ['start', 'center', 'end'] as const;
export type StickerTextAlign = (typeof STICKER_TEXT_ALIGNS)[number];

export const STICKER_PACK_LIMITS = {
  /** Le carré de référence des zones de texte, en pixels — celui du sticker gardé. */
  canvas: 512,
  minItems: 3,
  maxItems: 120,
  maxSlugLength: PACK_LIMITS.maxSlugLength,
  maxNameLength: PACK_LIMITS.maxNameLength,
  maxDescriptionLength: PACK_LIMITS.maxDescriptionLength,
  maxAuthorLength: PACK_LIMITS.maxAuthorLength,
  maxKeyLength: 32,
  maxTitleLength: 40,
  maxZones: 3,
  maxLines: 3,
  /** Plus petit qu'un 14 px sur 512, le texte ne se lit plus dans une bulle. */
  minFontSize: 14,
  maxFontSize: 96,
  maxTextLength: 60,
  /** Une zone trop étroite ne loge pas même un mot court. */
  minZoneEdge: 32,
  /** Les propositions en attente d'un même auteur. */
  maxPendingPerAuthor: PACK_LIMITS.maxPendingPerAuthor,
  maxReviewNoteLength: PACK_LIMITS.maxReviewNoteLength,
} as const;

/** Le slug devient l'adresse du pack et le préfixe de ses gabarits : `pack.<slug>.<clé>`. */
export const STICKER_PACK_SLUG_PATTERN = PACK_SLUG_PATTERN;
export const STICKER_ITEM_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
/** Les clés de zone deviennent les clés de `MessageSticker.slots` — même forme que la passerelle admet. */
export const STICKER_SLOT_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export type StickerTextBox = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type StickerTextZone = {
  /** La clé de la valeur dans `MessageSticker.slots`. */
  readonly slot: string;
  /** Ce que l'expéditeur lit au-dessus du champ (« Prénom », « Lieu »). */
  readonly label: string;
  readonly box: StickerTextBox;
  readonly defaultText: string;
  readonly maxLength: number;
  readonly maxLines: number;
  readonly minFontSize: number;
  readonly maxFontSize: number;
  readonly color: string;
  readonly weight: StickerTextWeight;
  readonly align: StickerTextAlign;
};

export type StickerPackItemManifest = {
  readonly key: string;
  readonly title: string;
  /** Le repli d'un lecteur qui n'affiche aucune image. */
  readonly emoji: string;
  readonly kind: StickerKind;
  /** Le nom du fichier joint à la proposition. */
  readonly asset: string;
  readonly zones?: readonly StickerTextZone[];
};

export type StickerPackManifest = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly items: readonly StickerPackItemManifest[];
};

const L = STICKER_PACK_LIMITS;
const text = (max: number) => z.string().check(z.trim(), z.minLength(1), z.maxLength(max));
const int = (min: number, max: number) => z.int().check(z.minimum(min), z.maximum(max));
const pattern = (regex: RegExp, max: number) => z.string().check(z.regex(regex), z.maxLength(max));

const zoneSchema = z.object({
  slot: pattern(STICKER_SLOT_PATTERN, 32),
  label: text(24),
  box: z.object({
    x: int(0, L.canvas),
    y: int(0, L.canvas),
    width: int(L.minZoneEdge, L.canvas),
    height: int(L.minZoneEdge, L.canvas),
  }),
  defaultText: text(L.maxTextLength),
  maxLength: int(1, L.maxTextLength),
  maxLines: z._default(int(1, L.maxLines), 1),
  minFontSize: z._default(int(L.minFontSize, L.maxFontSize), L.minFontSize),
  maxFontSize: z._default(int(L.minFontSize, L.maxFontSize), 48),
  color: z._default(z.string().check(z.regex(COLOR_PATTERN)), '#1c1941'),
  weight: z._default(z.enum(STICKER_TEXT_WEIGHTS), 'black'),
  align: z._default(z.enum(STICKER_TEXT_ALIGNS), 'center'),
});

const itemSchema = z.object({
  key: pattern(STICKER_ITEM_KEY_PATTERN, L.maxKeyLength),
  title: text(L.maxTitleLength),
  emoji: text(16),
  kind: z.enum(STICKER_KINDS),
  asset: text(120),
  zones: z.optional(z.array(zoneSchema).check(z.maxLength(L.maxZones))),
});

const manifestSchema = z.object({
  slug: pattern(STICKER_PACK_SLUG_PATTERN, L.maxSlugLength),
  name: text(L.maxNameLength),
  description: text(L.maxDescriptionLength),
  author: text(L.maxAuthorLength),
  items: z.array(itemSchema).check(z.minLength(L.minItems), z.maxLength(L.maxItems)),
});

/**
 * Ce qu'une proposition a de travers, nommé pour que l'éditeur le DISE à
 * l'endroit fautif. `path` suit le manifeste (`items.3.zones.0.box`).
 */
export type StickerPackProblemCode =
  | 'invalid'
  | 'reserved-slug'
  | 'duplicate-key'
  | 'duplicate-asset'
  | 'duplicate-slot'
  | 'zones-required'
  | 'zones-forbidden'
  | 'zone-outside'
  | 'zones-overlap'
  | 'font-range'
  | 'default-too-long'
  | 'default-overflows'
  | 'longest-overflows';

export type StickerPackProblem = { readonly path: string; readonly code: StickerPackProblemCode };

export type StickerPackValidation =
  | { readonly ok: true; readonly manifest: StickerPackManifest }
  | { readonly ok: false; readonly problems: readonly StickerPackProblem[] };

const overlaps = (a: StickerTextBox, b: StickerTextBox): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const duplicates = <T,>(values: readonly T[]): readonly number[] =>
  values.flatMap((value, index) => (values.indexOf(value) < index ? [index] : []));

/** Le texte le plus large qu'une zone peut recevoir : sa longueur maximale en « M », la lettre latine la plus large. */
export const longestStickerText = (zone: Pick<StickerTextZone, 'maxLength'>): string => 'M'.repeat(zone.maxLength);

function zoneProblems(zone: StickerTextZone, path: string): readonly StickerPackProblem[] {
  const { box } = zone;
  const problems: StickerPackProblem[] = [];
  if (box.x + box.width > L.canvas || box.y + box.height > L.canvas) problems.push({ path: `${path}.box`, code: 'zone-outside' });
  if (zone.minFontSize > zone.maxFontSize) problems.push({ path: `${path}.minFontSize`, code: 'font-range' });
  if (zone.defaultText.length > zone.maxLength) problems.push({ path: `${path}.defaultText`, code: 'default-too-long' });
  if (problems.length > 0) return problems;
  if (fitStickerText(zone.defaultText, zone) === null) problems.push({ path: `${path}.defaultText`, code: 'default-overflows' });
  if (fitStickerText(longestStickerText(zone), zone) === null) problems.push({ path: `${path}.maxLength`, code: 'longest-overflows' });
  return problems;
}

function itemProblems(item: StickerPackItemManifest, path: string): readonly StickerPackProblem[] {
  const zones = item.zones ?? [];
  if (item.kind !== 'instant') return zones.length > 0 ? [{ path: `${path}.zones`, code: 'zones-forbidden' }] : [];
  if (zones.length === 0) return [{ path: `${path}.zones`, code: 'zones-required' }];
  const slots = duplicates(zones.map((zone) => zone.slot)).map((i) => ({ path: `${path}.zones.${i}.slot`, code: 'duplicate-slot' as const }));
  const crossing = zones.flatMap((zone, i) =>
    zones.slice(0, i).some((other) => overlaps(zone.box, other.box)) ? [{ path: `${path}.zones.${i}.box`, code: 'zones-overlap' as const }] : [],
  );
  return [...slots, ...crossing, ...zones.flatMap((zone, i) => zoneProblems(zone, `${path}.zones.${i}`))];
}

/**
 * Valide un manifeste de pack — la MÊME fonction dans l'éditeur web (le tiers
 * voit ses erreurs avant d'envoyer) et dans la passerelle (qui ne se fie à
 * rien de ce que le client a vérifié).
 */
export function validateStickerPackManifest(input: unknown): StickerPackValidation {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), code: 'invalid' as const })) };
  }
  const manifest: StickerPackManifest = parsed.data;
  const problems: readonly StickerPackProblem[] = [
    ...(isReservedStickerPackSlug(manifest.slug) ? [{ path: 'slug', code: 'reserved-slug' as const }] : []),
    ...duplicates(manifest.items.map((item) => item.key)).map((i) => ({ path: `items.${i}.key`, code: 'duplicate-key' as const })),
    ...duplicates(manifest.items.map((item) => item.asset)).map((i) => ({ path: `items.${i}.asset`, code: 'duplicate-asset' as const })),
    ...manifest.items.flatMap((item, i) => itemProblems(item, `items.${i}`)),
  ];
  return problems.length > 0 ? { ok: false, problems } : { ok: true, manifest };
}

// ── La mise en page du texte d'un Instant ───────────────────────────────

/** Interligne, en multiple de la taille de police. */
export const STICKER_LINE_HEIGHT = 1.2;

const NARROW = new Set([...`il.,:;|!'’ı`]);
const WIDE = new Set([...'MWmw@%&']);
const WEIGHT_FACTOR: Readonly<Record<StickerTextWeight, number>> = { regular: 1, bold: 1.06, black: 1.1 };

/**
 * La chasse MAJORÉE d'un caractère, en fraction de la taille de police. Une
 * table volontairement pessimiste : idéogrammes et emojis comptent pour un
 * carré plein et plus, une capitale pour trois quarts.
 */
export function stickerGlyphAdvance(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (char === ' ') return 0.34;
  if (NARROW.has(char)) return 0.36;
  if (WIDE.has(char)) return 0.98;
  if (code >= 0x2e80) return 1.12;
  if (char >= 'A' && char <= 'Z') return 0.78;
  return 0.64;
}

export const stickerTextWidth = (value: string, fontSize: number, weight: StickerTextWeight = 'regular'): number =>
  [...value].reduce((sum, char) => sum + stickerGlyphAdvance(char), 0) * fontSize * WEIGHT_FACTOR[weight];

export type StickerTextLayout = {
  readonly fontSize: number;
  readonly lines: readonly string[];
  /** Vrai quand le texte a dû être raccourci pour tenir. */
  readonly truncated: boolean;
};

type Fit = Pick<StickerTextZone, 'box' | 'maxLines' | 'minFontSize' | 'maxFontSize' | 'weight'>;

/** Coupe un mot trop long pour la ligne en morceaux qui y tiennent. */
function splitWord(word: string, fits: (s: string) => boolean): readonly string[] {
  return [...word].reduce<string[]>((parts, char) => {
    const last = parts[parts.length - 1];
    if (last !== undefined && fits(last + char)) return [...parts.slice(0, -1), last + char];
    return [...parts, char];
  }, []);
}

/** Les lignes d'un texte à une taille donnée, mots entiers d'abord, coupés seulement s'ils ne tiennent sur aucune ligne. */
function wrap(value: string, fits: (s: string) => boolean): readonly string[] {
  const words = value.split(/\s+/).filter((word) => word !== '').flatMap((word) => (fits(word) ? [word] : splitWord(word, fits)));
  return words.reduce<string[]>((lines, word) => {
    const last = lines[lines.length - 1];
    if (last !== undefined && fits(`${last} ${word}`)) return [...lines.slice(0, -1), `${last} ${word}`];
    return [...lines, word];
  }, []);
}

const linesFor = (zone: Fit, fontSize: number): number =>
  Math.min(zone.maxLines, Math.floor(zone.box.height / (fontSize * STICKER_LINE_HEIGHT)));

/**
 * La plus GRANDE taille à laquelle le texte tient dans la zone — sur ses
 * lignes autorisées, en largeur et en hauteur. `null` : il ne tient pas même
 * à la taille minimale.
 */
export function fitStickerText(value: string, zone: Fit): StickerTextLayout | null {
  const trimmed = value.trim();
  const sizes = Array.from({ length: zone.maxFontSize - zone.minFontSize + 1 }, (_, i) => zone.maxFontSize - i);
  for (const fontSize of sizes) {
    const room = linesFor(zone, fontSize);
    if (room < 1) continue;
    const fits = (s: string) => stickerTextWidth(s, fontSize, zone.weight) <= zone.box.width;
    const lines = wrap(trimmed, fits);
    if (lines.length <= room && lines.every(fits)) return { fontSize, lines, truncated: false };
  }
  return null;
}

/**
 * La mise en page que le RENDU applique : celle de `fitStickerText`, et si le
 * texte ne tient pas (une écriture que la métrique n'a pas prévue, une valeur
 * forgée), le plus long début qui tienne à la taille minimale, suivi de « … ».
 * Elle tient TOUJOURS dans la zone.
 */
export function layoutStickerText(value: string, zone: Fit): StickerTextLayout {
  const fit = fitStickerText(value, zone);
  if (fit !== null) return fit;
  const chars = [...value.trim()];
  for (let length = chars.length - 1; length > 0; length -= 1) {
    const candidate = fitStickerText(`${chars.slice(0, length).join('').trimEnd()}…`, zone);
    if (candidate !== null) return { ...candidate, truncated: true };
  }
  return { fontSize: zone.minFontSize, lines: [], truncated: true };
}

// ── Ce que sert la passerelle ───────────────────────────────────────────

export type StickerPackItem = {
  readonly key: string;
  readonly title: string;
  readonly emoji: string;
  readonly kind: StickerKind;
  readonly mimeType: string;
  /** Chemin servi par `GET /attachments/file/*` — l'ancien chemin, gardé pour les clients publiés (#9223). */
  readonly fileUrl: string;
  /**
   * Le même fichier dans le magasin adressé, `GET /api/v1/pack-assets/<src>` (#10188, additif) :
   * public, immuable, ETag = empreinte. Absent ⇒ le client lit `fileUrl`.
   */
  readonly asset?: PackAssetRef;
  readonly width: number;
  readonly height: number;
  readonly zones: readonly StickerTextZone[];
};

/**
 * La projection `sticker` du résumé du moteur (`PackSummaryBase`), plus ses
 * genres — identique à l'octet à ce que servent les clients publiés.
 * `builtin` : dessiné par le client (Mee, Meo, Mee & Meo), `coverUrl` alors `null`.
 */
export type StickerPackSummary = PackSummaryBase & {
  readonly kinds: readonly StickerKind[];
  /** Le prix en Meeshes ; `null` ou absent = gratuit (additif, ignoré par les anciens clients). */
  readonly price?: number | null;
  /** Gratuit ⇒ `true` ; payant ⇒ une ligne de possession existe (additif). */
  readonly owned?: boolean;
  /**
   * Le nom et la description par langue de l'interface (#10189, additif) : la
   * vitrine unique les sert pour les intégrés ; un client les lit par
   * `stickerPackText`, qui retombe sur le catalogue partagé puis sur `name`.
   */
  readonly names?: PackNames;
  /** La couverture (le premier sticker) dans le magasin adressé (#10188, additif) ; absente ⇒ `coverUrl`. */
  readonly cover?: PackAssetRef;
};

export type StickerPackDetail = StickerPackSummary & {
  readonly items: readonly StickerPackItem[];
  /** Le mot du modérateur, servi au seul auteur. */
  readonly reviewNote?: string | null;
};

// ── Les packs intégrés ──────────────────────────────────────────────────

/** Le nom et la description d'un pack dans UNE langue. */
export type StickerPackText = { readonly name: string; readonly description: string };

/** Les sept langues de l'interface, toutes REQUISES pour un pack intégré : une langue absente ne compile pas (#10189). */
export type BuiltinStickerPackNames = Readonly<Record<PackLanguage, StickerPackText>>;

export type BuiltinStickerPack = {
  readonly slug: string;
  /** La projection FRANÇAISE de `names` — ce que le fil `/sticker-packs` a toujours servi à plat. */
  readonly name: string;
  readonly description: string;
  readonly names: BuiltinStickerPackNames;
  readonly kinds: readonly StickerKind[];
  /** Installé tant que l'utilisateur ne l'a pas retiré. */
  readonly installedByDefault: boolean;
};

/** `name` / `description` dérivent de `names.fr` : une seule table, jamais deux textes français à accorder. */
const builtinPack = (pack: Omit<BuiltinStickerPack, 'name' | 'description'>): BuiltinStickerPack => ({
  ...pack,
  name: pack.names.fr.name,
  description: pack.names.fr.description,
});

export const BUILTIN_STICKER_PACKS: readonly BuiltinStickerPack[] = [
  builtinPack({
    slug: 'mee',
    names: {
      fr: { name: 'Mee', description: 'Le colibri de Meeshy : ses humeurs, ses gestes et ses Instants qui écrivent ton message.' },
      en: { name: 'Mee', description: "Meeshy's hummingbird: its moods, gestures and Moments that write your message." },
      es: { name: 'Mee', description: 'El colibrí de Meeshy: sus estados de ánimo, gestos e Instantes que escriben tu mensaje.' },
      pt: { name: 'Mee', description: 'O beija-flor do Meeshy: seus humores, gestos e Instantes que escrevem a sua mensagem.' },
      de: { name: 'Mee', description: 'Der Kolibri von Meeshy: seine Launen, Gesten und Momente, die deine Nachricht schreiben.' },
      it: { name: 'Mee', description: 'Il colibrì di Meeshy: i suoi stati d’animo, i gesti e gli Istanti che scrivono il tuo messaggio.' },
      ar: { name: 'Mee', description: 'طائر الطنان في Meeshy: مزاجاته وإيماءاته ولحظاته التي تكتب رسالتك.' },
    },
    kinds: ['static', 'cinematic', 'instant'],
    installedByDefault: true,
  }),
  builtinPack({
    slug: 'meo',
    names: {
      fr: { name: 'Meo', description: 'Le complice de Mee, crête au vent : les mêmes envies de dire, avec son caractère.' },
      en: { name: 'Meo', description: "Mee's partner in crime, crest in the wind: the same urge to say it, with his own character." },
      es: { name: 'Meo', description: 'El cómplice de Mee, con la cresta al viento: las mismas ganas de decir, con su carácter.' },
      pt: { name: 'Meo', description: 'O cúmplice de Mee, de crista ao vento: a mesma vontade de dizer, com o seu caráter.' },
      de: { name: 'Meo', description: 'Mees Komplize, Kamm im Wind: dieselbe Lust, etwas zu sagen, mit eigenem Charakter.' },
      it: { name: 'Meo', description: 'Il complice di Mee, cresta al vento: la stessa voglia di dire, col suo carattere.' },
      ar: { name: 'Meo', description: 'رفيق Mee بعرفه المتطاير مع الريح: الرغبة نفسها في التعبير، بطابعه الخاص.' },
    },
    kinds: ['static', 'cinematic', 'instant'],
    installedByDefault: true,
  }),
  builtinPack({
    slug: 'mee-et-meo',
    names: {
      fr: { name: 'Mee & Meo', description: 'Les deux ensemble : câlins, chamailleries et fêtes à deux.' },
      en: { name: 'Mee & Meo', description: 'Both together: cuddles, squabbles and parties for two.' },
      es: { name: 'Mee & Meo', description: 'Los dos juntos: abrazos, peleítas y fiestas a dos.' },
      pt: { name: 'Mee & Meo', description: 'Os dois juntos: carinhos, brigas e festas a dois.' },
      de: { name: 'Mee & Meo', description: 'Beide zusammen: Kuscheln, Zankereien und Feste zu zweit.' },
      it: { name: 'Mee & Meo', description: 'Tutti e due insieme: coccole, battibecchi e feste in due.' },
      ar: { name: 'Mee & Meo', description: 'الاثنان معًا: عناق ومشاكسات واحتفالات لشخصين.' },
    },
    kinds: ['static', 'cinematic'],
    installedByDefault: true,
  }),
];

/** Les sept langues d'un pack intégré ; `null` pour tout autre slug. */
export const builtinStickerPackNames = (slug: string): BuiltinStickerPackNames | null =>
  BUILTIN_STICKER_PACKS.find((pack) => pack.slug === slug)?.names ?? null;

/**
 * Le texte d'un pack dans la langue de l'INTERFACE — la loi des clients
 * (#10189) : `names[langue]` servi avec le pack, sinon le catalogue des
 * intégrés (un ancien serveur sert un intégré à plat), sinon `name` /
 * `description` tels que l'auteur les a écrits. Seul un pack `builtin`
 * consulte le catalogue : un tiers ne peut pas prendre un slug intégré, mais
 * la loi ne s'en remet pas à cette réservation.
 */
export const stickerPackText = (
  pack: Pick<StickerPackSummary, 'slug' | 'name' | 'description' | 'builtin'> & { readonly names?: PackNames | undefined },
  language: PackLanguage,
): StickerPackText =>
  pack.names?.[language] ?? (pack.builtin ? builtinStickerPackNames(pack.slug)?.[language] : undefined) ?? { name: pack.name, description: pack.description };

export const STICKER_PACK_AUTHOR_MEESHY = 'Meeshy';

export const isBuiltinStickerPackSlug = (slug: string): boolean => BUILTIN_STICKER_PACKS.some((pack) => pack.slug === slug);

const STICKER_REGISTRIES: PackRegistries = { sticker: BUILTIN_STICKER_PACKS };

/** Un slug qu'un tiers ne peut pas prendre : celui d'un pack intégré ou d'une adresse de l'API — la règle du moteur, domaine `sticker`. */
export const isReservedStickerPackSlug = (slug: string): boolean => isReservedPackSlug('sticker', slug, STICKER_REGISTRIES);

/** Un pack est installé si l'utilisateur l'a installé ; sans choix de sa part, selon le défaut du pack — la règle du moteur, domaine `sticker`. */
export const isStickerPackInstalled = (slug: string, choice: { readonly installed: boolean } | undefined): boolean =>
  isPackInstalled('sticker', slug, choice, STICKER_REGISTRIES);

// ── Le gabarit d'un sticker de pack dans un message ─────────────────────

/** `pack.<slug>.<clé>` — tient dans les 64 caractères qu'admet `MessageSticker.templateId`. */
export const STICKER_PACK_TEMPLATE_PREFIX = 'pack.';

export const stickerPackTemplateId = (slug: string, key: string): string => `${STICKER_PACK_TEMPLATE_PREFIX}${slug}.${key}`;

export function parseStickerPackTemplateId(templateId: string | undefined): { readonly slug: string; readonly key: string } | null {
  if (templateId === undefined || !templateId.startsWith(STICKER_PACK_TEMPLATE_PREFIX)) return null;
  const [slug, key, ...rest] = templateId.slice(STICKER_PACK_TEMPLATE_PREFIX.length).split('.');
  if (slug === undefined || key === undefined || rest.length > 0) return null;
  return STICKER_PACK_SLUG_PATTERN.test(slug) && STICKER_ITEM_KEY_PATTERN.test(key) ? { slug, key } : null;
}

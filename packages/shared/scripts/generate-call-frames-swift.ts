/**
 * Régénère le catalogue Swift des cadres de capture d'appel (#8741) depuis
 * `packages/shared/design/call-capture-frames/<ambiance>.json`.
 *
 * Usage (une commande, sans argument), depuis `packages/shared` :
 *
 *   bun run generate:call-frames
 *   # ou, équivalent : bun scripts/generate-call-frames-swift.ts
 *
 * Le web importe les douze fichiers tels quels (`apps/web/src/lib/calls/frames/frame-catalogue.ts`) ;
 * iOS reçoit le MÊME catalogue déplié en littéraux Swift, un fichier par ambiance (le budget de
 * 1 200 lignes par source vaut aussi pour le code généré : `FileSizeBudgetGuardTests`). Le dépliage est celui du
 * web (`expandMotif` : la variante surcharge la base clé par clé), l'ordre aussi
 * (ambiance, puis ordre des fichiers). `__tests__/call-capture-frames-swift.test.ts`
 * exige que les fichiers committés soient égaux à `renderSwift()`, et qu'aucun fichier généré
 * périmé ne traîne : le Swift ne peut pas dériver du JSON en silence.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FRAME_MOODS = ['signature', 'distingue', 'elegant', 'jovial', 'deconnecte', 'corporate', 'fantastique', 'futuriste', 'glauque', 'hors-norme', 'morbide', 'feerique'] as const;
export const FRAME_BUCKETS = ['duo', 'comite', 'groupe', 'tablee'] as const;
export const FRAME_ARRANGEMENTS = ['split', 'diagonal', 'hero', 'grid', 'row', 'column', 'arch', 'orbit', 'scatter', 'tiers', 'mosaic', 'honeycomb', 'cascade'] as const;
export const SLOT_SHAPES = ['rect', 'round', 'circle', 'oval', 'arch', 'hex', 'diamond', 'heart', 'star', 'ticket', 'stamp', 'blob', 'torn', 'polaroid', 'frame-oval'] as const;
export const SLOT_TONES = ['color', 'mono', 'sepia', 'noir', 'warm', 'cool', 'faded', 'duotone'] as const;
export const SLOT_TILTS = ['none', 'gentle', 'wild'] as const;
export const FRAME_PATTERNS = ['dots', 'stripes', 'grid', 'checker', 'halftone', 'scanlines', 'grain', 'stars', 'confetti', 'sunburst', 'waves', 'circuit', 'damask', 'hearts'] as const;
export const FRAME_BORDERS = ['hairline', 'double', 'deco', 'baroque', 'filmstrip', 'ticket', 'perforated', 'neon', 'brackets', 'torn', 'mourning', 'vines', 'bulbs', 'polaroid'] as const;
export const FRAME_ORNAMENTS = [
  'sparkles', 'bokeh', 'confetti', 'balloons', 'stars', 'hearts', 'fireflies', 'petals', 'leaves', 'bubbles', 'snow', 'rays',
  'glitch', 'scanlines', 'grain', 'vignette', 'lightleak', 'crown', 'ribbon', 'tape', 'rec', 'crosshair', 'orbits', 'runes',
  'cobwebs', 'drips', 'lightning', 'notes', 'candles', 'moon', 'clouds', 'bats', 'skulls', 'roses',
] as const;
export const FRAME_FONTS = ['bold', 'neon', 'typewriter', 'handwriting', 'classic', 'calligraphy', 'cartoon', 'futuristic', 'fantasy', 'curve', 'tag', 'italic', 'retro', 'elegant', 'poster', 'bubble', 'note', 'brush'] as const;
export const BRAND_MARKS = ['logo', 'wordmark', 'both'] as const;
export const BRAND_PLACES = ['top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'watermark'] as const;
export const TEXT_SIZES = ['s', 'm', 'l'] as const;
export const NAME_SHOWS = ['none', 'name', 'handle', 'both'] as const;
export const NAME_STYLES = ['caption', 'plate', 'ribbon', 'badge', 'bubble', 'tag', 'list'] as const;
export const TITLE_SOURCES = ['group', 'names', 'brand', 'date', 'none', 'time', 'datetime', 'place', 'landmark', 'emotion'] as const;
export const TEXT_EFFECTS = ['none', 'shadow', 'glow', 'outline'] as const;
/* L'extension du format (#9197, doc 06 § 3) — les mêmes listes que `frame-spec.ts`, dans le même ordre. */
export const SLOT_LOOKS = ['instant-film', 'film-grain', 'oil-paint', 'scratch-film', 'halftone', 'vignette', 'bloom'] as const;
export const ORNAMENT_MOTIONS = ['still', 'loop', 'onAppear'] as const;
export const TEXT_FORMS = [
  'digital', 'digital-seconds', 'analog', 'words', 'moment',
  'short', 'long', 'day-month', 'calendar-tile', 'roman',
  'inline', 'stacked', 'stamp',
  'city', 'city-country', 'neighborhood', 'street', 'address', 'country-flag', 'coordinates', 'pin', 'map-silhouette',
  'name', 'line-art', 'badge', 'skyline',
  'emoji', 'word', 'color-aura', 'particles', 'sticker',
] as const;
export const ELEMENT_PLACES = ['top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center-left', 'center-right'] as const;
export const WATERMARK_CONTENTS = ['brand', 'brand-handle'] as const;
export const WATERMARK_ORIENTATIONS = ['diagonal-up', 'diagonal-down', 'horizontal', 'vertical', 'cross'] as const;
export const FRAME_SURFACES = ['capture', 'live'] as const;
export const FRAME_COSTS = ['light', 'standard', 'rich'] as const;
export const SCENE_LAYER_KINDS = ['image', 'lottie', 'sprite', 'video-loop', 'particles', 'light'] as const;
export const SCENE_DEPTHS = ['back', 'front', 'effects'] as const;
export const BEHAVIOR_TRIGGERS = ['onTap', 'onShake', 'onTilt', 'onSmile', 'onEmotion', 'onTime', 'onSpeaking', 'onCallEvent'] as const;
export const BEHAVIOR_ACTIONS = ['burst', 'calm', 'tint', 'play', 'stop', 'show', 'hide', 'shake'] as const;
export const BEHAVIOR_CONDITIONS = ['joy', 'love', 'pride', 'calm', 'surprise', 'nostalgia', 'party', 'gratitude', 'morning', 'day', 'evening', 'night', 'start', 'end'] as const;

/** Les formes admises par source (spec 01 § 2) : une forme hors de SA source fait échouer la génération, comme le schéma zod. */
const FORMS_BY_SOURCE: Readonly<Record<string, readonly string[]>> = {
  date: ['short', 'long', 'day-month', 'calendar-tile', 'roman'],
  time: ['digital', 'digital-seconds', 'analog', 'words', 'moment'],
  datetime: ['inline', 'stacked', 'stamp'],
  place: ['city', 'city-country', 'neighborhood', 'street', 'address', 'country-flag', 'coordinates', 'pin', 'map-silhouette'],
  landmark: ['name', 'line-art', 'badge', 'skyline'],
  emotion: ['emoji', 'word', 'color-aura', 'particles', 'sticker'],
};
const DENSITIES = ['low', 'mid', 'high'] as const;
const LAYERS = ['back', 'front'] as const;
const TITLE_PLACES = ['top', 'bottom'] as const;
const LETTER_CASES = ['upper', 'as-is'] as const;

export const OUTPUT_RELATIVE_DIR = 'apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated';

type Json = Readonly<Record<string, unknown>>;

class FrameSourceError extends Error {}

const fail = (path: string, what: string): never => {
  throw new FrameSourceError(`${path}: ${what}`);
};

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

const record = (value: unknown, path: string): Json => (isRecord(value) ? value : fail(path, 'objet attendu'));

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** `a-b-c` → `aBC` : le nom Swift d'une valeur d'énumération. */
export const swiftCase = (raw: string): string => raw.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());

const quote = (text: string): string => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

const member = (value: unknown, allowed: readonly string[], path: string): string =>
  typeof value === 'string' && allowed.includes(value) ? `.${swiftCase(value)}` : fail(path, `valeur hors vocabulaire ${JSON.stringify(value)}`);

/** Une énumération dans un paramètre OPTIONNEL : qualifiée, pour que `.none` ne se lise jamais `Optional.none`. */
const qualified = (value: unknown, allowed: readonly string[], typeName: string, path: string): string => `${typeName}${member(value, allowed, path)}`;

const hex = (value: unknown, path: string): string => (typeof value === 'string' && HEX.test(value) ? quote(value) : fail(path, `couleur invalide ${JSON.stringify(value)}`));

const numberLiteral = (value: unknown, path: string): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(path, 'nombre attendu');
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
};

const fraction = (value: unknown, path: string): string =>
  typeof value === 'number' && value >= 0 && value <= 1 ? numberLiteral(value, path) : fail(path, `fraction attendue ${JSON.stringify(value)}`);

const bool = (value: unknown, path: string): string => {
  if (value === undefined) return 'false';
  return typeof value === 'boolean' ? String(value) : fail(path, 'booléen attendu');
};

const optional = (value: unknown, render: (present: unknown) => string): string => (value === undefined ? 'nil' : render(value));

/*
 * L'extension du format (#9197) : une clé ajoutée ne s'écrit QUE si le cadre la déclare, en fin
 * d'initialiseur (les initialiseurs Swift lui donnent une valeur par défaut). Un cadre qui ne la
 * porte pas produit donc exactement le littéral d'avant — c'est ce qui garde le catalogue actuel
 * octet pour octet.
 */

/** `[]` si la clé est absente, sinon le champ rendu — à répandre dans une liste de champs. */
const present = (value: unknown, render: (value: unknown) => string): readonly string[] => (value === undefined ? [] : [render(value)]);

const items = (value: unknown, path: string, max = Number.POSITIVE_INFINITY): readonly unknown[] => {
  if (!Array.isArray(value)) return fail(path, 'liste attendue');
  return value.length <= max ? value : fail(path, `${max} au plus`);
};

const listLiteral = (value: unknown, path: string, render: (item: unknown, path: string) => string, max?: number): string =>
  `[${items(value, path, max).map((item, index) => render(item, `${path}[${index}]`)).join(', ')}]`;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_PATH = /^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const matching = (pattern: RegExp, what: string) => (value: unknown, path: string): string =>
  typeof value === 'string' && pattern.test(value) ? quote(value) : fail(path, `${what} attendu ${JSON.stringify(value)}`);

const slug = matching(SLUG, 'identifiant');
const assetPath = matching(ASSET_PATH, 'fichier du pack (assets/…)');
const isoDate = matching(ISO_DATE, 'date AAAA-MM-JJ');

const slotLooks = (value: unknown, path: string): string =>
  listLiteral(value, path, (item, at) => {
    const it = record(item, at);
    return `CallFrameSlotLook(id: ${member(it.id, SLOT_LOOKS, `${at}.id`)}, amount: ${optional(it.amount, (amount) => fraction(amount, `${at}.amount`))}, size: ${optional(it.size, (size) => fraction(size, `${at}.size`))})`;
  }, 2);

const watermark = (value: unknown, path: string): string => {
  const it = record(value, path);
  const opacity = typeof it.opacity === 'number' && it.opacity >= 0 && it.opacity <= 0.08 ? numberLiteral(it.opacity, `${path}.opacity`) : fail(`${path}.opacity`, 'opacité de 0 à 0,08 attendue');
  return `CallFrameWatermark(content: ${member(it.content, WATERMARK_CONTENTS, `${path}.content`)}, orientation: ${member(it.orientation, WATERMARK_ORIENTATIONS, `${path}.orientation`)}, opacity: ${opacity})`;
};

/** La forme d'un texte, réservée à SA source. */
const textForm = (form: unknown, source: unknown, path: string): string => {
  const allowed = typeof source === 'string' ? (FORMS_BY_SOURCE[source] ?? []) : [];
  return allowed.includes(String(form)) ? qualified(form, TEXT_FORMS, 'CallFrameTextForm', path) : fail(path, `forme ${JSON.stringify(form)} hors de la source ${JSON.stringify(source)}`);
};

const element = (value: unknown, path: string): string => {
  const it = record(value, path);
  const fields = [
    `source: ${member(it.source, TITLE_SOURCES, `${path}.source`)}`,
    `form: ${optional(it.form, (form) => textForm(form, it.source, `${path}.form`))}`,
    `place: ${member(it.place, ELEMENT_PLACES, `${path}.place`)}`,
    `font: ${member(it.font, FRAME_FONTS, `${path}.font`)}`,
    `color: ${hex(it.color, `${path}.color`)}`,
    `size: ${member(it.size, TEXT_SIZES, `${path}.size`)}`,
    `effect: ${optional(it.effect, (effect) => qualified(effect, TEXT_EFFECTS, 'CallFrameTextEffect', `${path}.effect`))}`,
    `letterCase: ${optional(it.case, (letterCase) => qualified(letterCase, LETTER_CASES, 'CallFrameLetterCase', `${path}.case`))}`,
  ];
  return `CallFrameElement(${fields.join(', ')})`;
};

const particleCount = (value: unknown, path: string): string =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 150 ? String(value) : fail(path, 'entier de 1 à 150 attendu');

const sceneLayer = (value: unknown, path: string): string => {
  const it = record(value, path);
  const fields = [
    `id: ${slug(it.id, `${path}.id`)}`,
    `kind: ${member(it.kind, SCENE_LAYER_KINDS, `${path}.kind`)}`,
    `depth: ${member(it.depth, SCENE_DEPTHS, `${path}.depth`)}`,
    `src: ${optional(it.src, (src) => assetPath(src, `${path}.src`))}`,
    `preset: ${optional(it.preset, (preset) => qualified(preset, FRAME_ORNAMENTS, 'CallFrameOrnamentKind', `${path}.preset`))}`,
    `color: ${optional(it.color, (color) => hex(color, `${path}.color`))}`,
    `amount: ${optional(it.amount, (amount) => fraction(amount, `${path}.amount`))}`,
    `maxParticles: ${optional(it.max, (max) => particleCount(max, `${path}.max`))}`,
  ];
  return `CallFrameSceneLayer(${fields.join(', ')})`;
};

const seconds = (value: unknown, path: string): string =>
  typeof value === 'number' && value > 0 && value <= 10 ? numberLiteral(value, path) : fail(path, 'durée de 0 à 10 s attendue');

const behavior = (value: unknown, path: string): string => {
  const it = record(value, path);
  const fields = [
    `trigger: ${member(it.trigger, BEHAVIOR_TRIGGERS, `${path}.trigger`)}`,
    `when: ${optional(it.when, (when) => qualified(when, BEHAVIOR_CONDITIONS, 'CallFrameBehaviorCondition', `${path}.when`))}`,
    `target: ${optional(it.target, (target) => slug(target, `${path}.target`))}`,
    `action: ${member(it.action, BEHAVIOR_ACTIONS, `${path}.action`)}`,
    `duration: ${optional(it.duration, (duration) => seconds(duration, `${path}.duration`))}`,
    `color: ${optional(it.color, (color) => hex(color, `${path}.color`))}`,
  ];
  return `CallFrameBehavior(${fields.join(', ')})`;
};

const fallbackTier = (value: unknown, path: string): string => {
  const it = record(value, path);
  const still = (item: unknown, at: string): string => {
    const entry = record(item, at);
    return `CallFrameFallbackStill(layer: ${slug(entry.layer, `${at}.layer`)}, src: ${assetPath(entry.src, `${at}.src`)})`;
  };
  return `CallFrameFallbackTier(hide: ${it.hide === undefined ? '[]' : listLiteral(it.hide, `${path}.hide`, slug)}, still: ${it.still === undefined ? '[]' : listLiteral(it.still, `${path}.still`, still)})`;
};

const fallbacks = (value: unknown, path: string): string => {
  const it = record(value, path);
  return `CallFrameFallbacks(reduced: ${optional(it.reduced, (tier) => fallbackTier(tier, `${path}.reduced`))}, minimal: ${optional(it.minimal, (tier) => fallbackTier(tier, `${path}.minimal`))})`;
};

const credits = (value: unknown, path: string): string => {
  const it = record(value, path);
  const author = typeof it.author === 'string' && it.author.length > 0 && it.author.length <= 80 ? quote(it.author) : fail(`${path}.author`, 'auteur attendu');
  return `CallFrameCredits(author: ${author}, createdAt: ${isoDate(it.createdAt, `${path}.createdAt`)}, updatedAt: ${optional(it.updatedAt, (date) => isoDate(date, `${path}.updatedAt`))})`;
};

const surfaces = (value: unknown, path: string): string => {
  const list = items(value, path);
  if (list.length === 0 || new Set(list).size !== list.length) return fail(path, 'surfaces distinctes, une au moins');
  return `[${list.map((surface, index) => member(surface, FRAME_SURFACES, `${path}[${index}]`)).join(', ')}]`;
};

const layout = (value: unknown, path: string): string => {
  const it = record(value, path);
  return `CallFrameLayout(arrangement: ${member(it.arrangement, FRAME_ARRANGEMENTS, `${path}.arrangement`)}, margin: ${fraction(it.margin, `${path}.margin`)}, gap: ${fraction(it.gap, `${path}.gap`)}, top: ${fraction(it.top, `${path}.top`)}, bottom: ${fraction(it.bottom, `${path}.bottom`)})`;
};

const stroke = (value: unknown, path: string): string => {
  const it = record(value, path);
  return `CallFrameStroke(color: ${hex(it.color, `${path}.color`)}, width: ${fraction(it.width, `${path}.width`)})`;
};

const card = (value: unknown, path: string): string => {
  const it = record(value, path);
  return `CallFrameCard(color: ${hex(it.color, `${path}.color`)}, pad: ${fraction(it.pad, `${path}.pad`)}, foot: ${fraction(it.foot, `${path}.foot`)})`;
};

const duotone = (value: unknown, path: string): string => {
  if (!Array.isArray(value) || value.length !== 2) return fail(path, 'paire de couleurs attendue');
  return `CallFrameDuotone(shadow: ${hex(value[0], `${path}[0]`)}, light: ${hex(value[1], `${path}[1]`)})`;
};

const slot = (value: unknown, path: string): string => {
  const it = record(value, path);
  const fields = [
    `shape: ${member(it.shape, SLOT_SHAPES, `${path}.shape`)}`,
    `radius: ${optional(it.radius, (radius) => fraction(radius, `${path}.radius`))}`,
    `stroke: ${optional(it.stroke, (present) => stroke(present, `${path}.stroke`))}`,
    `double: ${bool(it.double, `${path}.double`)}`,
    `glow: ${optional(it.glow, (glow) => hex(glow, `${path}.glow`))}`,
    `shadow: ${bool(it.shadow, `${path}.shadow`)}`,
    `card: ${optional(it.card, (present) => card(present, `${path}.card`))}`,
    `tilt: ${member(it.tilt, SLOT_TILTS, `${path}.tilt`)}`,
    `tone: ${member(it.tone, SLOT_TONES, `${path}.tone`)}`,
    `duotone: ${optional(it.duotone, (present) => duotone(present, `${path}.duotone`))}`,
    ...present(it.look, (looks) => `look: ${slotLooks(looks, `${path}.look`)}`),
  ];
  return `CallFrameSlotStyle(${fields.join(', ')})`;
};

const colors = (value: unknown, path: string): string => {
  if (!Array.isArray(value) || value.length < 2) return fail(path, 'au moins deux couleurs attendues');
  return `[${value.map((color, index) => hex(color, `${path}[${index}]`)).join(', ')}]`;
};

const background = (value: unknown, path: string): string => {
  const it = record(value, path);
  switch (it.kind) {
    case 'solid':
      return `.solid(color: ${hex(it.color, `${path}.color`)})`;
    case 'linear':
      return `.linear(colors: ${colors(it.colors, `${path}.colors`)}, angle: ${numberLiteral(it.angle, `${path}.angle`)})`;
    case 'radial':
      return `.radial(colors: ${colors(it.colors, `${path}.colors`)})`;
    case 'accent':
      return '.accent';
    default:
      return fail(path, `fond inconnu ${JSON.stringify(it.kind)}`);
  }
};

const pattern = (value: unknown, path: string): string => {
  const it = record(value, path);
  return `CallFramePattern(kind: ${member(it.kind, FRAME_PATTERNS, `${path}.kind`)}, color: ${hex(it.color, `${path}.color`)}, opacity: ${fraction(it.opacity, `${path}.opacity`)})`;
};

const border = (value: unknown, path: string): string => {
  const it = record(value, path);
  return `CallFrameBorder(kind: ${member(it.kind, FRAME_BORDERS, `${path}.kind`)}, color: ${hex(it.color, `${path}.color`)}, width: ${fraction(it.width, `${path}.width`)}, inset: ${fraction(it.inset, `${path}.inset`)})`;
};

const ornament = (value: unknown, path: string): string => {
  const it = record(value, path);
  const fields = [
    `kind: ${member(it.kind, FRAME_ORNAMENTS, `${path}.kind`)}`,
    `color: ${hex(it.color, `${path}.color`)}`,
    `density: ${member(it.density, DENSITIES, `${path}.density`)}`,
    `layer: ${member(it.layer, LAYERS, `${path}.layer`)}`,
    ...present(it.motion, (motion) => `motion: ${member(motion, ORNAMENT_MOTIONS, `${path}.motion`)}`),
  ];
  return `CallFrameOrnament(${fields.join(', ')})`;
};

const ornaments = (value: unknown, path: string): string => {
  if (!Array.isArray(value)) return fail(path, 'liste attendue');
  return value.length === 0 ? '[]' : `[\n${value.map((item, index) => `                    ${ornament(item, `${path}[${index}]`)}`).join(',\n')}\n                ]`;
};

const brand = (value: unknown, path: string): string => {
  const it = record(value, path);
  if (it.watermark !== undefined && it.place !== 'watermark') return fail(`${path}.watermark`, 'réservé au placement « watermark »');
  const fields = [
    `mark: ${member(it.mark, BRAND_MARKS, `${path}.mark`)}`,
    `place: ${member(it.place, BRAND_PLACES, `${path}.place`)}`,
    `color: ${hex(it.color, `${path}.color`)}`,
    `size: ${member(it.size, TEXT_SIZES, `${path}.size`)}`,
    `font: ${optional(it.font, (font) => qualified(font, FRAME_FONTS, 'StoryTextStyle', `${path}.font`))}`,
    ...present(it.watermark, (value) => `watermark: ${watermark(value, `${path}.watermark`)}`),
  ];
  return `CallFrameBrand(${fields.join(', ')})`;
};

const names = (value: unknown, path: string): string => {
  const it = record(value, path);
  return `CallFrameNames(show: ${member(it.show, NAME_SHOWS, `${path}.show`)}, style: ${member(it.style, NAME_STYLES, `${path}.style`)}, font: ${member(it.font, FRAME_FONTS, `${path}.font`)}, color: ${hex(it.color, `${path}.color`)}, fill: ${optional(it.fill, (fill) => hex(fill, `${path}.fill`))})`;
};

const title = (value: unknown, path: string): string => {
  const it = record(value, path);
  const fields = [
    `source: ${member(it.source, TITLE_SOURCES, `${path}.source`)}`,
    `font: ${member(it.font, FRAME_FONTS, `${path}.font`)}`,
    `color: ${hex(it.color, `${path}.color`)}`,
    `place: ${member(it.place, TITLE_PLACES, `${path}.place`)}`,
    `size: ${member(it.size, TEXT_SIZES, `${path}.size`)}`,
    `effect: ${optional(it.effect, (effect) => qualified(effect, TEXT_EFFECTS, 'CallFrameTextEffect', `${path}.effect`))}`,
    `letterCase: ${optional(it.case, (letterCase) => qualified(letterCase, LETTER_CASES, 'CallFrameLetterCase', `${path}.case`))}`,
    ...present(it.form, (form) => `form: ${textForm(form, it.source, `${path}.form`)}`),
  ];
  return `CallFrameTitle(${fields.join(', ')})`;
};

const LOOK_KEYS = ['layout', 'slot', 'background', 'pattern', 'border', 'ornaments', 'brand', 'names', 'title', 'subtitle', 'elements', 'scene', 'behaviors', 'fallbacks'] as const;

/** Les clés du MOTIF (doc 06 § 3) : elles valent pour toutes ses tranches, aucune variante ne les surcharge. */
const MOTIF_KEYS = ['credits', 'surfaces', 'cost'] as const;

const look = (value: Json, path: string): string => {
  const required = ['layout', 'slot', 'background', 'ornaments', 'names', 'title'];
  required.filter((key) => value[key] === undefined).forEach((key) => fail(path, `clé manquante « ${key} »`));
  const lines = [
    `layout: ${layout(value.layout, `${path}.layout`)}`,
    `slot: ${slot(value.slot, `${path}.slot`)}`,
    `background: ${background(value.background, `${path}.background`)}`,
    `pattern: ${optional(value.pattern, (present) => pattern(present, `${path}.pattern`))}`,
    `border: ${optional(value.border, (present) => border(present, `${path}.border`))}`,
    `ornaments: ${ornaments(value.ornaments, `${path}.ornaments`)}`,
    ...present(value.brand, (declared) => `brand: ${brand(declared, `${path}.brand`)}`),
    `names: ${names(value.names, `${path}.names`)}`,
    `title: ${title(value.title, `${path}.title`)}`,
    `subtitle: ${optional(value.subtitle, (declared) => title(declared, `${path}.subtitle`))}`,
    ...present(value.elements, (declared) => `elements: ${listLiteral(declared, `${path}.elements`, element, 6)}`),
    ...present(value.scene, (declared) => `scene: ${listLiteral(declared, `${path}.scene`, sceneLayer, 12)}`),
    ...present(value.behaviors, (declared) => `behaviors: ${listLiteral(declared, `${path}.behaviors`, behavior)}`),
    ...present(value.fallbacks, (declared) => `fallbacks: ${fallbacks(declared, `${path}.fallbacks`)}`),
  ];
  return `CallFrameLook(\n${lines.map((line) => `                ${line}`).join(',\n')}\n            )`;
};

/** Un cadre déplié : ce que le web obtient par `expandMotif`, clé par clé. */
export type ExpandedFrame = {
  readonly id: string;
  readonly motif: string;
  readonly mood: string;
  readonly name: string;
  readonly bucket: string;
  readonly look: Json;
  /** `credits`, `surfaces`, `cost` — seulement ceux que le motif déclare. */
  readonly motifKeys: Json;
};

const MOTIF_ID = /^[a-z-]+\.[a-z0-9-]+$/;

/** La variante surcharge la base clé par clé (`{ ...base, ...variant }`), une tranche à la fois, dans l'ordre des tranches. */
export function expandMotif(motif: Json, path: string): readonly ExpandedFrame[] {
  const id = typeof motif.id === 'string' && MOTIF_ID.test(motif.id) ? motif.id : fail(path, `identifiant de motif invalide ${JSON.stringify(motif.id)}`);
  const name = typeof motif.name === 'string' && motif.name.length > 0 ? motif.name : fail(path, 'nom de motif vide');
  const mood = typeof motif.mood === 'string' ? motif.mood : fail(path, 'ambiance absente');
  const base = record(motif.base, `${path}.base`);
  const variants = record(motif.variants, `${path}.variants`);
  const motifKeys: Json = Object.fromEntries(MOTIF_KEYS.filter((key) => motif[key] !== undefined).map((key) => [key, motif[key]]));
  Object.keys(variants)
    .filter((key) => !(FRAME_BUCKETS as readonly string[]).includes(key))
    .forEach((key) => fail(`${path}.variants`, `tranche inconnue « ${key} »`));
  return FRAME_BUCKETS.flatMap((bucket) => {
    const variant = variants[bucket];
    if (variant === undefined) return [];
    const merged: Json = { ...base, ...record(variant, `${path}.variants.${bucket}`) };
    Object.keys(merged)
      .filter((key) => !(LOOK_KEYS as readonly string[]).includes(key))
      .forEach((key) => fail(`${path}.${bucket}`, `clé inconnue « ${key} »`));
    return [{ id: `${id}.${bucket}`, motif: id, mood, name, bucket, look: merged, motifKeys }];
  });
}

/** Les cadres des douze fichiers, dans l'ordre du catalogue web : ambiance, puis ordre des fichiers. */
export function expandFiles(files: readonly unknown[]): readonly ExpandedFrame[] {
  const frames = files.flatMap((file, index) => {
    const path = `fichier #${index}`;
    const it = record(file, path);
    const mood = typeof it.mood === 'string' && (FRAME_MOODS as readonly string[]).includes(it.mood) ? it.mood : fail(path, `ambiance inconnue ${JSON.stringify(it.mood)}`);
    if (!Array.isArray(it.motifs)) return fail(`${mood}.json`, 'liste de motifs attendue');
    return it.motifs
      .map((motif, position) => record(motif, `${mood}.json#${position}`))
      .filter((motif) => motif.mood === mood)
      .flatMap((motif, position) => expandMotif(motif, `${mood}.json#${position}`));
  });
  const rank = (mood: string): number => (FRAME_MOODS as readonly string[]).indexOf(mood);
  return [...frames].sort((a, b) => rank(a.mood) - rank(b.mood));
}

const frameLiteral = (frame: ExpandedFrame): string => {
  const fields = [
    `id: ${quote(frame.id)}`,
    `motif: ${quote(frame.motif)}`,
    `mood: ${member(frame.mood, FRAME_MOODS, frame.id)}`,
    `name: ${quote(frame.name)}`,
    `bucket: ${member(frame.bucket, FRAME_BUCKETS, frame.id)}`,
    `look: ${look(frame.look, frame.id)}`,
    ...present(frame.motifKeys.credits, (declared) => `credits: ${credits(declared, `${frame.id}.credits`)}`),
    ...present(frame.motifKeys.surfaces, (declared) => `surfaces: ${surfaces(declared, `${frame.id}.surfaces`)}`),
    ...present(frame.motifKeys.cost, (declared) => `cost: ${qualified(declared, FRAME_COSTS, 'CallFrameCost', `${frame.id}.cost`)}`),
  ];
  return ['        CallFrameDesign(', fields.map((field) => `            ${field}`).join(',\n'), '        )'].join('\n');
};

const HEADER = [
  '// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames',
  '// Régénérer : `cd packages/shared && bun run generate:call-frames`.',
  '// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.',
  '',
].join('\n');

/** `hors-norme` → `HorsNorme` : le suffixe du fichier d'une ambiance. */
export const swiftTypeCase = (raw: string): string => {
  const camel = swiftCase(raw);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
};

export const INDEX_FILE = 'CallFrameCatalogue+Generated.swift';

export const moodFileName = (mood: string): string => `CallFrameCatalogue+${swiftTypeCase(mood)}.swift`;

/** Un fichier Swift généré : son nom (dans `OUTPUT_RELATIVE_DIR`) et son texte. */
export type GeneratedSwiftFile = { readonly name: string; readonly content: string };

const property = (mood: string): string => `${swiftCase(mood)}Frames`;

const moodFile = (mood: string, frames: readonly ExpandedFrame[]): GeneratedSwiftFile => {
  const body = frames.length === 0 ? '[]' : `[\n${frames.map(frameLiteral).join(',\n')}\n    ]`;
  return {
    name: moodFileName(mood),
    content: [
      HEADER,
      'import MeeshySDK',
      '',
      'nonisolated extension CallFrameCatalogue {',
      `    static let ${property(mood)}: [CallFrameDesign] = ${body}`,
      '}',
      '',
    ].join('\n'),
  };
};

const indexFile = (): GeneratedSwiftFile => ({
  name: INDEX_FILE,
  content: [
    HEADER,
    '/// Les douze ambiances, dans l\'ordre du catalogue web (`FRAME_MOODS`) — un fichier par ambiance,',
    '/// chacun sous le budget de taille des sources.',
    'nonisolated extension CallFrameCatalogue {',
    `    static let generated: [CallFrameDesign] = [\n${FRAME_MOODS.map((mood) => `        ${property(mood)}`).join(',\n')}\n    ].flatMap { $0 }`,
    '}',
    '',
  ].join('\n'),
});

/**
 * Les fichiers Swift, purs et déterministes : l'index (l'ordre des ambiances) puis un fichier par
 * ambiance, dans l'ordre de `FRAME_MOODS` — chaque fichier reste sous le budget de 1 200 lignes
 * que `FileSizeBudgetGuardTests` impose à toute source de l'app.
 */
export function renderSwift(files: readonly unknown[]): readonly GeneratedSwiftFile[] {
  const frames = expandFiles(files);
  return [indexFile(), ...FRAME_MOODS.map((mood) => moodFile(mood, frames.filter((frame) => frame.mood === mood)))];
}

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../../..');
export const SOURCE_DIR = resolve(REPO_ROOT, 'packages/shared/design/call-capture-frames');
export const OUTPUT_DIR = resolve(REPO_ROOT, OUTPUT_RELATIVE_DIR);

export function readMoodFiles(directory: string = SOURCE_DIR): readonly unknown[] {
  return FRAME_MOODS.map((mood): unknown => JSON.parse(readFileSync(join(directory, `${mood}.json`), 'utf8')));
}

/** Les fichiers générés présents sur disque — ceux que le générateur possède (`CallFrameCatalogue+*.swift`). */
export function generatedFilesOnDisk(directory: string = OUTPUT_DIR): readonly string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => /^CallFrameCatalogue\+[A-Za-z]+\.swift$/.test(name)).sort();
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const generated = renderSwift(readMoodFiles());
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const expected = new Set(generated.map((file) => file.name));
  generatedFilesOnDisk().filter((name) => !expected.has(name)).forEach((name) => rmSync(join(OUTPUT_DIR, name)));
  generated.forEach((file) => writeFileSync(join(OUTPUT_DIR, file.name), file.content));
  const count = generated.reduce((sum, file) => sum + (file.content.match(/^ {8}CallFrameDesign\($/gm) ?? []).length, 0);
  process.stdout.write(`${OUTPUT_RELATIVE_DIR} — ${generated.length} fichiers, ${count} cadres\n`);
}

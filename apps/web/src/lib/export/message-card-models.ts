import { CARD_ASPECTS, type CardAspect, type CardAuthorPlacement, type CardHeaderOrientation, type CardTilt } from './message-card-frame';
import type { MessageCardFormat } from './message-card-format';
import { CARD_LINKS, CARD_PALETTE_IDS, CARD_TYPEFACE_IDS, type CardLinkId, type CardPaletteId, type CardTypefaceId, type MessageCardTemplateId } from './message-card-templates';

/**
 * **LE DÉCOR D'UNE CARTE** (#18673, miroir de `MessageCardDecor`) — ce qu'une
 * maquette ajoute à la mise en page commune : l'alignement du texte, un cadre,
 * un ornement. Chaque brique est CONNUE du moteur et se règle par des valeurs :
 * une maquette de marque les combine, elle n'apporte jamais de code.
 */
export const CARD_DECOR_ALIGNMENTS = ['start', 'center'] as const;
export const CARD_DECOR_FRAMES = ['none', 'panel', 'border'] as const;
export const CARD_DECOR_ORNAMENTS = ['none', 'quoteMark', 'accentRule'] as const;

export type CardDecor = {
  readonly alignment: (typeof CARD_DECOR_ALIGNMENTS)[number];
  readonly frame: (typeof CARD_DECOR_FRAMES)[number];
  readonly ornament: (typeof CARD_DECOR_ORNAMENTS)[number];
};

export const NO_DECOR: CardDecor = { alignment: 'start', frame: 'none', ornament: 'none' };

export const isNoDecor = (decor: CardDecor): boolean =>
  decor.alignment === NO_DECOR.alignment && decor.frame === NO_DECOR.frame && decor.ornament === NO_DECOR.ornament;

/**
 * **UNE MAQUETTE D'EXPORT** (#18673, miroir de `MessageCardModel`) — une FICHE
 * DE DONNÉES : une palette, une police et une liaison par défaut, la
 * disposition, le décor, et les liaisons qu'on peut y choisir. La palette, la
 * police et la liaison ne sont pas des maquettes : ce sont leurs réglages.
 */
export type CardModel = {
  /** Stable — un format enregistré s'en souvient. Une marque le préfixe : `@marque/nom`. */
  readonly id: string;
  readonly names: Readonly<Record<string, string>>;
  readonly palette: CardPaletteId;
  readonly typeface: CardTypefaceId;
  readonly link: CardLinkId;
  /** Les liaisons qui vont à la maquette — vide : toutes. */
  readonly links: readonly CardLinkId[];
  readonly aspect: CardAspect;
  readonly header: CardHeaderOrientation;
  readonly authorsAt: CardAuthorPlacement;
  readonly tilt: CardTilt;
  readonly decor: CardDecor;
};

export const DEFAULT_MODEL_ID = 'citation';

export function modelName(model: CardModel, language: string | null): string {
  const code = language?.slice(0, 2).toLowerCase();
  return (code === undefined ? undefined : model.names[code]) ?? model.names['fr'] ?? Object.values(model.names).sort()[0] ?? model.id;
}

export const offeredLinks = (model: CardModel): readonly CardLinkId[] => (model.links.length === 0 ? CARD_LINKS : model.links);

export const modelTemplate = (model: CardModel): MessageCardTemplateId => `${model.palette}.${model.typeface}.${model.link}`;

/** Le format habillé par la maquette : ce qu'on a choisi de MONTRER reste ; l'allure vient d'elle. */
export const applyModel = (model: CardModel, format: MessageCardFormat): MessageCardFormat => ({
  ...format,
  template: modelTemplate(model),
  model: model.id,
  aspect: model.aspect,
  header: model.header,
  authorsAt: model.authorsAt,
  tilt: model.tilt,
  decor: model.decor,
});

/** `citation`, ou `@marque/nom` pour une marque : lettres minuscules, chiffres et tirets. */
export function isValidModelId(id: string): boolean {
  const branded = id.startsWith('@');
  const parts = branded ? id.slice(1).split('/') : [id];
  if (parts.length < 1 || parts.length > 2 || branded !== (parts.length === 2)) return false;
  return parts.every((part) => part.length >= 1 && part.length <= 40 && /^[a-z0-9-]+$/.test(part));
}

const IOS_HEADERS: Readonly<Record<string, CardHeaderOrientation>> = { horizontal: 'horizontal', rotatedUp: 'up', rotatedDown: 'down', stacked: 'letters' };
const IOS_PLACEMENTS: Readonly<Record<string, CardAuthorPlacement>> = { above: 'top', after: 'end' };
const TILTS: readonly CardTilt[] = ['none', 'left', 'right'];

type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };
const ok = <T,>(value: T): Read<T> => ({ ok: true, value });
const refused = { ok: false } as const;

/** Une clé absente prend sa valeur par défaut ; une clé présente mais inconnue refuse la fiche. */
function optional<T>(record: Record<string, unknown>, key: string, fallback: T, read: (raw: string) => T | undefined): Read<T> {
  const raw = record[key];
  if (raw === undefined) return ok(fallback);
  const value = typeof raw === 'string' ? read(raw) : undefined;
  return value === undefined ? refused : ok(value);
}

const pick = <T extends string>(values: readonly T[]) => (raw: string): T | undefined => values.find((value) => value === raw);

function decorOf(raw: unknown): Read<CardDecor> {
  if (raw === undefined) return ok(NO_DECOR);
  if (typeof raw !== 'object' || raw === null) return refused;
  const record = raw as Record<string, unknown>;
  const alignment = pick(CARD_DECOR_ALIGNMENTS)(String(record['alignment']));
  const frame = pick(CARD_DECOR_FRAMES)(String(record['frame']));
  const ornament = pick(CARD_DECOR_ORNAMENTS)(String(record['ornament']));
  return alignment === undefined || frame === undefined || ornament === undefined ? refused : ok({ alignment, frame, ornament });
}

function modelOf(raw: unknown): CardModel | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const id = record['id'];
  if (typeof id !== 'string' || !isValidModelId(id)) return null;
  const names = record['names'];
  if (typeof names !== 'object' || names === null) return null;
  const nameEntries = Object.entries(names as Record<string, unknown>);
  if (nameEntries.length === 0 || !nameEntries.every(([, value]) => typeof value === 'string')) return null;
  const palette = pick(CARD_PALETTE_IDS)(String(record['palette']));
  const typeface = pick(CARD_TYPEFACE_IDS)(String(record['typeface']));
  const link = pick(CARD_LINKS)(String(record['link']));
  if (palette === undefined || typeface === undefined || link === undefined) return null;
  const rawLinks = record['links'] ?? [];
  if (!Array.isArray(rawLinks)) return null;
  const links = rawLinks.map((entry) => (typeof entry === 'string' ? pick(CARD_LINKS)(entry) : undefined));
  if (links.some((entry) => entry === undefined)) return null;
  const offered = links.filter((entry): entry is CardLinkId => entry !== undefined);
  if (offered.length > 0 && !offered.includes(link)) return null;
  const aspect = optional(record, 'aspect', 'auto' as CardAspect, pick(CARD_ASPECTS));
  const header = optional(record, 'headerOrientation', 'horizontal' as CardHeaderOrientation, (value) => IOS_HEADERS[value]);
  const authorsAt = optional(record, 'authorPlacement', 'top' as CardAuthorPlacement, (value) => IOS_PLACEMENTS[value]);
  const tilt = optional(record, 'tilt', 'none' as CardTilt, pick(TILTS));
  const decor = decorOf(record['decor']);
  if (!aspect.ok || !header.ok || !authorsAt.ok || !tilt.ok || !decor.ok) return null;
  return {
    id,
    names: Object.fromEntries(nameEntries) as Record<string, string>,
    palette,
    typeface,
    link,
    links: offered,
    aspect: aspect.value,
    header: header.value,
    authorsAt: authorsAt.value,
    tilt: tilt.value,
    decor: decor.value,
  };
}

/**
 * Lit une liste de fiches, au format d'iOS — STRICTEMENT : une valeur inconnue,
 * un identifiant invalide ou en double refusent tout, jamais une maquette à moitié lue.
 */
export function decodeCardModels(json: string): readonly CardModel[] | null {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return null;
    const models = value.map(modelOf);
    if (models.some((model) => model === null)) return null;
    const read = models.filter((model): model is CardModel => model !== null);
    return new Set(read.map((model) => model.id)).size === read.length ? read : null;
  } catch {
    return null;
  }
}

/** Les huit maquettes de Meeshy — la MÊME fiche qu'iOS (`MessageCardModels.builtInJSON`) et qu'Android. */
export const BUILT_IN_MODELS_JSON = `[
  {"id": "citation", "names": {"fr": "Citation", "en": "Quote", "es": "Cita", "de": "Zitat", "it": "Citazione", "pt": "Citação", "ar": "اقتباس"},
   "palette": "aurore", "typeface": "rond", "link": "orbite"},
  {"id": "bulles", "names": {"fr": "Bulles", "en": "Bubbles", "es": "Burbujas", "de": "Blasen", "it": "Bolle", "pt": "Balões", "ar": "فقاعات"},
   "palette": "neige", "typeface": "systeme", "link": "bulles", "links": ["bulles"]},
  {"id": "affiche", "names": {"fr": "Affiche", "en": "Poster", "es": "Cartel", "de": "Plakat", "it": "Manifesto", "pt": "Cartaz", "ar": "ملصق"},
   "palette": "minuit", "typeface": "affiche", "link": "silence", "links": ["silence", "orbite"], "aspect": "story",
   "decor": {"alignment": "center", "frame": "none", "ornament": "accentRule"}},
  {"id": "editorial", "names": {"fr": "Éditorial", "en": "Editorial", "es": "Editorial", "de": "Editorial", "it": "Editoriale", "pt": "Editorial", "ar": "افتتاحية"},
   "palette": "editorial", "typeface": "didone", "link": "guillemets", "aspect": "portrait",
   "decor": {"alignment": "start", "frame": "border", "ornament": "none"}},
  {"id": "carnet", "names": {"fr": "Carnet", "en": "Notebook", "es": "Cuaderno", "de": "Notizbuch", "it": "Taccuino", "pt": "Caderno", "ar": "دفتر"},
   "palette": "manuscrit", "typeface": "plume", "link": "fil", "authorPlacement": "after", "tilt": "left",
   "decor": {"alignment": "start", "frame": "panel", "ornament": "none"}},
  {"id": "bandeau", "names": {"fr": "Bandeau", "en": "Banner", "es": "Banda", "de": "Banner", "it": "Fascia", "pt": "Faixa", "ar": "شريط"},
   "palette": "lagon", "typeface": "futur", "link": "filet", "headerOrientation": "rotatedUp", "aspect": "portrait"},
  {"id": "manifeste", "names": {"fr": "Manifeste", "en": "Manifesto", "es": "Manifiesto", "de": "Manifest", "it": "Manifesto", "pt": "Manifesto", "ar": "بيان"},
   "palette": "braise", "typeface": "marqueur", "link": "fleche", "aspect": "square", "tilt": "right",
   "decor": {"alignment": "start", "frame": "none", "ornament": "quoteMark"}},
  {"id": "epure", "names": {"fr": "Épure", "en": "Minimal", "es": "Mínimo", "de": "Schlicht", "it": "Essenziale", "pt": "Mínimo", "ar": "بسيط"},
   "palette": "ardoise", "typeface": "systeme", "link": "silence", "links": ["silence", "orbite"], "aspect": "square",
   "decor": {"alignment": "center", "frame": "border", "ornament": "none"}}
]`;

export const BUILT_IN_MODELS: readonly CardModel[] = decodeCardModels(BUILT_IN_MODELS_JSON) ?? [];

export const modelById = (id: string | null, models: readonly CardModel[] = BUILT_IN_MODELS): CardModel | null =>
  id === null ? null : (models.find((model) => model.id === id) ?? null);

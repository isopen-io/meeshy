/**
 * Accent conversationnel — portage TypeScript de l'algorithme Swift.
 *
 * Source de vérité (à MIROITER, jamais réinterpréter) :
 *   `packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift`
 *   → `DynamicColorGenerator.colorFor(context:)` (primary/secondary/accent)
 *   → `DynamicColorGenerator.colorForName(_:)` (repli hash → palette)
 * Miroir Kotlin déjà existant (vérifié identique au Swift sur tous les points
 * repris ici) : `apps/android/sdk-core/.../theme/DynamicColorGenerator.kt`.
 *
 * Algorithme (contrat LWS-2 / #3010 §0) :
 *   primary   = blend(languageColor × 0.30, typeColor × 0.30, themeColor × 0.40)
 *   secondary = hueShift(primary, +30°)
 *   accent    = hueShift(primary, −30°)
 *
 * Règle critique de troncature (contrat LWS-2, tâche C-021) : chaque canal RGB
 * du blend est un `Int(Double)` côté Swift — une TRONCATURE vers zéro, jamais
 * un arrondi. Sur des poids non négatifs, `Math.trunc` reproduit exactement ce
 * comportement. L'exemple documenté (contrat §0, `focal-implementation-contract.md`
 * §"L'accent démo") : fr `#3498DB` + groupe `#4ECDC4` + voyage `#1ABC9C`, poids
 * 0.30/0.30/0.40 → `#31B6BA` avec `Math.trunc` (canal G brut = 182.3 → 182 = 0xB6,
 * canal B brut = 186.9 → 186 = 0xBA) ; un arrondi donnerait `#31B6BB` (186.9 → 187),
 * la valeur affichée — à tort — sur la maquette `2026-08-15-conversation-list-lentille.html`.
 *
 * Espace colorimétrique du hueShift : Swift utilise `UIColor.getHue(_:saturation:
 * brightness:alpha:)`, c'est-à-dire **HSB/HSV** (teinte/saturation/luminosité),
 * PAS HSL (teinte/saturation/lumière). Les deux modèles divergent dès que la
 * saturation ou la luminosité s'écartent des extrêmes ; ce fichier reproduit HSB
 * bit pour bit (mêmes formules que le miroir Kotlin `rgbToHsv`/`hsvToRgb`), pas une
 * réinterprétation HSL.
 *
 * Divergence constatée avec la documentation produit (à noter, pas à corriger
 * ici — le Swift fait foi) : `packages/MeeshySDK/CLAUDE.md` et le contrat
 * d'implémentation décrivent le repli `colorForName` comme une "palette de 20
 * couleurs vibrantes" ; le commentaire du Swift source lui-même dit "40-color
 * vibrant palette". Le tableau `vibrantPalette` réellement défini dans
 * `ColorGeneration.swift` (lignes 201-220) contient **39** entrées — recomptées
 * ligne à ligne ci-dessous et copiées verbatim (aucune divergence avec le
 * miroir Kotlin, qui recopie la même liste de 39). C'est ce compte de 39 qui
 * fait foi ici, pas les 20 (docs) ni les 40 (commentaire Swift) annoncés ailleurs.
 */

// ---------------------------------------------------------------------------
// Tables de couleurs (copiées verbatim depuis ColorGeneration.swift L106-138)
// ---------------------------------------------------------------------------

const LANGUAGE_COLORS: Readonly<Record<string, string>> = {
  french: '3498DB',
  english: 'E74C3C',
  spanish: 'F39C12',
  german: '27AE60',
  japanese: 'E91E63',
  arabic: 'F8B500',
  chinese: 'C0392B',
  portuguese: '2ECC71',
  italian: '1ABC9C',
  other: '9B59B6',
};

/**
 * Codes ISO 639-1 vers les clés `ConversationContext.ConversationLanguage`
 * (Swift) — RÉSERVE 7, revue REV-1. Couvre les 9 langues RÉELLES portées par
 * `LANGUAGE_COLORS` (`other` exclu : c'est un repli catégoriel, pas une
 * langue ISO). `conversationAccentPalette` normalise `input.language` à
 * travers cette table AVANT le lookup dans `LANGUAGE_COLORS`, pour accepter
 * indifféremment `'fr'` ou `'french'`.
 */
export const ISO_TO_CONVERSATION_LANGUAGE: Readonly<Record<string, string>> = {
  fr: 'french',
  en: 'english',
  es: 'spanish',
  de: 'german',
  ja: 'japanese',
  ar: 'arabic',
  zh: 'chinese',
  pt: 'portuguese',
  it: 'italian',
};

const TYPE_COLORS: Readonly<Record<string, string>> = {
  direct: 'FF6B6B',
  group: '4ECDC4',
  community: '9B59B6',
  channel: 'F8B500',
  bot: '00CED1',
};

const THEME_COLORS: Readonly<Record<string, string>> = {
  general: '4ECDC4',
  work: '3498DB',
  social: 'E91E63',
  gaming: '2ECC71',
  music: '9B59B6',
  sports: 'F39C12',
  tech: '00CED1',
  art: 'E74C3C',
  travel: '1ABC9C',
  food: 'FF7F50',
};

/**
 * Mapping du type de conversation "fil" (wire, huit cas — Prisma/API) vers le
 * type de contexte à cinq clés qu'utilise réellement `colorFor` — même mapping
 * que `MeeshyConversation.computeColorPalette` (`CoreModels.swift` L341-355) :
 * `public`, `global`, `community` et `broadcast` retombent TOUS sur `community`.
 */
const WIRE_TYPE_TO_CONTEXT_TYPE: Readonly<Record<string, string>> = {
  direct: 'direct',
  group: 'group',
  public: 'community',
  global: 'community',
  community: 'community',
  broadcast: 'community',
  channel: 'channel',
  bot: 'bot',
};

/**
 * Repli côté TS pour un `type` hors des huit valeurs connues du fil — le Swift
 * n'a pas cette question à trancher (enum fermé, exhaustif à la compilation) ;
 * on retombe sur `direct`, la valeur par défaut de `ConversationContext.type`
 * dans son initialiseur (`ColorGeneration.swift` L22-26).
 */
const DEFAULT_CONTEXT_TYPE = 'direct';

/** Valeur par défaut de `ConversationContext.language` (L22-26) quand omise. */
const DEFAULT_LANGUAGE = 'french';

/** Valeur par défaut de `ConversationContext.theme` (L22-26) quand omis. */
const DEFAULT_THEME = 'general';

/**
 * Repli quand une clé (langue/thème) est fournie mais ne correspond à aucune
 * entrée connue — reproduit littéralement le `?? "4ECDC4"` du dictionnaire
 * Swift (`languageColors[context.language] ?? "4ECDC4"`,
 * `themeColors[context.theme] ?? "4ECDC4"`, L175 et L177). Ce branchement est
 * mort côté Swift (l'enum est fermé, la clé existe toujours) ; il redevient
 * vivant côté TS parce que `language`/`theme` y sont de simples `string`.
 */
const UNKNOWN_KEY_FALLBACK_HEX = '4ECDC4';

/** Repli type-inconnu-mais-mappé — reproduit `typeColors[...] ?? "FF6B6B"` (L176). */
const UNKNOWN_TYPE_FALLBACK_HEX = 'FF6B6B';

/**
 * Palette de repli — copiée verbatim depuis `ColorGeneration.swift` L201-220
 * (`vibrantPalette`), recomptée à 39 entrées (voir note de tête de fichier).
 * Identique au miroir Kotlin `DynamicColorGenerator.kt` L92-102.
 */
const VIBRANT_PALETTE: readonly string[] = [
  // Reds & Roses (350°–10°)
  'E74C3C', 'C0392B', 'DC4A5A', 'D94452', 'F43F5E',
  // Oranges & Corals (15°–40°)
  'FF7F50', 'E67E22', 'F97316', 'EA580C', 'D4763B',
  // Ambers & Golds (42°–55°)
  'D97706', 'B8860B', 'CA8A04',
  // Greens (120°–155°)
  '2ECC71', '27AE60', '059669', '16A34A', '22C55E',
  // Teals & Cyans (165°–195°)
  '1ABC9C', '14B8A6', '0D9488', '0891B2', '00CED1',
  // Blues (200°–230°)
  '3498DB', '2980B9', '0EA5E9', '3B82F6', '2563EB',
  // Indigos & Violets (240°–270°)
  '6366F1', '4F46E5', '7C3AED', '6D28D9',
  // Purples & Fuchsias (275°–320°)
  '9B59B6', 'A855F7', 'D946EF', 'C026D3',
  // Pinks (330°–350°)
  'EC4899', 'E91E63', 'DB2777',
];

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

/**
 * Entrée de `conversationAccentPalette`. `type` mappe les huit valeurs du fil
 * (voir `WIRE_TYPE_TO_CONTEXT_TYPE`) ; `language`/`theme` mappent les clés de
 * `ConversationContext.ConversationLanguage`/`.ConversationTheme` (Swift).
 *
 * `name` est accepté pour compléter l'API mais N'INTERVIENT PAS dans le calcul
 * — reproduction fidèle : `DynamicColorGenerator.colorFor(context:)`
 * (`ColorGeneration.swift` L174-196) ne lit jamais `context.name`, seulement
 * `.language`, `.type`, `.theme` (et `.memberCount`, pour `saturationBoost`,
 * hors du périmètre de cette fonction — voir plus bas).
 */
export type ConversationAccentInput = {
  readonly name: string;
  readonly type: string;
  readonly language?: string;
  readonly theme?: string;
};

/**
 * `{ primary, secondary, accent }` — délibérément sans `saturationBoost` : ce
 * champ de `ConversationColorPalette` (Swift) est dérivé de `memberCount` et
 * n'affecte JAMAIS les trois hex ici (le blend et le hueShift n'en dépendent
 * pas) ; il est hors du périmètre de l'API demandée par le contrat LWS-2.
 */
export type ConversationAccentPalette = {
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
};

// ---------------------------------------------------------------------------
// Primitives couleur (RGB ↔ hex, blend, HSB) — miroir de ColorGeneration.swift
// ---------------------------------------------------------------------------

type Rgb = { readonly r: number; readonly g: number; readonly b: number };

/**
 * Miroir de `DynamicColorGenerator.hexToRGB` (L292-304) : tolère un `#` en
 * tête et les espaces ; une chaîne non hexadécimale retombe sur 0 (comme
 * `Scanner.scanHexInt64` laissant `rgb` à sa valeur initiale 0).
 */
function hexToRgb(hex: string): Rgb {
  const sanitized = hex.trim().replace(/^#/, '');
  const parsed = Number.parseInt(sanitized, 16);
  const value = Number.isNaN(parsed) ? 0 : parsed;
  return {
    r: (value & 0xff0000) >> 16,
    g: (value & 0x00ff00) >> 8,
    b: value & 0x0000ff,
  };
}

/** Formate trois canaux 0-255 en hex 6 chiffres MAJUSCULES, sans `#`. */
function rgbToHexDigits(r: number, g: number, b: number): string {
  const channel = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
  return `${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Miroir de `DynamicColorGenerator.blendColors` (L267-279). TRONCATURE
 * (`Math.trunc`, jamais `Math.round`) de chaque canal, puis clamp au plafond
 * 255 (`min(255, r)` côté Swift — pas de plancher, les poids et couleurs
 * d'entrée sont toujours ≥ 0 donc il ne serait jamais atteint).
 */
function blendColors(
  hex1: string, weight1: number,
  hex2: string, weight2: number,
  hex3: string, weight3: number,
): string {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const c3 = hexToRgb(hex3);

  const r = Math.trunc(c1.r * weight1 + c2.r * weight2 + c3.r * weight3);
  const g = Math.trunc(c1.g * weight1 + c2.g * weight2 + c3.g * weight3);
  const b = Math.trunc(c1.b * weight1 + c2.b * weight2 + c3.b * weight3);

  return rgbToHexDigits(Math.min(255, r), Math.min(255, g), Math.min(255, b));
}

type Hsv = { readonly h: number; readonly s: number; readonly v: number };

/**
 * RGB (0-255) → HSB/HSV, teinte normalisée sur [0, 1) — reproduit
 * `UIColor.getHue(_:saturation:brightness:alpha:)`, PAS une conversion HSL.
 * Le JS `%` garde le signe du dividende (contrairement au Swift `.truncatingRemainder`
 * appliqué implicitement par `getHue`, dont le résultat est toujours positif) —
 * la correction explicite `if (h < 0) h += 360` ci-dessous restaure la parité
 * (vérifié bit à bit contre le calcul de référence, voir suite de tests).
 */
function rgbToHsv(rgb: Rgb): Hsv {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h: number;
  if (delta === 0) {
    h = 0;
  } else if (max === r) {
    h = 60 * (((g - b) / delta) % 6);
  } else if (max === g) {
    h = 60 * ((b - r) / delta + 2);
  } else {
    h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  return { h: h / 360, s, v: max };
}

/** HSB/HSV (teinte normalisée [0,1)) → RGB (0-255), TRONCATURE comme Swift. */
function hsvToRgb(hsv: Hsv): Rgb {
  const h = hsv.h * 360;
  const c = hsv.v * hsv.s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = hsv.v - c;

  let r1: number, g1: number, b1: number;
  if (h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }

  return {
    r: Math.trunc((r1 + m) * 255),
    g: Math.trunc((g1 + m) * 255),
    b: Math.trunc((b1 + m) * 255),
  };
}

/**
 * Miroir de `DynamicColorGenerator.shiftHue` (L310-326) : rotation de teinte
 * en HSB, une seule correction de bornage (comme le Swift — un décalage de
 * ±30° ne peut sortir qu'une fois de [0, 1)), pas de re-clamp après conversion
 * (le Swift n'en applique aucun ici, contrairement à `blendColors`).
 */
function shiftHue(hex: string, degrees: number): string {
  const hsv = rgbToHsv(hexToRgb(hex));
  let h = hsv.h + degrees / 360;
  if (h > 1) h -= 1;
  if (h < 0) h += 1;
  const shifted = hsvToRgb({ h, s: hsv.s, v: hsv.v });
  return rgbToHexDigits(shifted.r, shifted.g, shifted.b);
}

// ---------------------------------------------------------------------------
// Résolution des clés d'entrée → couleur de base
// ---------------------------------------------------------------------------

/**
 * Normalise un code ISO 639-1 (`'fr'`) vers sa clé `ConversationLanguage`
 * (`'french'`) via `ISO_TO_CONVERSATION_LANGUAGE` — une clé déjà pleine
 * (`'french'`) ou inconnue des deux tables traverse inchangée (RÉSERVE 7).
 */
function normalizeLanguageKey(language: string): string {
  return ISO_TO_CONVERSATION_LANGUAGE[language] ?? language;
}

function resolveLanguageColor(language: string | undefined): string {
  if (language === undefined) return LANGUAGE_COLORS[DEFAULT_LANGUAGE] as string;
  return LANGUAGE_COLORS[normalizeLanguageKey(language)] ?? UNKNOWN_KEY_FALLBACK_HEX;
}

function resolveThemeColor(theme: string | undefined): string {
  if (theme === undefined) return THEME_COLORS[DEFAULT_THEME] as string;
  return THEME_COLORS[theme] ?? UNKNOWN_KEY_FALLBACK_HEX;
}

function resolveTypeColor(type: string): string {
  const contextType = WIRE_TYPE_TO_CONTEXT_TYPE[type] ?? DEFAULT_CONTEXT_TYPE;
  return TYPE_COLORS[contextType] ?? UNKNOWN_TYPE_FALLBACK_HEX;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * `{ primary, secondary, accent }` déterministes pour une conversation, à
 * partir de son type / langue / thème — miroir exact de
 * `DynamicColorGenerator.colorFor(context:)` (`ColorGeneration.swift` L174-196).
 *
 * `primary = blend(langue × 0.30, type × 0.30, thème × 0.40)`, troncature par
 * canal (`Math.trunc`, jamais `Math.round` — voir note de tête de fichier).
 * `secondary`/`accent` = rotation de teinte HSB de `primary` à ±30°.
 */
export function conversationAccentPalette(
  input: ConversationAccentInput,
): ConversationAccentPalette {
  const languageHex = resolveLanguageColor(input.language);
  const typeHex = resolveTypeColor(input.type);
  const themeHex = resolveThemeColor(input.theme);

  const primary = blendColors(languageHex, 0.3, typeHex, 0.3, themeHex, 0.4);
  const secondary = shiftHue(primary, 30);
  const accent = shiftHue(primary, -30);

  return {
    primary: `#${primary}`,
    secondary: `#${secondary}`,
    accent: `#${accent}`,
  };
}

/**
 * Hash DJB2 sur 64 bits non signés avec repli (wraparound) — miroir de
 * `DynamicColorGenerator.stableHash` (`ColorGeneration.swift` L224-230).
 * `BigInt` est nécessaire : les valeurs intermédiaires dépassent
 * `Number.MAX_SAFE_INTEGER` dès quelques caractères, un `number` JS perdrait
 * la parité bit à bit avec le repli `UInt64` du Swift.
 */
const HASH_MASK_64 = (1n << 64n) - 1n;

function stableHash(value: string): bigint {
  let hash = 5381n;
  const bytes = new TextEncoder().encode(value);
  for (const byte of bytes) {
    hash = ((hash << 5n) + hash + BigInt(byte)) & HASH_MASK_64;
  }
  return hash;
}

/**
 * Repli déterministe pour les contextes sans métadonnées de conversation
 * (noms d'expéditeur, etc.) — miroir de `DynamicColorGenerator.colorForName`
 * (`ColorGeneration.swift` L234-237) : même hash DJB2, même palette de 39
 * couleurs (voir note de tête de fichier sur le décompte), même modulo.
 */
/**
 * Accent d'un CONTENU (post, réel, story, commentaire) — la couleur qui trace
 * le renforcement « c'est moi qui ai fait cette action ».
 *
 * Miroir exact d'iOS (`FeedModels.swift:255`) :
 *   `authorColor = colorForName(authorId.isEmpty ? author : authorId)`
 *
 * L'identifiant prime sur le nom : deux auteurs homonymes doivent recevoir deux
 * couleurs, et un auteur qui se renomme doit garder la sienne. Le repli sur le
 * nom ne sert que les surfaces qui n'ont pas encore l'identifiant sous la main.
 *
 * Cette règle vit ICI plutôt que chez ses appelants : recopiée d'un client à
 * l'autre, elle divergerait — et deux appareils peindraient le même post de
 * deux couleurs, ce qui rend le renforcement illisible dès qu'on change
 * d'écran.
 */
export function authorAccentColor(authorId: string | undefined | null, authorName: string): string {
  const seed = authorId && authorId.length > 0 ? authorId : authorName;
  return colorForName(seed);
}

export function colorForName(name: string): string {
  const hash = stableHash(name);
  const index = Number(hash % BigInt(VIBRANT_PALETTE.length));
  return `#${VIBRANT_PALETTE[index]}`;
}

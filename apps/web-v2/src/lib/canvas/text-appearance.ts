import { hexColorCss } from './background';
import { FLAT_TEXT_SHADOW, parseTextEffect, textEffectShadow } from './text-effect';

/**
 * **CE QU'UN OBJET TEXTE PORTE, EN CSS PUR** (#6943) — la traduction du
 * `payload` d'un `kind: 'text'` en propriétés de style, pour que le moteur
 * PEIGNE ce que le studio écrit. Sans ce module, le studio annonçait des
 * styles que le lecteur ne rendait pas : « un hôte qui annonce une apparence
 * qu'il ne sert pas est PIRE qu'une surface non câblée » (CLAUDE.md § Prisme,
 * cycle 123).
 *
 * **L'arbitrage de ce lot : aucune police web.** Les dix-huit familles de
 * `StoryTextStyle.swift` ne choisissent QUE des polices (depuis #4850), et
 * seize d'entre elles nomment une police embarquée iOS. Le poids de première
 * peinture est déjà au-dessus de son plafond (#6940), donc **rien n'est
 * téléchargé** : cinq familles sont SERVIES parce qu'elles n'exigent aucun
 * fichier, les treize autres restent sur la police système — jamais un repli
 * serif qui ferait croire à la bonne famille. Elles attendent leur budget,
 * une issue de suivi.
 *
 * Tout le reste du vocabulaire iOS passe à coût nul, et il y est entier :
 * l'axe EFFET (`text-effect.ts`, vingt-cinq ombres en `em`), la couleur, la
 * graisse, l'alignement, la pastille, le cadre et le contour des glyphes.
 */
export type SceneTextAppearance = {
  readonly fontFamily?: string;
  readonly fontWeight?: number;
  readonly fontStyle?: 'italic';
  readonly textAlign: 'left' | 'center' | 'right';
  readonly textShadow: string;
  /** `-webkit-text-stroke` — le contour des GLYPHES (`borderColor`/`borderWidth`). */
  readonly webkitTextStroke?: string;
  /** Le liseré de la BOÎTE (`frameBorderWidth`/`frameBorderColor`) — un
   * second axe, que `hasFrameBox` (`StoryTextObject.swift:394`) tient déjà
   * séparé du fond côté iOS. */
  readonly border?: string;
  readonly backgroundColor?: string;
  readonly borderRadius?: string;
  readonly padding?: string;
};

type TextPayload = Readonly<Record<string, unknown>>;

/** Les familles qui ne coûtent AUCUN octet — police système, ou pile
 * web-safe présente sur les plateformes courantes. L'ordre est celui des
 * pickers iOS (`StoryTextStyle.allCases`), réduit à ce qui se sert. */
export const SERVED_TEXT_STYLES = ['bold', 'neon', 'classic', 'italic', 'typewriter'] as const;
export type ServedTextStyle = (typeof SERVED_TEXT_STYLES)[number];

/** Nom PostScript iOS → pile web équivalente + graisse, `undefined` pour la
 * police système. `bold` et `neon` sont les DEUX familles qu'iOS rend déjà
 * sans police embarquée (`fontName == nil`). */
const STYLE_TABLE: Record<ServedTextStyle, { readonly family?: string; readonly weight: number; readonly italic?: true }> = {
  bold: { weight: 800 },
  neon: { weight: 600 },
  classic: { family: 'Georgia, "Times New Roman", serif', weight: 500 },
  italic: { family: 'Georgia, "Times New Roman", serif', weight: 400, italic: true },
  typewriter: { family: '"Courier New", Courier, monospace', weight: 400 },
};

/** `StoryTextWeight` (`StoryTextObject.swift`) → graisse CSS. */
const WEIGHT_TABLE: Record<string, number> = { thin: 200, normal: 400, semibold: 600, bold: 800 };

/** `StoryTextFrameShape` → rayon. `diamond`, `cloud` et `speech` exigent un
 * tracé SVG : hors tranche, elles retombent sur le rayon par défaut plutôt
 * que sur une forme inventée. */
const SHAPE_RADIUS: Record<string, string> = { none: '0', rectangle: '0', rounded: '0.25em', pill: '999px' };

/** Le défaut du COMPOSER iOS (`StoryTextObject.swift:109`), référentiel 1080 —
 * c'est lui qui convertit une largeur en design-px vers des `em`. */
const DEFAULT_FONT_SIZE = 96;

const stringOf = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);
const numberOf = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** Une largeur en design-px devient une fraction de la taille du texte — la
 * seule unité qui suive l'objet quand son échelle change. */
const emOf = (designPx: number, fontSize: number): string => `${round3(designPx / fontSize)}em`;

/** La pastille, dans les TROIS dialectes que le corpus porte :
 * `backgroundStyle` taguée (`{type:'solid',hex}`, la forme iOS actuelle), la
 * forme abrégée (`{solid}`, celle que le web-v2 lisait déjà) et `textBg` (la
 * clé LEGACY). `glass` reste hors tranche — un compositing par texte est une
 * question produit ouverte (§ 9, Q7). */
function pillColor(payload: TextPayload): string | undefined {
  const style = payload.backgroundStyle;
  if (typeof style === 'object' && style !== null) {
    const record = style as Readonly<Record<string, unknown>>;
    if (record.type === 'glass' || record.type === 'none') return undefined;
    const hex = stringOf(record.solid) ?? stringOf(record.hex);
    if (hex !== undefined) return hexColorCss(hex);
  }
  return hexColorCss(payload.textBg);
}

export function sceneTextAppearance(payload: TextPayload): SceneTextAppearance {
  const rawAlign = stringOf(payload.textAlign);
  const textAlign = rawAlign === 'left' || rawAlign === 'right' ? rawAlign : 'center';

  const styleKey = stringOf(payload.textStyle);
  const style = styleKey !== undefined && (SERVED_TEXT_STYLES as readonly string[]).includes(styleKey)
    ? STYLE_TABLE[styleKey as ServedTextStyle]
    : undefined;

  const declaredWeight = WEIGHT_TABLE[stringOf(payload.fontWeight) ?? ''];
  const fontSize = numberOf(payload.fontSize) ?? DEFAULT_FONT_SIZE;

  const effect = parseTextEffect(payload.textEffect);
  // Un effet REMPLACE le voile de lisibilité : les superposer doublerait
  // l'ombre d'un `letterpress` et noircirait un `glow`.
  const textShadow = textEffectShadow(effect) ?? FLAT_TEXT_SHADOW;

  const strokeColor = hexColorCss(payload.borderColor);
  // `borderWidth` sans `borderColor` ne dessine RIEN : côté iOS c'est la
  // COULEUR qui déclare le contour, il n'y a pas de booléen (défaut `nil` ⇒
  // pas de contour). Le défaut de largeur est 3 design-px.
  const webkitTextStroke = strokeColor === undefined ? undefined : `${emOf(numberOf(payload.borderWidth) ?? 3, fontSize)} ${strokeColor}`;

  const frameBorderWidth = numberOf(payload.frameBorderWidth);
  const border =
    frameBorderWidth !== undefined && frameBorderWidth > 0
      ? `${emOf(frameBorderWidth, fontSize)} solid ${hexColorCss(payload.frameBorderColor) ?? '#FFFFFF'}`
      : undefined;

  const backgroundColor = pillColor(payload);
  const boxed = backgroundColor !== undefined || border !== undefined;
  // `resolvedFramePaddingScale` (`StoryTextObject.swift:382`) : borné 0…3.
  const paddingScale = Math.min(3, Math.max(0, numberOf(payload.framePaddingScale) ?? 1));

  return {
    ...(style?.family !== undefined ? { fontFamily: style.family } : {}),
    ...(declaredWeight !== undefined ? { fontWeight: declaredWeight } : style !== undefined ? { fontWeight: style.weight } : {}),
    ...(style?.italic === true ? { fontStyle: 'italic' as const } : {}),
    textAlign,
    textShadow,
    ...(webkitTextStroke !== undefined ? { webkitTextStroke } : {}),
    ...(border !== undefined ? { border } : {}),
    ...(backgroundColor !== undefined ? { backgroundColor } : {}),
    ...(boxed ? { borderRadius: SHAPE_RADIUS[stringOf(payload.frameShape) ?? 'rounded'] ?? '0.25em' } : {}),
    // Arrondi au millième : `0.2 * 3` rend `0.6000000000000001` en flottant,
    // et une valeur CSS n'a pas à porter la queue binaire d'un produit.
    ...(boxed ? { padding: `${round3(0.2 * paddingScale)}em ${round3(0.5 * paddingScale)}em` } : {}),
  };
}

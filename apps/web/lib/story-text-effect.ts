/**
 * **L'axe EFFET d'un texte de story — la table UNIQUE, côté web** (#4870).
 *
 * `textStyle` choisit une POLICE et rien d'autre (#4850) ; ce qui BRILLE ou
 * PORTE UNE OMBRE est un second axe, `textEffect`, orthogonal à la police.
 * Avant lui, ce fichier n'existait pas et « neon » brillait ICI (et sur
 * Android) sans briller sur iOS, où la story est composée — un effet caché
 * derrière un nom de police, différent selon le client. La lueur ne vit plus
 * que sur cet axe.
 *
 * La table est en fraction de la taille de police (em), recopiée à
 * l'identique sur les deux autres miroirs — Swift `StoryTextEffect`
 * (`packages/MeeshySDK/.../Models/Story/StoryTextEffect.swift`), Kotlin
 * `StoryTextEffect.kt` (`apps/android/core/model/`). Toute évolution touche
 * les trois. `blur` est le rayon de flou au sens CSS ; les miroirs natifs
 * portent leur propre conversion.
 */

export const TEXT_EFFECTS = [
  // Lueurs — l'encre du TEXTE, sans décalage
  'glow', 'glowSoft', 'neon',
  // Contours — l'encre SOMBRE, sans décalage
  'halo', 'outline',
  // Ombres — l'encre SOMBRE, décalée
  'shadow', 'drop', 'lift', 'longShadow',
  // Reliefs — le texte paraît gravé
  'relief', 'emboss', 'letterpress', 'echo',
] as const;
export type StoryTextEffect = (typeof TEXT_EFFECTS)[number];

/// L'encre d'une ombre — trois valeurs, pas un booléen (#5244). `usesTextColor`
/// ne savait dire que « couleur du texte OU noir », ce qui interdisait les
/// reliefs gravés : `emboss` et `letterpress` posent une lumière CLAIRE d'un
/// côté du glyphe.
export type EffectInk = 'text' | 'dark' | 'light';

type EffectShadow = {
  offsetX: number;
  offsetY: number;
  blur: number;
  ink: EffectInk;
  opacity: number;
};

const TABLE: Record<StoryTextEffect, EffectShadow> = {
  glow: { offsetX: 0, offsetY: 0, blur: 0.36, ink: 'text', opacity: 1 },
  glowSoft: { offsetX: 0, offsetY: 0, blur: 0.24, ink: 'text', opacity: 0.55 },
  neon: { offsetX: 0, offsetY: 0, blur: 0.6, ink: 'text', opacity: 1 },

  halo: { offsetX: 0, offsetY: 0, blur: 0.3, ink: 'dark', opacity: 0.75 },
  outline: { offsetX: 0, offsetY: 0, blur: 0.09, ink: 'dark', opacity: 1 },

  shadow: { offsetX: 0.03, offsetY: 0.06, blur: 0.16, ink: 'dark', opacity: 0.6 },
  drop: { offsetX: 0.06, offsetY: 0.1, blur: 0.08, ink: 'dark', opacity: 0.75 },
  lift: { offsetX: 0, offsetY: 0.1, blur: 0.22, ink: 'dark', opacity: 0.45 },
  longShadow: { offsetX: 0.14, offsetY: 0.14, blur: 0, ink: 'dark', opacity: 0.35 },

  relief: { offsetX: 0.05, offsetY: 0.05, blur: 0, ink: 'dark', opacity: 0.85 },
  emboss: { offsetX: -0.03, offsetY: -0.03, blur: 0.02, ink: 'light', opacity: 0.7 },
  letterpress: { offsetX: 0, offsetY: 0.025, blur: 0.01, ink: 'light', opacity: 0.6 },
  echo: { offsetX: 0.09, offsetY: 0.09, blur: 0, ink: 'text', opacity: 0.35 },
};

/// L'ombre de LISIBILITÉ posée sur tout texte sans effet — un voile, pas un
/// effet : elle ne fait pas partie de l'axe et ne se choisit pas.
export const FLAT_TEXT_SHADOW = '0 1px 4px rgba(0,0,0,0.5)';

/// Parité `parsedTextEffect` iOS : une valeur inconnue vaut « aucun », jamais
/// une exception — le blob est tolérant par contrat.
export function parseTextEffect(raw: unknown): StoryTextEffect | undefined {
  return typeof raw === 'string' && (TEXT_EFFECTS as readonly string[]).includes(raw)
    ? (raw as StoryTextEffect)
    : undefined;
}

const em = (value: number): string => (value === 0 ? '0' : `${value}em`);

/// La couleur CSS d'une encre, à son opacité.
///
/// **`currentColor` ne porte pas d'alpha**, et c'est ce qui a failli faire
/// diverger le web au moment où l'axe est passé à quatorze effets (#5244) :
/// tant que la seule encre `text` était `glow` (opacité 1), `currentColor`
/// suffisait — `glowSoft` (0,55) et `echo` (0,35) se seraient rendus PLEINS
/// ici et translucides sur les deux clients natifs. `color-mix` applique
/// l'alpha en gardant la couleur du texte, quelle qu'elle soit.
function inkColor(spec: EffectShadow): string {
  if (spec.ink === 'light') return `rgba(255,255,255,${spec.opacity})`;
  if (spec.ink === 'dark') return `rgba(0,0,0,${spec.opacity})`;
  return spec.opacity >= 1
    ? 'currentColor'
    : `color-mix(in srgb, currentColor ${Math.round(spec.opacity * 100)}%, transparent)`;
}

/// La valeur `text-shadow` d'un effet, en em pour suivre la taille de police —
/// ou `undefined` sans effet, pour que l'appelant pose son voile de lisibilité.
export function textEffectShadow(effect: StoryTextEffect | undefined): string | undefined {
  if (!effect) return undefined;
  const spec = TABLE[effect];
  const color = inkColor(spec);
  return `${em(spec.offsetX)} ${em(spec.offsetY)} ${em(spec.blur)} ${color}`;
}

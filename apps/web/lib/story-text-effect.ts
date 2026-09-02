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

export const TEXT_EFFECTS = ['glow', 'shadow', 'relief'] as const;
export type StoryTextEffect = (typeof TEXT_EFFECTS)[number];

type EffectShadow = {
  offsetX: number;
  offsetY: number;
  blur: number;
  usesTextColor: boolean;
  opacity: number;
};

const TABLE: Record<StoryTextEffect, EffectShadow> = {
  glow: { offsetX: 0, offsetY: 0, blur: 0.36, usesTextColor: true, opacity: 1 },
  shadow: { offsetX: 0.03, offsetY: 0.06, blur: 0.16, usesTextColor: false, opacity: 0.6 },
  relief: { offsetX: 0.05, offsetY: 0.05, blur: 0, usesTextColor: false, opacity: 0.85 },
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

/// La valeur `text-shadow` d'un effet, en em pour suivre la taille de police —
/// ou `undefined` sans effet, pour que l'appelant pose son voile de lisibilité.
export function textEffectShadow(effect: StoryTextEffect | undefined): string | undefined {
  if (!effect) return undefined;
  const spec = TABLE[effect];
  const color = spec.usesTextColor ? 'currentColor' : `rgba(0,0,0,${spec.opacity})`;
  return `${em(spec.offsetX)} ${em(spec.offsetY)} ${em(spec.blur)} ${color}`;
}

/**
 * LE MESSAGE DE L'AUTEUR SUR SON CADRE (#10165, L12, § 5.14 du prompt des
 * Cadres de gloire) — une loi PURE, sans DOM : ce que le champ du résultat
 * accepte et ce que le peintre écrit sur la plaque.
 *
 *  - ≤ 60 GRAPHÈMES, comptés par `Intl.Segmenter` (un drapeau, une famille
 *    d'emojis, une lettre décomposée valent un) — jamais des unités UTF-16 ;
 *  - UNE ligne : retours à la ligne et tabulations deviennent une espace, les
 *    espaces se resserrent, les bords se taillent ;
 *  - du TEXTE seulement : caractères de contrôle, marques bidi incrustées et
 *    largeurs nulles retirés — le sens d'écriture se pose au rendu, par un
 *    isolat (FSI … PDI), jamais par ce que l'auteur a collé ;
 *  - jamais interprété : une balise ou un lien restent des lettres (le peintre
 *    écrit en `fillText`, le champ est un `<input>`).
 *
 * Le même filtre borne ce que la recette du carnet rapporte : une entrée écrite
 * ailleurs ne peint jamais plus que la plaque n'en admet.
 */
export const AUTHOR_MESSAGE_MAX_GRAPHEMES = 60;

const SEGMENTER = new Intl.Segmenter('und', { granularity: 'grapheme' });

const graphemesOf = (text: string): string[] => Array.from(SEGMENTER.segment(text), (part) => part.segment);

/** Contrôles C0 et C1, marques et isolats bidi, largeurs nulles, jointeurs seuls, marque d'ordre des octets. */
const STRIPPED = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​‎‏‪-‮⁦-⁩﻿]/g;

const ONE_LINE = /\s+/g;

export const authorMessageGraphemes = (text: string): number => graphemesOf(text).length;

/** Le message tel que la plaque l'admet ; `null` : aucun message. */
export function authorMessageOf(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const clean = raw.normalize('NFC').replace(STRIPPED, '').replace(ONE_LINE, ' ').trim();
  if (clean.length === 0) return null;
  return graphemesOf(clean).slice(0, AUTHOR_MESSAGE_MAX_GRAPHEMES).join('').trimEnd();
}

/** Le message prêt à être peint : son sens d'écriture isolé du reste de la plaque (FSI … PDI). */
export const isolatedAuthorMessage = (message: string): string => `⁨${message}⁩`;

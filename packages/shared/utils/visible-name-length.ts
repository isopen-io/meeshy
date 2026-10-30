/**
 * La longueur d'un nom telle que le LECTEUR la voit (#13825, audit).
 *
 * `String.length` compte des unités UTF-16 : « É » saisi décomposé (E + accent
 * combinant) en fait deux, un caractère invisible ou de contrôle en ajoute un,
 * une balise vide en ajoute sept. Chacun de ces « A » passait la borne de 2 puis
 * était stocké « A » une fois nettoyé par la passerelle
 * (`SecuritySanitizer.sanitizeText`).
 *
 * La borne se mesure donc sur ce qui RESTE : balises retirées, invisibles et
 * caractères de contrôle retirés (la même liste que `sanitizeText`), forme NFC,
 * rognage, puis comptage des GRAPHÈMES (`Intl.Segmenter`) qui portent une
 * LETTRE, un CHIFFRE ou un ÉMOJI (pictogramme ou drapeau) — « É » vaut 1,
 * « 😀😀 » 2, une famille en émoji 1, « 🇫🇷🇨🇲 » 2 : un nom affiché d'émojis
 * est un nom que l'utilisateur VOIT. Un caractère de FORMAT (marque de
 * direction U+200E, gluon U+2060, trait d'union conditionnel U+00AD,
 * forçages U+202E/U+2066…) ou un REMPLISSAGE hangul
 * (U+115F, U+1160, U+3164, U+FFA0 — des « lettres » qui ne s'affichent pas)
 * ne comptent pas : « Aㅤ » ne fait pas un nom de 2.
 *
 * Module sans dépendance : les schémas (`validation-primitives.ts`) et la
 * dérivation des noms (`registration-identity.ts`) le citent sans se boucler.
 */

const MARKUP_TAG = /<[^>]*>/g;
const INVISIBLE_OR_CONTROL = /[​﻿\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F￹-￻]/g;

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Le texte qu'un nom laisse voir une fois nettoyé : ce que la passerelle stocke, au rognage près. */
export function visibleNameText(value: string): string {
  return value.replace(MARKUP_TAG, '').replace(INVISIBLE_OR_CONTROL, '').normalize('NFC').trim();
}

const HANGUL_FILLERS = /[\u115F\u1160\u3164\uFFA0]/gu;
const SEEN = /[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

/** Un graphème se VOIT s'il porte une lettre, un chiffre ou un émoji, remplissages hangul retirés. */
const isVisibleGrapheme = (grapheme: string): boolean => SEEN.test(grapheme.replace(HANGUL_FILLERS, ''));

/** Le nombre de graphèmes visibles d'une chaîne déjà nettoyée. */
export function visibleGraphemeCount(value: string): number {
  return Array.from(graphemes.segment(value), (part) => part.segment).filter(isVisibleGrapheme).length;
}

/** Combien de graphèmes VISIBLES porte ce nom. */
export function visibleNameLength(value: string): number {
  return visibleGraphemeCount(visibleNameText(value));
}

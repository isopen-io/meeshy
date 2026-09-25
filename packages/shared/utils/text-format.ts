/**
 * **POSER OU RETIRER UNE EMPHASE SUR UNE SÉLECTION** (#7849) — ce que font le
 * raccourci clavier et la barre de format du compositeur. Pure : elle prend un
 * texte et une sélection, rend un texte et la sélection qui suit.
 *
 * Les marqueurs sont EXACTEMENT ceux que `segmentText` lit
 * (`text-segments.ts`) : ce qu'on pose ici est ce que le rendu reconnaît.
 * Miroir iOS : `ComposerTextFormat` (`apps/ios/.../ComposerTextFormat.swift`).
 *
 * Trois gestes :
 *  - sélection vide ⇒ la paire est posée, le curseur ENTRE les deux ;
 *  - sélection déjà encadrée (dedans ou juste autour) ⇒ l'emphase est RETIRÉE ;
 *  - sinon ⇒ la sélection est encadrée, sans ses blancs de bord (une emphase
 *    qui s'ouvre ou se ferme sur un blanc n'en est pas une pour le rendu).
 */
import type { EmphasisStyle } from './text-segments.js';

export const EMPHASIS_MARKER = {
  bold: '**',
  italic: '*',
  underline: '__',
  strikethrough: '~~',
} as const satisfies Record<EmphasisStyle, string>;

export type FormatSelection = { readonly text: string; readonly start: number; readonly end: number };

const runOf = (text: string, from: number, step: 1 | -1, char: string): number => {
  let count = 0;
  for (let index = from; index >= 0 && index < text.length && text[index] === char; index += step) count += 1;
  return count;
};

/** L'italique ne se confond pas avec le gras : une étoile SEULE (ou trois, `***`) encadre. */
const hasOuterMarker = (text: string, start: number, end: number, marker: string): boolean => {
  const m = marker.length;
  if (start < m || text.slice(start - m, start) !== marker || text.slice(end, end + m) !== marker) return false;
  if (marker !== '*') return true;
  return runOf(text, start - 1, -1, '*') % 2 === 1 && runOf(text, end, 1, '*') % 2 === 1;
};

const hasInnerMarker = (selected: string, marker: string): boolean => {
  const m = marker.length;
  if (selected.length <= 2 * m || !selected.startsWith(marker) || !selected.endsWith(marker)) return false;
  if (marker !== '*') return true;
  return runOf(selected, 0, 1, '*') % 2 === 1 && runOf(selected, selected.length - 1, -1, '*') % 2 === 1;
};

export function toggleEmphasis(selection: FormatSelection, style: EmphasisStyle): FormatSelection {
  const marker = EMPHASIS_MARKER[style];
  const m = marker.length;
  const { text } = selection;
  const lo = Math.max(0, Math.min(selection.start, selection.end, text.length));
  const hi = Math.min(text.length, Math.max(selection.start, selection.end));

  if (lo === hi) {
    return { text: `${text.slice(0, lo)}${marker}${marker}${text.slice(lo)}`, start: lo + m, end: lo + m };
  }

  const leading = text.slice(lo, hi).length - text.slice(lo, hi).trimStart().length;
  const trailing = text.slice(lo, hi).length - text.slice(lo, hi).trimEnd().length;
  const start = lo + leading;
  const end = Math.max(start, hi - trailing);
  if (start === end) return { text, start: lo, end: hi };

  if (hasOuterMarker(text, start, end, marker)) {
    return {
      text: `${text.slice(0, start - m)}${text.slice(start, end)}${text.slice(end + m)}`,
      start: start - m,
      end: end - m,
    };
  }

  const selected = text.slice(start, end);
  if (hasInnerMarker(selected, marker)) {
    return {
      text: `${text.slice(0, start)}${selected.slice(m, -m)}${text.slice(end)}`,
      start,
      end: end - 2 * m,
    };
  }

  return {
    text: `${text.slice(0, start)}${marker}${selected}${marker}${text.slice(end)}`,
    start: start + m,
    end: end + m,
  };
}

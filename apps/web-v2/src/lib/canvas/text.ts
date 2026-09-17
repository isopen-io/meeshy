import { served, type Served } from '@/lib/api/prism';

import { hexColorCss } from './background';
import type { CanvasObject } from './document';

/**
 * LE PRISME D'UN OBJET TEXTE DE SCÈNE (#6898, § 9.1 de la spécification) —
 * `infra-1` (D-79, `src/lib/canvas/`) n'a pas atterri au démarrage de ce lot
 * (mesuré : `src/lib/canvas/` n'existait pas), donc CE lot écrit le contrat
 * sous le nom que D-79 lui donnait déjà.
 *
 * Miroir de `StoryTextObject.swift:419-429` : parcourt le prisme du lecteur
 * DANS L'ORDRE, sinon l'original — jamais `translations.first` (règle 1 du
 * Prisme, CLAUDE.md racine). `served()` (`lib/api/prism.ts`, D-14) porte déjà
 * cette descente ; ce module ne fait que la BRANCHER sur la forme d'un objet
 * canvas — `payload.translations` est une carte `{ langue: texte }` DÉJÀ
 * PLATE (contrairement à `Post.translations`), donc `served()` la reçoit
 * TELLE QUELLE, sans passer par `buildPostTranslationRecord`.
 */
export type ServedSceneText = Served & {
  readonly color: string;
  /** La taille du texte en FRACTION de la largeur de la scène rendue —
   * `fontSize` est posé dans le référentiel 1080 (`CanvasGeometry.designWidth`),
   * et le rendu le multiplie par la largeur réelle (`scaleFactor`). */
  readonly widthFraction: number;
};

/** `CanvasGeometry.designWidth` (`CanvasGeometry.swift:5`). */
const DESIGN_WIDTH = 1080;
/** Le défaut du décodeur iOS pour un texte sans `fontSize`
 * (`CanvasV3Migration.swift:877`). */
const DEFAULT_FONT_SIZE = 64;

const isPlainRecord = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringOf = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);

export function resolveSceneText(params: {
  readonly object: CanvasObject;
  readonly preferredLanguages: readonly string[];
}): ServedSceneText {
  const { object, preferredLanguages } = params;
  const { payload } = object;
  const original = stringOf(payload.text, '');
  const translations = isPlainRecord(payload.translations) ? payload.translations : {};

  const resolved = served({
    preferredLanguages,
    originalLanguage: object.locale,
    translations,
    original,
  });

  // §3.3.3 — le corpus texte-seul écrit `color`, iOS relit `textColor` :
  // le web lit les deux, `textColor` en tête.
  // Chaque valeur passe par `hexColorCss` : le corpus réel écrit « FFFFFF »
  // sans dièse, qu'un navigateur ignore en silence (#6899).
  const color = hexColorCss(payload.textColor) ?? hexColorCss(payload.color) ?? '#FFFFFF';

  const fontSize = typeof payload.fontSize === 'number' && payload.fontSize > 0 ? payload.fontSize : DEFAULT_FONT_SIZE;

  return { ...resolved, color, widthFraction: fontSize / DESIGN_WIDTH };
}

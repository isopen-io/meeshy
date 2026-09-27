/**
 * **LE CADRE D'UN MÉDIA DE FOND** (#8414, maquette plein écran règle 4 :
 * « chaque média garde son format ») — le SITE UNIQUE des constantes du
 * panneau Cadre, lu par le composer (qui les écrit) et par le lecteur (qui
 * peint les bandes d'un fond ajusté).
 *
 * Le contrat est COMMUN au web et à iOS, et vit dans le `transform` du
 * porteur de fond — le même objet qui porte déjà `videoFitMode`
 * (`background.ts`) :
 *  - `videoFitMode` : `"fit"` (Ajuster, le défaut depuis #8372) | `"fill"` ;
 *  - `backdrop` : ce qui se peint AUTOUR d'un média ajusté. Absent = `"blur"`
 *    (le média lui-même, flouté) ; les quatre autres sont des teintes pleines.
 *
 * Aucun consommateur hors du web (la passerelle transporte `storyEffects` en
 * `Json` sans le lire) : le module reste dans `lib/canvas`, pas dans
 * `packages/shared`.
 */
export const SCENE_FIT_MODES = ['fit', 'fill'] as const;
export type SceneFitMode = (typeof SCENE_FIT_MODES)[number];
export const DEFAULT_SCENE_FIT_MODE: SceneFitMode = 'fit';

export const SCENE_BACKDROPS = ['blur', 'black', 'white', 'indigo', 'sand'] as const;
export type SceneBackdrop = (typeof SCENE_BACKDROPS)[number];
export type SceneBackdropTint = Exclude<SceneBackdrop, 'blur'>;
export const DEFAULT_SCENE_BACKDROP: SceneBackdrop = 'blur';

export const SCENE_BACKDROP_TINT: Readonly<Record<SceneBackdropTint, string>> = {
  black: '#000000',
  white: '#F5F5F4',
  indigo: '#312E81',
  sand: '#FDE68A',
};

const oneOf = <T extends string>(table: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (table as readonly string[]).includes(value) ? (value as T) : fallback;

/** Une valeur du corpus (chaîne libre côté serveur) vers un fond CONNU — tout
 * le reste se relit comme l'absence : le flou. */
export const sceneBackdropOf = (value: unknown): SceneBackdrop => oneOf(SCENE_BACKDROPS, value, DEFAULT_SCENE_BACKDROP);

export const sceneFitModeOf = (value: unknown): SceneFitMode => oneOf(SCENE_FIT_MODES, value, DEFAULT_SCENE_FIT_MODE);

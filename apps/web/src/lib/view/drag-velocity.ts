/**
 * **LA FIN PROJETÉE D'UN GLISSÉ WEB** (#11198) — `predictedEndTranslation`
 * de SwiftUI n'a pas d'équivalent dans les événements de pointeur : elle se
 * calcule ici, pour tout glissé qui décide au relâcher sur l'élan du doigt
 * (le cube du lecteur de stories, `lib/stories/group-cube.ts`). Module à
 * part : le balayage commun des plein écrans (`viewer-chrome-gestures.ts`)
 * l'échantillonne sans emporter la géométrie du cube dans la visionneuse de
 * médias.
 */
export type DragSample = { readonly t: number; readonly x: number };

/** La fenêtre où la vitesse du relâcher se mesure. */
export const DRAG_VELOCITY_WINDOW_MS = 100;
/** L'horizon de la projection. */
export const DRAG_PROJECTION_MS = 200;

/**
 * La position au relâcher prolongée de la vitesse des
 * {@link DRAG_VELOCITY_WINDOW_MS} dernières millisecondes sur
 * {@link DRAG_PROJECTION_MS}. Choix documenté : un lancer de ~1 200 px/s sur
 * un téléphone de 390 px franchit la moitié depuis 10 % de course (le témoin
 * iOS `decide(-0.1, -0.7)`), et un doigt qui revient de plus de ~80 px/s
 * vers l'origine dépasse la tolérance au retour du cube (4 % de la largeur) —
 * il annule. Un doigt resté immobile avant de lever projette sa propre
 * position.
 */
export function predictedEndOf(samples: readonly DragSample[], translation: number): number {
  const last = samples[samples.length - 1];
  if (last === undefined) return translation;
  const first = samples.find((sample) => last.t - sample.t <= DRAG_VELOCITY_WINDOW_MS);
  if (first === undefined || last.t <= first.t) return translation;
  const velocity = (last.x - first.x) / (last.t - first.t);
  return translation + velocity * DRAG_PROJECTION_MS;
}

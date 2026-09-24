/**
 * `cqw` — un nombre EN FRACTION (0..1) vers une déclaration `Ncqw` (unité de
 * conteneur, `container-type: inline-size`, posé par `SceneCanvas`). Le
 * référentiel design 1080 se projette ainsi SANS mesure JS
 * (`scaleFactor = width/1080`, `CanvasGeometry.swift:26`).
 *
 * Arrondi à 4 décimales et les zéros de fin retirés — la même valeur
 * (`702/1080 × 100`) doit rendre EXACTEMENT `"65cqw"`, jamais
 * `"65.00000000000001cqw"` (l'erreur flottante d'une division), pour que les
 * témoins DOM comparent une chaîne STABLE.
 */
export function cqw(fraction: number): string {
  const value = Math.round(fraction * 100 * 10000) / 10000;
  return `${value}cqw`;
}

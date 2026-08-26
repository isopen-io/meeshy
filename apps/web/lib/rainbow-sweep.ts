/**
 * Miroir web de `RainbowSweep` (`packages/MeeshySDK/.../Models/RainbowSweep.swift`).
 *
 * L'effet `rainbow` ne fait plus tourner son spectre : les couleurs sont
 * POSÉES, et une comète les parcourt puis se repose. Le repos domine le cycle —
 * c'est ce qui distingue un effet qui ponctue d'un effet qui tourne en boucle et
 * que l'œil finit par subir.
 *
 * **Sources jumelles.** Swift pilote sa comète par `Shape.trim(from:to:)` et
 * `animatableData` ; le web par `stroke-dasharray` sur un tracé SVG déclaré
 * `pathLength="1"`, ce qui rend les fractions de périmètre directement
 * utilisables. Les mécaniques diffèrent, la COURSE décrite doit être la même —
 * `__tests__/lib/rainbow-sweep.test.ts` lit la source Swift et le CSS pour
 * l'exiger.
 *
 * Pourquoi le périmètre et non l'angle, des deux côtés : un `conic-gradient`
 * qui tourne balaie vite les côtés courts d'une bulle et lentement les longs.
 * La vitesse apparente du point chaud dépendrait de la longueur du message.
 */
export const RAINBOW_SWEEP = {
  /** Durée d'un cycle complet, en secondes — course puis repos. */
  cycle: 4.5,
  /** Part du cycle consacrée à la course. Le reste est du repos. */
  sweepFraction: 0.55,
  /** Longueur de la comète, en fraction du périmètre. */
  arcLength: 0.12,
  /** Part de la COURSE consacrée à l'allumage, et autant à l'extinction. */
  fadeFraction: 0.12,
} as const;

/**
 * Custom properties consommées par `.msg-fx-rainbow-comet` dans `globals.css`.
 *
 * Elles font de ce module la source SERVIE, et non une copie décorative que
 * personne ne lit : le CSS n'écrit en dur que les bornes de keyframes, qu'aucune
 * `var()` ne peut porter.
 */
export function rainbowCometStyle(): Record<string, string> {
  return {
    '--msg-fx-comet-arc': String(RAINBOW_SWEEP.arcLength),
    '--msg-fx-comet-gap': String(1 - RAINBOW_SWEEP.arcLength),
    '--msg-fx-comet-cycle': `${RAINBOW_SWEEP.cycle}s`,
  };
}

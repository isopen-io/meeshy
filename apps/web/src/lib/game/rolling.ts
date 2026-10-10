/**
 * LE CHIFFRE QUI ROULE (#9494, conception XIII.1) — « un gain de points fait
 * rouler le chiffre » : le total de la bannière défile de l'ancienne valeur à
 * la nouvelle au lieu de sauter. Fonction PURE du temps écoulé ; l'hôte
 * (`components/game/use-rolling-number.ts`) la pilote avec une image par
 * rafraîchissement et la coupe sous `prefers-reduced-motion`.
 */
export const ROLL_MS = 700;

/** Sortie rapide, arrivée douce : le chiffre freine en approchant de sa valeur. */
const easeOut = (t: number): number => 1 - (1 - t) ** 3;

export const rolledValue = (from: number, to: number, elapsedMs: number): number => {
  if (!Number.isFinite(elapsedMs)) return to;
  const t = Math.min(1, Math.max(0, elapsedMs / ROLL_MS));
  return Math.round(from + (to - from) * easeOut(t));
};

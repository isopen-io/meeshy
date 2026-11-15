/**
 * L'ÉPOQUE DU CATALOGUE DES CADRES (#10163, L10b) — un compteur que tout ce qui change l'étagère des packs
 * installés fait avancer (choisir son atmosphère installe son pack, § 5.12). La scène des cadres relit son
 * catalogue de session quand l'époque a bougé, et le déroulé qui montre un aperçu se réabonne : la première
 * photo après le choix se compose dans le cadre choisi, pas dans la carte simple d'un catalogue d'avant.
 *
 * Hors du dossier `glory/` à dessein : le déroulé s'y abonne par un import STATIQUE sans attirer le peintre
 * (chunk `glory_painter`, garde `glory/source-guard.test.ts`).
 */
let epoch = 0;
const listeners = new Set<() => void>();

export const gloryCatalogEpoch = (): number => epoch;

export const bumpGloryCatalogEpoch = (): void => {
  epoch += 1;
  listeners.forEach((listener) => listener());
};

export const subscribeGloryCatalogEpoch = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

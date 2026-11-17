/**
 * LE MOTIF D'UN GROUPE RADIO DU KIT (#18875). La flèche coche le voisin ET y porte le
 * focus : sans cela, la coche change mais le focus et la voix restent sur l'ancien rang.
 * Partagé par l'échelle de proximité (K33) et la piste du pas-à-pas (K53).
 */
export const focusKitRadio = (from: HTMLElement, index: number): void => {
  from.closest('[role="radiogroup"]')?.querySelectorAll<HTMLElement>('[role="radio"]')[index]?.focus();
};

/** Le clavier d'un groupe radio du kit : flèches pour le voisin (la gauche avance en RTL), Début et Fin pour les extrémités ; `from` vaut -1 sans rang coché. */
export const kitRadioKeyTarget = ({ key, from, lastIndex, isRtl }: { readonly key: string; readonly from: number; readonly lastIndex: number; readonly isRtl: boolean }): number | null => {
  const forward = isRtl ? 'ArrowLeft' : 'ArrowRight';
  const backward = isRtl ? 'ArrowRight' : 'ArrowLeft';
  if (key === forward || key === 'ArrowDown') return Math.min(from + 1, lastIndex);
  if (key === backward || key === 'ArrowUp') return Math.max(from - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return lastIndex;
  return null;
};

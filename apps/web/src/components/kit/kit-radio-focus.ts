/**
 * LE MOTIF D'UN GROUPE RADIO DU KIT (#18875). La flèche coche le voisin ET y porte le
 * focus : sans cela, la coche change mais le focus et la voix restent sur l'ancien rang.
 * Partagé par l'échelle de proximité (K33) et la piste du pas-à-pas (K53).
 */
export const focusKitRadio = (from: HTMLElement, index: number): void => {
  from.closest('[role="radiogroup"]')?.querySelectorAll<HTMLElement>('[role="radio"]')[index]?.focus();
};

/**
 * Le clavier d'un groupe radio du kit : flèches pour le voisin (la gauche avance en RTL), Début
 * et Fin pour les extrémités ; `from` vaut -1 sans rang coché. Un rang que `isSelectable` refuse
 * (éteint, verrouillé) est SAUTÉ : sans cela la flèche bute sur un bouton qui ne prend pas le
 * focus, et le rang suivant devient inatteignable. Sans voisin choisissable, la cible est `from`.
 */
export const kitRadioKeyTarget = ({ key, from, lastIndex, isRtl, isSelectable = () => true }: { readonly key: string; readonly from: number; readonly lastIndex: number; readonly isRtl: boolean; readonly isSelectable?: ((index: number) => boolean) | undefined }): number | null => {
  const forward = isRtl ? 'ArrowLeft' : 'ArrowRight';
  const backward = isRtl ? 'ArrowRight' : 'ArrowLeft';
  const selectable = Array.from({ length: Math.max(lastIndex + 1, 0) }, (_, index) => index).filter((index) => isSelectable(index));
  const stay = Math.min(Math.max(from, 0), Math.max(lastIndex, 0));
  if (key === forward || key === 'ArrowDown') return selectable.find((index) => index > from) ?? stay;
  if (key === backward || key === 'ArrowUp') return [...selectable].reverse().find((index) => index < from) ?? stay;
  if (key === 'Home') return selectable[0] ?? stay;
  if (key === 'End') return selectable[selectable.length - 1] ?? stay;
  return null;
};

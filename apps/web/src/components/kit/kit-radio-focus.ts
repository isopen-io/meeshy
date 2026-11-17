/**
 * LE MOTIF D'UN GROUPE RADIO DU KIT (#18875). La flèche coche le voisin ET y porte le
 * focus : sans cela, la coche change mais le focus et la voix restent sur l'ancien rang.
 * Partagé par l'échelle de proximité (K33) et la piste du pas-à-pas (K53).
 */
export const focusKitRadio = (from: HTMLElement, index: number): void => {
  from.closest('[role="radiogroup"]')?.querySelectorAll<HTMLElement>('[role="radio"]')[index]?.focus();
};

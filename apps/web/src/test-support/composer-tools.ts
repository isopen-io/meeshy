import { act } from 'react';

/**
 * OUVRIR LE MENU DU « + » (épure #18361, règle 6) — les quatre outils du composeur (éphémère, flou, vue unique,
 * effets) sont rangés derrière lui. Un témoin qui touche l'un d'eux l'ouvre comme le ferait la personne.
 */
export const OPEN_ATTACH_MENU = 'button[aria-label="Ouvrir le menu des pièces jointes"]';

export function openComposerTools(host: ParentNode): void {
  const plus = host.querySelector<HTMLButtonElement>(OPEN_ATTACH_MENU);
  if (plus !== null) act(() => plus.click());
}

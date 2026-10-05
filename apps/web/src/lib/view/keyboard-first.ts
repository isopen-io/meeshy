/**
 * LE CLAVIER PART D'ABORD (#8000, directive porteur 2026-09-26) — « lorsqu'on
 * défile le texte vers le haut, il faut cacher le clavier systématiquement
 * avant de faire disparaître le reste ».
 *
 * Deux lois pures, MIROIR mot pour mot de
 * `apps/ios/Meeshy/Features/Main/Focal/Core/KeyboardFirstScroll.swift` :
 *
 * - `dismissesKeyboard` — clavier ouvert et doigt qui tire vers les messages
 *   ANCIENS ⇒ le clavier se ferme. Vers les récents, il reste : on y écrit.
 * - `chromeMayCollapse` — un geste COMMENCÉ clavier ouvert ne replie RIEN
 *   d'autre, même une fois le clavier parti : ce premier défilement ne fait
 *   que fermer le clavier. Le repli (en-tête, composeur) n'appartient qu'au
 *   geste suivant, commencé clavier fermé.
 */

export type KeyboardDismissInput = {
  readonly keyboardOpen: boolean;
  readonly towardOlder: boolean;
};

export function dismissesKeyboard(input: KeyboardDismissInput): boolean {
  return input.keyboardOpen && input.towardOlder;
}

export type ChromeCollapseInput = {
  readonly keyboardOpenAtGestureStart: boolean;
  readonly keyboardOpen: boolean;
};

export function chromeMayCollapse(input: ChromeCollapseInput): boolean {
  return !input.keyboardOpenAtGestureStart && !input.keyboardOpen;
}

/**
 * ENTRÉE ET MÉTHODE DE SAISIE (#20752).
 *
 * Avec un clavier japonais, chinois ou coréen, Entrée CONFIRME le candidat de
 * conversion : un gestionnaire qui soumet sur tout `keydown` Entrée envoie le
 * texte au milieu d'un mot. `isComposing` le dit partout sauf sous Safari, qui
 * livre `compositionend` AVANT ce `keydown` (WebKit 165004) ; la touche y porte
 * encore `keyCode` 229, d'où les deux lectures.
 */
export type CompositionKeyEvent = { readonly isComposing: boolean; readonly keyCode?: number };

export type EnterKeyEvent = CompositionKeyEvent & { readonly key: string; readonly shiftKey: boolean };

export type EnterKeyIntent = 'submit' | 'composing' | 'none';

export const confirmsComposition = (event: CompositionKeyEvent): boolean => event.isComposing || event.keyCode === 229;

export const enterKeyIntent = (event: EnterKeyEvent, { multiline }: { readonly multiline: boolean }): EnterKeyIntent => {
  if (event.key !== 'Enter') return 'none';
  if (confirmsComposition(event)) return 'composing';
  return multiline && event.shiftKey ? 'none' : 'submit';
};

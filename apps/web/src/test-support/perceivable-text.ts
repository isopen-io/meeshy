/**
 * TOUT CE QU'UN UTILISATEUR PEUT LIRE OU ENTENDRE d'un fragment rendu (#6626) :
 * le texte, et les noms accessibles posés en attribut (`aria-label`, `title`).
 * Un mot retiré d'un `textContent` mais resté dans un `aria-label` serait encore
 * DIT à voix haute — un témoin de vocabulaire qui ne lirait que le texte
 * laisserait passer exactement ce cas.
 */
export function perceivableText(el: Element): string {
  const attributes = [...el.querySelectorAll('[aria-label], [title]')].flatMap((node) => [
    node.getAttribute('aria-label') ?? '',
    node.getAttribute('title') ?? '',
  ]);
  return [(el.textContent ?? '').replace(/\s+/gu, ' '), ...attributes].join(' ');
}

/** La note qu'un bouton (i) gouverne — lue par son `aria-controls`, jamais par
 * un sélecteur d'identifiant : `useId` rend des identifiants que `querySelector`
 * refuserait sans échappement. */
export function controlledBy(button: Element | null): HTMLElement | null {
  const id = button?.getAttribute('aria-controls');
  return id === null || id === undefined ? null : button?.ownerDocument.getElementById(id) ?? null;
}

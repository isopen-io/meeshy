import { useLayoutEffect, useState } from 'react';

/**
 * **L'HÔTE DE CE QUI DOIT RESTER TOUCHABLE AU-DESSUS D'UNE MODALE** (#10539).
 *
 * Un `<dialog>` ouvert par `showModal()` rend INERTE tout ce qui n'est pas son
 * descendant et se peint dans la couche supérieure du navigateur : la bannière
 * in-app, portée par `<body>`, passait dessous — ni visible, ni touchable. Aucun
 * `z-index` n'y change rien. Deux lois du navigateur la sortent de là, ensemble :
 * un DESCENDANT de la modale n'est pas inerte, et un `popover` montré se peint
 * dans la couche supérieure, hors du cadre, du rognage et des transformations de
 * son parent. La bannière vit donc DANS la modale du dessus, en `popover`.
 *
 * Contrairement à l'appel (`use-call-presentation.ts`), elle ne s'ouvre pas en
 * modale elle-même : elle volerait le focus du champ qu'on remplit et rendrait
 * la feuille inerte à chaque message reçu.
 *
 * Sans modale — ou quand c'est l'appel qui tient la couche supérieure — l'hôte
 * reste `<body>`, et rien ne change. De même sur un navigateur sans API
 * Popover : c'est aussi elle qui garantit `:modal`, qu'on n'interroge pas sans.
 */
export function topModalHost(): HTMLElement {
  const modals = [...document.querySelectorAll<HTMLElement>('dialog:modal')];
  return modals.some((dialog) => dialog.hasAttribute('data-call-stage')) ? document.body : (modals.pop() ?? document.body);
}

type Carrier = HTMLElement & { showPopover?: () => void };

function follow(carrier: Carrier): void {
  const host = carrier.showPopover === undefined ? document.body : topModalHost();
  if (carrier.parentElement === host) return;
  carrier.popover = host === document.body ? null : 'manual';
  host.appendChild(carrier);
  if (carrier.popover !== null) carrier.showPopover?.();
}

/* La feuille de style du navigateur donne à un `popover` une bordure, une marge
   intérieure et la couleur du système : le porteur n'en veut pas — son contenu
   est `fixed`, sa boîte reste vide. */
function createCarrier(): HTMLElement {
  const carrier = document.createElement('div');
  carrier.style.cssText = 'border:0;padding:0;color:inherit';
  return carrier;
}

/** Le porteur d'un portail qui SUIT la modale du dessus, sans démonter son contenu. */
export function useTopModalHost(): HTMLElement {
  const [carrier] = useState(createCarrier);

  useLayoutEffect(() => {
    const sync = () => follow(carrier);
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, attributeFilter: ['open'] });
    return () => {
      observer.disconnect();
      carrier.remove();
    };
  }, [carrier]);

  return carrier;
}

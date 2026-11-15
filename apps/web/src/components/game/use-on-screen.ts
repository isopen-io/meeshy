import { useCallback, useEffect, useState } from 'react';

/**
 * « À L'ÉCRAN ? » (#9381) — une animation qui boucle sans fin ne coûte rien
 * tant qu'on la regarde et coûte de la batterie dès qu'on ne la regarde plus :
 * la Flamme vacille toujours, même scrollée hors de l'écran ou sous un autre
 * écran empilé. Le navigateur dit, par un `IntersectionObserver`, si l'élément
 * touche la fenêtre ; l'hôte pose alors `data-game-offscreen` et la feuille
 * (`styles/game.css`) met l'animation en pause.
 *
 * Sans observateur (rendu serveur, vieux moteur), l'élément est tenu pour
 * VISIBLE : on garde l'animation plutôt que de la perdre en silence. La cible
 * arrive par une réf de RAPPEL (état), comme `use-out-of-view.ts` : un élément
 * qui quitte puis revient dans l'arbre est ré-observé.
 */
export function useOnScreen(): { readonly observe: (node: Element | null) => void; readonly visible: boolean } {
  const [target, setTarget] = useState<Element | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (target === null || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry !== undefined) setVisible(entry.isIntersecting);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [target]);

  const observe = useCallback((node: Element | null) => setTarget(node), []);
  return { observe, visible };
}

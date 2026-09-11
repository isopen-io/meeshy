import { useEffect, useRef } from 'react';

/**
 * LE RETOUR MATÉRIEL CONSOMME LA COUCHE MODALE, PAS L'ÉCRAN (#5555, puis
 * généralisé revue #5814, défaut majeur 6) — extrait de `components/
 * sheet.tsx` pour que TOUTE couche modale future (feuille, menu, visionneuse
 * de média) partage la MÊME loi plutôt que d'en réécrire une jumelle, comme
 * le suivi le demandait : « elle mérite d'être écrite UNE fois, dans le
 * socle des surfaces modales, jamais dans `message-menu.tsx` seul. »
 *
 * `MessageMenu` est la PREMIÈRE couche NON-`<dialog>` à l'utiliser — mesuré
 * manquante sur l'AVD `Meeshy_Poc_Web-v31` (`AND-9-back-depuis-menu.png`) :
 * menu ouvert, un appui BACK quittait le FIL (avec historique) ou
 * L'APPLICATION (sans historique), le menu disparaissant avec l'écran plutôt
 * qu'à cause de lui.
 *
 * MÊME MÉCANIQUE que `Sheet` : pose une entrée d'historique (même URL — le
 * routeur la voit identique et ne re-rend rien, `router.tsx` § `notify`) au
 * montage, se ferme sur `popstate` — le retour CONSOMME donc cette entrée
 * au lieu de quitter l'écran. Fermée autrement (Échap, un clic hors-menu,
 * une action choisie), elle REND son entrée (`history.back()`) pour qu'un
 * retour ULTÉRIEUR ne soit pas avalé à la place.
 */
export function useBackDismiss(onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    window.history.pushState(null, '');
    let consumedByHistory = false;
    const onPopState = () => {
      consumedByHistory = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      if (!consumedByHistory) window.history.back();
    };
  }, []);
}

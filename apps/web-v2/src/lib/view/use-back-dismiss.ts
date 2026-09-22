import { useEffect, useLayoutEffect, useRef } from 'react';

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
 *
 * **ELLE NE REND QUE SA PROPRE ENTRÉE** (#6313). Une couche fermée PARCE
 * QU'UNE ACTION A NAVIGUÉ — un barreau de l'échelle flottante pousse sa
 * destination puis referme l'échelle — n'est plus l'entrée courante :
 * reculer d'une entrée défaisait la navigation elle-même (mesuré : `/notifications`
 * poussée, `/` rendue, sur `dev` comme sur la branche de #6288). L'entrée
 * posée porte donc une MARQUE, et le retour n'a lieu que si l'historique est
 * encore dessus. Le prix, assumé : après une telle navigation, l'entrée de la
 * couche reste sous la destination, et un retour y ramène l'écran d'origine —
 * exactement ce qu'on quittait.
 *
 * **L'ENTRÉE EST POSÉE DANS LE COMMIT QUI INSÈRE LA COUCHE** (#6319). Un effet
 * passif la posait APRÈS la peinture (Preact : un `requestAnimationFrame`
 * puis un `setTimeout`) : dans l'intervalle, la couche était VISIBLE et un
 * retour ne trouvait aucune entrée à consommer — il quittait le fil (mesuré
 * en CI : `URL blank`, trois têtes de dev sur neuf). L'effet de mise en page
 * s'exécute avant que le navigateur ne rende la main : aucune image ne montre
 * la couche sans que le retour lui appartienne.
 *
 * **UNE COUCHE OUVERTE PAR LE GESTE QUI EN FERME UNE AUTRE ADOPTE SON ENTRÉE**
 * (#7415). « Plus… » dans le menu d'un message : le menu se ferme et la
 * feuille s'ouvre dans le MÊME commit. Le nettoyage du menu appelait
 * `history.back()` sur-le-champ ; ce recul est ASYNCHRONE, et son `popstate`
 * arrivait après que la feuille avait posé son entrée — elle le prenait pour
 * un retour matériel et se refermait une milliseconde après s'être ouverte
 * (mesuré dans Chromium). Le recul part donc au tour de micro-tâche qui suit
 * le commit : une couche montée DANS ce commit trouve l'entrée encore
 * courante, la reprend à son nom (`replaceState`) et annule le recul. Aucune
 * entrée n'est ajoutée ni perdue, et le retour matériel ferme bien la
 * nouvelle couche. Sans adoption, le recul part comme avant.
 */
let nextMarker = 0;

/** Les entrées RENDUES par une couche fermée, dont le recul attend la fin du commit. */
const pendingReleases = new Set<string>();

function carriesMarker(state: unknown, marker: string): boolean {
  return typeof state === 'object' && state !== null && (state as { readonly backDismiss?: unknown }).backDismiss === marker;
}

export function useBackDismiss(onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    nextMarker += 1;
    const marker = `back-dismiss-${nextMarker}`;
    const released = [...pendingReleases].find((candidate) => carriesMarker(window.history.state, candidate));
    if (released === undefined) {
      window.history.pushState({ backDismiss: marker }, '');
    } else {
      pendingReleases.delete(released);
      window.history.replaceState({ backDismiss: marker }, '');
    }
    let consumedByHistory = false;
    const onPopState = () => {
      consumedByHistory = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      if (consumedByHistory || !carriesMarker(window.history.state, marker)) return;
      pendingReleases.add(marker);
      queueMicrotask(() => {
        if (!pendingReleases.delete(marker)) return;
        if (carriesMarker(window.history.state, marker)) window.history.back();
      });
    };
  }, []);
}

import { useCallback, useEffect, useState, type RefObject } from 'react';

import { resolveOutOfView } from './out-of-view';

export type UseOutOfViewParams = {
  /** La fenêtre de référence — le scrollport. `null` ⇒ le viewport. */
  readonly root: RefObject<Element | null>;
  readonly revealRatio: number;
  readonly releaseRatio: number;
};

export type OutOfView = {
  readonly pinned: boolean;
  /**
   * À poser sur la CIBLE observée (`ref={observe}`). Identité STABLE : React
   * ne la détache ni ne la rattache d'un rendu à l'autre.
   */
  readonly observe: (node: Element | null) => void;
};

/**
 * `useOutOfView` — DÉLÈGUE l'observation au navigateur, jamais à un
 * écouteur `scroll` maison (#6103).
 *
 * `LentilleSceneActivity`/`useScene` lit `scrollTop` à la main PARCE QUE la
 * perspective a besoin d'une VALEUR CONTINUE (la distance à la bande de
 * focus, à chaque image). Ici la question est BINAIRE — « le grand rail
 * est-il sorti ? » — et c'est exactement ce qu'un `IntersectionObserver`
 * calcule nativement, sans jamais forcer de recalcul de mise en page sur le
 * thread principal à chaque `scroll` : le navigateur ne notifie QUE quand le
 * ratio de visibilité franchit l'un des `threshold` déclarés, au rythme de
 * son choix (souvent hors du thread principal).
 *
 * **LA CIBLE ARRIVE PAR UNE RÉF DE RAPPEL, JAMAIS PAR UN `RefObject`, et
 * c'est la correction de revue de ce lot.** La première forme prenait
 * `target: RefObject<Element>` et listait `target.current` dans les
 * dépendances de l'effet. Un `RefObject` ne DÉCLENCHE aucun rendu quand il
 * change, et les dépendances sont évaluées PENDANT le rendu, donc avant que
 * React n'ait (ré)assigné les réfs : ce que l'effet observe et ce que la
 * liste de dépendances DIT observer ne sont jamais la même chose.
 *
 * LE DÉFAUT MESURÉ (témoin « la cible qui DISPARAÎT relâche la bande ») —
 * la cible peut QUITTER le DOM : `StoryRail` ne peint rien quand son
 * corpus visible est vide (échec à cache vide, dernière conversation
 * archivée). Rien, dans la forme livrée, ne RELÂCHAIT alors `pinned` : il
 * restait `true` sur un souvenir. L'en-tête effaçait donc son titre
 * (`opacity: 0`, `aria-hidden`) pendant que la bande censée le remplacer ne
 * peignait rien non plus, faute de conversations — **un en-tête VIDE, sans
 * titre ni bande.** Mesuré sur le code livré : `pinned = true` après le
 * démontage de la cible.
 *
 * (Le remontage, lui, se rattrapait par accident : les dépendances passaient
 * de `[ancienNœud, …]` au rendu du démontage à `[null, …]` à celui du
 * remontage, ce qui rejouait l'effet. Un rattrapage qui tient à l'ordre des
 * commits, pas à la règle — la réf de rappel le rend structurel.)
 *
 * Une réf de RAPPEL traverse l'état (`useState`) : elle rend, donc l'effet
 * voit la cible réelle de chaque commit — présente, absente, ou remplacée.
 * Et l'absence de cible RELÂCHE la bande, au lieu de la figer sur un souvenir.
 *
 * `root`, lui, reste un `RefObject` : c'est le scrollport, monté en
 * PERMANENCE (voir le doc-comment de `ListError`, `routes/conversations.tsx`)
 * et toujours commité avant la cible qu'il contient — son identité d'objet
 * est stable, donc une dépendance saine.
 *
 * Un SEUL observateur, posé au montage de la cible et sur tout changement de
 * seuil ; jamais recréé à chaque frappe de défilement.
 */
export function useOutOfView({ root, revealRatio, releaseRatio }: UseOutOfViewParams): OutOfView {
  const [target, setTarget] = useState<Element | null>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (target === null) {
      setPinned(false);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry === undefined) return;
        setPinned((current) =>
          resolveOutOfView({ pinned: current, visibleRatio: entry.intersectionRatio, revealRatio, releaseRatio }),
        );
      },
      { root: root.current, threshold: [revealRatio, releaseRatio] },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [target, root, revealRatio, releaseRatio]);

  const observe = useCallback((node: Element | null) => {
    setTarget(node);
  }, []);

  return { pinned, observe };
}

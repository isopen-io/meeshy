import { useEffect } from 'react';

import { focalLoupeScale } from '@/lib/reading-mode/election';

/**
 * LA LOUPE DU MESSAGE DÉPLIÉ (#8147) — pose `transform: scale(…)` sur le
 * contenu d'un message long déplié (`unfold-stage.tsx`), la retire sinon. Son
 * verre reste à sa taille : la loupe s'écrête à sa marge verticale
 * (`fixedGlass`). L'ÉLU de la scène du Fil a désormais son propre cadre, qui
 * grandit avec son contenu (`use-focus-frame.ts`, #8506).
 *
 * **Pourquoi ce n'est PAS l'écriture continue que `reading-mode/scene.ts`
 * interdit** (règle 3 de son doc-comment de tête). Ce que cette règle retire
 * est la COURBE : un calcul rejoué à CHAQUE frame de défilement, sur TOUTES
 * les rangées visibles, fonction de leur distance à la ligne de focus. Ce
 * hook-ci écrit UNE fois par CHANGEMENT D'ÉLECTION (`isFocused`), sur UNE
 * seule rangée (celle qui vient d'être élue, ou celle qui vient de cesser de
 * l'être) — le même ordre de grandeur que `data-elected`/`data-scene`, des
 * écritures DISCRÈTES sur événement, jamais un calcul par image. Miroir
 * `FocalScrollPerspective.magnify(cell.contentView.layer, isFocused:)`
 * (`MessageListViewController.swift:3423`), qui pose la loupe sur la cellule
 * élue exactement de la même façon — un événement, une écriture.
 *
 * **La mesure ignore tout `transform` déjà posé.** `offsetWidth`/`offsetHeight`
 * sont la boîte de MISE EN PAGE de l'élément — `transform` ne la change
 * jamais (seul `getBoundingClientRect()` la reflèterait, gonflée par le
 * `scale` déjà appliqué) : mesurer avec `getBoundingClientRect()` après une
 * première pose ferait grandir le gain à chaque ré-observation. Même
 * discipline que `layer.bounds.size` côté iOS, qui ignore `layer.transform`.
 *
 * `ResizeObserver` REMPLACE une lecture par frame : la rangée élue peut
 * changer de hauteur pendant qu'elle est élue (un média s'y charge), et
 * l'écrêtage doit suivre — mais l'observateur ne réagit QUE sur un
 * redimensionnement réel de CETTE rangée, jamais à chaque image de
 * défilement.
 *
 * **AUCUNE transition CSS sur ce `transform` — et ce n'est pas un oubli.**
 * Une première version posait `transition: transform 250ms ease-out` (le
 * même tempo que l'entrée en scène iOS, `Scene.enterDuration`) : cliquer un
 * drapeau de `.focus-strip` de l'élue faisait alors SAUTER le défilement de
 * plus d'un millier de pixels, RÉÉLISANT une rangée à quinze rangs de là —
 * witness `check-reading-mode.mjs` (« cliquer un contrôle de la bande de
 * focus ne déplace JAMAIS l'élection »). Mesuré en isolant chaque variable :
 * ni `focalLoupeScale` seule (transform posé, pas de transition), ni la
 * transition seule (transition posée, `transform` gardé à l'identité) ne le
 * reproduit — seule la COMBINAISON (une transition active sur un `transform`
 * NON identité) le déclenche, dans CETTE liste virtualisée précisément (le
 * défileur y ajuste `scrollTop` à la mesure de chaque rangée, `@tanstack/
 * react-virtual`). Le mécanisme exact (ancrage de défilement du navigateur
 * pendant une transition) n'a pas été isolé plus loin ; la CONSÉQUENCE,
 * elle, est nette et reproductible. La loupe reste donc posée SANS
 * transition — un saut net à l'élection plutôt qu'un fondu, un compromis
 * assumé tant que la cause précise n'est pas éclaircie plus avant (suivi :
 * ouvrir une issue si l'animation devient un besoin produit exprimé).
 */
export function useFocalLoupe(row: { current: HTMLElement | null }, isFocused: boolean): void {
  useEffect(() => {
    const element = row.current;
    if (element === null) return;

    const reducedMotion =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const apply = () => {
      const scale = focalLoupeScale({
        isFocused,
        reducedMotion,
        width: element.offsetWidth,
        height: element.offsetHeight,
        fixedGlass: true,
      });
      element.style.transform = scale === 1 ? '' : `scale(${scale})`;
    };

    apply();

    if (!isFocused || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [row, isFocused]);
}

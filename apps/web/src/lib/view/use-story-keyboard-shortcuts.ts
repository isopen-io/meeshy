import { useEffect } from 'react';

import { screenGestureYields, shortcutYieldsToTarget } from '@/lib/view/shortcut-scope';

/**
 * **LES RACCOURCIS CLAVIER DU LECTEUR** (#7116, extraction hors budget) —
 * EXTRAIT de `routes/story.tsx` (§ périmètre de la spécification, déjà à
 * 996 lignes avant ce lot) : une extraction PURE, aucun comportement
 * observable ne change — même motif que `use-comments-sheet-host.ts`.
 *
 * `layerOpen` couvre DÉSORMAIS la feuille de commentaires ET la feuille
 * « Vues » (#7116) : ni l'une ni l'autre ne porte de champ de saisie, mais la
 * loi du doigt (`screenGestureYields`) veut la MÊME cession pour toute
 * couche qui recouvre la scène — une flèche tapée pendant que « Vues » est
 * ouverte ne doit pas faire avancer la story sous la feuille.
 */
export function useStoryKeyboardShortcuts(params: {
  readonly advance: (direction: 'previous' | 'next') => void;
  readonly paused: boolean;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly closeViewer: () => void;
  readonly showsSound: boolean;
  readonly onToggleMute: () => void;
  readonly layerOpen: boolean;
}): void {
  const { advance, paused, pause, resume, closeViewer, showsSound, onToggleMute, layerOpen } = params;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* ÉCHAP D'ABORD, ET SANS CONDITION : fermer depuis un champ reste juste,
         et la feuille de commentaires, qui veut le garder pour elle,
         l'intercepte en phase de CAPTURE (`story-comments-sheet.tsx`). */
      if (e.key === 'Escape') {
        closeViewer();
        return;
      }
      /* LE RESTE APPARTIENT AU NŒUD QUI A LE FOCUS, TOUCHE PAR TOUCHE
         (`lib/view/shortcut-scope.ts`, D-91). Sans cette cession, mesuré au
         navigateur : « a b » tapé dans le composeur de commentaire rendait
         « ab » (le raccourci de pause avalait l'espace), une flèche pendant
         la frappe faisait avancer la story — ce qui ferme la feuille et
         emporte le brouillon — et Espace n'activait AUCUN bouton du lecteur,
         le `click` d'un `<button>` naissant d'un `keyup` que le
         `preventDefault` ci-dessous supprimait. La cession est FINE : un
         bouton ne réclame qu'Espace et Entrée, sinon cliquer « muet » (ce
         qui le focalise) figerait les flèches jusqu'au clic suivant. */
      if (shortcutYieldsToTarget({ target: e.target, key: e.key })) return;
      /* Feuille ouverte (commentaires OU vues) : ses touches ne pilotent pas
         la story recouverte — la loi du doigt (`screenGestureYields`),
         appliquée au clavier (revue #6484, étendue #7116). */
      if (screenGestureYields({ target: e.target, layerOpen })) return;
      if (e.key === 'ArrowLeft') advance('previous');
      else if (e.key === 'ArrowRight') advance('next');
      else if (e.key === ' ') {
        e.preventDefault();
        if (paused) resume();
        else pause();
      } else if (e.key === 'm' || e.key === 'M') {
        if (showsSound) onToggleMute();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, paused, pause, resume, closeViewer, showsSound, onToggleMute, layerOpen]);
}

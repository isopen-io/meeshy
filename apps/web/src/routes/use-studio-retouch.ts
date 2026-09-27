import { useState } from 'react';

import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import type { StudioPage } from '@/lib/stories/studio-page';
import type { StudioRetouchDeps } from '@/lib/stories/studio-retouch';

/**
 * **LA RETOUCHE D'UNE IMAGE DU FIL** (#8416, miroir
 * `ConversationImageSceneDoor.swift`) — le MÊME studio, semé de l'image en
 * attente du composeur de message, réduit à ce qui PEINT : pas d'audience, pas
 * de formats, pas d'Animé, pas de nouvelle scène, pas de son ni de
 * description ; le socle ne porte que « Terminé », qui rend le composite
 * (`renderStudioRetouch`) à l'hôte. Rien n'est envoyé ni téléversé.
 */
export type StudioRetouch = {
  readonly file: File;
  readonly onDone: (file: File) => void;
  readonly onCancel: () => void;
  /** Injectable pour les témoins ; la production peint un canvas hors écran. */
  readonly render?: StudioRetouchDeps;
};

/** Le magasin d'une retouche : EN MÉMOIRE, jamais le brouillon de story. */
export const RETOUCH_DRAFTS = createStudioDraftStore(null);

/** « TERMINÉ » (#8416) — le composite à la taille réelle remplace la pièce
 * jointe chez l'hôte ; le rendu se charge à la demande, hors du chunk du
 * studio. Un rendu impossible le DIT (`retouchFailed`), sans rien rendre. */
export function useStudioRetouchFinish(retouch: StudioRetouch | undefined, currentPage: () => StudioPage) {
  const [finishing, setFinishing] = useState(false);
  const [retouchFailed, setRetouchFailed] = useState(false);
  const finishRetouch = async () => {
    if (retouch === undefined || finishing) return;
    setFinishing(true);
    setRetouchFailed(false);
    const { renderStudioRetouch, browserRetouchDeps, retouchedFileName } = await import('@/lib/stories/studio-retouch');
    const blob = await renderStudioRetouch(currentPage(), retouch.render ?? browserRetouchDeps);
    setFinishing(false);
    if (blob === null) {
      setRetouchFailed(true);
      return;
    }
    retouch.onDone(new File([blob], retouchedFileName(retouch.file.name), { type: 'image/jpeg' }));
  };
  return { finishing, retouchFailed, finishRetouch };
}

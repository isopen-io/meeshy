import { useState } from 'react';

import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import type { StudioRetouchVideoDeps } from '@/lib/stories/studio-retouch-video';
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
  /** La pièce à retoucher — `null` : LA CAMÉRA DE LA BARRE (#9123, miroir
   * `ConversationCaptureSceneEditor`), le studio s'ouvre VIDE, viseur armé. */
  readonly file: File | null;
  readonly onDone: (file: File) => void;
  readonly onCancel: () => void;
  /** Injectable pour les témoins ; la production peint un canvas hors écran. */
  readonly render?: StudioRetouchDeps;
  /** Injectable pour les témoins ; la production prend le moteur navigateur. */
  readonly camera?: CameraEngine;
  /** Injectable pour les témoins ; la production enregistre un canvas (#9124). */
  readonly renderVideo?: StudioRetouchVideoDeps;
};

/** Le magasin d'une retouche : EN MÉMOIRE, jamais le brouillon de story. */
export const RETOUCH_DRAFTS = createStudioDraftStore(null);

/** « TERMINÉ » (#8416) — le composite à la taille réelle remplace la pièce
 * jointe chez l'hôte ; le rendu se charge à la demande, hors du chunk du
 * studio. Un rendu impossible le DIT (`retouchFailed`), sans rien rendre. */
export function useStudioRetouchFinish(retouch: StudioRetouch | undefined, currentPage: () => StudioPage, taken: () => File | null) {
  const [finishing, setFinishing] = useState(false);
  const [retouchFailed, setRetouchFailed] = useState(false);
  const finishRetouch = async () => {
    if (retouch === undefined || finishing) return;
    setFinishing(true);
    setRetouchFailed(false);
    const original = retouch.file ?? taken();
    const { studioRetouchReturn, renderedImage, renderedVideo } = await import('@/lib/stories/studio-retouch-finish');
    const decision = studioRetouchReturn({ capturing: retouch.file === null, page: currentPage(), original });
    if (decision === 'cancel') {
      setFinishing(false);
      return retouch.onCancel();
    }
    if (decision === 'return-original' && original !== null) {
      setFinishing(false);
      return retouch.onDone(original);
    }
    const file = decision === 'render-video' ? await renderedVideo(retouch, currentPage(), original) : await renderedImage(retouch, currentPage(), original);
    setFinishing(false);
    if (file === null) {
      setRetouchFailed(true);
      return;
    }
    retouch.onDone(file);
  };
  return { finishing, retouchFailed, finishRetouch };
}


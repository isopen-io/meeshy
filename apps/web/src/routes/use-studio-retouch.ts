import { useState } from 'react';

import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import { isStudioPageEmpty, type StudioPage } from '@/lib/stories/studio-page';
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
};

/** Ce que « Terminé » rend (miroir `ComposerReturnMedia.action`) : la
 * retouche d'une pièce rend le composite ; la caméra rend la prise INTACTE
 * telle quelle (pleine définition), un studio resté vide n'a rien à rendre. */
export type StudioRetouchReturn = 'render' | 'return-capture' | 'cancel';

export function studioRetouchReturn({
  capturing,
  page,
  taken,
}: {
  readonly capturing: boolean;
  readonly page: StudioPage;
  readonly taken: File | null;
}): StudioRetouchReturn {
  if (!capturing) return 'render';
  if (taken !== null && capturedPageUntouched(page, taken)) return 'return-capture';
  return isStudioPageEmpty(page) ? 'cancel' : 'render';
}

function capturedPageUntouched(page: StudioPage, taken: File): boolean {
  const background = page.background;
  return (
    background !== null &&
    background.file === taken &&
    background.frame === undefined &&
    background.filter === undefined &&
    page.overlay === null &&
    page.texts.every((layer) => layer.text.trim() === '')
  );
}

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
    const prise = taken();
    const decision = studioRetouchReturn({ capturing: retouch.file === null, page: currentPage(), taken: prise });
    if (decision === 'cancel') return retouch.onCancel();
    if (decision === 'return-capture' && prise !== null) return retouch.onDone(prise);
    setFinishing(true);
    setRetouchFailed(false);
    const { renderStudioRetouch, browserRetouchDeps, retouchedFileName } = await import('@/lib/stories/studio-retouch');
    const blob = await renderStudioRetouch(currentPage(), retouch.render ?? browserRetouchDeps);
    setFinishing(false);
    if (blob === null) {
      setRetouchFailed(true);
      return;
    }
    retouch.onDone(new File([blob], retouchedFileName((retouch.file ?? prise)?.name ?? 'photo.jpg'), { type: 'image/jpeg' }));
  };
  return { finishing, retouchFailed, finishRetouch };
}

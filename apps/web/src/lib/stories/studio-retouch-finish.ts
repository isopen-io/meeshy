import { isStudioPageEmpty, studioPageVideo, type StudioPage } from './studio-page';
import type { StudioRetouch } from '@/routes/use-studio-retouch';

/** **CE QUE « TERMINÉ » REND** (#9123, #9124 — miroir
 * `ComposerReturnMedia.action`), chargé au toucher, hors du chunk du studio : une
 * pièce que l'hôte n'a pas encore (la prise de la caméra) repart TELLE QUELLE
 * si l'auteur n'y a pas touché ; une VIDÉO en attente intacte reste en place
 * (#9124) ; un studio vide n'a rien à rendre ; sinon la scène se rend — en
 * vidéo dès qu'elle en porte une, en image sinon. */
export type StudioRetouchReturn = 'render-image' | 'render-video' | 'return-original' | 'cancel';

export function studioRetouchReturn({
  capturing,
  page,
  original,
}: {
  readonly capturing: boolean;
  readonly page: StudioPage;
  /** Le fichier d'ORIGINE : la prise (caméra) ou la pièce retouchée. */
  readonly original: File | null;
}): StudioRetouchReturn {
  const untouched = original !== null && capturedPageUntouched(page, original);
  const hasVideo = studioPageVideo(page) !== null;
  if (capturing && untouched) return 'return-original';
  if (capturing && isStudioPageEmpty(page)) return 'cancel';
  if (!capturing && untouched && hasVideo) return 'cancel';
  return hasVideo ? 'render-video' : 'render-image';
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


export async function renderedImage(retouch: StudioRetouch, page: StudioPage, original: File | null): Promise<File | null> {
  const { renderStudioRetouch, browserRetouchDeps, retouchedFileName } = await import('@/lib/stories/studio-retouch');
  const blob = await renderStudioRetouch(page, retouch.render ?? browserRetouchDeps);
  return blob === null ? null : new File([blob], retouchedFileName(original?.name ?? 'photo.jpg'), { type: 'image/jpeg' });
}

export async function renderedVideo(retouch: StudioRetouch, page: StudioPage, original: File | null): Promise<File | null> {
  const { renderStudioRetouchVideo, browserRetouchVideoDeps, retouchedVideoFileName } = await import('@/lib/stories/studio-retouch-video');
  const rendered = await renderStudioRetouchVideo(page, retouch.renderVideo ?? browserRetouchVideoDeps);
  if (rendered === null) return null;
  return new File([rendered.blob], retouchedVideoFileName(original?.name ?? 'video', rendered.mimeType), { type: rendered.mimeType });
}

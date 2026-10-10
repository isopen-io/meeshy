import { currentCredential } from '@/lib/api/client';
import { attachmentSrc } from '@/lib/api/media-url';
import type { Attachment } from '@/lib/api/types';
import { currentGallerySaver } from '@/lib/gallery/gallery-saver';
import { saveToGallery } from '@/lib/gallery/save-to-gallery';
import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { browserFileDeliveryHost } from '@/lib/media/file-delivery-host';

/**
 * ENREGISTRER UNE PIÈCE (#6303 ; extrait de `viewer-media-actions.tsx` au
 * #9908) — la visionneuse ET le menu d'une pièce (appui long dans le fil) en
 * sont les deux portes : une seule écriture du téléchargement, de la galerie
 * et du repli « fichier ».
 */
export type NoticeKey = Extract<
  InterfaceCatalogKey,
  | 'media.viewer.saved'
  | 'media.viewer.save_failed'
  | 'media.viewer.offline'
  | 'media.viewer.retry'
  | 'media.viewer.react_failed'
  | 'media.viewer.react_limit'
  | 'media.viewer.compose_failed'
>;

type Fetched = { readonly status: 'ready'; readonly blob: Blob; readonly fileName: string } | { readonly status: 'failed'; readonly notice: NoticeKey };

export async function fetchPiece(attachment: Attachment): Promise<Fetched> {
  const { downloadFile } = await import('@/lib/media/download-file');
  const result = await downloadFile({
    url: attachmentSrc(attachment.fileUrl),
    fallbackMediaId: attachment.id,
    deps: { fetchImpl: (input, init) => fetch(input, init), credential: currentCredential },
    onProgress: () => undefined,
  });
  if (result.status === 'ready') {
    return { status: 'ready', blob: result.blob, fileName: attachment.originalName !== '' ? attachment.originalName : result.fileName };
  }
  return { status: 'failed', notice: result.status === 'offline' ? 'media.viewer.offline' : 'media.viewer.save_failed' };
}

export async function savePiece(attachment: Attachment): Promise<NoticeKey> {
  try {
    const fetched = await fetchPiece(attachment);
    if (fetched.status === 'failed') return fetched.notice;
    const mimeType = fetched.blob.type !== '' ? fetched.blob.type : attachment.mimeType;
    const gallery = await saveToGallery({ saver: currentGallerySaver(), blob: fetched.blob, fileName: fetched.fileName, mimeType });
    if (gallery !== null) return gallery;
    const { fileDeliveryPortal } = await import('@/lib/media/deliver-file');
    const portal = fileDeliveryPortal(browserFileDeliveryHost());
    const outcome = portal === null ? 'unavailable' : await portal.deliver(fetched.blob, fetched.fileName, mimeType);
    if (outcome === 'delivered') return 'media.viewer.saved';
    return outcome === 'expired' ? 'media.viewer.retry' : 'media.viewer.save_failed';
  } catch {
    return 'media.viewer.offline';
  }
}

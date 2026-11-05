import type { FeedMedia } from '@/lib/api/feed-pages';
import type { Attachment } from '@/lib/api/types';
import { standaloneSharePage, type MediaViewerPage } from '@/lib/view/viewer-page-offers';

/**
 * **UN MÉDIA DE COMMENTAIRE S'OUVRE EN PLEIN ÉCRAN** (#13881, miroir
 * `CommentMediaView` → `ConversationMediaGalleryView` iOS) — la visionneuse
 * commune, sur les photos et vidéos du commentaire. Aucun message ne porte la
 * pièce : elle se PARTAGE comme un média nu (`standaloneSharePage`) et
 * s'IMAGE dans l'atelier de carte (#16393), signée par l'auteur du
 * commentaire. Un son reste sur place : il n'a rien à montrer en plein écran.
 */
const EPOCH_ISO = new Date(0).toISOString();

const isVisual = (piece: FeedMedia): boolean => piece.mimeType?.startsWith('image/') === true || piece.mimeType?.startsWith('video/') === true;

export const viewableCommentMedia = (media: readonly FeedMedia[]): readonly FeedMedia[] =>
  media.filter((piece) => isVisual(piece) && piece.fileUrl !== '');

const positive = (value: number | null | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

export function commentMediaAttachment(piece: FeedMedia, commentId: string): Attachment {
  const width = positive(piece.width);
  const height = positive(piece.height);
  const duration = positive(piece.duration);
  return {
    id: piece.id,
    messageId: commentId,
    fileName: piece.id,
    originalName: piece.id,
    mimeType: piece.mimeType ?? '',
    fileSize: 0,
    fileUrl: piece.fileUrl,
    ...(typeof piece.thumbnailUrl === 'string' && piece.thumbnailUrl !== '' ? { thumbnailUrl: piece.thumbnailUrl } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(duration !== undefined ? { duration } : {}),
    uploadedBy: '',
    isAnonymous: false,
    createdAt: EPOCH_ISO,
    isForwarded: false,
    capturedInApp: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    viewedCount: 0,
    downloadedCount: 0,
    consumedCount: 0,
    isEncrypted: false,
  };
}

export function commentMediaPage(params: {
  readonly piece: FeedMedia;
  readonly commentId: string;
  readonly imager: (piece: FeedMedia) => void;
}): MediaViewerPage | null {
  const { piece, commentId } = params;
  const base = standaloneSharePage(commentMediaAttachment(piece, commentId));
  if (base === null) return null;
  return isVisual(piece) && piece.fileUrl.trim() !== '' ? { ...base, imager: () => params.imager(piece) } : base;
}

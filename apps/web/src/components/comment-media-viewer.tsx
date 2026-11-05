import { useCallback, useMemo } from 'react';

import type { FeedMedia } from '@/lib/api/feed-pages';
import { commentMediaAttachment, commentMediaPage } from '@/lib/comments/comment-media-viewer';
import { openPublicationImage, type PublicationImageRequest } from '@/lib/export/publication-image-store';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { MediaViewerPage } from '@/lib/view/viewer-page-offers';

import MediaViewer from './media-viewer';

/**
 * LE PLEIN ÉCRAN DES MÉDIAS D'UN COMMENTAIRE (#13881) — chunk À LA DEMANDE,
 * chargé au toucher d'une photo ou au bouton plein écran d'une vidéo. La
 * visionneuse commune, avec ce qu'un média nu sait faire : Partager, Imager.
 *
 * « Imager » REFERME la visionneuse et ouvre l'ATELIER DE CARTE (#16393), le
 * même qu'un message ou un commentaire : la pièce y arrive signée par
 * l'auteur du commentaire.
 */
export default function CommentMediaViewer({
  media,
  startIndex,
  commentId,
  authorUsername,
  onClose,
  open = openPublicationImage,
}: {
  readonly media: readonly FeedMedia[];
  readonly startIndex: number;
  readonly commentId: string;
  readonly authorUsername?: string | null | undefined;
  readonly onClose: () => void;
  readonly open?: (request: PublicationImageRequest) => void;
}) {
  const items = useMemo(() => media.map((piece) => commentMediaAttachment(piece, commentId)), [media, commentId]);
  const imager = useCallback(
    (piece: FeedMedia) => {
      onClose();
      void import('@/lib/export/publication-image').then(({ commentMediaImageRequestOf }) => {
        const request = commentMediaImageRequestOf({ piece, commentId, author: { username: authorUsername ?? null } });
        if (request !== null) open(request);
      });
    },
    [open, onClose, commentId, authorUsername],
  );
  const actionsAt = useCallback(
    (index: number): MediaViewerPage | null => {
      const piece = media[index];
      return piece === undefined ? null : commentMediaPage({ piece, commentId, imager });
    },
    [media, commentId, imager],
  );
  const language = currentInterfaceLanguage();
  return <MediaViewer items={items} startIndex={startIndex} actionsAt={actionsAt} onClose={onClose} languages={[language]} fallbackLanguage={language} />;
}

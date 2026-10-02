import type { FeedMedia } from '@/lib/api/feed-pages';
import { attachmentSrc } from '@/lib/api/media-url';

/**
 * **LES PHOTOS ET VIDÉOS D'UN COMMENTAIRE** (#9167, miroir `CommentMediaView`
 * iOS) — sous le texte, chacune à sa forme, sans recadrage : une photo se voit
 * entière, une vidéo se lit sur place. L'image d'un sticker n'en fait pas
 * partie (l'hôte la retire : le sticker la peint déjà).
 */
const MEDIA_MAX_HEIGHT = 220;

const isVideo = (media: FeedMedia) => media.mimeType?.startsWith('video/') === true;
const isImage = (media: FeedMedia) => media.mimeType?.startsWith('image/') === true;

export function CommentMedia({ media }: { readonly media: readonly FeedMedia[] }) {
  const shown = media.filter((piece) => (isImage(piece) || isVideo(piece)) && piece.fileUrl !== '');
  if (shown.length === 0) return null;
  return (
    <div data-comment-media="" className="flex flex-wrap gap-1.5 py-1">
      {shown.map((piece) =>
        isVideo(piece) ? (
          <video
            key={piece.id}
            src={attachmentSrc(piece.fileUrl)}
            controls
            playsInline
            preload="metadata"
            className="max-w-full rounded-[12px]"
            style={{ maxHeight: MEDIA_MAX_HEIGHT, background: 'var(--color-ios-card)' }}
          />
        ) : (
          <img
            key={piece.id}
            src={attachmentSrc(piece.fileUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            className="max-w-full rounded-[12px] object-contain"
            style={{ maxHeight: MEDIA_MAX_HEIGHT, background: 'var(--color-ios-card)' }}
          />
        ),
      )}
    </div>
  );
}

import type { FeedMedia } from '@/lib/api/feed-pages';
import { attachmentSrc } from '@/lib/api/media-url';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { coordinateNativeMedia } from '@/lib/view/native-media-coordination';

/**
 * **LES PHOTOS, VIDÉOS ET SONS D'UN COMMENTAIRE** (#9167, #9318, miroir
 * `CommentMediaView` iOS) — sous le texte, chacune à sa forme, sans
 * recadrage : une photo se voit entière (un GIF s'y anime), une vidéo se lit
 * sur place, un son aussi — par le lecteur natif, comme la vidéo voisine et
 * comme l'aperçu d'un son en attente au plateau (`composer-tray.tsx`). L'image d'un sticker n'en fait pas
 * partie (l'hôte la retire : le sticker la peint déjà).
 *
 * Le lecteur natif entre au coordinateur (#9575, `coordinateNativeMedia`) :
 * un seul média joue à la fois, ici comme dans le fil.
 */
const MEDIA_MAX_HEIGHT = 220;

const isVideo = (media: FeedMedia) => media.mimeType?.startsWith('video/') === true;
const isImage = (media: FeedMedia) => media.mimeType?.startsWith('image/') === true;
const isAudio = (media: FeedMedia) => media.mimeType?.startsWith('audio/') === true;

export function CommentMedia({ media }: { readonly media: readonly FeedMedia[] }) {
  const shown = media.filter((piece) => (isImage(piece) || isVideo(piece) || isAudio(piece)) && piece.fileUrl !== '');
  if (shown.length === 0) return null;
  const language = currentInterfaceLanguage();
  return (
    <div data-comment-media="" className="flex flex-wrap gap-1.5 py-1">
      {shown.map((piece) =>
        isAudio(piece) ? (
          /* `preload="none"` — une page de commentaires peut porter plusieurs
             sons ; aucun n'ouvre de connexion avant qu'on le lise. */
          <audio
            key={piece.id}
            ref={coordinateNativeMedia}
            src={attachmentSrc(piece.fileUrl)}
            controls
            preload="none"
            aria-label={translate(language, 'feed.post.media.audio')}
            className="w-full max-w-xs"
          />
        ) : isVideo(piece) ? (
          <video
            key={piece.id}
            ref={coordinateNativeMedia}
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

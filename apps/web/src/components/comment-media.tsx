import { lazy, Suspense, useMemo, useState } from 'react';

import type { FeedMedia } from '@/lib/api/feed-pages';
import { attachmentSrc } from '@/lib/api/media-url';
import { viewableCommentMedia } from '@/lib/comments/comment-media-viewer';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { coordinateNativeMedia } from '@/lib/view/native-media-coordination';

import { GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';

/* À LA DEMANDE : le plein écran ne se charge qu'au toucher d'une photo ou au bouton d'une vidéo. */
const CommentMediaViewer = lazy(() => import('./comment-media-viewer'));

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
 *
 * Une photo se TOUCHE et une vidéo porte son bouton plein écran (#13881) :
 * la visionneuse commune s'ouvre sur la pièce, avec Partager et Imager.
 */
const MEDIA_MAX_HEIGHT = 220;

const isVideo = (media: FeedMedia) => media.mimeType?.startsWith('video/') === true;
const isImage = (media: FeedMedia) => media.mimeType?.startsWith('image/') === true;
const isAudio = (media: FeedMedia) => media.mimeType?.startsWith('audio/') === true;

export function CommentMedia({
  media,
  commentId,
  authorUsername,
}: {
  readonly media: readonly FeedMedia[];
  readonly commentId: string;
  /** L'auteur du commentaire — son @ filigrane ce qu'« Imager » compose. */
  readonly authorUsername?: string | null | undefined;
}) {
  const [opened, setOpened] = useState<number | null>(null);
  const shown = media.filter((piece) => (isImage(piece) || isVideo(piece) || isAudio(piece)) && piece.fileUrl !== '');
  const viewable = useMemo(() => viewableCommentMedia(media), [media]);
  if (shown.length === 0) return null;
  const language = currentInterfaceLanguage();
  const openLabel = translate(language, 'media.viewer.open_fullscreen');
  const open = (piece: FeedMedia) => () => setOpened(viewable.indexOf(piece));
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
          <div key={piece.id} className="relative max-w-full">
            <video
              ref={coordinateNativeMedia}
              src={attachmentSrc(piece.fileUrl)}
              controls
              playsInline
              preload="metadata"
              className="block max-w-full rounded-[12px]"
              style={{ maxHeight: MEDIA_MAX_HEIGHT, background: 'var(--color-ios-card)' }}
            />
            <button
              type="button"
              data-comment-media-open={piece.id}
              onClick={open(piece)}
              aria-label={openLabel}
              className="tap-target-34 absolute start-1.5 top-1.5 grid place-items-center rounded-full text-on-media"
              style={{ width: 28, height: 28, backgroundColor: 'var(--color-scrim)' }}
            >
              <GlyphSvg glyph={MEDIA_GLYPHS.arrowsOutSimple} size={13} />
            </button>
          </div>
        ) : (
          <button
            key={piece.id}
            type="button"
            data-comment-media-open={piece.id}
            onClick={open(piece)}
            aria-label={openLabel}
            className="block max-w-full rounded-[12px] focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ cursor: 'zoom-in', outlineColor: 'var(--color-ios-brand)' }}
          >
            <img
              src={attachmentSrc(piece.fileUrl)}
              alt=""
              loading="lazy"
              decoding="async"
              className="block max-w-full rounded-[12px] object-contain"
              style={{ maxHeight: MEDIA_MAX_HEIGHT, background: 'var(--color-ios-card)' }}
            />
          </button>
        ),
      )}
      {opened !== null && opened >= 0 ? (
        <Suspense fallback={null}>
          <CommentMediaViewer media={viewable} startIndex={opened} commentId={commentId} authorUsername={authorUsername} onClose={() => setOpened(null)} />
        </Suspense>
      ) : null}
    </div>
  );
}

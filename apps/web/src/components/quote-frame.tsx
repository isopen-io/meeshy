import { QUOTED_CARD_WIDTH } from '@/lib/reading-mode/metrics';
import type { QuotedFrame } from '@/lib/view/quoted-preview';

import { Glyph } from './glyph';
import { QuoteVideoStill } from './quote-media';

/**
 * LA MINIATURE D'UNE PIÈCE UNIQUE CITÉE (#7929, complément porteur du
 * 2026-09-25) — aussi large que la carte de story (`QUOTED_CARD_WIDTH`), haute
 * au rapport d'aspect ORIGINAL du média (`QuotedFrame`, borné par
 * `quotedPreviewOf`). Une vidéo sans vignette servie montre sa PREMIÈRE IMAGE,
 * tirée du fichier (`stillSrc`, #8233), sur le flou ThumbHash ou un fond
 * sombre, et le badge de lecture — jamais une case vide. Décorative : la zone
 * qui la porte a déjà son nom.
 */
export function QuoteFrame({
  frame,
  thumbnailSrc,
  stillSrc,
  placeholderSrc,
  kind,
  timebased,
}: {
  readonly frame: QuotedFrame;
  readonly thumbnailSrc: string | null;
  /** Le fichier d'une vidéo SANS vignette — sa première image tient lieu de poster. */
  readonly stillSrc: string | null;
  readonly placeholderSrc: string | null;
  readonly kind: string;
  readonly timebased: boolean;
}) {
  const height = Math.round(QUOTED_CARD_WIDTH / frame.aspectRatio);
  const backdrop =
    placeholderSrc !== null
      ? { backgroundImage: `url("${placeholderSrc}")`, backgroundSize: 'cover' }
      : thumbnailSrc === null
        ? { backgroundColor: 'black' }
        : {};
  return (
    <span
      data-quote-frame={kind}
      data-quote-frame-measured={frame.measured ? 'true' : 'false'}
      className="relative block shrink-0 overflow-hidden rounded-media"
      style={{ width: QUOTED_CARD_WIDTH, height, ...backdrop }}
      aria-hidden
    >
      {thumbnailSrc !== null ? (
        <img
          data-quote-thumb={kind}
          src={thumbnailSrc}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : stillSrc !== null ? (
        <QuoteVideoStill src={stillSrc} />
      ) : null}
      {timebased ? <Glyph name="fillPlay" size={20} className="absolute inset-0 m-auto text-white" /> : null}
    </span>
  );
}

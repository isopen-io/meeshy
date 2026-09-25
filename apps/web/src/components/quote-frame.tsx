import { QUOTED_CARD_WIDTH } from '@/lib/reading-mode/metrics';
import type { QuotedFrame } from '@/lib/view/quoted-preview';

import { Glyph } from './glyph';

/**
 * LA MINIATURE D'UNE PIÈCE UNIQUE CITÉE (#7929, complément porteur du
 * 2026-09-25) — aussi large que la carte de story (`QUOTED_CARD_WIDTH`), haute
 * au rapport d'aspect ORIGINAL du média (`QuotedFrame`, borné par
 * `quotedPreviewOf`). Une vidéo sans vignette servie garde son cadre : un fond
 * sombre et le badge de lecture, comme sa tuile dans le fil — jamais une case
 * vide. Décorative : le bouton de la citation porte déjà son nom.
 */
export function QuoteFrame({
  frame,
  thumbnailSrc,
  placeholderSrc,
  kind,
  timebased,
}: {
  readonly frame: QuotedFrame;
  readonly thumbnailSrc: string | null;
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
      className="relative mt-1.5 block shrink-0 overflow-hidden rounded-media"
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
      ) : null}
      {timebased ? <Glyph name="fillPlay" size={20} className="absolute inset-0 m-auto text-white" /> : null}
    </span>
  );
}

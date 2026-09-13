import { useEffect, useRef } from 'react';

import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

import type { Attachment } from '@/lib/api/types';
import { attachmentSrc } from '@/lib/api/media-url';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';
import { kindOf } from '@/lib/view/message';
import { FILMSTRIP, filmstripLeadingInset, filmstripScrollOffset } from '@/lib/view/media-stage';

import { Glyph } from './glyph';

/**
 * `MediaFilmstrip` (#6221) — la pellicule en couloir bas de la visionneuse,
 * miroir de `ConversationMediaFilmstrip.swift`. **ABSENTE pour un média
 * SEUL** (`items.length <= 1`, `+Geometry.swift:88-102` : « un média seul ne
 * réserve aucun couloir bas ») — c'est l'HÔTE (`media-viewer.tsx`) qui décide
 * de la MONTER ou non, ce composant ne fait que rendre ce qu'on lui donne ;
 * le garde-fou est repris ICI en plus, en défense, pour qu'un appel direct
 * ne puisse jamais rendre une pellicule à un seul bouton.
 *
 * La TÊTE DE LECTURE est le bord DROIT (`scroll-padding-inline-start` posé à
 * `filmstripLeadingInset(largeur)`, defilement vers `filmstripScrollOffset`).
 */
export function MediaFilmstrip({
  items,
  currentIndex,
  onSelect,
}: {
  readonly items: readonly Attachment[];
  readonly currentIndex: number;
  readonly onSelect: (index: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (el === null) return;
    el.style.scrollPaddingInlineStart = `${filmstripLeadingInset(el.clientWidth)}px`;
    el.scrollLeft = filmstripScrollOffset(currentIndex);
  }, [currentIndex]);

  if (items.length <= 1) return null;

  return (
    <div
      data-filmstrip
      role="group"
      aria-label="Pellicule"
      ref={trackRef}
      className="flex overflow-x-auto"
      style={{
        gap: FILMSTRIP.spacing,
        paddingBlockStart: FILMSTRIP.verticalPadding,
        paddingBlockEnd: FILMSTRIP.bottomPadding,
        paddingInlineEnd: FILMSTRIP.trailingInset,
      }}
    >
      {items.map((attachment, index) => {
        const isCurrent = index === currentIndex;
        // `maskedAttachment` (#6189, cycle 125) — LA VIGNETTE EST UN CONTENU :
        // sans cette garde, la pellicule rendait `attachment.thumbnailUrl` (ou
        // son ThumbHash, dérivé de l'image) pour CHAQUE pièce, masquée ou
        // non — la seule case que `MediaGrid` retient déjà, révélée un cran
        // plus loin par le couloir bas de la visionneuse.
        const isMasked = maskedAttachment(attachment);
        const thumb = isMasked
          ? undefined
          : attachment.thumbnailUrl !== undefined && attachment.thumbnailUrl !== ''
            ? attachmentSrc(attachment.thumbnailUrl)
            : thumbHashPlaceholder(attachment.thumbHash);

        return (
          <button
            key={attachment.id}
            type="button"
            data-filmstrip-item
            {...(isMasked ? { 'data-protected-attachment': 'hidden' as const } : {})}
            aria-label={isMasked ? `Média protégé ${index + 1} sur ${items.length}` : `Média ${index + 1} sur ${items.length}`}
            {...(isCurrent ? { 'aria-current': 'true' as const } : {})}
            onClick={() => onSelect(index)}
            className="media-filmstrip-item relative flex shrink-0 items-center justify-center overflow-hidden bg-black"
            style={{
              width: FILMSTRIP.itemSide,
              height: FILMSTRIP.itemSide,
              opacity: isCurrent ? 1 : 0.55,
              transform: isCurrent ? 'scale(1)' : 'scale(0.9)',
              border: isCurrent ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.18)',
            }}
          >
            {isMasked ? (
              <Glyph name="eyeSlash" size={14} className="media-filmstrip-masked-glyph" />
            ) : (
              <>
                {thumb !== undefined ? <img src={thumb} alt="" aria-hidden className="size-full object-cover" /> : null}
                {kindOf(attachment) === 'video' ? (
                  <Glyph name="fillPlay" size={16} className="absolute inset-0 m-auto text-white" />
                ) : null}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

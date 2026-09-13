import { useEffect, useRef } from 'react';

import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

import type { Attachment } from '@/lib/api/types';
import { attachmentSrc } from '@/lib/api/media-url';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';
import { kindOf } from '@/lib/view/message';
import {
  FILMSTRIP,
  FILMSTRIP_RESERVED_HEIGHT,
  filmstripIndexAtPlayhead,
  filmstripLeadingInset,
  filmstripMaxScrollOffset,
  filmstripScrollOffset,
} from '@/lib/view/media-stage';

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
 *
 * DEUX SENS DE SYNCHRONISATION (#6345, miroir `ConversationMediaFilmstrip`
 * iOS 17+, `modernStrip`) : la sélection (clic, flèche) fait défiler la bande
 * vers `filmstripScrollOffset(currentIndex)` (effet ci-dessous) — ET le
 * défilement À LA MAIN de la bande choisit le média affiché (`onScroll`),
 * borné par `filmstripMaxScrollOffset` (le rembours élastique de certains
 * trackpads peut rendre un `scrollLeft` hors bornes). Round-trip stable :
 * `filmstripIndexAtPlayhead(filmstripScrollOffset(i), n) === i`, donc l'effet
 * ne redéclenche jamais `onSelect` en boucle.
 *
 * `FILMSTRIP_RESERVED_HEIGHT` (= 80, `border-box`) — la hauteur TOTALE que la
 * bande réserve, miroir de `.frame(height: reservedHeight)` côté iOS : le
 * plateau (`flex-1`) s'en trouve raccourci d'autant, jamais recouvert.
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
    // `paddingInlineStart` (contenu RÉEL, pas seulement `scroll-padding-*`,
    // sans effet tant qu'aucun `scroll-snap-type` n'est posé sur CET élément)
    // — sans lui, `scrollWidth` d'une pellicule courte (≤ 6 vignettes) reste
    // plus étroit que le viewport et le navigateur borne TOUT `scrollLeft` à
    // 0 : ni le mount-effect ci-dessous ni un doigt réel ne peuvent amener un
    // média autre que le premier sous la tête de lecture. Miroir
    // `contentMargins(.leading, leadingInset, for: .scrollContent)` (iOS 17+).
    const inset = `${filmstripLeadingInset(el.clientWidth)}px`;
    el.style.paddingInlineStart = inset;
    el.style.scrollPaddingInlineStart = inset;
    el.scrollLeft = filmstripScrollOffset(currentIndex);
  }, [currentIndex]);

  const onScroll = (): void => {
    const el = trackRef.current;
    if (el === null) return;
    const bounded = Math.min(filmstripMaxScrollOffset(items.length, el.clientWidth), Math.max(0, el.scrollLeft));
    const next = filmstripIndexAtPlayhead(bounded, items.length);
    if (next !== currentIndex) onSelect(next);
  };

  if (items.length <= 1) return null;

  return (
    <div
      data-filmstrip
      role="group"
      aria-label="Pellicule"
      ref={trackRef}
      onScroll={onScroll}
      className="flex overflow-x-auto box-border"
      style={{
        height: FILMSTRIP_RESERVED_HEIGHT,
        gap: FILMSTRIP.spacing,
        paddingBlockStart: FILMSTRIP.verticalPadding,
        paddingBlockEnd: FILMSTRIP.verticalPadding + FILMSTRIP.bottomPadding,
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

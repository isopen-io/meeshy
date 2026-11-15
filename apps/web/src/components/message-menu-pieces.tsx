import { useLayoutEffect, useRef } from 'react';

import { attachmentSrc } from '@/lib/api/media-url';
import type { Attachment } from '@/lib/api/types';
import { translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';
import { kindOf } from '@/lib/view/message';

import { Glyph, GlyphSvg } from './glyph';
import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';
import { MaskedAttachment } from './masked-attachment';
import { useAttachmentMasked } from './view-once-opened';

/**
 * L'APERÇU D'UNE PIÈCE (#9907, directive porteur du 2026-10-10) — l'appui long
 * sur une tuile d'un message à plusieurs pièces montre CETTE pièce seule, à
 * son rapport d'aspect (`object-fit: contain`, jamais rognée ni étirée), avec
 * un défilement horizontal vers les autres pièces du message et un indicateur
 * « 3/7 ». Le défilement CHANGE la cible du menu (`onIndex`).
 *
 * Trois portes au défilement, aucune obligatoire : le glissé (défilement
 * natif aimanté, `scroll-snap`), les flèches du clavier (posées par le menu,
 * qui tient le focus) et deux boutons de 44 px. La position se dit au lecteur
 * d'écran (« Photo 3 sur 7 ») dans une région vivante.
 *
 * Une pièce MASQUÉE (vue unique, floutée, chiffrée) garde sa forme au repos
 * (`MaskedAttachment`, sans bouton) : l'aperçu d'un appui long ne révèle
 * jamais ce que la rangée ne montrait pas. Une vidéo se montre par sa
 * vignette, sinon par sa première image (`preload="metadata"`), sans son ni
 * lecture : l'aperçu montre, il ne joue pas.
 */
export function MessageMenuPieces({
  pieces,
  index,
  onIndex,
  positionLabel,
  language,
  rtl,
}: {
  readonly pieces: readonly Attachment[];
  readonly index: number;
  readonly onIndex: (index: number) => void;
  readonly positionLabel: string;
  readonly language: InterfaceLanguage;
  readonly rtl: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const masked = useAttachmentMasked();
  const total = pieces.length;
  const format = new Intl.NumberFormat(language);

  /* LA PIÈCE COURANTE EST À L'ÉCRAN DÈS LA PREMIÈRE IMAGE — `useLayoutEffect`,
     avant la peinture : aucune image où l'aperçu montrerait la première pièce
     puis sauterait sur la troisième. Un index déjà atteint par le glissé ne
     re-défile pas (le geste et l'état disent alors la même chose). */
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null || scroller.clientWidth === 0) return;
    const current = Math.round(Math.abs(scroller.scrollLeft) / scroller.clientWidth);
    if (current === index) return;
    scroller.scrollTo({ left: (rtl ? -1 : 1) * index * scroller.clientWidth, behavior: 'instant' });
  }, [index, rtl]);

  const onScroll = () => {
    const scroller = scrollerRef.current;
    if (scroller === null || scroller.clientWidth === 0) return;
    const landed = Math.round(Math.abs(scroller.scrollLeft) / scroller.clientWidth);
    if (landed !== index && landed >= 0 && landed < total) onIndex(landed);
  };

  const step = (delta: -1 | 1) => {
    const next = index + delta;
    if (next >= 0 && next < total) onIndex(next);
  };

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={translateMessagePieces(language, 'message.piece.preview')}
      data-message-menu-pieces
      className="relative size-full"
    >
      <div
        ref={scrollerRef}
        data-message-menu-pieces-scroller
        onScroll={onScroll}
        className="flex size-full overflow-x-auto overflow-y-hidden"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', overscrollBehaviorX: 'contain' }}
      >
        {pieces.map((piece, i) => (
          <div
            key={piece.id}
            data-message-menu-piece={piece.id}
            {...(i === index ? { 'data-current': '' } : { 'aria-hidden': true })}
            className="relative grid size-full shrink-0 place-items-center"
            style={{ flex: '0 0 100%', scrollSnapAlign: 'center' }}
          >
            {masked(piece) ? <MaskedAttachment attachment={piece} fill /> : <PieceVisual piece={piece} />}
          </div>
        ))}
      </div>

      {index > 0 ? (
        <PieceStepButton side="start" label={translateMessagePieces(language, 'message.piece.previous')} rtl={rtl} onPress={() => step(-1)} />
      ) : null}
      {index < total - 1 ? (
        <PieceStepButton side="end" label={translateMessagePieces(language, 'message.piece.next')} rtl={rtl} onPress={() => step(1)} />
      ) : null}

      <span
        aria-hidden
        data-message-menu-pieces-indicator
        className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded-chip px-2 py-0.5 text-time font-semibold text-on-media"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-media-backdrop) 60%, transparent)' }}
      >
        {format.format(index + 1)}/{format.format(total)}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {positionLabel}
      </span>
    </div>
  );
}

function PieceVisual({ piece }: { readonly piece: Attachment }) {
  const placeholder = thumbHashPlaceholder(piece.thumbHash);
  const isVideo = kindOf(piece) === 'video';
  const thumbnail = piece.thumbnailUrl !== undefined && piece.thumbnailUrl !== '' ? piece.thumbnailUrl : undefined;
  const still = thumbnail ?? (isVideo || piece.fileUrl === '' ? undefined : piece.fileUrl);
  const background =
    placeholder === undefined
      ? {}
      : { backgroundImage: `url("${placeholder}")`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' };
  return (
    <div className="relative size-full" style={background}>
      {still !== undefined ? (
        <img src={attachmentSrc(still)} alt="" decoding="async" className="absolute inset-0 size-full" style={{ objectFit: 'contain' }} />
      ) : isVideo && piece.fileUrl !== '' ? (
        <video
          src={attachmentSrc(piece.fileUrl)}
          preload="metadata"
          muted
          playsInline
          className="absolute inset-0 size-full"
          style={{ objectFit: 'contain' }}
        />
      ) : (
        <Glyph name="image" size={40} className="absolute inset-0 m-auto opacity-40" />
      )}
      {isVideo ? (
        <span
          aria-hidden
          className="absolute inset-0 m-auto grid size-11 place-items-center rounded-full text-on-media"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-media-backdrop) 55%, transparent)' }}
        >
          <Glyph name="fillPlay" size={18} />
        </span>
      ) : null}
    </div>
  );
}

/**
 * Un bouton de défilement — 44 px de cible, posé au bord LOGIQUE (début / fin,
 * qui s'inversent en arabe), sa flèche suivant le sens de lecture. Hors de la
 * tabulation : le clavier défile par ses flèches, le menu garde le focus sur
 * ses entrées ; le lecteur d'écran l'atteint par son nom.
 */
function PieceStepButton({
  side,
  label,
  rtl,
  onPress,
}: {
  readonly side: 'start' | 'end';
  readonly label: string;
  readonly rtl: boolean;
  readonly onPress: () => void;
}) {
  const pointsLeft = (side === 'start') !== rtl;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      data-message-menu-piece-step={side}
      onClick={onPress}
      className={`absolute top-0 bottom-0 my-auto grid size-11 place-items-center rounded-full text-on-media ${side === 'start' ? 'start-1' : 'end-1'}`}
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-media-backdrop) 55%, transparent)' }}
    >
      <GlyphSvg glyph={pointsLeft ? THREAD_MENU_GLYPHS.caretLeft : THREAD_MENU_GLYPHS.caretRight} size={18} />
    </button>
  );
}

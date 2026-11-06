import { useLayoutEffect, useMemo, useRef, type ComponentProps, type MouseEvent } from 'react';

import { longMessageExcerpt } from '@meeshy/shared/utils/long-message';
import { FOCAL_METRICS, focalExpandEasingCss } from '@meeshy/shared/utils/focal-metrics';

import { translate } from '@/lib/i18n-catalog';
import { useFlip } from '@/lib/use-flip';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useUnfoldedRow } from '@/lib/view/unfold-store';

import { RichText } from './rich-text';

/**
 * LE TEXTE D'UN MESSAGE, REPLIÉ QUAND IL EST LONG (#8147, #16464).
 *
 * Au-delà du seuil (`LONG_MESSAGE_THRESHOLD`, 512 graphèmes — celui d'iOS),
 * le fil n'en montre qu'un QUART, coupé au mot (`longMessageExcerpt`, la loi
 * partagée avec iOS), suivi de « … Lire la suite ». Directive porteur
 * 2026-11-06 (jumelle iOS #16463) : un toucher affiche le message ENTIER,
 * rendu comme un message ordinaire du mode courant — aucune mise en avant —,
 * et il le reste : aucun « Réduire », plusieurs messages peuvent l'être, et
 * seule la réouverture du fil les replie (`unfold-store.ts`).
 *
 * `messageId` est la clé de RANGÉE du fil (`threadRowKeyOf`) : c'est par elle
 * que le virtualiseur tient le haut du message pendant qu'il se déplie.
 *
 * `text` est le texte SERVI par le Prisme (`served()` chez les deux peaux) :
 * l'extrait et le dépliage portent sur ce que le lecteur lit, jamais sur
 * l'original quand une traduction est servie.
 *
 * RIEN NE S'ANIME EN GÉOMÉTRIE (#11314) : le texte intégral prend sa place
 * d'un coup, sous l'extrait, et le corps s'allume en `opacity` (`useFlip`, au
 * tempo `expandDurationMs` et sur la courbe `expandCurve` que joue aussi iOS,
 * #8232). Réduire le mouvement ⇒ la bascule est sèche.
 *
 * L'ACCESSIBILITÉ : le texte intégral est DÉJÀ dans le libellé de la rangée
 * (`composeMessageLabel`, d'où `plainTextHidden` chez les deux peaux) ; le
 * bouton porte `aria-expanded="false"` et une cible de 44 px. Il disparaît au
 * dépliage : le focus se pose alors sur le texte, pour qu'il ne tombe pas sur
 * la page.
 */
type RichTextProps = ComponentProps<typeof RichText>;

/** Opacité de départ du corps qui se déplie. */
const FOLD_FADE_FROM = 0.4;

export function LongMessageText({
  messageId,
  text,
  toggleColor = 'var(--color-ios-ink)',
  ...richText
}: RichTextProps & {
  readonly messageId: string;
  /** La teinte du bouton SUR CETTE SURFACE — une bulle envoyée est indigo. */
  readonly toggleColor?: string;
}) {
  const { truncated, excerpt } = useMemo(() => longMessageExcerpt(text), [text]);
  const { unfolded, unfold } = useUnfoldedRow(messageId);
  const box = useRef<HTMLDivElement>(null);
  const focusOnUnfold = useRef(false);
  useFlip(box, {
    key: unfolded ? 'unfolded' : 'folded',
    duration: FOCAL_METRICS.expandDurationMs,
    easing: focalExpandEasingCss(),
    fadeFrom: FOLD_FADE_FROM,
  });
  useLayoutEffect(() => {
    if (!unfolded || !focusOnUnfold.current) return;
    focusOnUnfold.current = false;
    box.current?.focus({ preventScroll: true });
  }, [unfolded]);

  if (!truncated) return <RichText text={text} {...richText} />;

  const onUnfold = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    focusOnUnfold.current = document.activeElement === event.currentTarget;
    unfold();
  };

  return (
    <div
      ref={box}
      data-long-message={unfolded ? 'unfolded' : 'folded'}
      {...(unfolded ? { tabIndex: -1, className: 'outline-none' } : {})}
    >
      <RichText text={unfolded ? text : `${excerpt}…`} {...richText} />
      {unfolded ? null : (
        <button
          type="button"
          data-long-message-toggle=""
          aria-expanded={false}
          onClick={onUnfold}
          className="-mb-2 flex min-h-11 items-center text-bubble font-semibold underline underline-offset-4"
          style={{ color: toggleColor }}
        >
          {translate(currentInterfaceLanguage(), 'thread.long-message.read-more')}
        </button>
      )}
    </div>
  );
}

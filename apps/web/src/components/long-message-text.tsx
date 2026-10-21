import { useMemo, useRef, type ComponentProps } from 'react';

import { longMessageExcerpt } from '@meeshy/shared/utils/long-message';
import { FOCAL_METRICS, focalExpandEasingCss } from '@meeshy/shared/utils/focal-metrics';

import { translate } from '@/lib/i18n-catalog';
import { useFlip } from '@/lib/use-flip';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { toggleUnfolded, useIsUnfolded } from '@/lib/view/unfold-store';

import { RichText } from './rich-text';

/**
 * LE TEXTE D'UN MESSAGE, REPLIÉ QUAND IL EST LONG (#8147).
 *
 * Directive porteur 2026-09-26 : au-delà du seuil (`LONG_MESSAGE_THRESHOLD`,
 * 512 graphèmes — celui d'iOS, inchangé), le fil n'en montre qu'un QUART,
 * coupé au mot (`longMessageExcerpt`, la loi partagée avec iOS), suivi de
 * « … Lire la suite ». Toucher DÉPLIE sur place — aucune feuille — et
 * « Réduire » replie. L'état vit dans `unfold-store` : un seul déplié à la
 * fois, et l'hôte du fil (`ThreadModes`) le lit pour poser l'effet Focal.
 *
 * `text` est le texte SERVI par le Prisme (`served()` chez les deux peaux) :
 * l'extrait et le dépliage portent sur ce que le lecteur lit, jamais sur
 * l'original quand une traduction est servie.
 *
 * LE DÉPLIAGE SE JOUE EN FLIP, ET RIEN NE S'ANIME EN GÉOMÉTRIE (#11314).
 * Le texte intégral prend sa place d'un coup ; le bouton — seul élément qui
 * change de place — repart de son ancienne position en `transform`, et le
 * corps s'allume en `opacity` (`useFlip`, au tempo `expandDurationMs` et sur
 * la courbe `expandCurve` que joue aussi iOS, #8232). Réduire le mouvement ⇒
 * la bascule est sèche.
 *
 * L'ACCESSIBILITÉ : le texte intégral est DÉJÀ dans le libellé de la rangée
 * (`composeMessageLabel`, d'où `plainTextHidden` chez les deux peaux) ; le
 * bouton porte `aria-expanded`, que les lecteurs d'écran annoncent
 * (« réduit » / « développé ») à chaque bascule.
 */
type RichTextProps = ComponentProps<typeof RichText>;

/** Opacité de départ du corps qui se déplie ou se replie. */
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
  const unfolded = useIsUnfolded(messageId);
  const box = useRef<HTMLDivElement>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const motion = { key: unfolded ? 'unfolded' : 'folded', duration: FOCAL_METRICS.expandDurationMs, easing: focalExpandEasingCss() };
  useFlip(toggleButton, motion);
  useFlip(box, { ...motion, fadeFrom: FOLD_FADE_FROM });

  if (!truncated) return <RichText text={text} {...richText} />;

  const language = currentInterfaceLanguage();
  const toggle = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    toggleUnfolded(messageId);
  };

  return (
    <div ref={box} data-long-message={unfolded ? 'unfolded' : 'folded'}>
      <RichText text={unfolded ? text : `${excerpt}…`} {...richText} />
      <button
        ref={toggleButton}
        type="button"
        data-long-message-toggle=""
        aria-expanded={unfolded}
        onClick={toggle}
        className="-mb-2 flex min-h-11 items-center text-bubble font-semibold underline underline-offset-4"
        style={{ color: toggleColor }}
      >
        {translate(language, unfolded ? 'thread.long-message.collapse' : 'thread.long-message.read-more')}
      </button>
    </div>
  );
}

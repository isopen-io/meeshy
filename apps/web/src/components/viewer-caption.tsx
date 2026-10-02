import type { CSSProperties, SyntheticEvent } from 'react';

import type { ContentTrackingLink } from '@meeshy/shared/types/post';

import { RichText } from './rich-text';

/**
 * **LA LÉGENDE POSÉE SUR UN MÉDIA** (#9074) — le site UNIQUE des lecteurs
 * plein écran (story, visionneuse) et des légendes du fil (carrousel,
 * mosaïque) : le texte passe par `RichText`, donc une adresse de la carte
 * `trackingLinks` s'ouvre par `/l/<token>` en AFFICHANT l'adresse, et une
 * adresse hors carte reste un lien direct.
 *
 * ## Le lien ne vole pas le geste de la scène
 *
 * Ces légendes vivent SUR une surface qui a son propre geste : avancer la
 * story, ouvrir la visionneuse. Deux règles, et seulement deux :
 *
 *  1. un tap sur le TEXTE passe toujours à l'hôte — la légende n'est pas une
 *     zone morte posée sur la scène ;
 *  2. un tap sur un LIEN reste au lien : chaque lien porte
 *     `data-claims-gesture` (lu par `screenGestureYields`, la loi du lecteur
 *     de story) et la remontée de `pointerdown`/`pointerup`/`click` s'arrête
 *     ici quand — et seulement quand — la cible est un lien.
 *
 * Le chrome du lecteur est `pointer-events-none` (la scène reste touchable
 * sous la barre basse) : seuls les LIENS en sortent, jamais le paragraphe.
 */
const LINK_REACHABLE = '[&_a]:pointer-events-auto';

const stopOnLink = (event: SyntheticEvent): void => {
  const target = event.target;
  if (target instanceof Element && target.closest('a') !== null) event.stopPropagation();
};

export function ViewerCaption({
  text,
  trackingLinks,
  lang,
  className,
  style,
  probe,
}: {
  readonly text: string;
  readonly trackingLinks?: readonly ContentTrackingLink[] | undefined;
  /** La langue SERVIE — absente ⇒ aucun attribut (celle du document). */
  readonly lang?: string | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** Les prises des gates (`data-story-media-caption`, …), posées sur le paragraphe. */
  readonly probe?: Readonly<Record<`data-${string}`, string>> | undefined;
}) {
  return (
    <RichText
      {...probe}
      text={text}
      trackingLinks={trackingLinks}
      linkColor="inherit"
      claimsGesture
      className={className === undefined ? LINK_REACHABLE : `${className} ${LINK_REACHABLE}`}
      {...(style === undefined ? {} : { style })}
      {...(lang === undefined || lang === '' ? {} : { lang })}
      onPointerDown={stopOnLink}
      onPointerUp={stopOnLink}
      onClick={stopOnLink}
    />
  );
}

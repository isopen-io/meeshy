import type { CSSProperties, ReactNode } from 'react';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { AuthorStoryRing } from '@/lib/view/author-story-ring';
import { identityTarget } from '@/lib/view/identity-target';
import { Link } from '@/routes/route-table';

/**
 * **LE NOM D'UNE PERSONNE MÈNE OÙ SON AVATAR MÈNE** (#7241, directive porteur
 * du 2026-09-21).
 *
 * `Avatar` porte la porte depuis #6396 ; le nom restait du texte. La directive
 * demande le MÊME geste sur les deux, et ce composant est la moitié qui
 * manquait — il partage la loi de destination (`identityTarget`), jamais une
 * seconde décision qui dériverait.
 *
 * ## PAS DE PLANCHER DE 44 PX ICI, ET C'EST UN PRÉCÉDENT, PAS UN OUBLI
 *
 * Un nom vit DANS une ligne de texte : lui imposer 44 px de haut casserait la
 * ligne qui le porte, et un `<a>` inline ne peut pas grandir sans pousser ses
 * voisins. Le dépôt a déjà tranché ce cas — les `@mentions`
 * (`components/rich-text.tsx:68`) sont des liens inline sans plancher, et les
 * gates les acceptent. La cible de 44 px reste servie par l'AVATAR, qui est à
 * côté et qui, lui, peut grandir sans déplacer la mise en page
 * (`styles/avatar.css`).
 *
 * ## LE MODE `redundant`, ET POURQUOI IL EXISTE
 *
 * Sur la rangée plate (Focal), la ligne d'identité entière est `aria-hidden`
 * depuis #5935 : le libellé de la rangée porte déjà le nom, et le relire était
 * un défaut majeur. Y poser un lien FOCALISABLE en rouvrirait un autre — un
 * élément atteignable au clavier dans un sous-arbre masqué est invisible au
 * lecteur d'écran tout en recevant le focus. `redundant` retire donc le nom du
 * parcours clavier : le geste au DOIGT reste (c'est ce que la directive
 * demande), et le clavier passe par l'AVATAR, qui est hors du masque et
 * s'annonce. Il ne se pose QUE là où un autre chemin vers la même adresse est
 * annoncé — sans quoi il retirerait la seule porte.
 *
 * ## SANS DESTINATION, IL RESTE DU TEXTE
 *
 * Un participant anonyme n'a pas de pseudo ; un message système n'a pas
 * d'auteur. Rendre leur nom tapable poserait un contrôle sans destination — et
 * `/u/` n'est pas une adresse. Le composant rend alors exactement ce que le
 * site rendait avant lui : un `<span>`.
 */
export function PersonName({
  name,
  username,
  storyRing,
  redundant,
  className,
  style,
  children,
}: {
  readonly name: string;
  readonly username?: string | null | undefined;
  readonly storyRing?: AuthorStoryRing | undefined;
  /** Un AUTRE chemin vers la même adresse est déjà annoncé : celui-ci sort du
      parcours clavier. Voir le doc-comment du module. */
  readonly redundant?: boolean | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly children?: ReactNode | undefined;
}) {
  const cible = identityTarget({ ...(username === undefined ? {} : { username }), ...(storyRing === undefined ? {} : { storyRing }) });
  const contenu = children ?? name;

  if (cible === null) {
    return (
      <span className={className} style={style}>
        {contenu}
      </span>
    );
  }

  const langue = currentInterfaceLanguage();
  const etiquette = translate(langue, cible.kind === 'story' ? 'a11y.avatar.story' : 'a11y.avatar.profile', { name });
  const accessibilite = redundant === true ? { tabIndex: -1 } : { 'aria-label': etiquette };

  if (cible.kind === 'story') {
    return (
      <Link to="story" params={{ post: cible.post }} className={className} style={style} {...accessibilite}>
        {contenu}
      </Link>
    );
  }

  return (
    <Link to="userProfile" params={{ username: cible.username }} className={className} style={style} {...accessibilite}>
      {contenu}
    </Link>
  );
}

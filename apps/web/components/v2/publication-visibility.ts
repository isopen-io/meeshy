import type { PostVisibility } from '@meeshy/shared/types/post';

/**
 * Les SIX audiences que le modèle définit, dans l'ordre où toute surface de
 * publication web les présente — composer post/réel, composer audio, composer
 * story, ET éditeur d'un post déjà publié.
 *
 * Source unique délibérée : quatre listes recopiées avaient dérivé (l'éditeur
 * n'en offrait que trois, les composers cinq), ce qui rendait `COMMUNITY`,
 * `EXCEPT` et `ONLY` posables à la création puis INATTEIGNABLES ensuite. La loi
 * produit 2026-08-23 est l'inverse : la publication naît publique
 * (`DEFAULT_PUBLICATION_VISIBILITY`) et son auteur peut la resserrer — ou la
 * rouvrir — à tout moment.
 *
 * `EXCEPT` se lit « mes amis sauf ceux-ci » et non « tout le monde sauf
 * ceux-ci » : côté gateway la branche EXCEPT exige l'amitié AVANT d'appliquer
 * la liste (postVisibility.ts). Les libellés des quatre catalogues disent
 * exactement cela.
 */
export const PUBLICATION_VISIBILITY_OPTIONS: readonly {
  readonly id: PostVisibility;
  readonly labelKey: string;
  readonly icon: string;
}[] = [
  { id: 'PUBLIC', labelKey: 'publicationVisibility.public', icon: '🌍' },
  { id: 'FRIENDS', labelKey: 'publicationVisibility.friends', icon: '👥' },
  { id: 'COMMUNITY', labelKey: 'publicationVisibility.community', icon: '🏘️' },
  { id: 'EXCEPT', labelKey: 'publicationVisibility.except', icon: '🚫' },
  { id: 'ONLY', labelKey: 'publicationVisibility.only', icon: '🎯' },
  { id: 'PRIVATE', labelKey: 'publicationVisibility.private', icon: '🔒' },
];

/**
 * Comment une référence se montre dans un contenu.
 *
 * INLINE est DÉRIVÉ par le serveur, qui relit les `@handle` du texte — le
 * client ne le déclare jamais. Les trois autres sont déclarés : le texte ne
 * peut pas les porter.
 */
export type PostReferenceDisplay = 'INLINE' | 'PINNED' | 'NOTE' | 'SILENT';

/**
 * Une personne référencée, telle que le serveur la sert.
 *
 * Le profil arrive RÉSOLU AU CHARGEMENT : quelqu'un qui change de nom
 * d'affichage apparaît sous son nom actuel, pas sous celui qu'il portait à la
 * publication.
 */
export type PostReference = {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  readonly display: PostReferenceDisplay;
};

/**
 * Le droit d'ouvrir un contenu expiré parce qu'on y est référencé — DÉCLARÉ par
 * le serveur, jamais recalculé côté client.
 *
 * Le client ne voit que `expiresAt` et ignore tout de la référence : déduire
 * l'accès localement ferait refuser un contenu que le serveur autorise.
 */
export type ReferenceAccess = 'none' | 'granted' | 'consumed';

/** Une personne que l'auteur a choisi de nommer, et comment. */
export type ComposerReference = {
  readonly username: string;
  readonly userId?: string;
  readonly display: PostReferenceDisplay;
};

/** Ce que le client envoie dans `mentions` de `POST /posts`. */
export type PostReferenceInput = {
  readonly userId?: string;
  readonly username?: string;
  readonly display: Exclude<PostReferenceDisplay, 'INLINE'>;
};

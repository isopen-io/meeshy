/**
 * Les charges client des surfaces SOCIALES portées par le socket : appartenance
 * à une room de post, réactions de commentaire. Les charges serveur
 * correspondantes vivent dans `../post.js`.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

/**
 * Données pour ajouter une réaction à un commentaire
 */
export interface CommentReactionAddData {
  readonly commentId: string;
  readonly postId: string;
  readonly emoji: string;
}

/**
 * Données pour retirer une réaction d'un commentaire
 */
export interface CommentReactionRemoveData {
  readonly commentId: string;
  readonly postId: string;
  readonly emoji: string;
}

/**
 * Données pour rejoindre/quitter une room de post
 */
export interface PostRoomActionData {
  readonly postId: string;
}

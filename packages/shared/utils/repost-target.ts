import type { Post } from '../types/post.js';

/**
 * Ce que VISE un repost : la RACINE de la chaîne.
 *
 * Deux choses se confondent naturellement ici, et la confusion a déjà été
 * faite puis rattrapée en revue le 2026-08-23 — c'est pour qu'elle ne se
 * refasse pas que la règle vit dans une fonction plutôt que recopiée sur dix
 * sites d'appel :
 *
 * - la RÉFÉRENCE remonte à la racine, ce que cette fonction calcule ;
 * - le FORMAT (`targetType`) reste celui de la CARTE sur laquelle
 *   l'utilisateur a agi. Il ne suit PAS la racine, et ne se calcule donc pas
 *   ici : reposter depuis son fil le repost-de-story de quelqu'un doit donner
 *   un post dans son fil, jamais une story de 20 h dans son tray.
 *
 * ## Pourquoi le client grimpe, alors que le gateway grimpe déjà
 *
 * `PostService.repostPost` remonte bien la racine — mais seulement pour
 * `originalRepostOfId`, qui ne sert qu'au routage des likes, vues et
 * réactions. La relation d'AFFICHAGE, elle, est écrite telle quelle
 * (`repostOfId: postId`), et `repostOfInclude` ne fait qu'UN saut à la
 * relecture. Viser le maillon précédent donne donc une carte encastrée qui
 * pointe une coquille : un repost de POST ou de RÉEL ne porte ni contenu ni
 * média propres (`repostPost` ne duplique les médias que pour une source
 * ÉPHÉMÈRE), et le lecteur affiche une carte vide.
 *
 * ## Où cette loi s'applique — et où elle ne s'applique PAS
 *
 * Aux surfaces de CARTE : fil, fil des réels, page de détail, profil. Le
 * jumeau iOS trace la même frontière — `RepostTargeting.target` sert
 * `FeedViewModel`, `ReelsViewModel`, `PostDetailView`, `ProfileUserPostsList`,
 * tandis que le viewer de story envoie `story.id` sans grimper
 * (`StoryViewerView.repostAsPostDirect`).
 *
 * Le viewer de story en est donc EXCLU, pour deux raisons dont chacune suffit :
 * `repostPost` recopie le contenu et les médias d'une source ÉPHÉMÈRE dans le
 * repost (la scène vue est autonome, il n'y a aucune carte vide à éviter), et
 * il refuse un original dont l'échéance est passée — une story repartagée
 * survit à sa racine, donc grimper y ferait échouer un geste qui réussit.
 *
 * Toute évolution touche les deux plateformes.
 */
export type RepostSourceCard = Pick<Post, 'id'> &
  Partial<Pick<Post, 'repostOfId' | 'originalRepostOfId'>>;

/** La racine si le serveur l'a hydratée, sinon le maillon, sinon la carte. */
export function repostTargetId(card: RepostSourceCard): string {
  return card.originalRepostOfId ?? card.repostOfId ?? card.id;
}

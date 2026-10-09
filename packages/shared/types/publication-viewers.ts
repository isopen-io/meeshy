/**
 * Ce que chaque personne de la liste des vues a fait sur UN contenu (story,
 * post ou réel) — servi par `GET /posts/:postId/interactions` (#9727).
 *
 * QUI la lit (décision porteur 2026-10-09) : l'AUTEUR d'une story ou d'un
 * statut. L'auteur d'un POST ou d'un RÉEL n'en voit que les NOMBRES
 * (`viewCount`…) et reçoit 403 sur la liste. ADMIN/BIGBOSS la lisent pour tout
 * contenu, chaque lecture journalisée dans `AdminAuditLog` (#9733) — une trace
 * qui ne s'écrit pas refuse la lecture (503 `AUDIT_UNAVAILABLE`).
 *
 * Chaque champ est OPTIONNEL et ABSENT quand il vaut zéro : « un compteur à 0
 * ne s'affiche pas » se décide au serveur, une fois, pour les deux clients.
 * Un ancien client, qui ne lit que `reaction`, continue de décoder la ligne.
 *
 * - `reactions` — les emojis posés par la personne sur ce contenu, du plus
 *   ancien au plus récent ;
 * - `shareCount` — ses liens de partage tracés vers ce contenu
 *   (`TrackingLink.createdBy`). Un partage SANS lien n'est enregistré par
 *   personne nulle part (il n'incrémente que `Post.shareCount`) : il n'est
 *   pas compté ici, et rien ne l'invente ;
 * - `repostCount` — ses republications (simples ou citées) encore en ligne ;
 * - `commentCount` / `replyCount` — ses commentaires de premier niveau et ses
 *   réponses à un commentaire, supprimés exclus.
 *
 * Le FAVORI n'y figure jamais (décision porteur 2026-10-09) : mettre un contenu
 * de côté reste un geste privé. Un client qui décodait un `bookmarked`
 * optionnel continue de fonctionner sans lui.
 *
 * Pour un POST ou un RÉEL, la liste ne porte que les vues et les partages par
 * lien postérieurs à la mise en service (`VIEWER_ACTIVITY_DISCLOSED_SINCE`,
 * passerelle) ; une story garde tout son historique.
 */
export type PostViewerEngagement = {
  readonly reactions?: readonly string[];
  readonly shareCount?: number;
  readonly repostCount?: number;
  readonly commentCount?: number;
  readonly replyCount?: number;
};

/** Une ligne de la liste des vues, telle que la passerelle la sert. */
export type PostViewerRow = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly viewedAt: string;
  /** Réaction la plus récente — le champ historique, gardé pour les anciens clients. */
  readonly reaction: string | null;
} & PostViewerEngagement;

/**
 * La page servie sous `data` par `GET /posts/:postId/interactions`.
 *
 * `engagement` est OPTIONNEL (un ancien client l'ignore) et ne prend qu'une
 * valeur : `'unavailable'` quand la passerelle n'a pas pu établir ce que les
 * personnes ont fait (une garde de blocage ou de visibilité qui ne conclut
 * pas). Les lignes partent alors sans aucun champ d'engagement — ce qui ne
 * veut PAS dire que personne n'a rien fait : le client le dit, discrètement.
 * Absent ⇒ le détail est servi.
 */
export type PostViewersPage = {
  readonly viewers: readonly PostViewerRow[];
  readonly engagement?: 'unavailable';
};

/**
 * LA LISTE D'AUDIENCE d'une publication — `visibilityUserIds` — n'est servie
 * qu'à son AUTEUR (#7407).
 *
 * Pour une publication `ONLY`, c'est la liste des personnes visées ; pour
 * `EXCEPT`, celle des personnes EXCLUES. Servie à un lecteur, elle lui apprend
 * qui d'autre est dans la confidence, ou qui l'auteur a écarté. L'auteur en a
 * besoin : son formulaire d'édition la relit (web legacy, iOS `EditPostSheet`),
 * et ses appareils la persistent depuis l'écho temps réel.
 *
 * ## Charger n'est pas servir
 *
 * `postScalarSelect` continue de la CHARGER : la passerelle en a besoin pour
 * router ses diffusions (`SocialEventsHandler.getVisibilityFilteredRecipients`)
 * et prévenir la bonne audience (mentions, éventail d'amis). C'est chaque
 * SORTIE vers un lecteur qui passe par cette projection — liste
 * (`withViewerPostState`), fiche (`getPostById`), réponse d'écriture
 * (`servePublishedPost`), stories, humeurs, diffusion.
 *
 * ## Fail-closed
 *
 * Lecteur inconnu (anonyme, absent) ou auteur inconnu : la liste ne part pas.
 * Rien ne l'y autorise « par défaut » — ni le rôle (un ADMIN non auteur reçoit
 * ce que reçoit un lecteur ordinaire ; la route de modération
 * `GET /admin/posts/:postId` la sert exprès, derrière `canModerateContent`), ni
 * la visibilité (une publication `PUBLIC` peut garder la liste d'un ancien
 * `EXCEPT` : `updatePost` ne la vide que si le client l'envoie).
 *
 * ## Une republication ne rend pas la liste à son auteur
 *
 * `EXCEPT`/`ONLY` d'une republication HÉRITENT la liste de la source
 * (`repostVisibilityInheritsAudienceList`, `PostService.createPost` et
 * `repostPost`) : le republieur « possède » une liste qu'il n'a pas écrite. La
 * lui servir rouvrirait la fuite par sa propre publication. Aucun client n'en a
 * besoin : le composer de republication n'offre pas ces deux audiences, et le
 * serveur substitue la liste de la source à ce que le client envoie.
 */

/** Ce que la décision lit — typé `unknown` pour juger aussi une ligne sérialisée. */
export type AudienceListSubject = {
  readonly authorId?: unknown;
  readonly repostOfId?: unknown;
};

export type WithoutAudienceList<T> = Omit<T, 'visibilityUserIds'>;

/** La liste devient OPTIONNELLE : présente pour l'auteur, absente pour tout autre lecteur. */
export type ServedAudienceList<T> = WithoutAudienceList<T> & Partial<T>;

export function mayReadAudienceList(post: AudienceListSubject, viewerId: string | null | undefined): boolean {
  if (!viewerId || typeof post.authorId !== 'string' || post.repostOfId) return false;
  return post.authorId === viewerId;
}

export function withoutAudienceList<T extends object>(post: T): WithoutAudienceList<T> {
  const { visibilityUserIds: _reservedToAuthor, ...served } = post as T & { readonly visibilityUserIds?: unknown };
  return served;
}

export function withAudienceListFor<T extends object & AudienceListSubject>(
  post: T,
  viewerId: string | null | undefined,
): ServedAudienceList<T> {
  if (mayReadAudienceList(post, viewerId)) return post;
  // `Omit<T, K>` ne se prouve pas assignable à `Partial<T>` pour un `T`
  // GÉNÉRIQUE ; il l'est pour tout `T` concret, la seule clé retirée y
  // devenant optionnelle. L'assertion ne franchit que cette limite d'inférence.
  return withoutAudienceList(post) as ServedAudienceList<T>;
}

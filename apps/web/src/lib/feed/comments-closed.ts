/**
 * **LES COMMENTAIRES D'UNE PUBLICATION SONT-ILS FERMÉS ?** (#16541) — la loi
 * UNIQUE du client. Une publication les ferme elle-même (`commentsDisabled`),
 * ou republie un original qui les a fermés : la passerelle refuse alors un
 * commentaire sur l'une comme sur l'autre (`403 COMMENTS_DISABLED`), et
 * offrir le champ serait un contrôle qui ment (loi 4).
 *
 * Absent ⇒ ouverts : un serveur ancien qui ne sert pas le champ n'a rien fermé.
 */
export type CommentsClosedSubject = {
  readonly commentsDisabled?: boolean | null;
  readonly repostOf?: { readonly commentsDisabled?: boolean | null } | null;
};

export function commentsClosed(post: CommentsClosedSubject | null | undefined): boolean {
  if (post === null || post === undefined) return false;
  return post.commentsDisabled === true || post.repostOf?.commentsDisabled === true;
}

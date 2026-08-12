/**
 * LA diffusion « ce contenu a disparu », partagée par les deux routes qui
 * peuvent retirer un post.
 *
 * Trois familles de contenu vivent dans la même table `Post` mais voyagent sur
 * trois événements distincts — `post:deleted`, `story:deleted`,
 * `status:deleted` — parce que les clients s'y abonnent séparément (barre de
 * stories, fil, bandeau de statuts). Choisir le bon événement est donc une
 * règle, pas un détail d'appel, et elle n'a aucune raison d'exister en deux
 * exemplaires : `DELETE /posts/:postId` (l'app) et `DELETE /admin/posts/:postId`
 * (la console) retirent le même objet.
 *
 * DEUX INVARIANTS, tous deux appris à leurs dépens :
 *
 * 1. L'audience se déplie depuis l'AUTEUR. `SocialEventsHandler` se sert de cet
 *    identifiant pour énumérer les amis de cette personne et pour ajouter sa
 *    feed room aux destinataires. Un retrait peut être décidé par quelqu'un
 *    d'autre (modérateur, admin) : passer l'acteur diffuse alors la disparition
 *    aux amis DU MODÉRATEUR, qui n'ont pas le post, et à personne d'autre.
 *
 * 2. La visibilité accompagne le STATUS. `broadcastStatusDeleted` refiltre
 *    l'audience avec elle ; sans elle un statut `ONLY`/`EXCEPT` annoncerait sa
 *    disparition plus largement qu'il n'a été publié.
 *
 * Best-effort : le retrait est déjà committé quand ceci s'exécute, une
 * diffusion perdue ne doit jamais transformer une suppression réussie en 500.
 */

/** Le sous-ensemble de `SocialEventsHandler` dont ce chemin a besoin. */
export interface PostRemovalBroadcaster {
  broadcastPostDeleted(postId: string, authorId: string): Promise<void>;
  broadcastStoryDeleted(storyId: string, authorId: string): Promise<void>;
  broadcastStatusDeleted(
    statusId: string,
    authorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[]
  ): Promise<void>;
}

/** Le document retiré, tel que Prisma le rend. */
export interface RemovedPost {
  id: string;
  authorId: string;
  type: string | null | undefined;
  visibility: string | null | undefined;
  visibilityUserIds?: string[] | null;
}

export function broadcastPostRemoval(
  socialEvents: PostRemovalBroadcaster | null | undefined,
  post: RemovedPost,
  onError: (err: unknown) => void
): void {
  if (!socialEvents) return;

  const { id, authorId, type } = post;
  const emit =
    type === 'STATUS'
      ? socialEvents.broadcastStatusDeleted(id, authorId, post.visibility, post.visibilityUserIds ?? [])
      : type === 'STORY'
        ? socialEvents.broadcastStoryDeleted(id, authorId)
        : socialEvents.broadcastPostDeleted(id, authorId);

  emit.catch(onError);
}

/**
 * POST MENTION NOTIFICATIONS (Fix 2) — extrait de `NotificationService.ts`
 * (#7093).
 */
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { notificationLogger } from '../../../utils/logger-enhanced';
import { truncateMessage } from '../notification-preview';
import type { FanoutDependencies } from './dependencies';

export type PostMentionFanoutParams = {
  postId: string;
  posterId: string;
  mentionedUserIds: string[];
  postExcerpt?: string;
  /**
   * Type du contenu mentionnant — discriminant qui décide de la surface
   * ouverte au tap côté client (lecteur de réel / viewer éphémère / détail de
   * post). Défaut POST.
   */
  postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
  /**
   * `Post.visibility`. Requis — la garde d'audience ne doit pas pouvoir être
   * désarmée par simple omission d'un paramètre optionnel.
   */
  visibility: string | null | undefined;
  /** `Post.visibilityUserIds` — liste blanche en ONLY, liste noire en EXCEPT. */
  visibilityUserIds?: readonly string[];
};

/**
 * Envoie des notifications user_mentioned en batch pour les mentions dans un post.
 *
 * Mirrors createCommentMentionNotificationsBatch.
 * Skip: self-mention, rate-limit anti-spam (MAX_MENTIONS_PER_MINUTE per pair sender:recipient).
 */
export async function createPostMentionNotificationsBatch(
  deps: FanoutDependencies,
  params: PostMentionFanoutParams
): Promise<void> {
  if (params.mentionedUserIds.length === 0) return;

  const poster = await deps.prisma.user.findUnique({
    where: { id: params.posterId },
    select: { username: true, displayName: true, avatar: true },
  });

  if (!poster) return;

  // La garde d'audience est RETIRÉE du chemin de référence — décision produit
  // 2026-08-19. Elle empêchait l'extrait d'un post FRIENDS de partir vers un
  // non-ami ; mais nommer quelqu'un lui OUVRE désormais le contenu, donc la
  // garde n'a plus d'objet : elle taisait précisément les gens que l'auteur
  // venait de désigner.
  //
  // CE QUI PROTÈGE RÉELLEMENT — à ne pas se tromper de gardien.
  //
  // La rédaction d'origine désignait l'avertissement du composer comme « la
  // SEULE protection restante ». C'est FAUX, et dangereusement : un
  // avertissement d'interface ne protège rien côté serveur, et cette phrase
  // invite à croire que l'ACL de lecture serait retirable. Une revue de
  // sécurité automatique s'y est d'ailleurs laissé prendre le 2026-08-19 et a
  // classé ce bloc en IDOR à haute gravité.
  //
  // Le vrai gardien est un GRANT PERSISTÉ, vérifié à la lecture :
  //   PostMention                              (table, `post_user_mention_unique`)
  //     → isReferenceStillOpen                 (postVisibility.ts)
  //       → canUserViewPost(..., includeReferenced: true)
  //         → canUserConsumePost               (verdict de LECTURE)
  //
  // Le grant n'est pas perpétuel : sur un contenu EXPIRÉ il ne vaut qu'une
  // fenêtre de 24 h (`verdictFor`, referenceAccess.ts), et c'est
  // `isReferenceStillOpen` — et non la seule existence de la ligne — qui la
  // fait respecter par TOUT ce que `canUserConsumePost` garde : ce lot de
  // notifications, le fil de commentaires, la room socket.
  //
  // L'extrait ne part donc qu'à des utilisateurs qui sont EFFECTIVEMENT
  // autorisés à ouvrir le post : la notification ne leur apprend rien qu'ils
  // ne puissent déjà lire. L'ordre le garantit — `createPostMentions` est
  // `await`é AVANT `createPostMentionNotificationsBatch` (postMentions.ts),
  // donc pas de fenêtre où la notification précéderait le grant.
  //
  // L'avertissement du composer reste utile, mais il est de l'UX : il évite à
  // l'auteur d'ouvrir son contenu sans le vouloir. Il n'est pas la garde.
  // Retirer le grant persisté ou `includeReferenced`, EN REVANCHE, rouvrirait
  // une vraie fuite.
  const audience = params.mentionedUserIds;
  if (audience.length === 0) return;

  const excerpt = params.postExcerpt
    ? truncateMessage(params.postExcerpt)
    : '';
  const langs = await deps.resolveRecipientLangs(audience);

  const actorInfo = {
    id: params.posterId,
    username: poster.username,
    displayName: poster.displayName,
    avatar: poster.avatar,
  };

  const tasks: Array<Promise<unknown>> = [];

  for (const userId of audience) {
    if (userId === params.posterId) continue;

    if (!deps.shouldCreateMentionNotification(params.posterId, userId)) {
      notificationLogger.info('Post mention notification blocked (rate limit)', {
        posterId: params.posterId,
        recipientId: userId,
      });
      continue;
    }

    tasks.push(
      deps.createNotification({
        userId,
        type: 'user_mentioned',
        priority: 'high',
        content: excerpt || notificationString(langs.get(userId) ?? 'fr', 'mention'),
        actor: actorInfo,
        lang: langs.get(userId) ?? 'fr',
        context: {
          postId: params.postId,
        },
        metadata: {
          action: 'view_post',
          entityType: 'post',
          postId: params.postId,
          postPreview: excerpt,
          postType: params.postType ?? 'POST',
        } as any,
      })
    );
  }

  // createNotification ne rejette jamais (catch interne + log du userId
  // exact) : attendre les tasks suffit, pas de gestion rejected ici.
  await Promise.allSettled(tasks);
}

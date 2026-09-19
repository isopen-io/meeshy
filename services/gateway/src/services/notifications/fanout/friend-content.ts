/**
 * FRIEND CONTENT NOTIFICATIONS (Phase 4F) — extrait de
 * `NotificationService.ts` (#7093).
 */
import { notificationString, type NotificationStringKey } from '@meeshy/shared/utils/notification-strings';
import { notificationLogger } from '../../../utils/logger-enhanced';
import { getCommunityCoMemberIds } from '../../posts/communityVisibility';
import { truncateMessage } from '../notification-preview';
import { resolvePostMedia } from '../post-media-thumbnail';
import { FANOUT_ROW_CAP } from './row-cap';
import type { FanoutDependencies } from './dependencies';

export type FriendContentFanoutParams = {
  postId: string;
  authorId: string;
  contentType: 'STORY' | 'POST' | 'MOOD' | 'STATUS' | 'REEL';
  excerpt?: string;
  /** Date de publication ISO du contenu (contexte « publié il y a … » côté client). */
  postCreatedAt?: string | Date;
  /** Date d'expiration ISO (story/status éphémère) → le client affiche « expirée ». */
  postExpiresAt?: string | Date;
  /** Nature du média principal — affiché quand le contenu n'a pas de texte. */
  mediaType?: 'image' | 'video' | 'audio' | 'text';
  /**
   * User IDs to exclude from fan-out.
   * Pass mentionedUserIds so a friend who is also @mentioned only gets user_mentioned.
   */
  excludeUserIds?: string[];
  /**
   * Post visibility — used to filter recipients (same rules as Socket.IO broadcast).
   *
   * **Requis**, comme sur les trois lots voisins depuis les cycles 28 et 31.
   * L'omission n'était pas anodine ici : le défaut `PUBLIC` fait retomber un
   * post `PRIVATE` — ou un `EXCEPT` et sa liste noire — sur l'énumération
   * complète des amis, avec extrait et vignette. La faute appartient au build.
   */
  visibility: string | null | undefined;
  /** User IDs list for ONLY/EXCEPT visibility modes. */
  visibilityUserIds?: string[];
};

/**
 * Fan-out notifications to all friends of `authorId` when they publish new content.
 *
 * contentType mapping:
 *   STORY  → friend_new_story
 *   POST   → friend_new_post
 *   MOOD   → friend_new_mood
 *   STATUS → friend_new_mood  (lightweight/ephemeral; grouped with MOOD to avoid type proliferation)
 *
 * Rate-limit: none in v1. These are once-per-publish events so burst risk is low.
 * Aggregation: none in v1. Duplicate suppression (author vs friend) is enforced via excludeUserIds.
 *
 * Dedup with mentions: pass mentionedUserIds as `excludeUserIds`.
 * user_mentioned takes priority over friend_new_post for the same recipient.
 *
 * Cap: 500 friend rows max (mirrors createStoryCommentNotificationsBatch pattern).
 */
export async function createFriendContentNotificationsBatch(
  deps: FanoutDependencies,
  params: FriendContentFanoutParams
): Promise<void> {
  // REEL est une variante de post : même type de notification (friend_new_post),
  // mais le contentType REEL est conservé dans la metadata pour l'affichage client.
  const typeMap: Record<'STORY' | 'POST' | 'MOOD' | 'STATUS' | 'REEL', 'friend_new_story' | 'friend_new_post' | 'friend_new_mood'> = {
    STORY: 'friend_new_story',
    POST: 'friend_new_post',
    MOOD: 'friend_new_mood',
    STATUS: 'friend_new_mood',
    REEL: 'friend_new_post',
  };
  const notificationType = typeMap[params.contentType];

  const author = await deps.prisma.user.findUnique({
    where: { id: params.authorId },
    select: { username: true, displayName: true, avatar: true },
  });

  if (!author) return;

  const friendRequestRows = await deps.prisma.friendRequest.findMany({
    where: {
      status: 'accepted',
      OR: [{ senderId: params.authorId }, { receiverId: params.authorId }],
    },
    select: { senderId: true, receiverId: true },
    take: FANOUT_ROW_CAP + 1,
    orderBy: { updatedAt: 'desc' },
  });

  // Le tri est `updatedAt desc` et la borne est fixe : chez un auteur qui la
  // dépasse durablement, ce sont TOUJOURS les mêmes contacts — les plus
  // anciens — qui n'apprennent aucune de ses publications. Le silence est ici
  // structurel, pas ponctuel, d'où la trace.
  //
  // Requête sans `distinct` : la ligne témoin y est un compte EXACT — elle
  // existe si et seulement si l'auteur a PLUS de `FANOUT_ROW_CAP` amitiés
  // acceptées. Elle est comptée, puis jetée par le `slice` : la borne de
  // diffusion reste à sa valeur, seule sa saturation devient dicible.
  if (friendRequestRows.length > FANOUT_ROW_CAP) {
    notificationLogger.warn('Fan-out de publication tronqué à la borne', {
      postId: params.postId,
      authorId: params.authorId,
      cap: FANOUT_ROW_CAP,
    });
  }
  const friendRequests = friendRequestRows.slice(0, FANOUT_ROW_CAP);

  const excludeSet = new Set(params.excludeUserIds ?? []);
  const excerpt = params.excerpt ? truncateMessage(params.excerpt) : '';
  // Vignette du contenu publié → rendue in-app + attachée au push iOS. Le
  // mediaType explicite de l'appelant prime ; sinon on le dérive du média.
  const media = await resolvePostMedia(deps.prisma, params.postId);
  const mediaType = params.mediaType ?? media?.mediaType;

  // Aucun `?? 'PUBLIC'` : une visibilité absente retombe sur la branche par
  // défaut ci-dessous (l'énumération des amis), jamais sur une ouverture.
  const visibility = params.visibility;
  const visibilityUserIds = params.visibilityUserIds ?? [];
  const visibilityUserIdSet = new Set(visibilityUserIds);

  if (visibility === 'PRIVATE') return;

  // Content : le wording « a publié une nouvelle … » est localisé par
  // destinataire ; le subtitle typé (« Nouvelle story » …) voyage en
  // APN-natif (restauré par le NSE) — les deux dans la langue du destinataire.
  const contentKeyByType: Record<'friend_new_story' | 'friend_new_post' | 'friend_new_mood', NotificationStringKey> = {
    friend_new_story: 'friend.story',
    friend_new_post: 'friend.post',
    friend_new_mood: 'friend.mood',
  };
  // Un réel emprunte le type friend_new_post mais garde son wording propre :
  // « a publié un nouveau réel », pas « … un nouveau post ». Le discriminant
  // REEL est conservé dans la metadata pour l'affichage client, donc le titre,
  // le corps et le sous-titre doivent tous rester conscients de l'entité —
  // sinon un réel s'annonçait comme un post (titre + corps) tout en affichant
  // « Nouveau réel » en sous-titre du builder : une contradiction.
  const contentKey: NotificationStringKey =
    params.contentType === 'REEL' ? 'friend.reel' : contentKeyByType[notificationType];

  const baseFriendIds = friendRequests
    .map(fr => (fr.senderId === params.authorId ? fr.receiverId : fr.senderId))
    .filter(id => id !== params.authorId && !excludeSet.has(id));

  let recipientIds: string[];
  if (visibility === 'COMMUNITY') {
    // Une action dans une communauté est OBLIGATOIREMENT notifiée à TOUS les
    // membres de la communauté (pas seulement aux contacts de l'auteur) —
    // miroir de SocialEventsHandler.getVisibilityFilteredRecipients pour que
    // notification et broadcast temps réel ciblent exactement le même set.
    const coMemberIds = await getCommunityCoMemberIds(deps.prisma, params.authorId);
    recipientIds = coMemberIds.filter(id => id !== params.authorId && !excludeSet.has(id));
  } else if (visibility === 'ONLY') {
    recipientIds = visibilityUserIds.filter(id => id !== params.authorId && !excludeSet.has(id));
  } else if (visibility === 'EXCEPT') {
    recipientIds = baseFriendIds.filter(id => !visibilityUserIdSet.has(id));
  } else {
    recipientIds = baseFriendIds;
  }

  const uniqueRecipientIds = [...new Set(recipientIds)];
  const langs = await deps.resolveRecipientLangs(uniqueRecipientIds);

  const actorInfo = {
    id: params.authorId,
    username: author.username,
    displayName: author.displayName,
    avatar: author.avatar,
  };

  const tasks: Array<Promise<unknown>> = [];

  for (const recipientId of uniqueRecipientIds) {
    const fLang = langs.get(recipientId) ?? 'fr';
    tasks.push(
      deps.createNotification({
        userId: recipientId,
        type: notificationType,
        priority: 'normal',
        content: excerpt || notificationString(fLang, contentKey),
        subtitle: notificationString(fLang, 'friend.subtitleNew', {
          postType: params.contentType,
        }),
        actor: actorInfo,
        lang: fLang,
        context: {
          postId: params.postId,
          ...(params.postCreatedAt ? { postCreatedAt: new Date(params.postCreatedAt).toISOString() } : {}),
          ...(params.postExpiresAt ? { postExpiresAt: new Date(params.postExpiresAt).toISOString() } : {}),
          ...(media?.thumbnailUrl
            ? { firstAttachmentUrl: media.thumbnailUrl, firstAttachmentMimeType: media.thumbnailMimeType }
            : {}),
        },
        metadata: {
          action: 'view_post',
          postId: params.postId,
          contentType: params.contentType,
          // Le discriminant d'entité voyage AUSSI sous `postType` : c'est la
          // clé que lisent le payload push (`data.postType`) et le routage
          // client. Sans ce miroir, le nouveau réel d'un ami arrivait sans
          // discriminant et ouvrait le détail de post plat au lieu du lecteur
          // immersif. `contentType` est conservé pour la rétro-compat web.
          postType: params.contentType,
          excerpt,
          ...(mediaType ? { mediaType } : {}),
          ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
        } as any,
      })
    );
  }

  // createNotification ne rejette jamais (catch interne + log du userId
  // exact) : attendre les tasks suffit, pas de gestion rejected ici.
  await Promise.allSettled(tasks);
}

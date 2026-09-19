/**
 * STORY COMMENT FAN-OUT (Phase 1D) — extrait de `NotificationService.ts`
 * (#7093). Fan-out déclenché quand un commentaire de premier niveau arrive
 * sur une story / un post.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { notificationLogger } from '../../../utils/logger-enhanced';
import { getCommunityCoMemberIds } from '../../posts/communityVisibility';
import { filterPostConsumers } from '../../posts/postAudience';
import { truncateMessage } from '../notification-preview';
import { FANOUT_ROW_CAP } from './row-cap';
import type { FanoutDependencies } from './dependencies';

/** Les trois lectures bornées qui composent les seaux d'un fan-out de fil. */
export type FanoutBucket = 'previousComments' | 'friendRequests' | 'reactors';

/**
 * Les trois seaux d'un fan-out de commentaire, et ce qu'on n'a PAS pu lire.
 *
 * `truncatedBuckets` distingue « ce seau est complet » de « ce seau s'arrête à
 * la borne » — deux listes identiques en apparence, dont une seule dit la
 * vérité sur l'audience réelle. Sans ce champ, un fan-out silencieusement
 * tronqué se lit exactement comme un fan-out exhaustif.
 */
export type StoryNotificationRecipients = {
  authorId: string;
  friendIds: string[];
  previousCommenterIds: string[];
  truncatedBuckets: FanoutBucket[];
};

/**
 * Resolves the three recipient buckets for story comment notifications.
 *
 * Priority order (a user appears in EXACTLY ONE bucket):
 *   1. storyAuthorId  → STORY_NEW_COMMENT
 *   2. previousCommenterIds (prior commenters on this post, excl. commenter & author)
 *                     → STORY_THREAD_REPLY
 *   3. friendIds (friends of the author, excl. commenter, author, and prior commenters)
 *                     → FRIEND_STORY_COMMENT
 */
export async function getStoryNotificationRecipients(
  prisma: PrismaClient,
  postId: string,
  authorId: string,
  commenterId: string
): Promise<StoryNotificationRecipients> {
  // Cap at FANOUT_ROW_CAP rows to bound fan-out cost on viral posts.
  // Future: large posts should use a background queue for fan-out.
  //
  // Les IDs qui ne seront JAMAIS notifiés sortent PAR LA REQUÊTE, pas par un
  // filtre en aval : sous la borne, une ligne écartée après coup a quand même
  // consommé sa place. Et l'auteur qui répond à chacun de ses commentateurs est
  // l'engagé le plus prolifique de son propre fil — ses réponses évinçaient donc
  // des destinataires réels du seau, en silence.
  const excludedEngagerIds = Array.from(new Set([commenterId, authorId]));

  const [previousComments, friendRequests, reactors] = await Promise.all([
    prisma.postComment.findMany({
      where: {
        postId,
        deletedAt: null,
        authorId: { notIn: excludedEngagerIds },
      },
      distinct: ['authorId'],
      select: { authorId: true },
      take: FANOUT_ROW_CAP + 1,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.friendRequest.findMany({
      where: {
        status: 'accepted',
        OR: [{ senderId: authorId }, { receiverId: authorId }],
      },
      select: { senderId: true, receiverId: true },
      take: FANOUT_ROW_CAP + 1,
      orderBy: { updatedAt: 'desc' },
    }),
    // Include post reactors as thread-engaged participants (same bucket as prior commenters)
    prisma.postReaction.findMany({
      where: {
        postId,
        userId: { notIn: excludedEngagerIds },
      },
      distinct: ['userId'],
      select: { userId: true },
      take: FANOUT_ROW_CAP + 1,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Une liste rendue à la borne exacte est INDISCERNABLE d'une liste
  // complète : le seau paraît entier, et le destinataire au-delà de la borne
  // n'apprend jamais rien. La saturation est donc nommée dans le retour — pour
  // que l'appelant puisse en tenir compte — et consignée ici, pour qu'elle
  // soit observable ailleurs que dans le silence d'un utilisateur.
  //
  // Le verdict se lit sur la LIGNE TÉMOIN (`take` = borne + 1), pas sur
  // « autant de lignes que la borne » : un seau qui compte exactement
  // `FANOUT_ROW_CAP` engagés est COMPLET, et le déclarer tronqué ferait crier
  // au loup à chaque publication d'un auteur à exactement 500 amis. C'est ce
  // que la note ci-dessus demande — distinguer « complet » de « s'arrête à la
  // borne » — et `>=` échouait précisément au point où les deux se touchent.
  const truncatedBuckets = [
    previousComments.length > FANOUT_ROW_CAP ? 'previousComments' as const : null,
    friendRequests.length > FANOUT_ROW_CAP ? 'friendRequests' as const : null,
    reactors.length > FANOUT_ROW_CAP ? 'reactors' as const : null,
  ].filter((bucket): bucket is FanoutBucket => bucket !== null);

  if (truncatedBuckets.length > 0) {
    notificationLogger.warn('Fan-out de commentaire tronqué à la borne', {
      postId,
      authorId,
      buckets: truncatedBuckets,
      cap: FANOUT_ROW_CAP,
    });
  }

  // Le `notIn` plus haut est ce qui protège le BUDGET ; les `filter` ci-dessous
  // restent la POSTCONDITION de la méthode. Deux rôles distincts, pas une garde
  // en double : la requête décide qui coûte une ligne, la méthode répond de ce
  // qu'elle rend — « ni l'auteur ni le commentateur ne sortent d'ici » tient
  // quelle que soit la clause `where` du jour.
  const isNotifiableEngager = (id: string): boolean =>
    id !== authorId && id !== commenterId;

  const rawPreviousCommenterIds = previousComments
    .slice(0, FANOUT_ROW_CAP)
    .map((c: { authorId: string }) => c.authorId)
    .filter(isNotifiableEngager);

  // Merge reactor user IDs into the "thread engagement" bucket.
  // Reactors who also commented are deduplicated via Set — they still appear only once.
  const reactorIds = reactors
    .slice(0, FANOUT_ROW_CAP)
    .map((r: { userId: string }) => r.userId)
    .filter(isNotifiableEngager);

  const previousCommenterIds = Array.from(
    new Set([...rawPreviousCommenterIds, ...reactorIds])
  );

  const previousCommenterSet = new Set(previousCommenterIds);

  // L'auteur ancre CHAQUE ligne d'amitié — l'écarter par la requête est
  // impossible ici : sa présence est structurelle, pas budgétaire.
  const allFriendIds = friendRequests
    .slice(0, FANOUT_ROW_CAP)
    .flatMap((fr: { senderId: string; receiverId: string }) => [fr.senderId, fr.receiverId])
    .filter(isNotifiableEngager);

  const friendIds = Array.from(new Set(allFriendIds)).filter(
    (id: string) => !previousCommenterSet.has(id)
  );

  return { authorId, friendIds, previousCommenterIds, truncatedBuckets };
}

export type StoryCommentFanoutParams = {
  postId: string;
  commentId: string;
  storyAuthorId: string;
  commenterId: string;
  commentExcerpt?: string;
  /**
   * Type du post commenté. Pilote le wording (« story » vs « publication »
   * vs « humeur ») et le bucket auteur : pour un post non-story, l'auteur
   * est déjà notifié via `createPostCommentNotification` (route), donc le
   * bucket 1 est sauté pour éviter la double notification.
   * Défaut STORY (compat avec les appels existants).
   */
  postType?: 'STORY' | 'POST' | 'MOOD' | 'STATUS' | 'REEL';
  /** Date de publication ISO du contenu commenté (contexte expiry côté client). */
  postCreatedAt?: string | Date;
  /** Date d'expiration ISO du contenu commenté (story/status éphémère). */
  postExpiresAt?: string | Date;
  /**
   * User IDs to exclude from fan-out buckets (story_thread_reply, friend_story_comment).
   * Use to pass mentionedUserIds so users who received user_mentioned don't also get
   * a lower-priority story thread/friend notification.
   * The story author always gets STORY_NEW_COMMENT regardless of this list.
   */
  excludeUserIds?: string[];
  /**
   * Visibilité du post commenté. Filtre les buckets fan-out (thread + amis)
   * exactement comme `SocialEventsHandler.getVisibilityFilteredRecipients` et
   * `createFriendContentNotificationsBatch` : un post ONLY/EXCEPT/PRIVATE/
   * COMMUNITY ne doit JAMAIS notifier (extrait de commentaire inclus) un
   * utilisateur qui n'a pas le droit de le voir.
   *
   * REQUIS — annoncé par les cycles 28, 29 et 30, qui l'avaient laissé
   * `visibility?` à défaut `PUBLIC`. Une garde qu'on désarme en omettant un
   * paramètre optionnel n'est pas une garde : rien ne signalait l'oubli, ni
   * au build ni à l'exécution. Le prix se paie une fois, à la déclaration.
   */
  visibility: string | null | undefined;
  /** Liste d'IDs pour les modes ONLY (autorisés) / EXCEPT (exclus). */
  visibilityUserIds?: string[];
};

/**
 * Fan-out notifications when a new top-level comment is added to a story.
 *
 *  - Story author        → STORY_NEW_COMMENT  (priority: normal)
 *  - Previous commenters → STORY_THREAD_REPLY (priority: low)
 *  - Friends of author   → FRIEND_STORY_COMMENT (priority: low)
 *
 * Commenter never receives a notification.
 */
export async function createStoryCommentNotificationsBatch(
  deps: FanoutDependencies,
  params: StoryCommentFanoutParams
): Promise<void> {
  const [actor, postAuthor] = await Promise.all([
    deps.prisma.user.findUnique({
      where: { id: params.commenterId },
      select: { username: true, displayName: true, avatar: true },
    }),
    deps.prisma.user.findUnique({
      where: { id: params.storyAuthorId },
      select: { username: true, displayName: true },
    }),
  ]);

  if (!actor) return;

  // La saturation des seaux est consignée par `getStoryNotificationRecipients`
  // lui-même — là où elle est constatée, donc pour TOUS ses appelants et pas
  // seulement pour celui-ci.
  const { authorId, friendIds, previousCommenterIds } =
    await getStoryNotificationRecipients(
      deps.prisma,
      params.postId,
      params.storyAuthorId,
      params.commenterId
    );

  // Filtre de visibilité — miroir de SocialEventsHandler.getVisibilityFilteredRecipients
  // et de createFriendContentNotificationsBatch : un post restreint ne doit jamais
  // fanout un commentaire (extrait inclus) vers un utilisateur qui ne peut pas le voir.
  // L'auteur (bucket STORY_NEW_COMMENT) est exempt — il possède le post.
  const visibility = params.visibility;
  const visibilityUserIdSet = new Set(params.visibilityUserIds ?? []);
  const coMemberIds = visibility === 'COMMUNITY'
    ? new Set(await getCommunityCoMemberIds(deps.prisma, params.storyAuthorId))
    : null;
  // Ne s'applique QU'À `friendIds`, une sortie d'ÉNUMÉRATEUR : ces gens SONT
  // les amis actuels de l'auteur, dépliés de son graphe quelques lignes plus
  // haut. Leur amitié n'est donc pas à re-vérifier, et seules les listes
  // nominatives peuvent encore les écarter. Un post COMMUNITY ne passe jamais
  // ici : il a sa propre branche, adossée au graphe communauté.
  const canSeeAsFriend = (userId: string): boolean => {
    switch (visibility) {
      case 'PRIVATE': return false;
      case 'ONLY': return visibilityUserIdSet.has(userId);
      case 'EXCEPT': return !visibilityUserIdSet.has(userId);
      default: return true; // PUBLIC / FRIENDS — amis par construction
    }
  };
  // Un post COMMUNITY fanout aux co-membres (pas aux amis de l'auteur) — le graphe
  // amis et le graphe communauté diffèrent ; on cible exactement le même set que le
  // broadcast temps réel, buckets thread/auteur/commenter restant disjoints.
  const friendAudience = (
    visibility === 'COMMUNITY'
      ? [...coMemberIds!].filter(id =>
          id !== params.storyAuthorId &&
          id !== params.commenterId &&
          !previousCommenterIds.includes(id))
      : friendIds.filter(canSeeAsFriend)
  );
  // `previousCommenterIds` (commentateurs antérieurs ∪ réacteurs) n'est PAS une
  // sortie d'énumérateur : c'est un ensemble arbitraire au regard de l'audience
  // du moment. Ils y étaient admis quand ils ont engagé le post ; une
  // dés-amitié ou une édition de visibilité les en sort sans toucher à leur
  // commentaire. Il leur faut donc un test d'ADMISSION, pas la table locale
  // ci-dessus qui rendait `true` sur FRIENDS/EXCEPT sans lire aucun graphe.
  // Même audience que `canNotifyAboutPost`, qui garde la notification unitaire
  // de cette même population depuis le cycle 30.
  //
  // Sur un post COMMUNITY, les co-membres sont donc résolus une seconde fois
  // (deux requêtes bornées de plus, sur un chemin déjà détaché de la réponse
  // HTTP). C'est le prix assumé pour ne PAS refiltrer à la main avec le set
  // ci-dessus : une copie locale de la règle d'admission est exactement ce qui
  // avait laissé ce seau sans garde.
  const engagedAudience = await filterPostConsumers({
    prisma: deps.prisma,
    authorId: params.storyAuthorId,
    visibility,
    visibilityUserIds: params.visibilityUserIds,
    candidateUserIds: previousCommenterIds,
  });

  const excerpt = params.commentExcerpt
    ? truncateMessage(params.commentExcerpt)
    : '';

  // Wording typé : le destinataire doit savoir SUR QUOI porte le commentaire
  // (story / publication / humeur / statut) et, pour les buckets fan-out, la
  // story/publication DE QUI. Le contexte voyage en `subtitle` (APN-natif,
  // restauré côté NSE après la donation d'intent), le body reste le contenu
  // du commentaire.
  const postType = params.postType ?? 'STORY';
  // REEL est une variante de post : le catalogue i18n serveur le rend comme
  // « publication », mais on conserve REEL dans la metadata pour que le client
  // affiche le libellé/icône « Réel » distinct.
  const i18nPostType = postType === 'REEL' ? 'POST' : postType;
  const authorName = postAuthor?.displayName?.trim()
    || postAuthor?.username?.trim()
    || '';
  const langs = await deps.resolveRecipientLangs([authorId, ...engagedAudience, ...friendAudience]);
  const contextSubtitleFor = (lang: string): string => authorName
    ? notificationString(lang, 'comment.subtitleFrom', { postType: i18nPostType, author: authorName })
    : notificationString(lang, 'comment.subtitleBare', { postType: i18nPostType });

  const commonContext = {
    postId: params.postId,
    commentId: params.commentId,
    ...(params.postCreatedAt ? { postCreatedAt: new Date(params.postCreatedAt).toISOString() } : {}),
    ...(params.postExpiresAt ? { postExpiresAt: new Date(params.postExpiresAt).toISOString() } : {}),
  };
  const commonMetadata = {
    action: 'view_post' as const,
    postId: params.postId,
    commentId: params.commentId,
    commentPreview: excerpt,
    postType,
    ...(authorName ? { contentAuthorName: authorName } : {}),
  };
  const actorInfo = {
    id: params.commenterId,
    username: actor.username,
    displayName: actor.displayName,
    avatar: actor.avatar,
  };

  const excludeSet = new Set(params.excludeUserIds ?? []);
  const tasks: Array<Promise<unknown>> = [];

  // 1. Story author notification — always sent regardless of excludeUserIds
  //    (STORY_NEW_COMMENT has priority over all fan-out notifications).
  //    Pour un post non-story, l'auteur est déjà notifié via post_comment
  //    (route) — bucket sauté pour ne pas le notifier deux fois.
  if (authorId !== params.commenterId && postType === 'STORY') {
    const aLang = langs.get(authorId) ?? 'fr';
    tasks.push(
      deps.createNotification({
        userId: authorId,
        type: 'story_new_comment',
        priority: 'normal',
        content: excerpt || notificationString(aLang, 'comment.your', { postType: i18nPostType }),
        subtitle: notificationString(aLang, 'comment.subtitleOwner', { postType: i18nPostType }),
        actor: actorInfo,
        context: commonContext,
        metadata: commonMetadata,
        lang: aLang,
      })
    );
  }

  // 2. Previous commenters (thread participants) — skip mentioned users
  for (const recipientId of engagedAudience) {
    if (excludeSet.has(recipientId)) continue;
    const rLang = langs.get(recipientId) ?? 'fr';
    tasks.push(
      deps.createNotification({
        userId: recipientId,
        type: 'story_thread_reply',
        priority: 'low',
        content: excerpt || notificationString(rLang, 'comment.repliedIn', { postType: i18nPostType }),
        // Pas de `subtitle` explicite : l'auteur du contenu est désormais
        // DANS l'action (« a répondu dans une story de Alice »), et le
        // répéter en sous-titre écrirait deux fois la même chose.
        ...(authorName ? {} : { subtitle: contextSubtitleFor(rLang) }),
        actor: actorInfo,
        context: commonContext,
        metadata: commonMetadata,
        lang: rLang,
      })
    );
  }

  // 3. Friends of the story author (or community co-members) — skip mentioned users
  for (const recipientId of friendAudience) {
    if (excludeSet.has(recipientId)) continue;
    const rLang = langs.get(recipientId) ?? 'fr';
    tasks.push(
      deps.createNotification({
        userId: recipientId,
        type: 'friend_story_comment',
        priority: 'low',
        content: excerpt || notificationString(rLang, 'comment.generic', { postType: i18nPostType }),
        ...(authorName ? {} : { subtitle: contextSubtitleFor(rLang) }),
        actor: actorInfo,
        context: commonContext,
        metadata: commonMetadata,
        lang: rLang,
      })
    );
  }

  // createNotification ne rejette jamais (catch interne + log du userId
  // exact) : attendre les tasks suffit, pas de gestion rejected ici.
  await Promise.allSettled(tasks);
}

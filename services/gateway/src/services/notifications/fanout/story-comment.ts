/**
 * STORY COMMENT FAN-OUT (Phase 1D) — extrait de `NotificationService.ts`
 * (#7093). Fan-out déclenché quand un commentaire de premier niveau arrive
 * sur une story / un post.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { notificationLogger } from '../../../utils/logger-enhanced';
import { filterPostConsumers } from '../../posts/postAudience';
import { truncateMessage } from '../notification-preview';
import { FANOUT_ROW_CAP } from './row-cap';
import { getBlockedUserIdsAmong } from '../../../utils/blocking';
import type { FanoutDependencies } from './dependencies';
import { resolveEntourage, type Entourage } from './entourage';

/** Les trois lectures bornées qui composent les seaux d'un fan-out de fil. */
export type FanoutBucket = 'previousComments' | 'entourage' | 'reactors';

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
 *   3. friendIds (the ENTOURAGE of the author and of the commenter, each at the
 *      level its owner chose — `commentEntourage`, #13929 — excl. commenter,
 *      author, and prior commenters) → FRIEND_STORY_COMMENT
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

  const [previousComments, entourage, reactors] = await Promise.all([
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
    commentEntourage(prisma, authorId, commenterId),
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
    entourage.truncated ? 'entourage' as const : null,
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

  const friendIds = entourage.ids.filter(
    (id: string) => isNotifiableEngager(id) && !previousCommenterSet.has(id)
  );

  return { authorId, friendIds, previousCommenterIds, truncatedBuckets };
}

/**
 * Les tiers prévenus d'un commentaire (#13929) — deux entourages, chacun réglé
 * par SON propriétaire :
 *  - celui de l'AUTEUR du contenu, au cran de « l'activité des autres sur mes
 *    contenus » (`circleOnMyContentComment`, défaut Proche) ;
 *  - celui du COMMENTATEUR, au cran de « mon activité ailleurs »
 *    (`circleElsewhereComment`, défaut Sang) — sauf quand il commente son
 *    propre contenu, qui n'est pas « ailleurs ».
 * Le plus restrictif gagne (#14080) : un destinataire passe les DEUX seuils,
 * chacun mesuré depuis son propriétaire — l'INTERSECTION, dans l'ordre de
 * l'entourage de l'auteur. « Personne » chez l'un ⇒ aucun relais.
 */
async function commentEntourage(
  prisma: PrismaClient,
  authorId: string,
  commenterId: string
): Promise<Entourage> {
  const [ofAuthor, ofCommenter] = await Promise.all([
    resolveEntourage(prisma, { ownerId: authorId, key: 'circleOnMyContentComment', excludeUserIds: [commenterId] }),
    commenterId === authorId
      ? Promise.resolve<Entourage>({ ids: [], truncated: false })
      : resolveEntourage(prisma, { ownerId: commenterId, key: 'circleElsewhereComment', excludeUserIds: [authorId] }),
  ]);
  if (commenterId === authorId) return ofAuthor;
  const commenterSide = new Set(ofCommenter.ids);
  return {
    ids: ofAuthor.ids.filter((id) => commenterSide.has(id)),
    truncated: ofAuthor.truncated || ofCommenter.truncated,
  };
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
 *  - Entourages (author's and commenter's, by their circle settings) → FRIEND_STORY_COMMENT (priority: low)
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

  // Les entourages disent qui est PRÉVENU ; l'admission de la publication dit
  // qui a le droit de la VOIR (PRIVATE, ONLY, EXCEPT, COMMUNITY, FRIENDS — la
  // même table que le fil, #13929). L'auteur (bucket STORY_NEW_COMMENT) en est
  // exempt — il possède le post.
  const visibility = params.visibility;
  const friendAudience = (
    await filterPostConsumers({
      prisma: deps.prisma,
      authorId: params.storyAuthorId,
      visibility,
      visibilityUserIds: params.visibilityUserIds,
      candidateUserIds: friendIds,
    })
  ).filter((id) => id !== params.storyAuthorId && id !== params.commenterId);
  // `previousCommenterIds` (commentateurs antérieurs ∪ réacteurs) n'est PAS une
  // sortie d'énumérateur : c'est un ensemble arbitraire au regard de l'audience
  // du moment. Ils y étaient admis quand ils ont engagé le post ; une
  // dés-amitié ou une édition de visibilité les en sort sans toucher à leur
  // commentaire. Il leur faut donc un test d'ADMISSION.
  // Même audience que `canNotifyAboutPost`, qui garde la notification unitaire
  // de cette même population depuis le cycle 30.
  //
  // Sur un post COMMUNITY, les co-membres sont donc résolus une seconde fois
  // (deux requêtes bornées de plus, sur un chemin déjà détaché de la réponse
  // HTTP). C'est le prix assumé pour ne PAS refiltrer à la main : une copie
  // locale de la règle d'admission est exactement ce qui avait laissé ce seau
  // sans garde.
  const engagedAudience = await filterPostConsumers({
    prisma: deps.prisma,
    authorId: params.storyAuthorId,
    visibility,
    visibilityUserIds: params.visibilityUserIds,
    candidateUserIds: previousCommenterIds,
  });

  // #13350 — le blocage ne rompt pas l'amitié en base : une personne en
  // relation de blocage avec l'AUTEUR de la story sort des deux seaux
  // d'éventail, en une lecture groupée. La garde de dernier recours de
  // `createNotification` ne compare le destinataire qu'à l'ACTEUR (le
  // commentateur) ; le nom de l'auteur et l'extrait de son fil voyagent
  // pourtant dans la charge. Une lecture qui échoue n'envoie rien à ces seaux.
  const fanoutCandidates = [...new Set([...engagedAudience, ...friendAudience])];
  let blockedWithAuthor: Set<string> | null;
  try {
    blockedWithAuthor = await getBlockedUserIdsAmong(deps.prisma, params.storyAuthorId, fanoutCandidates);
  } catch (error) {
    notificationLogger.error('Fan-out de commentaire restreint à l’auteur : blocage illisible', { postId: params.postId, error });
    blockedWithAuthor = null;
  }
  const notBlockedWithAuthor = (id: string): boolean => blockedWithAuthor !== null && !blockedWithAuthor.has(id);
  const engagedRecipients = engagedAudience.filter(notBlockedWithAuthor);
  const friendRecipients = friendAudience.filter(notBlockedWithAuthor);

  const excerpt = params.commentExcerpt
    ? truncateMessage(params.commentExcerpt)
    : '';

  // Wording typé : le destinataire doit savoir SUR QUOI porte le commentaire
  // (story / publication / humeur) et, pour les buckets fan-out, la
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
  const langs = await deps.resolveRecipientLangs([authorId, ...engagedRecipients, ...friendRecipients]);
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
  for (const recipientId of engagedRecipients) {
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
  for (const recipientId of friendRecipients) {
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

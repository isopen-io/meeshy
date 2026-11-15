/**
 * Les bâtisseurs d'ENGAGEMENT sur un contenu social — extraits de
 * `NotificationService.ts` (#7632, budget de taille).
 *
 * Une responsabilité : dire à l'AUTEUR d'un post ou d'un commentaire que
 * quelqu'un vient d'interagir avec lui. Réaction, commentaire, partage,
 * réponse de commentaire, réaction de commentaire — cinq entrées, UN
 * destinataire chacune, et la même question : QUEL contenu est visé, et que
 * montrer de lui.
 *
 * Ce que ces cinq partagent, et qui justifie le regroupement :
 *  - la vignette du contenu visé (`resolvePostMedia`) voyage jusqu'au push iOS ;
 *  - le SUBTITLE nomme la cible, le CORPS la MONTRE (cf. `targetPreviewBody`) ;
 *  - l'extrait du POST visé est RELU et descend le Prisme du destinataire
 *    (`../served-post-excerpt`, #8731) — jamais reçu tout fait d'un appelant ;
 *  - l'auteur ne se notifie jamais lui-même.
 *
 * Les éventails batch (mentions, amis, commentaires de story) vivent chez eux,
 * dans `../fanout/` : ils composent une AUDIENCE, ceux-ci servent un lecteur
 * NOMMÉ.
 *
 * Le fichier ne s'appelle PAS `post-engagement.ts` : le `.gitignore` racine
 * porte un `post-*` NON QUALIFIÉ, qui matche par BASENAME à toute profondeur et
 * aurait avalé ce module en silence — vert en local, absent du dépôt. Le
 * `.gitignore` documente lui-même le piège et tient une liste d'exceptions ;
 * un nom qui ne le déclenche pas coûte moins qu'une ligne de plus dessus.
 */
import type { Notification } from '@meeshy/shared/types/notification';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { buildOwnerSubtitleWithDetail, targetPreviewBody } from '../notification-preview';
import { resolvePostMedia } from '../post-media-thumbnail';
import { loadServedPostExcerpt } from '../served-post-excerpt';
import { textSynthesis } from '../content-synthesis';
import type { NotificationBuilderDependencies } from './dependencies';
import { relayActivityToEntourage, relayRepostToEntourage } from '../fanout/activity-relay';

export async function createPostLikeNotification(
  deps: NotificationBuilderDependencies,
  params: {
    actorId: string;
    postId: string;
    postAuthorId: string;
    emoji: string;
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
    /** Date de publication ISO du contenu réagi (contexte expiry côté client). */
    postCreatedAt?: string | Date;
    /** Date d'expiration ISO (story/status éphémère) → le client affiche « expirée ». */
    postExpiresAt?: string | Date;
  }
): Promise<Notification | null> {
  // Don't notify yourself
  if (params.actorId === params.postAuthorId) return null;

  // Anti-spam: throttle reaction notifications per sender→recipient pair
  if (!deps.shouldCreateReactionNotification(params.actorId, params.postAuthorId)) {
    return null;
  }

  const actor = await deps.prisma.user.findUnique({
    where: { id: params.actorId },
    select: { username: true, displayName: true, avatar: true },
  });
  if (!actor) return null;

  // Map postType to the right notification type
  const type = params.postType === 'STORY'
    ? 'story_reaction'
    : params.postType === 'STATUS'
      ? 'status_reaction'
      : 'post_like';

  const prism = await deps.resolveRecipientPrism(params.postAuthorId);
  const lang = prism.lang;
  const subtitlePostType = params.postType ?? 'POST';

  // Détail du contenu réagi : sa SYNTHÈSE (« Message texte · Image haute
  // définition », #14318) — le destinataire identifie QUEL contenu sans que le
  // texte parte, et le push iOS attache la seule vignette. L'extrait servi
  // descend le Prisme du destinataire (#8731) et ne sert qu'à compter.
  const trimmedPreview = await servedExcerpt(deps, params.postId, prism.ordered);
  const media = await resolvePostMedia(deps.prisma, params.postId);
  // Le sous-titre nomme la cible, le corps la MONTRE : le détail (texte /
  // média) descend dans le corps, que la phrase d'action n'occupe plus.
  const subtitle = notificationString(lang, 'comment.subtitleOwner', { postType: subtitlePostType });

  // L'entourage de l'auteur ET du réacteur apprend la réaction (#14068), sous le
  // même débit que la notification de l'auteur ; ce relais ne lève jamais.
  const relayed = relayActivityToEntourage(deps, {
    activity: 'reaction',
    postId: params.postId,
    actorId: params.actorId,
    emoji: params.emoji,
  });

  const notification = await deps.createNotification({
    userId: params.postAuthorId,
    type,
    priority: 'normal',
    content: targetPreviewBody(lang, subtitlePostType, {
      textPreview: trimmedPreview,
      mediaType: media?.mediaType,
    }),
    subtitle,
    lang,

    actor: {
      id: params.actorId,
      username: actor.username,
      displayName: actor.displayName,
      avatar: actor.avatar,
    },

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
      emoji: params.emoji,
      postType: params.postType || 'POST',
      ...postPreviewField(lang, trimmedPreview),
      ...(media ? { mediaType: media.mediaType } : {}),
      ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
    },
  });
  await relayed;
  return notification;
}

// ==============================================
// SOCIAL — POST_COMMENT
// ==============================================

export async function createPostCommentNotification(
  deps: NotificationBuilderDependencies,
  params: {
    actorId: string;
    postId: string;
    postAuthorId: string;
    commentId: string;
    commentPreview: string;
    /** Type du post commenté — pilote le wording du subtitle. Défaut POST. */
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
    /** Date de publication ISO du post (le client en dérive « du JJ/MM/AAAA HH:MM »). */
    postCreatedAt?: string | Date;
    /** Date d'expiration ISO (story/status éphémère) → le client affiche « expirée ». */
    postExpiresAt?: string | Date;
  }
): Promise<Notification | null> {
  if (params.actorId === params.postAuthorId) return null;

  const actor = await deps.prisma.user.findUnique({
    where: { id: params.actorId },
    select: { username: true, displayName: true, avatar: true },
  });
  if (!actor) return null;

  // Subtitle = la cible du commentaire (« Votre humeur · Message texte ») ;
  // body = la SYNTHÈSE du commentaire (#14318). Libellés dans la langue de
  // cadrage du destinataire.
  const prism = await deps.resolveRecipientPrism(params.postAuthorId);
  const lang = prism.lang;
  const trimmedPostPreview = await servedExcerpt(deps, params.postId, prism.ordered);
  // Cible du commentaire : synthèse du post (texte puis média) + vignette
  // poussée au push iOS.
  const media = await resolvePostMedia(deps.prisma, params.postId);
  const subtitle = buildOwnerSubtitleWithDetail(lang, params.postType ?? 'POST', {
    textPreview: trimmedPostPreview,
    mediaType: media?.mediaType,
  });

  return deps.createNotification({
    userId: params.postAuthorId,
    type: 'post_comment',
    priority: 'normal',
    content: textSynthesis(lang, params.commentPreview),
    subtitle,
    lang,

    actor: {
      id: params.actorId,
      username: actor.username,
      displayName: actor.displayName,
      avatar: actor.avatar,
    },

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
      commentId: params.commentId,
      commentPreview: textSynthesis(lang, params.commentPreview),
      postType: params.postType ?? 'POST',
      ...postPreviewField(lang, trimmedPostPreview),
      ...(media ? { mediaType: media.mediaType } : {}),
      ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
    },
  });
}

// ==============================================
// SOCIAL — POST_REPOST
// ==============================================

export async function createPostRepostNotification(
  deps: NotificationBuilderDependencies,
  params: {
    actorId: string;
    originalPostId: string;
    postAuthorId: string;
    repostId: string;
    /** Type du post partagé — pilote le wording. Défaut POST. */
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
    /** Date de publication ISO du contenu partagé (contexte expiry côté client). */
    postCreatedAt?: string | Date;
    /** Date d'expiration ISO (story/status éphémère) → le client affiche « expirée ». */
    postExpiresAt?: string | Date;
    /** L'éventail `friend_new_post` de la republication est parti (porte `POST /posts`). */
    reposterEntourageNotified?: boolean;
  }
): Promise<Notification | null> {
  // #14070 / #14072 — l'entourage de l'auteur republié l'apprend, que l'auteur
  // puisse voir la republication ou non : chacun est admis sur ce qu'IL voit.
  const [, notification] = await Promise.all([
    relayRepostToEntourage(deps, {
      originalPostId: params.originalPostId,
      repostId: params.repostId,
      actorId: params.actorId,
      reposterEntourageNotified: params.reposterEntourageNotified === true,
    }),
    notifyRepostedAuthorOnly(deps, params),
  ]);
  return notification;
}

async function notifyRepostedAuthorOnly(
  deps: NotificationBuilderDependencies,
  params: Parameters<typeof createPostRepostNotification>[1]
): Promise<Notification | null> {
  if (params.actorId === params.postAuthorId) return null;

  // #10525 — la notification DIT qu'une republication existe : l'auteur de
  // l'original ne l'apprend que s'il peut la VOIR (republication privée, ou
  // dont l'audience l'exclut). Même verdict, fail-closed, que les autres
  // notifications à destinataire unique du fil.
  if (!(await deps.canNotifyAboutPost(params.repostId, params.postAuthorId))) return null;

  const actor = await deps.prisma.user.findUnique({
    where: { id: params.actorId },
    select: { username: true, displayName: true, avatar: true },
  });
  if (!actor) return null;

  const prism = await deps.resolveRecipientPrism(params.postAuthorId);
  const lang = prism.lang;
  const trimmedPostPreview = await servedExcerpt(deps, params.originalPostId, prism.ordered);
  const media = await resolvePostMedia(deps.prisma, params.originalPostId);
  // Cf. `targetPreviewBody` : une republication n'apporte aucun contenu neuf,
  // le détail du contenu republié descend donc dans le corps.
  const subtitle = notificationString(lang, 'comment.subtitleOwner', { postType: params.postType ?? 'POST' });

  return deps.createNotification({
    userId: params.postAuthorId,
    type: 'post_repost',
    priority: 'normal',
    content: targetPreviewBody(lang, params.postType ?? 'POST', {
      textPreview: trimmedPostPreview,
      mediaType: media?.mediaType,
    }),
    subtitle,
    lang,

    actor: {
      id: params.actorId,
      username: actor.username,
      displayName: actor.displayName,
      avatar: actor.avatar,
    },

    context: {
      postId: params.originalPostId,
      ...(params.postCreatedAt ? { postCreatedAt: new Date(params.postCreatedAt).toISOString() } : {}),
      ...(params.postExpiresAt ? { postExpiresAt: new Date(params.postExpiresAt).toISOString() } : {}),
      ...(media?.thumbnailUrl
        ? { firstAttachmentUrl: media.thumbnailUrl, firstAttachmentMimeType: media.thumbnailMimeType }
        : {}),
    },

    metadata: {
      action: 'view_post',
      originalPostId: params.originalPostId,
      repostId: params.repostId,
      postType: params.postType ?? 'POST',
      ...postPreviewField(lang, trimmedPostPreview),
      ...(media ? { mediaType: media.mediaType } : {}),
      ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
    },
  });
}

// ==============================================
// SOCIAL — COMMENT_REPLY
// ==============================================

export async function createCommentReplyNotification(
  deps: NotificationBuilderDependencies,
  params: {
    actorId: string;
    postId: string;
    commentAuthorId: string;
    commentId: string;
    /** Identifiant du commentaire parent — permet au client de déplier le fil
     *  parent puis de défiler/surligner la réponse (`commentId`). */
    parentCommentId?: string;
    replyPreview: string;
    /** Extrait du commentaire parent — identifie À QUOI on répond. */
    parentCommentPreview?: string;
    /** Type du contenu portant le commentaire — précise « sur votre story/réel ». Défaut POST. */
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
    /** Date de publication ISO du contenu (le client en dérive « du JJ/MM/AAAA HH:MM »). */
    postCreatedAt?: string | Date;
    /** Date d'expiration ISO (story/status éphémère) → le client affiche « expirée ». */
    postExpiresAt?: string | Date;
  }
): Promise<Notification | null> {
  if (params.actorId === params.commentAuthorId) return null;

  if (!(await deps.canNotifyAboutPost(params.postId, params.commentAuthorId))) return null;

  const actor = await deps.prisma.user.findUnique({
    where: { id: params.actorId },
    select: { username: true, displayName: true, avatar: true },
  });
  if (!actor) return null;

  // Le titre « X a répondu à votre commentaire » est calculé par le builder
  // (source unique localisée). Le subtitle précise l'ENTITÉ portant le
  // commentaire (« Story », « Réel »…) — pas « publication » générique ; le
  // client y append la date locale (« · 23/06/2026 14:30 ») depuis postCreatedAt.
  const prism = await deps.resolveRecipientPrism(params.commentAuthorId);
  const lang = prism.lang;
  const trimmedParent = params.parentCommentPreview?.trim() ?? '';
  const postExcerpt = await servedExcerpt(deps, params.postId, prism.ordered);
  // POST_NOUN_CAP gère REEL distinctement (« Réel ») → pas de mapping vers POST.
  const subtitle = notificationString(lang, 'comment.subtitleBare', { postType: params.postType ?? 'POST' });
  // Vignette du contenu portant le commentaire → attachée au push iOS.
  const media = await resolvePostMedia(deps.prisma, params.postId);

  return deps.createNotification({
    userId: params.commentAuthorId,
    type: 'comment_reply',
    priority: 'normal',
    content: textSynthesis(lang, params.replyPreview),
    subtitle,
    lang,

    actor: {
      id: params.actorId,
      username: actor.username,
      displayName: actor.displayName,
      avatar: actor.avatar,
    },

    context: {
      postId: params.postId,
      commentId: params.commentId,
      ...(params.parentCommentId ? { parentCommentId: params.parentCommentId } : {}),
      ...(params.postCreatedAt ? { postCreatedAt: new Date(params.postCreatedAt).toISOString() } : {}),
      ...(params.postExpiresAt ? { postExpiresAt: new Date(params.postExpiresAt).toISOString() } : {}),
      ...(media?.thumbnailUrl
        ? { firstAttachmentUrl: media.thumbnailUrl, firstAttachmentMimeType: media.thumbnailMimeType }
        : {}),
    },

    metadata: {
      action: 'view_post',
      postId: params.postId,
      commentId: params.commentId,
      ...(params.parentCommentId ? { parentCommentId: params.parentCommentId } : {}),
      commentPreview: textSynthesis(lang, params.replyPreview),
      postType: params.postType ?? 'POST',
      ...(trimmedParent !== ''
        ? { parentCommentPreview: textSynthesis(lang, trimmedParent) }
        : {}),
      ...postPreviewField(lang, postExcerpt),
      ...(media ? { mediaType: media.mediaType } : {}),
      ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
    },
  });
}

// ==============================================
// SOCIAL — COMMENT_LIKE
// ==============================================

export async function createCommentLikeNotification(
  deps: NotificationBuilderDependencies,
  params: {
    actorId: string;
    postId: string;
    commentId: string;
    commentAuthorId: string;
    emoji: string;
    /** Extrait du commentaire liké — identifie QUEL commentaire reçoit la réaction. */
    commentPreview?: string;
    /**
     * Type de l'entité PORTANT le commentaire liké. Sans lui, le client ne peut
     * pas choisir la bonne surface (lecteur de réel / viewer éphémère / détail
     * de post) et retombe sur une heuristique de cache. Défaut POST.
     */
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
  }
): Promise<Notification | null> {
  if (params.actorId === params.commentAuthorId) return null;

  if (!(await deps.canNotifyAboutPost(params.postId, params.commentAuthorId))) return null;

  const actor = await deps.prisma.user.findUnique({
    where: { id: params.actorId },
    select: { username: true, displayName: true, avatar: true },
  });
  if (!actor) return null;

  const prism = await deps.resolveRecipientPrism(params.commentAuthorId);
  const lang = prism.lang;
  const trimmedPreview = params.commentPreview?.trim() ?? '';
  const postExcerpt = await servedExcerpt(deps, params.postId, prism.ordered);
  // Vignette du post portant le commentaire → attachée au push iOS.
  const media = await resolvePostMedia(deps.prisma, params.postId);
  // La cible est LE COMMENTAIRE : sa SYNTHÈSE est ce que le corps dit (#14318),
  // la phrase d'action étant déjà portée par le titre et la bannière. Sans
  // texte, le corps nomme l'entité.
  const commentSynthesis = textSynthesis(lang, trimmedPreview);
  const commentBody = commentSynthesis || notificationString(lang, 'comment.reply');

  return deps.createNotification({
    userId: params.commentAuthorId,
    type: 'comment_like',
    priority: 'low',
    content: commentBody,
    lang,

    actor: {
      id: params.actorId,
      username: actor.username,
      displayName: actor.displayName,
      avatar: actor.avatar,
    },

    context: {
      postId: params.postId,
      ...(media?.thumbnailUrl
        ? { firstAttachmentUrl: media.thumbnailUrl, firstAttachmentMimeType: media.thumbnailMimeType }
        : {}),
    },

    metadata: {
      action: 'view_post',
      postId: params.postId,
      commentId: params.commentId,
      emoji: params.emoji,
      postType: params.postType ?? 'POST',
      ...(commentSynthesis !== '' ? { commentPreview: commentSynthesis } : {}),
      ...postPreviewField(lang, postExcerpt),
      ...(media ? { mediaType: media.mediaType } : {}),
      ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
    },
  });
}

/**
 * L'extrait du POST visé, sous la clé que la réécriture d'édition connaît
 * (`reproduceEditedSubjectNotifications` → `postPreview`) : une notification
 * sur un COMMENTAIRE décrit aussi le contenu qui le porte (#8724). Vide ⇒ rien.
 */
export function postPreviewField(
  lang: string,
  postPreview: string | undefined,
): { postPreview?: string } {
  const synthesis = textSynthesis(lang, postPreview);
  return synthesis !== '' ? { postPreview: synthesis } : {};
}

/**
 * L'extrait du post, RELU et résolu dans le Prisme du destinataire (#8731) —
 * chaîne vide quand rien ne doit partir (post sans texte, supprimé, expiré,
 * illisible), la forme qu'attendent les compositeurs voisins.
 */
async function servedExcerpt(
  deps: Pick<NotificationBuilderDependencies, 'prisma'>,
  postId: string,
  preferredLanguages: readonly string[],
): Promise<string> {
  return (await loadServedPostExcerpt(deps.prisma, { postId, preferredLanguages })) ?? '';
}

// ==============================================
// SOCIAL — COMMENT_REACTION
// ==============================================

export async function createCommentReactionNotification(
  deps: NotificationBuilderDependencies,
  params: {
  commentAuthorId: string;
  reactorUserId: string;
  commentId: string;
  postId: string;
  reactionEmoji: string;
  /** Truncated comment content (≤ 80 chars) to inject into the body. */
  commentPreview?: string;
  /** Display name (fallback: username) of the post/story author. */
  postAuthorName?: string;
  /**
   * Type d'entité portant le commentaire réagi. Mirror du sibling
   * `createPostLikeNotification` : un REEL/STATUS ne s'effondre plus vers 'POST'
   * dans la métadonnée ni dans le corps localisé.
   */
  postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
}): Promise<void> {
  if (params.commentAuthorId === params.reactorUserId) return;

  // Anti-spam: throttle reaction notifications per sender→recipient pair
  if (!deps.shouldCreateReactionNotification(params.reactorUserId, params.commentAuthorId)) {
    return;
  }

  if (!(await deps.canNotifyAboutPost(params.postId, params.commentAuthorId))) return;

  const reactor = await deps.prisma.user.findUnique({
    where: { id: params.reactorUserId },
    select: { username: true, displayName: true, avatar: true },
  });

  if (!reactor) return;

  const prism = await deps.resolveRecipientPrism(params.commentAuthorId);
  const lang = prism.lang;

  // Subtitle (rendu sous le title côté iOS — banner riche) : la SYNTHÈSE du
  // commentaire qui a reçu la réaction (#14318), jamais son texte. Calculée
  // une fois : elle sert au sous-titre ET, en métadonnée, de clé de
  // réécriture quand le commentaire est édité.
  const commentSynthesis = textSynthesis(lang, params.commentPreview);
  const subtitle = commentSynthesis !== '' ? commentSynthesis : undefined;

  // Le CORPS dit ce qui a été visé, jamais la phrase d'action (#9049) : le
  // titre porte déjà « Alice a réagi ❤️ à votre commentaire », et le répéter
  // en corps le faisait lire deux fois — sur la liste, le push et la bannière.
  // La synthèse du commentaire d'abord ; à défaut, le contexte (« Sur le réel de
  // Bob ») ; en dernier recours la phrase d'action, pour qu'une ligne ne soit
  // jamais vide.
  const context = notificationString(lang, 'reaction.commentContext', {
    author: params.postAuthorName,
    postType: params.postType,
  }).trim();
  const body = subtitle
    ?? (context !== '' ? context.charAt(0).toLocaleUpperCase(lang) + context.slice(1) : undefined)
    ?? notificationString(lang, 'reaction.comment', { emoji: params.reactionEmoji });

  // Vignette + nature du média du post (#8724) : la ligne montre DE QUOI il
  // s'agit — même source que les quatre bâtisseurs voisins.
  const media = await resolvePostMedia(deps.prisma, params.postId);
  const postExcerpt = await servedExcerpt(deps, params.postId, prism.ordered);

  await deps.createNotification({
    userId: params.commentAuthorId,
    type: 'comment_reaction',
    priority: 'low',
    content: body,
    subtitle,
    lang,

    actor: {
      id: params.reactorUserId,
      username: reactor.username,
      displayName: reactor.displayName,
      avatar: reactor.avatar,
    },

    // postId/commentId vivent dans context (cible de navigation = contexte
    // central de la notif). Ils sont désormais exposés par le schema de
    // réponse (notificationContextSchema) — plus de strip côté REST.
    context: {
      postId: params.postId,
      commentId: params.commentId,
      ...(media?.thumbnailUrl
        ? { firstAttachmentUrl: media.thumbnailUrl, firstAttachmentMimeType: media.thumbnailMimeType }
        : {}),
    },

    metadata: {
      action: 'view_post',
      reactionEmoji: params.reactionEmoji,
      // Entité portant le commentaire → le client affiche « Réel »/« Humeur »/« Story »/
      // « Publication » (et non un libellé générique). Ne s'effondre plus vers 'POST'
      // pour les REEL/STATUS (F58) — cohérent avec le sibling post-reaction.
      postType: params.postType ?? 'POST',
      // La synthèse rangée ici rend la ligne AUTO-DESCRIPTIVE : c'est elle que
      // `reproduceEditedSubjectNotifications` cherche dans le sous-titre pour
      // la recalculer quand le commentaire est édité. Même clé que ses
      // voisins `comment_like` / `post_comment`.
      ...(commentSynthesis !== '' ? { commentPreview: commentSynthesis } : {}),
      ...postPreviewField(lang, postExcerpt),
      ...(media ? { mediaType: media.mediaType } : {}),
      ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
    },
  });
}

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
import type { NotificationBuilderDependencies } from './dependencies';

export async function createPostLikeNotification(
  deps: NotificationBuilderDependencies,
  params: {
    actorId: string;
    postId: string;
    postAuthorId: string;
    emoji: string;
    postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
    /** Aperçu du contenu réagi (≤ ~80 chars) — identifie QUELLE entité. */
    postPreview?: string;
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

  const lang = await deps.resolveRecipientLang(params.postAuthorId);
  const subtitlePostType = params.postType ?? 'POST';

  // Détail du contenu réagi : extrait texte si présent, sinon vignette/résumé
  // média (« Votre story · 📷 Photo ») — le destinataire identifie QUEL
  // contenu sans ouvrir l'app, et le push iOS attache la miniature.
  const trimmedPreview = params.postPreview?.trim() ?? '';
  const media = await resolvePostMedia(deps.prisma, params.postId);
  // Le sous-titre nomme la cible, le corps la MONTRE : le détail (texte /
  // média) descend dans le corps, que la phrase d'action n'occupe plus.
  const subtitle = notificationString(lang, 'comment.subtitleOwner', { postType: subtitlePostType });

  return deps.createNotification({
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
      ...(trimmedPreview !== ''
        ? { postPreview: deps.truncateMessage(trimmedPreview) }
        : {}),
      ...(media ? { mediaType: media.mediaType } : {}),
      ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
    },
  });
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
    /** Extrait du post commenté (≤ ~80 chars) pour identifier LE post visé. */
    postPreview?: string;
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

  // Subtitle = la cible du commentaire (« Votre humeur : « … » ») ; body =
  // le texte du commentaire. Le destinataire sait QUOI a été commenté sans
  // ouvrir l'app. Libellé localisé (Prisme-first) — plus de français codé en dur.
  const lang = await deps.resolveRecipientLang(params.postAuthorId);
  const trimmedPostPreview = params.postPreview?.trim() ?? '';
  // Cible du commentaire : extrait texte du post si présent, sinon résumé
  // média (« Votre publication · 📷 Photo ») + vignette poussée au push iOS.
  const media = await resolvePostMedia(deps.prisma, params.postId);
  const subtitle = buildOwnerSubtitleWithDetail(lang, params.postType ?? 'POST', {
    textPreview: trimmedPostPreview,
    mediaType: media?.mediaType,
  });

  return deps.createNotification({
    userId: params.postAuthorId,
    type: 'post_comment',
    priority: 'normal',
    content: deps.truncateMessage(params.commentPreview),
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
      commentPreview: deps.truncateMessage(params.commentPreview),
      postType: params.postType ?? 'POST',
      ...(trimmedPostPreview !== ''
        ? { postPreview: deps.truncateMessage(trimmedPostPreview) }
        : {}),
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
    /** Extrait du post partagé pour identifier LE contenu repris. */
    postPreview?: string;
    /** Date de publication ISO du contenu partagé (contexte expiry côté client). */
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

  const lang = await deps.resolveRecipientLang(params.postAuthorId);
  const trimmedPostPreview = params.postPreview?.trim() ?? '';
  const media = await resolvePostMedia(deps.prisma, params.originalPostId);
  // Cf. `targetPreviewBody` : un partage n'apporte aucun contenu neuf, le
  // détail du contenu partagé descend donc dans le corps.
  const subtitle = notificationString(lang, 'comment.subtitleOwner', {
    postType: params.postType ?? 'POST',
  });

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
      ...(trimmedPostPreview !== ''
        ? { postPreview: deps.truncateMessage(trimmedPostPreview) }
        : {}),
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
  const lang = await deps.resolveRecipientLang(params.commentAuthorId);
  const trimmedParent = params.parentCommentPreview?.trim() ?? '';
  // POST_NOUN_CAP gère REEL distinctement (« Réel ») → pas de mapping vers POST.
  const subtitle = notificationString(lang, 'comment.subtitleBare', { postType: params.postType ?? 'POST' });
  // Vignette du contenu portant le commentaire → attachée au push iOS.
  const media = await resolvePostMedia(deps.prisma, params.postId);

  return deps.createNotification({
    userId: params.commentAuthorId,
    type: 'comment_reply',
    priority: 'normal',
    content: deps.truncateMessage(params.replyPreview),
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
      commentPreview: deps.truncateMessage(params.replyPreview),
      postType: params.postType ?? 'POST',
      ...(trimmedParent !== ''
        ? { parentCommentPreview: deps.truncateMessage(trimmedParent) }
        : {}),
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

  const lang = await deps.resolveRecipientLang(params.commentAuthorId);
  const trimmedPreview = params.commentPreview?.trim() ?? '';
  // Vignette du post portant le commentaire → attachée au push iOS.
  const media = await resolvePostMedia(deps.prisma, params.postId);
  // La cible est LE COMMENTAIRE : son extrait est ce que le corps doit
  // montrer, la phrase d'action étant déjà portée par le titre et la
  // bannière. Sans extrait, le corps nomme l'entité.
  const commentBody = trimmedPreview !== ''
    ? `« ${deps.truncateMessage(trimmedPreview)} »`
    : notificationString(lang, 'comment.reply');

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
      ...(trimmedPreview !== ''
        ? { commentPreview: deps.truncateMessage(trimmedPreview) }
        : {}),
      ...(media?.thumbnailUrl ? { postThumbnailUrl: media.thumbnailUrl } : {}),
    },
  });
}

/**
 * Sections d'export supplémentaires pour `GET /me/export` (#3633).
 *
 * Extrait dans un module séparé pour garder `export.ts` sous le budget de
 * taille — chaque fonction est une requête BORNÉE (toujours `take`/`skip`,
 * jamais un `findMany` nu : `me/export.ts` porte déjà 2 `findMany` non bornés
 * hérités et gelés par `unbounded-findmany-guard.test.ts`, ce module n'en
 * ajoute aucun) qui rend `{ items, total }` — `total` sert à calculer
 * `hasMore` côté route, sans réintroduire une pagination par curseur pour un
 * usage ponctuel (export RGPD, pas une liste défilante).
 *
 * Chaque sélection est un SUPERSET conscient des colonnes utiles à
 * l'utilisateur, à l'exclusion explicite de ce qui n'est ni lisible ni
 * portable : embeddings binaires (`UserVoiceModel.embedding`,
 * `chatterboxConditionals`), jetons de session (`sessionToken`,
 * `refreshToken`, `deviceFingerprint`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { validatePagination } from '../../utils/pagination';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

export type ExportPage = { readonly limit: number; readonly offset: number };

/**
 * Borne `limit`/`offset` une fois, pour toutes les sections d'un même appel.
 *
 * Route par `validatePagination` (SSOT, `utils/pagination.ts`) plutôt qu'un
 * `parseInt` local — `pagination-parse-sweep.test.ts` interdit tout décodage de
 * pagination hors de ce point unique sur les routes non-admin.
 */
export function resolveExportPage(query: { limit?: string; offset?: string }): ExportPage {
  return validatePagination(query.offset ?? '0', query.limit, {
    defaultLimit: DEFAULT_LIMIT,
    maxLimit: MAX_LIMIT,
  });
}

export type ExportSection<T> = { readonly items: readonly T[]; readonly total: number; readonly hasMore: boolean };

function toSection<T>(items: readonly T[], total: number, page: ExportPage): ExportSection<T> {
  return { items, total, hasMore: page.offset + items.length < total };
}

export async function exportPosts(prisma: PrismaClient, userId: string, page: ExportPage) {
  const where = { authorId: userId, type: { in: ['POST' as const, 'REEL' as const] }, deletedAt: null };
  const [items, total] = await Promise.all([
    prisma.post.findMany({
      where,
      select: {
        id: true, type: true, visibility: true, content: true, originalLanguage: true,
        communityId: true, repostOfId: true, isQuote: true, createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.post.count({ where }),
  ]);
  return toSection(items, total, page);
}

export async function exportStories(prisma: PrismaClient, userId: string, page: ExportPage) {
  const where = { authorId: userId, type: { in: ['STORY' as const, 'STATUS' as const] }, deletedAt: null };
  const [items, total] = await Promise.all([
    prisma.post.findMany({
      where,
      select: {
        id: true, type: true, visibility: true, content: true, storyEffects: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.post.count({ where }),
  ]);
  return toSection(items, total, page);
}

export async function exportComments(prisma: PrismaClient, userId: string, page: ExportPage) {
  const where = { authorId: userId, deletedAt: null };
  const [items, total] = await Promise.all([
    prisma.postComment.findMany({
      where,
      select: {
        id: true, postId: true, parentId: true, content: true, originalLanguage: true,
        isEdited: true, likeCount: true, replyCount: true, createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.postComment.count({ where }),
  ]);
  return toSection(items, total, page);
}

/**
 * Trois tables distinctes (réaction message / post / commentaire), trois
 * conventions de propriétaire (`participantId` via `Participant.userId`, ou
 * `userId` direct) — fusionner en une seule liste imposerait un curseur
 * commun à des collections hétérogènes. Chacune est bornée et paginée
 * indépendamment, sous la MÊME fenêtre `limit`/`offset`.
 */
export async function exportReactions(prisma: PrismaClient, participantIds: readonly string[], userId: string, page: ExportPage) {
  const messageWhere = { participantId: { in: [...participantIds] } };
  const postWhere = { userId };
  const commentWhere = { userId };

  const [messages, messagesTotal, posts, postsTotal, comments, commentsTotal] = await Promise.all([
    prisma.reaction.findMany({
      where: messageWhere,
      select: { id: true, messageId: true, emoji: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.reaction.count({ where: messageWhere }),
    prisma.postReaction.findMany({
      where: postWhere,
      select: { id: true, postId: true, emoji: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.postReaction.count({ where: postWhere }),
    prisma.commentReaction.findMany({
      where: commentWhere,
      select: { id: true, commentId: true, emoji: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.commentReaction.count({ where: commentWhere }),
  ]);

  return {
    messages: toSection(messages, messagesTotal, page),
    posts: toSection(posts, postsTotal, page),
    comments: toSection(comments, commentsTotal, page),
  };
}

/** Même raison de séparation que `exportReactions` : deux tables, deux propriétaires. */
export async function exportMedia(prisma: PrismaClient, userId: string, page: ExportPage) {
  const attachmentWhere = { uploadedBy: userId, isAnonymous: false };
  const postMediaWhere = { uploaderId: userId };

  const [attachments, attachmentsTotal, postMedia, postMediaTotal] = await Promise.all([
    prisma.messageAttachment.findMany({
      where: attachmentWhere,
      select: {
        id: true, messageId: true, originalName: true, mimeType: true, fileSize: true,
        fileUrl: true, duration: true, width: true, height: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.messageAttachment.count({ where: attachmentWhere }),
    prisma.postMedia.findMany({
      where: postMediaWhere,
      select: {
        id: true, postId: true, commentId: true, originalName: true, mimeType: true,
        fileSize: true, fileUrl: true, duration: true, width: true, height: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.postMedia.count({ where: postMediaWhere }),
  ]);

  return {
    attachments: toSection(attachments, attachmentsTotal, page),
    postMedia: toSection(postMedia, postMediaTotal, page),
  };
}

/**
 * Au plus une ligne par utilisateur (`userId` unique) : pas de pagination à
 * proprement parler, mais un `findFirst` reste bien plus honnête qu'un
 * `findUnique` suivi d'un cast — et surtout, EXCLUT les blobs binaires
 * (`embedding`, `chatterboxConditionals`) qui n'ont aucun sens dans un export
 * JSON portable.
 */
export async function exportVoiceProfile(prisma: PrismaClient, userId: string) {
  return prisma.userVoiceModel.findFirst({
    where: { userId },
    select: {
      profileId: true, embeddingModel: true, embeddingDimension: true, audioCount: true,
      totalDurationMs: true, qualityScore: true, version: true, referenceAudioUrl: true,
      trainingAudioSamples: true, voiceCharacteristics: true, voiceAnalysisAt: true,
      voicePublicAt: true, createdAt: true, updatedAt: true,
    },
  });
}

/**
 * Jamais `sessionToken`/`refreshToken`/`deviceFingerprint` : ce sont des
 * secrets d'authentification, pas des données à exporter — le hachage
 * n'annule pas la règle de ne jamais faire voyager un identifiant
 * d'authentification hors de son usage.
 */
export async function exportSessions(prisma: PrismaClient, userId: string, page: ExportPage) {
  const where = { userId };
  const [items, total] = await Promise.all([
    prisma.userSession.findMany({
      where,
      select: {
        id: true, deviceType: true, deviceVendor: true, deviceModel: true, osName: true,
        osVersion: true, browserName: true, browserVersion: true, isMobile: true,
        country: true, city: true, isTrusted: true, isCurrentSession: true,
        expiresAt: true, isValid: true, invalidatedAt: true, invalidatedReason: true,
        createdAt: true, lastActivityAt: true,
      },
      orderBy: { lastActivityAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.userSession.count({ where }),
  ]);
  return toSection(items, total, page);
}

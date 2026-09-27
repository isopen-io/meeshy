/**
 * La photo et la bannière d'un membre, posées par l'administration (#8217).
 *
 * - `GET /admin/users/:userId/profile-image-candidates` — les images que le
 *   membre a déjà rendues PUBLIQUES, parmi lesquelles choisir.
 * - `PUT /admin/users/:userId/profile-images/:kind` (`avatar` | `banner`) —
 *   pose l'image, par l'une de trois sources :
 *     `upload` — une image que l'ADMINISTRATEUR vient de téléverser
 *                (`POST /attachments/upload`), reconnue par SA ligne ;
 *     `media`  — une image publique du membre (`PROFILE_IMAGE_CANDIDATE`) ;
 *     `none`   — retirer l'image.
 *
 * ## Ce qui ne devient PAS public par ce geste
 *
 * Une photo de profil est visible de tous. Un média ne peut donc être choisi
 * que s'il l'est DÉJÀ : image d'un post ou d'un reel `PUBLIC`, non supprimé.
 * Une pièce jointe de message, une story (masquée du public après 20 h), un
 * statut, un post réservé aux amis ou à une communauté ne sont jamais
 * candidats — la liste ne les offre pas, et l'écriture les refuse (la MÊME
 * requête décide des deux). Rendre public un média privé demande une décision
 * explicite, que cette route ne prend pas.
 *
 * ## Et pas d'URL arbitraire
 *
 * `PATCH /admin/users/:userId` accepte `avatar: <url>` (`z.url()`), ce qui
 * refusait l'adresse RELATIVE qu'un téléversement rend — la voie « téléverser »
 * n'aboutissait pas — et laissait poser n'importe quelle adresse externe. Ici
 * l'URL doit désigner un téléversement de l'acteur lui-même.
 *
 * ## Les gardes
 *
 * Celles des écritures d'un compte (`users-write.ts`) : `canUpdateUsers`, puis
 * le RANG (`requireHierarchy`), puis la loi des champs `avatar` / `banner`.
 * La lecture des candidates porte les mêmes : elle ne sert qu'à préparer
 * l'écriture.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { UserAuditAction, UserRoleEnum } from '@meeshy/shared/types';
import type { UserAuditService } from '../../services/admin/user-audit.service';
import { sanitizationService } from '../../services/admin/user-sanitization.service';
import { requireUserModifyAccess } from '../../middleware/admin-user-auth.middleware';
import { requireHierarchy } from '../../middleware/authorize';
import { UnifiedAuthContext, UnifiedAuthRequest, authUserCacheKey } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';
import { calculateProfileCompletionRate } from '../../utils/profile-completion';
import { unsetOrNull } from '../../utils/prisma-unset';
import { validatePagination } from '../../utils/pagination';
import { sendBadRequest, sendError, sendForbidden, sendInternalError, sendNotFound, sendPaginatedSuccess, sendSuccess } from '../../utils/response';
import { logError } from '../../utils/logger.js';
import { evaluerLoiDesChamps } from './user-field-law';

type Deps = { userAuditService: UserAuditService };

const KINDS = ['avatar', 'banner'] as const;
type ProfileImageKind = (typeof KINDS)[number];

const OBJECT_ID = /^[a-f\d]{24}$/i;
const reason = z.string().max(500).optional();

const bodySchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('upload'), url: z.string().min(1).max(2048), reason }),
  z.object({ source: z.literal('media'), mediaId: z.string().regex(OBJECT_ID), reason }),
  z.object({ source: z.literal('none'), reason }),
]);

/**
 * LA requête d'éligibilité — partagée par la liste et par l'écriture, pour
 * qu'on ne puisse jamais choisir ce que la liste n'offre pas, ni offrir ce que
 * l'écriture refuserait.
 */
export function profileImageCandidateWhere(userId: string) {
  return {
    mimeType: { startsWith: 'image/' },
    post: {
      is: {
        authorId: userId,
        visibility: 'PUBLIC' as const,
        type: { in: ['POST' as const, 'REEL' as const] },
        ...unsetOrNull('deletedAt'),
      },
    },
  };
}

const CANDIDATE_SELECT = {
  id: true,
  fileUrl: true,
  thumbnailUrl: true,
  mimeType: true,
  width: true,
  height: true,
  createdAt: true,
  postId: true,
} as const;

const TARGET_SELECT = {
  id: true,
  avatar: true,
  banner: true,
  displayName: true,
  bio: true,
  phoneNumber: true,
  email: true,
} as const;

function acteurDe(request: FastifyRequest): { id: string; role: UserRoleEnum } {
  const ctx = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
  return { id: ctx.registeredUser!.id, role: ctx.registeredUser!.role as UserRoleEnum };
}

const kindOf = (value: unknown): ProfileImageKind | null =>
  KINDS.find((kind) => kind === value) ?? null;

async function oublierLeCache(userId: string): Promise<void> {
  try {
    await getCacheStore().del(authUserCacheKey(userId));
  } catch {
    /* best-effort : le profil servi par le cache expire de lui-même */
  }
}

type Resolution = { readonly url: string | null } | { readonly refused: string };

async function resolveSource(
  fastify: FastifyInstance,
  params: { readonly actorId: string; readonly userId: string; readonly body: z.infer<typeof bodySchema> },
): Promise<Resolution> {
  const { body } = params;
  if (body.source === 'none') return { url: null };

  if (body.source === 'media') {
    const media = await fastify.prisma.postMedia.findFirst({
      where: { id: body.mediaId, ...profileImageCandidateWhere(params.userId) },
      select: { fileUrl: true },
    });
    return media ? { url: media.fileUrl } : { refused: 'PROFILE_IMAGE_NOT_ELIGIBLE' };
  }

  const upload = await fastify.prisma.messageAttachment.findFirst({
    where: { fileUrl: body.url, uploadedBy: params.actorId, mimeType: { startsWith: 'image/' } },
    select: { fileUrl: true },
  });
  return upload ? { url: upload.fileUrl } : { refused: 'PROFILE_IMAGE_UPLOAD_UNKNOWN' };
}

function refuserSelonLaLoi(reply: FastifyReply, role: UserRoleEnum, kind: ProfileImageKind, motif: string | undefined): boolean {
  const refus = evaluerLoiDesChamps({ role, champs: [kind], ...(motif === undefined ? {} : { motif }) });
  if (!refus) return false;
  if (refus.cause === 'inconnu' || refus.cause === 'motif') sendBadRequest(reply, refus.message);
  else sendForbidden(reply, refus.message, { message: refus.message });
  return true;
}

export function registerUserProfileImageRoutes(fastify: FastifyInstance, deps: Deps): void {
  const gardes = [fastify.authenticate, requireUserModifyAccess, requireHierarchy({ param: 'userId' })];

  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string };
  }>('/admin/users/:userId/profile-image-candidates', { preHandler: gardes }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset: offsetNum, limit: limitNum } = validatePagination(request.query.offset ?? '0', request.query.limit, {
        defaultLimit: 30,
        maxLimit: 100,
      });
      const where = profileImageCandidateWhere(userId);
      const [candidates, total] = await Promise.all([
        fastify.prisma.postMedia.findMany({ where, select: CANDIDATE_SELECT, orderBy: { createdAt: 'desc' }, skip: offsetNum, take: limitNum }),
        fastify.prisma.postMedia.count({ where }),
      ]);
      return sendPaginatedSuccess(reply, candidates, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + candidates.length < total,
      });
    } catch (error) {
      logError(fastify.log, 'Error listing profile image candidates', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to list profile image candidates' });
    }
  });

  fastify.put<{
    Params: { userId: string; kind: string };
  }>('/admin/users/:userId/profile-images/:kind', { preHandler: gardes }, async (request, reply) => {
    try {
      const kind = kindOf(request.params.kind);
      if (kind === null) return sendBadRequest(reply, 'Unknown profile image kind');

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) return sendBadRequest(reply, 'Invalid input data');
      const body = parsed.data;
      const motif = body.reason?.trim() === '' ? undefined : body.reason?.trim();

      const moi = acteurDe(request);
      if (refuserSelonLaLoi(reply, moi.role, kind, motif)) return;

      const { userId } = request.params;
      const cible = await fastify.prisma.user.findUnique({ where: { id: userId }, select: TARGET_SELECT });
      if (!cible) return sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });

      const resolution = await resolveSource(fastify, { actorId: moi.id, userId, body });
      if ('refused' in resolution) {
        return sendError(reply, 400, 'This image cannot be used as a profile image', { code: resolution.refused });
      }

      const url = resolution.url;
      const avant = cible[kind] ?? null;
      const aJour = await fastify.prisma.user.update({
        where: { id: userId },
        data: kind === 'avatar'
          ? { avatar: url, profileCompletionRate: calculateProfileCompletionRate({ ...cible, avatar: url }) }
          : { banner: url },
      });

      await oublierLeCache(userId);
      fastify.notificationService?.emitUserUpdated({ userId, changes: kind === 'avatar' ? { avatar: url } : { banner: url } })
        .catch((err: unknown) => logError(fastify.log, '[ADMIN_PROFILE_IMAGE] emitUserUpdated failed', err));

      await deps.userAuditService.createAuditLog({
        userId,
        adminId: moi.id,
        action: UserAuditAction.UPDATE_PROFILE,
        entityId: userId,
        changes: { [kind]: { before: avant, after: url } },
        metadata: {
          ...(motif === undefined ? {} : { reason: motif }),
          source: body.source,
          ...(body.source === 'media' ? { mediaId: body.mediaId } : {}),
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return sendSuccess(reply, sanitizationService.sanitizeUser(aJour as never, moi.role), {
        message: 'Profile image updated',
      });
    } catch (error) {
      logError(fastify.log, 'Error updating profile image', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to update profile image' });
    }
  });
}

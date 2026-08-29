import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  UserRoleEnum,
  UserAuditAction,
  PaginatedUsersResponse,
  UserFilters,
  CreateUserDTO,
  ResetPasswordDTO
} from '@meeshy/shared/types';
import {
  createUserValidationSchema,
  resetPasswordValidationSchema
} from '@meeshy/shared/types/validation/admin-user';
import { UserManagementService, type SessionRevoker } from '../../services/admin/user-management.service';
import { disconnectRevokedSessions } from '../../socketio/disconnectRevokedSessions';
import { UserAuditService } from '../../services/admin/user-audit.service';
import { sanitizationService } from '../../services/admin/user-sanitization.service';
import { permissionsService } from '../../services/admin/permissions.service';
import { UnifiedAuthContext, UnifiedAuthRequest } from '../../middleware/auth';
import {
  requireUserViewAccess,
  requireUserDeleteAccess
} from '../../middleware/admin-user-auth.middleware';
import { requirePermission, requireHierarchy } from '../../middleware/authorize';
import { registerUserWriteRoutes } from './users-write';
import { validatePagination, buildPaginationMeta } from '../../utils/pagination';
import { withAnonymousParticipantCounts } from '../../utils/share-link-participant-counts';
import { sendSuccess, sendInternalError, sendNotFound, sendForbidden, sendBadRequest, sendPaginatedSuccess } from '../../utils/response';
import { conversationActiveMemberCountSelect } from '../conversations/utils/active-member-count';

// Utilisation des schemas de validation renforces
const createUserSchema = createUserValidationSchema;
const resetPasswordSchema = resetPasswordValidationSchema;

// #4165 — plafonds de l'énumération, en amont de `GET
// /admin/users/:userId/reported-messages`, des conversations puis des
// messages d'un utilisateur (`Report.reportedEntityId` étant polymorphe, voir
// le commentaire au site d'appel). Larges par rapport à un usage normal :
// couvrent un compte qui aurait rejoint 2 000 conversations ou envoyé 20 000
// messages, tout en éliminant le scan réellement illimité que l'audit signale.
const REPORTED_MESSAGES_PARTICIPANT_SCAN_CAP = 2_000;
const REPORTED_MESSAGES_MESSAGE_SCAN_CAP = 20_000;

// Directive produit 2026-08-25 (revue adversariale F4) : une SÉLECTION ou un
// ORDRE qui dépend de lastActiveAt révèle la présence autant que le champ que
// sanitizeUsers masque. Sans canViewPresence, les bornes sont IGNORÉES en
// silence (un 403 confirmerait l'existence du filtre) et le tri retombe sur
// createdAt.
const PRESENCE_SORT_KEYS: ReadonlySet<string> = new Set(['lastActiveAt', 'isOnline']);

type PresenceGatedFilters = Pick<UserFilters, 'lastActiveAfter' | 'lastActiveBefore' | 'sortBy'>;

function presenceGatedFilters(query: UserFilters, canViewPresence: boolean): PresenceGatedFilters {
  const requestedSort = query.sortBy || 'createdAt';
  if (!canViewPresence) {
    return { sortBy: PRESENCE_SORT_KEYS.has(requestedSort) ? 'createdAt' : requestedSort };
  }
  return {
    lastActiveAfter: query.lastActiveAfter ? new Date(query.lastActiveAfter) : undefined,
    lastActiveBefore: query.lastActiveBefore ? new Date(query.lastActiveBefore) : undefined,
    sortBy: requestedSort
  };
}

// Même chemin que `routes/auth/revoke-all-sessions.ts` : le manager est lu à
// chaque appel, pas capturé ici — il n'existe pas encore quand les routes
// s'enregistrent.
function deactivatedUserSessionRevoker(fastify: FastifyInstance): SessionRevoker {
  return (userId) => disconnectRevokedSessions({
    io: fastify.socketIOHandler?.getManager?.()?.getIO(),
    userId,
    reason: 'admin_revoke',
    onError: (err) => fastify.log.warn({ err, userId }, '[ADMIN] socket fanout failed on user deactivation'),
  });
}

export async function userAdminRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialiser les services
  const userManagementService = new UserManagementService(fastify.prisma, {
    revokeSessions: deactivatedUserSessionRevoker(fastify),
    // Résolu à l'appel, comme `deactivatedUserSessionRevoker` : le manager
    // n'existe pas encore quand les routes s'enregistrent. Alimente l'avis
    // d'arrivée + l'effectif temps réel de `ensureGlobalConversationMembership`
    // (#3876) quand `createUser` ajoute le compte au salon global.
    resolveSocketManager: () => fastify.socketIOHandler?.getManager(),
  });
  const userAuditService = new UserAuditService(fastify.prisma);

  // Les ÉCRITURES vivent dans `users-write.ts`, sous la loi de leur CHAMP
  // (#4154). Ce fichier ne garde que les lectures, la création et la
  // suppression — trois gestes qui ne posent pas la question « quel champ ».
  registerUserWriteRoutes(fastify, { userManagementService, userAuditService });

  /**
   * GET /admin/users - Liste tous les utilisateurs (avec sanitization)
   */
  fastify.get<{
    Querystring: UserFilters & { offset?: string; limit?: string };
  }>('/admin/users', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const viewerRole = authContext.registeredUser!.role as UserRoleEnum;

      const filters: UserFilters = {
        search: request.query.search,
        role: request.query.role,
        isActive: request.query.isActive,
        emailVerified: request.query.emailVerified,
        phoneVerified: request.query.phoneVerified,
        twoFactorEnabled: request.query.twoFactorEnabled,
        createdAfter: request.query.createdAfter ? new Date(request.query.createdAfter) : undefined,
        createdBefore: request.query.createdBefore ? new Date(request.query.createdBefore) : undefined,
        ...presenceGatedFilters(request.query, permissionsService.canViewPresence(viewerRole)),
        sortOrder: request.query.sortOrder || 'desc'
      };

      const pagination = validatePagination(request.query.offset, request.query.limit);

      // Recuperer les utilisateurs (donnees completes)
      const result = await userManagementService.getUsers(filters, pagination);

      // Sanitize selon le role du viewer
      const sanitizedUsers = sanitizationService.sanitizeUsers(
        result.users,
        viewerRole
      );

      const paginationMeta = buildPaginationMeta(
        result.total,
        pagination.offset,
        pagination.limit,
        result.users.length
      );

      const response: PaginatedUsersResponse = {
        users: sanitizedUsers,
        pagination: paginationMeta
      };

      // Log d'audit
      await userAuditService.createAuditLog({
        userId: authContext.registeredUser.id,
        adminId: authContext.registeredUser.id,
        action: UserAuditAction.VIEW_USER_LIST,
        entityId: 'users',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      sendSuccess(reply, response);
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching users');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch users' });
    }
  });

  /**
   * GET /admin/users/:userId - Details d'un utilisateur (avec sanitization)
   */
  fastify.get<{
    Params: { userId: string };
  }>('/admin/users/:userId', {
    // `canViewUserDetails` était DÉCLARÉE dans la matrice et lue par AUCUNE
    // route : la finesse annoncée — « voir la liste » distinct de « voir le
    // détail » — n'existait pas dans le code. Elle vaut `canViewUsers` pour les
    // six rôles (mesuré), donc la câbler ne change aucune admission ; elle rend
    // la matrice vraie, et le jour où les deux divergent, la route suit.
    preHandler: [fastify.authenticate, requireUserViewAccess, requirePermission('canViewUserDetails')]
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const viewerRole = authContext.registeredUser!.role as UserRoleEnum;

      const user = await userManagementService.getUserById(request.params.userId);

      if (!user) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
        return;
      }

      // Sanitize selon le role
      const sanitizedUser = sanitizationService.sanitizeUser(user, viewerRole);

      // Log d'audit
      await userAuditService.logViewUser(
        authContext.registeredUser!.id,
        request.params.userId,
        request.ip,
        request.headers['user-agent']
      );

      sendSuccess(reply, sanitizedUser);
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user details' });
    }
  });

  /**
   * POST /admin/users - Creer un nouvel utilisateur
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.post<{
    Body: CreateUserDTO;
  }>('/admin/users', {
    // CRÉER n'est pas MODIFIER. La route se gardait sur `canUpdateUsers` alors
    // que `canCreateUsers` existait, déclarée et jamais lue — même piège armé
    // que `canResetPasswords` (#4144) : sans effet aujourd'hui, exploitable le
    // jour où un rôle reçoit l'une sans l'autre.
    preHandler: [fastify.authenticate, requirePermission('canCreateUsers')]
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les donnees
      const validatedData = createUserSchema.parse(request.body);

      // La garde porte sur le role EFFECTIF, pas sur le role DEMANDE (#4144).
      //
      // Elle etait ecrite `if (validatedData.role) { … }` : une garde
      // conditionnee a la PRESENCE de ce qu'elle garde ne s'applique pas quand
      // le champ est omis. Rien ne fuyait — `UserManagementService.createUser`
      // pose `data.role || 'USER'` et un administrateur a le droit de creer un
      // USER — mais la garde ne le VERIFIAIT pas : elle dependait d'un defaut
      // ecrit dans une autre unite, qu'aucun test ne relie a elle. Evaluer le
      // role effectif rend la garde vraie par elle-meme, et la fait suivre si
      // ce defaut change un jour.
      const roleEffectif = (validatedData.role ?? 'USER') as UserRoleEnum;
      if (!permissionsService.canManageUser(adminRole, roleEffectif)) {
        sendForbidden(reply, 'Insufficient permissions to create user with this role', { message: 'Access denied' });
        return;
      }

      // Creer l'utilisateur
      const newUser = await userManagementService.createUser(
        validatedData as CreateUserDTO,
        authContext.registeredUser!.id
      );

      // Log d'audit
      await userAuditService.logCreateUser(
        authContext.registeredUser!.id,
        newUser.id,
        validatedData as unknown as Record<string, unknown>,
        request.ip,
        request.headers['user-agent']
      );

      // Sanitize la reponse
      const sanitizedUser = sanitizationService.sanitizeUser(newUser, adminRole);

      sendSuccess(reply, sanitizedUser, { statusCode: 201, message: 'User created successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendBadRequest(reply, 'Invalid input data');
        return;
      }

      fastify.log.error({ err: error }, 'Error creating user');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to create user' });
    }
  });

  /**
   * POST /admin/users/:userId/reset-password - Reinitialiser le mot de passe
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.post<{
    Params: { userId: string };
    Body: ResetPasswordDTO;
  }>('/admin/users/:userId/reset-password', {
    // `requireHierarchy` sur TOUTE écriture visant un compte, sans exception à
    // énumérer (#4154) : c'est l'absence d'exception qui ferme la classe. Le
    // handler pose en plus `canResetPasswords` — la permission du GESTE, que
    // la hiérarchie ne dit pas.
    preHandler: [fastify.authenticate, requirePermission('canResetPasswords'), requireHierarchy({ param: 'userId' })]
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les donnees
      const validatedData = resetPasswordSchema.parse(request.body);

      // Recuperer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
        return;
      }

      // Deux questions distinctes, et elles ont chacune leur permission (#4144).
      //
      // `canResetPasswords` — « ce ROLE a-t-il le droit de reinitialiser un mot
      // de passe ? » — etait DECLAREE dans `AdminPermissions` et consultee par
      // AUCUN site du depot (grep : sept occurrences, toutes dans la matrice
      // elle-meme). La route gardait sur `canUpdateUsers`, qui vaut la meme
      // chose pour BIGBOSS et ADMIN aujourd'hui : le defaut n'etait donc pas
      // exploitable, c'etait un piege arme. Le jour ou un role recoit
      // `canUpdateUsers` sans `canResetPasswords` — ce que la matrice permet
      // d'exprimer, sinon elle n'aurait pas deux champs — il aurait pu
      // reinitialiser des mots de passe. Une permission declaree que rien ne
      // lit n'est pas une protection.
      if (!permissionsService.hasPermission(adminRole, 'canResetPasswords')) {
        sendForbidden(reply, 'Insufficient permissions to reset password', { message: 'Access denied' });
        return;
      }

      // `canModifyUser` — « ce role a-t-il le RANG pour agir sur CETTE cible ? »
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        sendForbidden(reply, 'Insufficient permissions to reset password', { message: 'Access denied' });
        return;
      }

      // Reinitialiser le mot de passe
      const updatedUser = await userManagementService.resetPassword(
        request.params.userId,
        validatedData as ResetPasswordDTO,
        authContext.registeredUser!.id
      );

      // Log d'audit
      await userAuditService.logResetPassword(
        authContext.registeredUser!.id,
        request.params.userId,
        request.ip,
        request.headers['user-agent']
      );

      sendSuccess(reply, { message: 'Password reset successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendBadRequest(reply, 'Invalid input data');
        return;
      }

      fastify.log.error({ err: error }, 'Error resetting password');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to reset password' });
    }
  });

  /**
   * DELETE /admin/users/:userId - Supprimer un utilisateur (soft delete)
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.delete<{
    Params: { userId: string };
  }>('/admin/users/:userId', {
    preHandler: [fastify.authenticate, requireUserDeleteAccess, requireHierarchy({ param: 'userId' })]
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Recuperer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
        return;
      }

      // Verifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        sendForbidden(reply, 'Insufficient permissions to delete this user', { message: 'Access denied' });
        return;
      }

      // Supprimer l'utilisateur (soft delete)
      await userManagementService.deleteUser(
        request.params.userId,
        authContext.registeredUser.id
      );

      // Log d'audit
      await userAuditService.logDeleteUser(
        authContext.registeredUser!.id,
        request.params.userId,
        undefined,
        request.ip,
        request.headers['user-agent']
      );

      sendSuccess(reply, { message: 'User deleted successfully' });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error deleting user');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to delete user' });
    }
  });

  /**
   * GET /admin/users/:userId/activity - Detailed links, affiliates, contacts for a user
   */
  fastify.get<{
    Params: { userId: string };
  }>('/admin/users/:userId/activity', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;

      const [shareLinks, trackingLinks, affiliateTokens, sentRequests, receivedRequests] = await Promise.all([
        fastify.prisma.conversationShareLink.findMany({
          where: { createdBy: userId },
          select: {
            id: true,
            linkId: true,
            identifier: true,
            name: true,
            description: true,
            maxUses: true,
            currentUses: true,
            maxConcurrentUsers: true,
            currentConcurrentUsers: true,
            isActive: true,
            expiresAt: true,
            createdAt: true,
            conversation: {
              select: { id: true, identifier: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),

        fastify.prisma.trackingLink.findMany({
          where: { createdBy: userId },
          select: {
            id: true,
            token: true,
            name: true,
            campaign: true,
            source: true,
            medium: true,
            originalUrl: true,
            shortUrl: true,
            totalClicks: true,
            uniqueClicks: true,
            isActive: true,
            expiresAt: true,
            createdAt: true,
            lastClickedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),

        fastify.prisma.affiliateToken.findMany({
          where: { createdBy: userId },
          select: {
            id: true,
            token: true,
            name: true,
            maxUses: true,
            currentUses: true,
            clickCount: true,
            isActive: true,
            expiresAt: true,
            createdAt: true,
            _count: {
              select: { affiliations: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),

        fastify.prisma.friendRequest.findMany({
          where: { senderId: userId },
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            receiver: {
              select: { id: true, username: true, displayName: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),

        fastify.prisma.friendRequest.findMany({
          where: { receiverId: userId },
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            sender: {
              select: { id: true, username: true, displayName: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      ]);

      sendSuccess(reply, {
        shareLinks: await withAnonymousParticipantCounts(fastify.prisma, shareLinks),
        trackingLinks,
        affiliateTokens,
        contacts: {
          sent: sentRequests,
          received: receivedRequests,
        },
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user activity');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user activity' });
    }
  });

  /**
   * GET /admin/users/:userId/conversations - List conversations a user participates in (admin view).
   * Metadata only (no message content); the target user's membership (role/joinedAt) is flattened
   * onto each conversation. Requires canViewUsers permission.
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string; type?: string };
  }>('/admin/users/:userId/conversations', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit, type } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const where: any = {
        participants: {
          some: { userId, isActive: true }
        }
      };
      if (type) {
        where.type = type;
      }

      const [conversations, total] = await Promise.all([
        fastify.prisma.conversation.findMany({
          where,
          select: {
            id: true,
            identifier: true,
            title: true,
            type: true,
            avatar: true,
            isActive: true,
            // Même règle que `GET /conversations` : la colonne `memberCount`
            // n'est écrite par personne, donc l'écran admin affichait
            // « 0 membres » sur toute conversation créée depuis la migration
            // héritée. Le compte vient de la base.
            _count: { select: conversationActiveMemberCountSelect },
            communityId: true,
            createdAt: true,
            lastMessageAt: true,
            participants: {
              where: { isActive: true },
              take: 6,
              orderBy: { joinedAt: 'asc' },
              select: {
                id: true,
                userId: true,
                type: true,
                displayName: true,
                avatar: true,
                role: true,
                joinedAt: true,
                isActive: true,
                nickname: true,
                user: { select: { id: true, username: true, displayName: true, avatar: true } }
              }
            }
          },
          orderBy: { lastMessageAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.conversation.count({ where })
      ]);

      // Keep a small participant preview (direct → the other member, group → a
      // first slice; the full group list is paged via the dedicated endpoint),
      // and surface the target user's membership separately for convenience.
      const data = conversations.map((conv) => {
        const { _count, ...convData } = conv as typeof conv & { _count: { participants: number } };
        const participants = (convData as { participants?: Array<{ userId?: string | null }> }).participants ?? [];
        const membership = participants.find((p) => p.userId === userId) ?? null;
        return { ...convData, memberCount: _count.participants, participants, membership };
      });

      return sendPaginatedSuccess(reply, data, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + conversations.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user conversations');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user conversations' });
    }
  });

  /**
   * GET /admin/users/:userId/media - List media produced by a user (admin view).
   * Merges post media (post.authorId) and message attachments (uploadedBy),
   * sorted by recency. Requires canViewUsers permission.
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string };
  }>('/admin/users/:userId/media', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      // The first (offset + limit) of the merged stream are guaranteed to be
      // within the first (offset + limit) of each source, so taking that many
      // from each is sufficient for a correct slice after merge.
      const window = offsetNum + limitNum;
      const postWhere = { post: { authorId: userId } };
      const attWhere = { uploadedBy: userId };
      const mediaSelect = {
        id: true, originalName: true, mimeType: true, fileUrl: true, thumbnailUrl: true,
        fileSize: true, width: true, height: true, duration: true, createdAt: true
      } as const;

      const [postMedia, attachments, postCount, attCount] = await Promise.all([
        fastify.prisma.postMedia.findMany({
          where: postWhere,
          select: { ...mediaSelect, postId: true },
          orderBy: { createdAt: 'desc' },
          take: window
        }),
        fastify.prisma.messageAttachment.findMany({
          where: attWhere,
          select: { ...mediaSelect, messageId: true },
          orderBy: { createdAt: 'desc' },
          take: window
        }),
        fastify.prisma.postMedia.count({ where: postWhere }),
        fastify.prisma.messageAttachment.count({ where: attWhere })
      ]);

      const toMedia = (m: Record<string, unknown>, source: 'post' | 'message', contextId: unknown) => ({
        id: m.id,
        originalName: m.originalName,
        mimeType: m.mimeType,
        fileUrl: m.fileUrl,
        thumbnailUrl: m.thumbnailUrl,
        fileSize: m.fileSize,
        width: m.width,
        height: m.height,
        duration: m.duration,
        createdAt: m.createdAt as string | Date,
        source,
        contextId
      });

      const merged = [
        ...postMedia.map((m) => toMedia(m as Record<string, unknown>, 'post', (m as Record<string, unknown>).postId)),
        ...attachments.map((m) => toMedia(m as Record<string, unknown>, 'message', (m as Record<string, unknown>).messageId))
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const pageSlice = merged.slice(offsetNum, offsetNum + limitNum);
      const total = postCount + attCount;

      return sendPaginatedSuccess(reply, pageSlice, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + pageSlice.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user media');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user media' });
    }
  });

  /**
   * GET /admin/users/:userId/reports - Reports filed BY a user (reporterId).
   * Requires canViewUsers permission.
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string; status?: string };
  }>('/admin/users/:userId/reports', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit, status } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const where: Record<string, unknown> = { reporterId: userId };
      if (status) {
        where.status = status;
      }

      const [reports, total] = await Promise.all([
        fastify.prisma.report.findMany({
          where,
          select: {
            id: true,
            reportedType: true,
            reportedEntityId: true,
            reportType: true,
            reason: true,
            status: true,
            actionTaken: true,
            createdAt: true,
            resolvedAt: true
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.report.count({ where })
      ]);

      return sendPaginatedSuccess(reply, reports, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + reports.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user reports');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user reports' });
    }
  });

  /**
   * GET /admin/users/:userId/reported-messages - Messages authored by the user
   * that have been reported. Each item is a report joined with its message.
   * Requires canViewUsers permission.
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string };
  }>('/admin/users/:userId/reported-messages', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const emptyPage = () => sendPaginatedSuccess(reply, [], { total: 0, offset: offsetNum, limit: limitNum, hasMore: false });

      // BORNÉ (#4165), et c'est un compromis À DOCUMENTER, pas un simple
      // `take` ajouté : `Report.reportedEntityId` est POLYMORPHE (message,
      // user, conversation, community, post, story — `schema.prisma`, aucune
      // relation Prisma déclarée), donc aucune requête ne peut pousser
      // "expéditeur du message = userId" DANS `report.findMany` lui-même. Il
      // faut D'ABORD énumérer les messages de l'utilisateur pour construire le
      // filtre `reportedEntityId IN […]` — c'est cette énumération qui était
      // SANS `take` : sur un compte très actif (des dizaines de milliers de
      // messages), CHAQUE page de signalements repayait la totalité de son
      // historique. Ordonnées par récence, les deux requêtes plafonnent large
      // (bien au-delà d'un usage normal) : au-delà, ce sont les conversations/
      // messages les plus ANCIENS qui sortent du périmètre — les plus probables
      // d'être déjà résolus, les moins probables d'être encore sous
      // modération active. Une borne exacte demanderait une relation dédiée
      // sur `Report` (hors territoire de ce lot, `schema.prisma` étant un
      // fichier-carrefour).
      const participants = await fastify.prisma.participant.findMany({
        where: { userId, type: 'user' },
        select: { id: true },
        orderBy: { joinedAt: 'desc' },
        take: REPORTED_MESSAGES_PARTICIPANT_SCAN_CAP
      });
      const participantIds = participants.map((p) => p.id);
      if (participantIds.length === 0) return emptyPage();

      // Message ids authored by the user (bounded by the user's own messages).
      const userMessages = await fastify.prisma.message.findMany({
        where: { senderId: { in: participantIds } },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        take: REPORTED_MESSAGES_MESSAGE_SCAN_CAP
      });
      const messageIds = userMessages.map((m) => m.id);
      if (messageIds.length === 0) return emptyPage();

      const reportWhere = { reportedType: 'message', reportedEntityId: { in: messageIds } };

      const [reports, total] = await Promise.all([
        fastify.prisma.report.findMany({
          where: reportWhere,
          select: {
            id: true,
            reportedEntityId: true,
            reportType: true,
            reason: true,
            status: true,
            reporterId: true,
            reporterName: true,
            createdAt: true,
            resolvedAt: true
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.report.count({ where: reportWhere })
      ]);

      const reportedMessageIds = [...new Set(reports.map((r) => r.reportedEntityId))];
      // Déjà borné IMPLICITEMENT : `reportedMessageIds` dérive de `reports`,
      // la page ≤ `limitNum` posée ci-dessus par `report.findMany`. `take`
      // explicite quand même (#4165) — la borne ne doit pas dépendre d'un
      // raisonnement à distance sur la taille d'un tableau amont.
      const messages = reportedMessageIds.length > 0
        ? await fastify.prisma.message.findMany({
            where: { id: { in: reportedMessageIds } },
            select: { id: true, content: true, conversationId: true, messageType: true, createdAt: true, deletedAt: true },
            take: reportedMessageIds.length
          })
        : [];
      const messageMap = new Map(messages.map((m) => [m.id, m]));

      const data = reports.map((r) => ({ ...r, message: messageMap.get(r.reportedEntityId) ?? null }));

      return sendPaginatedSuccess(reply, data, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + reports.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user reported messages');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user reported messages' });
    }
  });

  /**
   * GET /admin/conversations/:conversationId/participants - Paginated members of
   * a conversation (for the group members modal in the admin user fiche).
   * Requires canViewUsers permission.
   */
  fastify.get<{
    Params: { conversationId: string };
    Querystring: { offset?: string; limit?: string };
  }>('/admin/conversations/:conversationId/participants', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const viewerRole = authContext.registeredUser!.role as UserRoleEnum;
      // Directive produit 2026-08-25 : `requireUserViewAccess` laisse passer
      // MODERATOR/AUDIT (canViewUsers), qui n'ont plus le droit de voir la
      // présence — seuil `canViewPresence` (ADMIN/BIGBOSS uniquement).
      const canSeePresence = permissionsService.canViewPresence(viewerRole);

      const { conversationId } = request.params;
      const { offset = '0', limit } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 30, maxLimit: 100 });

      const conversation = await fastify.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true }
      });
      if (!conversation) {
        return sendNotFound(reply, 'Conversation non trouvée');
      }

      const where = { conversationId };
      const [participants, total] = await Promise.all([
        fastify.prisma.participant.findMany({
          where,
          select: {
            id: true,
            userId: true,
            type: true,
            displayName: true,
            avatar: true,
            role: true,
            isActive: true,
            isOnline: true,
            joinedAt: true,
            nickname: true,
            user: { select: { id: true, username: true, displayName: true, avatar: true } }
          },
          orderBy: { joinedAt: 'asc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.participant.count({ where })
      ]);

      const data = canSeePresence ? participants : participants.map((p) => ({ ...p, isOnline: false }));

      return sendPaginatedSuccess(reply, data, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + participants.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching conversation participants');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch conversation participants' });
    }
  });

  /**
   * GET /admin/conversations/:conversationId/messages - Paginated messages of a
   * conversation, newest first (for the messages modal in the admin user fiche).
   * Deleted messages are included (moderation view) and flagged via deletedAt.
   * Requires canViewUsers permission.
   */
  fastify.get<{
    Params: { conversationId: string };
    Querystring: { offset?: string; limit?: string };
  }>('/admin/conversations/:conversationId/messages', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const { conversationId } = request.params;
      const { offset = '0', limit } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 30, maxLimit: 100 });

      const conversation = await fastify.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true }
      });
      if (!conversation) {
        return sendNotFound(reply, 'Conversation non trouvée');
      }

      const where = { conversationId };
      const [messages, total] = await Promise.all([
        fastify.prisma.message.findMany({
          where,
          select: {
            id: true,
            content: true,
            originalLanguage: true,
            messageType: true,
            messageSource: true,
            isEdited: true,
            editedAt: true,
            deletedAt: true,
            replyToId: true,
            createdAt: true,
            sender: {
              select: {
                id: true,
                userId: true,
                type: true,
                displayName: true,
                avatar: true,
                nickname: true,
                user: { select: { id: true, username: true, displayName: true, avatar: true } }
              }
            },
            _count: { select: { attachments: true } }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.message.count({ where })
      ]);

      const data = messages.map(({ _count, ...rest }) => ({
        ...rest,
        attachmentCount: _count?.attachments ?? 0
      }));

      return sendPaginatedSuccess(reply, data, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + messages.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching conversation messages');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch conversation messages' });
    }
  });
}

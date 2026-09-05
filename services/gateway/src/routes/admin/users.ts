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
// #4157 c.4 / #4333 — le prédicat PARTAGÉ (composant lui-même `maskedAttachment`,
// la MÊME garde que l'éventail de notifications) : voir media-protection.ts.
import {
  attachmentProtectionSelect,
  messageProtectionSelect,
  mediaAttachmentIsProtected,
  type MessageProtectionContext
} from './media-protection';
import { registerConversationMessagesSovereignRoute } from './conversation-messages-sovereign';
import { registerUserReportsRoutes } from './user-reports';
import { registerUserWriteRoutes } from './users-write';
import { validatePagination, buildPaginationMeta } from '../../utils/pagination';
import { withAnonymousParticipantCounts } from '../../utils/share-link-participant-counts';
import { sendSuccess, sendInternalError, sendNotFound, sendForbidden, sendBadRequest, sendPaginatedSuccess } from '../../utils/response';
import { conversationActiveMemberCountSelect } from '../conversations/utils/active-member-count';

// Utilisation des schemas de validation renforces
const createUserSchema = createUserValidationSchema;
const resetPasswordSchema = resetPasswordValidationSchema;

// #4494 / #4284 — la surface `Report` (les seuils déclarés + les deux
// portes qui la lisent) vit désormais dans `user-reports.ts` : ce fichier
// avait franchi le budget de taille des fichiers de routes (#4284, < 1000
// lignes). Réexportée ici parce que
// `reported-messages-audit-content-guard.test.ts` importe ces symboles
// depuis `routes/admin/users` — une dépendance publique que ce
// déplacement ne doit pas casser.
export {
  SEUILS_REPORT,
  REPORT_PERMISSION_LA_PLUS_HAUTE,
  type PermissionReport,
  type SeuilReport
} from './user-reports';

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
            // #4157 c.3 / #4692 — AUCUNE colonne de `SHARE_LINK_JOIN_KEY_COLUMNS`
            // (`linkId`, `identifier`) : les deux OUVRENT la porte de jointure,
            // indifféremment (`findShareLinkByKey`), et les lecteurs de cette
            // route sont BIGBOSS, ADMIN, MODERATOR et AUDIT — les deux derniers
            // sans `canViewSensitiveData`. Le premier lot n'avait retiré que
            // `linkId` en écrivant qu'« `id` suffit à désigner le lien » ; c'était
            // faux deux fois — `identifier` sortait à sa place, et `id` était
            // lui-même une clé de jointure. #4692 a retiré l'ObjectId de la LOI
            // (link-admission.ts), ce qui rend enfin `id` opaque et le laisse
            // servir de référence à la console. Le secret ne se lit qu'au geste
            // souverain `POST /admin/share-links/:id/reveal`, qui rend désormais
            // les DEUX clés.
            id: true,
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
            // #4694 — `token` REVIENT, et le commentaire qui prétendait le
            // protéger est retiré : il ne protégeait rien.
            //
            // Le lot #4157 c.3 l'avait sorti du `select` « comme `linkId` », en
            // gardant `shortUrl` — que `TrackingLinkService` compose
            // exactement `/l/${token}` (l. 148, et l. 926 au changement de
            // jeton ; `schema.prisma` le dit aussi : « URL courte générée
            // (meeshy.me/l/<token>) »). **Le champ retiré était contenu dans le
            // champ conservé.** Le témoin ne tombait pas parce que sa fixture
            // valait `'https://s'` au lieu de la forme de production.
            //
            // MESURE des routes clefées par `:token`, qui décide de la sortie
            // retenue : `GET /l/:token` est une redirection PUBLIQUE,
            // `GET /tracking-links/:token/resolve` est publique PAR DESIGN (son
            // doc-comment l'écrit), `POST …/:token/click` est en `authOptional`
            // et `POST …/:token/redirect-status` n'a aucun hook. Tout ce qui
            // MUTE (`PATCH`, `DELETE`, `…/deactivate`) est `authRequired` +
            // contrôle de propriétaire, et `GET /tracking-links/:token`
            // (les stats) l'est aussi. Ce jeton est donc une clé de ROUTAGE
            // publique, pas un secret : le masquer coûterait à la console le
            // libellé d'un lien sans nom (`link.name || link.token`) sans rien
            // fermer. `AffiliateToken.token` reste retiré — lui consomme une
            // place de `maxUses` sur `POST /affiliate/register`.
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
            // #4157 c.3 — jeton d'affiliation retiré, même raison.
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
      // #4157 c.4 / #4333 — la protection d'un média se lit aux DEUX niveaux
      // qui la déclarent : le MESSAGE et la PIÈCE JOINTE elle-même (voir
      // `media-protection.ts` pour la raison — une seule des deux lectures ne
      // suffit pas). `PostMedia` n'a AUCUNE de ces colonnes (vérifié au
      // schéma) : un post n'est pas éphémère, seul le versant
      // `messageAttachment` les demande.
      const [postMedia, attachments, postCount, attCount] = await Promise.all([
        fastify.prisma.postMedia.findMany({
          where: postWhere,
          select: { ...mediaSelect, postId: true },
          orderBy: { createdAt: 'desc' },
          take: window
        }),
        fastify.prisma.messageAttachment.findMany({
          where: attWhere,
          select: {
            ...mediaSelect,
            messageId: true,
            ...attachmentProtectionSelect,
            message: { select: messageProtectionSelect }
          },
          orderBy: { createdAt: 'desc' },
          take: window
        }),
        fastify.prisma.postMedia.count({ where: postWhere }),
        fastify.prisma.messageAttachment.count({ where: attWhere })
      ]);

      /**
       * Un média protégé reste LISTÉ — un administrateur doit pouvoir constater
       * qu'il existe, sa taille, sa date, le message qui le porte — mais son
       * CONTENU ne voyage pas : `fileUrl` et `thumbnailUrl` tombent à `null` et
       * `isProtected` dit pourquoi la ligne est amputée, plutôt que de laisser
       * croire à un média sans fichier. Masquer la ligne entière priverait la
       * modération d'un fait qu'elle a le droit de connaître ; servir l'URL la
       * ferait sortir du produit par une porte que le reste du produit ferme.
       */
      const toMedia = (m: Record<string, unknown>, source: 'post' | 'message', contextId: unknown) => {
        const protege = source === 'message' && mediaAttachmentIsProtected(
          m as Parameters<typeof mediaAttachmentIsProtected>[0],
          m.message as MessageProtectionContext | null | undefined
        );
        return {
          id: m.id,
          originalName: m.originalName,
          mimeType: m.mimeType,
          fileUrl: protege ? null : m.fileUrl,
          thumbnailUrl: protege ? null : m.thumbnailUrl,
          fileSize: m.fileSize,
          width: m.width,
          height: m.height,
          duration: m.duration,
          createdAt: m.createdAt as string | Date,
          source,
          contextId,
          isProtected: protege
        };
      };

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

  // GET /admin/users/:userId/reports et GET /admin/users/:userId/reported-messages
  // — la surface `Report` : deux portes qui lisent la MÊME table sous des
  // seuils déclarés (SEUILS_REPORT, #4157 étendu par #4494). Vivent
  // désormais dans `user-reports.ts`, une unité nommable à part entière
  // (#4284), plutôt qu'une tranche de plus dans ce fichier déjà au plafond
  // de taille.
  registerUserReportsRoutes(fastify);

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

  // GET /admin/conversations/:conversationId/messages — régime SOUVERAIN
  // (#4333 c.3, troisième frère de PUT /admin/agent/llm et DELETE
  // /admin/agent/reset) : servait auparavant le contenu intégral de
  // n'importe quelle conversation privée sous la seule garde `canViewUsers`
  // — `requireSovereign()`, motif écrit et audit vivent désormais dans
  // `conversation-messages-sovereign.ts`, une unité nommable à part entière
  // plutôt qu'une tranche de plus dans ce fichier déjà au plafond de taille.
  registerConversationMessagesSovereignRoute(fastify);
}

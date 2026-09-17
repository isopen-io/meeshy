/**
 * Historique de connexion d'un utilisateur, côté administration (#6821).
 *
 * `UserSession` (appareil, IP, pays, ville, coordonnées, `isTrusted`,
 * `expiresAt`, `isValid`, `invalidatedAt`/`invalidatedReason`,
 * `lastActivityAt`) et `SecurityEvent` sont écrits à chaque connexion
 * (`AuthService`, `MagicLinkService`, `routes/auth/register.ts`) mais
 * n'avaient aucun lecteur sous `routes/admin/` — la donnée existait, il
 * manquait la porte. Trois routes, un seul seuil (`canViewSensitiveData`,
 * déjà celui des autres données de connexion — `lastLoginIp`,
 * `lastLoginLocation`, etc. — servies par `sanitizeUser`) :
 *
 * - `GET /admin/users/:userId/sessions` — historique paginé, TOUTES les
 *   sessions (valides et révoquées : un historique qui n'affiche que les
 *   sessions vivantes n'en est pas un).
 * - `DELETE /admin/users/:userId/sessions/:sessionId` — révocation par un
 *   administrateur. Coupe le socket de CET appareil et lui seul
 *   (`disconnectSession`, #4213) — jamais `disconnectRevokedSessions`, qui
 *   coupe tout le compte et n'a pas de mapping session→socket pour épargner
 *   les autres (voir son doc-comment).
 * - `GET /admin/users/:userId/security-events` — filtres `eventType`,
 *   `severity`, période.
 *
 * La révocation est une ÉCRITURE visant un compte : `requireHierarchy`
 * s'applique sans exception à énumérer (règle du fichier voisin
 * `routes/admin/users.ts`, reprise de #4154).
 */
import type { FastifyInstance } from 'fastify';
import { UserAuditAction } from '@meeshy/shared/types';
import type { UserAuditService } from '../../services/admin/user-audit.service';
import { invalidateSession } from '../../services/SessionService';
import { disconnectSession } from '../../socketio/disconnectSession';
import { requireUserViewAccess } from '../../middleware/admin-user-auth.middleware';
import { requirePermission, requireHierarchy } from '../../middleware/authorize';
import { UnifiedAuthContext, UnifiedAuthRequest } from '../../middleware/auth';
import { validatePagination } from '../../utils/pagination';
import { sendNotFound, sendInternalError, sendSuccess, sendPaginatedSuccess } from '../../utils/response';
import { logError, logWarn } from '../../utils/logger.js';

type Deps = {
  userAuditService: UserAuditService;
};

// Jamais `sessionToken` (hash du jeton) ni `refreshToken` : rien qu'un admin
// n'a besoin de lire pour comprendre QUAND et D'OÙ un compte s'est connecté.
// `deviceFingerprint` reste hors de cette liste pour la même raison — un
// identifiant de suivi, pas une donnée de connexion au sens de l'issue.
const SESSION_HISTORY_SELECT = {
  id: true,
  deviceType: true,
  deviceVendor: true,
  deviceModel: true,
  osName: true,
  osVersion: true,
  browserName: true,
  browserVersion: true,
  isMobile: true,
  ipAddress: true,
  country: true,
  city: true,
  location: true,
  latitude: true,
  longitude: true,
  timezone: true,
  isTrusted: true,
  expiresAt: true,
  isValid: true,
  invalidatedAt: true,
  invalidatedReason: true,
  createdAt: true,
  lastActivityAt: true,
} as const;

const SECURITY_EVENT_SELECT = {
  id: true,
  eventType: true,
  severity: true,
  status: true,
  description: true,
  metadata: true,
  ipAddress: true,
  userAgent: true,
  deviceFingerprint: true,
  geoLocation: true,
  createdAt: true,
} as const;

export function registerUserSessionRoutes(fastify: FastifyInstance, deps: Deps): void {
  const { userAuditService } = deps;

  /**
   * GET /admin/users/:userId/sessions - Historique de connexion paginé
   * (toutes sessions, valides et révoquées). Requiert canViewSensitiveData.
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string };
  }>('/admin/users/:userId/sessions', {
    preHandler: [fastify.authenticate, requireUserViewAccess, requirePermission('canViewSensitiveData')]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const where = { userId };
      const [sessions, total] = await Promise.all([
        fastify.prisma.userSession.findMany({
          where,
          select: SESSION_HISTORY_SELECT,
          orderBy: { lastActivityAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.userSession.count({ where })
      ]);

      return sendPaginatedSuccess(reply, sessions, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + sessions.length < total
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching user sessions', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user sessions' });
    }
  });

  /**
   * DELETE /admin/users/:userId/sessions/:sessionId - Révocation d'une
   * session nommée par un administrateur.
   */
  fastify.delete<{
    Params: { userId: string; sessionId: string };
  }>('/admin/users/:userId/sessions/:sessionId', {
    preHandler: [
      fastify.authenticate,
      requireUserViewAccess,
      requirePermission('canViewSensitiveData'),
      requireHierarchy({ param: 'userId' })
    ]
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const { userId, sessionId } = request.params;

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      // La cible appartient bien à CE compte — `requireHierarchy` ne compare
      // que le rang du VIEWER à celui du userId de la route, jamais l'id de
      // session à son propriétaire.
      const session = await fastify.prisma.userSession.findFirst({
        where: { id: sessionId, userId },
        select: { id: true }
      });
      if (!session) {
        return sendNotFound(reply, 'Session non trouvée');
      }

      const revoked = await invalidateSession(sessionId, 'admin_revoke');
      if (!revoked) {
        return sendNotFound(reply, 'Impossible de révoquer cette session');
      }

      // Le socket de CET appareil, et lui seul (#4213) — voir le doc-comment
      // de `disconnectSession` : `disconnectRevokedSessions` coupe TOUT le
      // compte et n'a pas de mapping session→socket pour épargner les autres.
      await disconnectSession({
        io: fastify.socketIOHandler?.getManager?.()?.getIO(),
        userId,
        sessionId,
        onError: (error) => logWarn(fastify.log, '[ADMIN] socket cut failed on session revoke', error),
      });

      await userAuditService.createAuditLog({
        userId,
        adminId: authContext.registeredUser!.id,
        action: UserAuditAction.REVOKE_SESSION,
        entityId: sessionId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      return sendSuccess(reply, { message: 'Session révoquée avec succès' });
    } catch (error) {
      logError(fastify.log, 'Error revoking user session', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to revoke user session' });
    }
  });

  /**
   * GET /admin/users/:userId/security-events - Historique paginé, filtrable
   * par `eventType`, `severity` et période. Requiert canViewSensitiveData.
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: {
      offset?: string;
      limit?: string;
      eventType?: string;
      severity?: string;
      createdAfter?: string;
      createdBefore?: string;
    };
  }>('/admin/users/:userId/security-events', {
    preHandler: [fastify.authenticate, requireUserViewAccess, requirePermission('canViewSensitiveData')]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit, eventType, severity, createdAfter, createdBefore } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const where: Record<string, unknown> = { userId };
      if (eventType) where.eventType = eventType;
      if (severity) where.severity = severity;
      if (createdAfter || createdBefore) {
        where.createdAt = {
          ...(createdAfter ? { gte: new Date(createdAfter) } : {}),
          ...(createdBefore ? { lte: new Date(createdBefore) } : {})
        };
      }

      const [events, total] = await Promise.all([
        fastify.prisma.securityEvent.findMany({
          where,
          select: SECURITY_EVENT_SELECT,
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.securityEvent.count({ where })
      ]);

      return sendPaginatedSuccess(reply, events, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + events.length < total
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching user security events', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user security events' });
    }
  });
}

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
 * - `DELETE /admin/users/:userId/sessions` — « tout fermer » d'un membre en
 *   un geste (#9613) : toutes ses sessions, toutes ses sockets.
 *
 * La révocation est une ÉCRITURE visant un compte : `requireHierarchy`
 * s'applique sans exception à énumérer (règle du fichier voisin
 * `routes/admin/users.ts`, reprise de #4154).
 *
 * #9613, #9643 (décision porteur du 2026-10-08 : l'administration voit TOUT) :
 *  - les sessions servent tout ce qui est retenu — version, build, plateforme,
 *    nom d'appareil, moyen de connexion, agent, fuseau, adresse, pays, ville
 *    approximative — avec l'attribution DB-IP en `meta.geolocation`. Les trois
 *    lectures exigent `canViewSensitiveData` (BIGBOSS, ADMIN) : l'adresse et
 *    la ville ne sortent vers personne d'autre ;
 *  - CHAQUE lecture des sessions et des événements de sécurité est journalisée
 *    (`AdminAuditLog`, `VIEW_USER`, `metadata.surface`), patron de
 *    `user-profile-reads.ts` ;
 *  - un membre déconnecté par l'administration en est toujours informé, sans
 *    que l'administrateur soit nommé (`informMemberOfTeamClosure`).
 */
import type { FastifyInstance } from 'fastify';
import { UserAuditAction } from '@meeshy/shared/types';
import type { UserAuditService } from '../../services/admin/user-audit.service';
import { GEOLOCATION_ATTRIBUTION } from '@meeshy/shared/utils/client-session';
import { invalidateAllSessions, invalidateSession } from '../../services/SessionService';
import {
  informMemberOfTeamClosure,
  TEAM_CLOSURE_EMAIL_WINDOW_SECONDS,
  type TeamClosureMailer,
} from '../../services/auth/team-session-closure';
import { getCacheStore } from '../../services/CacheStore';
import { RETENTION, monthsBefore, retainedSessionWhere } from '../../services/retention/retention-bounds';
import { disconnectSession } from '../../socketio/disconnectSession';
import { forAdministration } from '../../services/auth/security-event-view';
import { disconnectRevokedSessions } from '../../socketio/disconnectRevokedSessions';
import { requireUserViewAccess } from '../../middleware/admin-user-auth.middleware';
import { requirePermission, requireHierarchy } from '../../middleware/authorize';
import { UnifiedAuthContext, UnifiedAuthRequest } from '../../middleware/auth';
import { validatePagination } from '../../utils/pagination';
import { sendNotFound, sendInternalError, sendSuccess, sendPaginatedSuccess } from '../../utils/response';
import { logError, logWarn } from '../../utils/logger.js';

type Deps = {
  userAuditService: UserAuditService;
  emailService: TeamClosureMailer;
};

// Jamais `sessionToken` (hash du jeton) ni `refreshToken` : rien qu'un admin
// n'a besoin de lire pour comprendre QUAND et D'OÙ un compte s'est connecté.
// `deviceFingerprint` reste hors de cette liste pour la même raison — un
// identifiant de suivi, pas une donnée de connexion au sens de l'issue. Plus
// de `latitude` / `longitude` (#9609) : elles ne sont plus écrites, et aucun
// client ne les lisait.
const SESSION_HISTORY_SELECT = {
  id: true,
  appVersion: true,
  appBuild: true,
  platform: true,
  deviceName: true,
  loginMethod: true,
  userAgent: true,
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
  const { userAuditService, emailService } = deps;

  const auditRead = (request: { ip: string; headers: Record<string, unknown> }, userId: string, metadata: Record<string, unknown>) => {
    const authContext = (request as unknown as UnifiedAuthRequest).authContext as UnifiedAuthContext;
    return userAuditService.createAuditLog({
      userId,
      adminId: authContext.registeredUser!.id,
      action: UserAuditAction.VIEW_USER,
      entityId: userId,
      metadata,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    });
  };

  const claimEmailSlot = (userId: string) =>
    getCacheStore().setnx(`team-session-closure-email:${userId}`, '1', TEAM_CLOSURE_EMAIL_WINDOW_SECONDS);

  const informMember = (userId: string, scope: 'one' | 'all', sessionIds: readonly string[], revokedCount: number) => {
    void informMemberOfTeamClosure({ prisma: fastify.prisma, emailService, claimEmailSlot }, { userId, scope, sessionIds, revokedCount })
      .catch((error) => logWarn(fastify.log, '[ADMIN] member not informed of session closure', error));
  };

  /**
   * GET /admin/users/:userId/sessions - Historique de connexion paginé
   * (toutes sessions, valides et révoquées). Requiert canViewSensitiveData.
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string };
  }>('/admin/users/:userId/sessions', {
    // Audit L2-7 — lire l'adresse et la ville d'un membre exige de le
    // SURCLASSER (ou d'être soi), comme le fermer : un ADMIN ne lit pas celles
    // d'un BIGBOSS.
    preHandler: [fastify.authenticate, requireUserViewAccess, requirePermission('canViewSensitiveData'), requireHierarchy({ param: 'userId' })]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      // La borne de la purge, armée ou non (revue « privacy-retention-bypass ») :
      // une session close ou échue depuis plus de 90 jours ne se sert plus.
      const where = { userId, ...retainedSessionWhere(new Date()) };
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

      await auditRead(request, userId, { surface: 'sessions', offset: offsetNum });

      return sendPaginatedSuccess(reply, sessions, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + sessions.length < total
      }, { meta: { geolocation: GEOLOCATION_ATTRIBUTION } });
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
      // Une session DÉJÀ close ne se referme pas (audit A2-5) : ni motif
      // réécrit, ni conservation prolongée, ni membre averti pour rien.
      const session = await fastify.prisma.userSession.findFirst({
        where: { id: sessionId, userId, isValid: true },
        select: { id: true }
      });
      if (!session) {
        return sendNotFound(reply, 'Session non trouvée ou déjà fermée');
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
        reason: 'admin_revoke',
        onError: (error) => logWarn(fastify.log, '[ADMIN] socket cut failed on session revoke', error),
      });

      await userAuditService.createAuditLog({
        userId,
        adminId: authContext.registeredUser!.id,
        action: UserAuditAction.REVOKE_SESSION,
        // entity 'User' : l'identifiant est celui du MEMBRE ; la session est dans metadata.
        entityId: userId,
        metadata: { sessionId },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      informMember(userId, 'one', [sessionId], 1);

      return sendSuccess(reply, { message: 'Session révoquée avec succès' });
    } catch (error) {
      logError(fastify.log, 'Error revoking user session', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to revoke user session' });
    }
  });

  /**
   * DELETE /admin/users/:userId/sessions — « tout fermer » d'un membre en un
   * geste (#9613) : toutes ses sessions en base, puis toutes ses sockets, avec
   * le motif `admin_revoke`. Journalisé ; le membre en est informé.
   */
  fastify.delete<{
    Params: { userId: string };
  }>('/admin/users/:userId/sessions', {
    preHandler: [
      fastify.authenticate,
      requireUserViewAccess,
      requirePermission('canViewSensitiveData'),
      requireHierarchy({ param: 'userId' })
    ]
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const { userId } = request.params;

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const revokedCount = await invalidateAllSessions(userId, undefined, 'admin_revoke');

      await disconnectRevokedSessions({
        io: fastify.socketIOHandler?.getManager?.()?.getIO(),
        userId,
        reason: 'admin_revoke',
        onError: (error) => logWarn(fastify.log, '[ADMIN] socket cut failed on revoke-all', error),
      });

      await userAuditService.createAuditLog({
        userId,
        adminId: authContext.registeredUser!.id,
        action: UserAuditAction.REVOKE_SESSION,
        entityId: userId,
        metadata: { scope: 'all', revokedCount },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      informMember(userId, 'all', [], revokedCount);

      return sendSuccess(reply, { revokedCount });
    } catch (error) {
      logError(fastify.log, 'Error revoking all user sessions', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to revoke user sessions' });
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
    // Audit L2-7 — lire l'adresse et la ville d'un membre exige de le
    // SURCLASSER (ou d'être soi), comme le fermer : un ADMIN ne lit pas celles
    // d'un BIGBOSS.
    preHandler: [fastify.authenticate, requireUserViewAccess, requirePermission('canViewSensitiveData'), requireHierarchy({ param: 'userId' })]
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
      // Jamais au-delà de la borne de conservation (12 mois), purge armée ou non.
      const retainedFrom = monthsBefore(new Date(), RETENTION.securityEventMonths);
      const asked = createdAfter ? new Date(createdAfter) : null;
      const from = asked !== null && asked.getTime() > retainedFrom.getTime() ? asked : retainedFrom;
      where.createdAt = {
        gte: from,
        ...(createdBefore ? { lte: new Date(createdBefore) } : {})
      };

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

      await auditRead(request, userId, {
        surface: 'security-events',
        offset: offsetNum,
        ...(eventType ? { eventType } : {}),
        ...(severity ? { severity } : {}),
      });

      // Audit L2-2 — l'adresse et le lieu d'un TIERS (le demandeur d'un
      // transfert de numéro) ne sortent pas, même vers l'administration.
      return sendPaginatedSuccess(reply, events.map(forAdministration), {
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

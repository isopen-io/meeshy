import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import { sendSuccess, sendInternalError, sendNotFound, sendUnauthorized, sendForbidden, sendBadRequest, sendConflict, sendPaginatedSuccess } from '../../utils/response';
import { getReportService } from '../../services/admin/report.service';
import { validatePagination, buildPaginationMeta } from '../../utils/pagination';
import type {
  UpdateReportDTO,
  ReportFilters
} from '@meeshy/shared/types';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { requirePermission } from '../../middleware/authorize';
import { signaler, limiteursDeSignalement } from '../reports';
import { depreciee } from '../../utils/deprecation';

// Schemas de validation Zod
const updateReportSchema = z.object({
  status: z.enum(['pending', 'under_review', 'resolved', 'rejected', 'dismissed']).optional(),
  moderatorNotes: z.string().optional(),
  actionTaken: z.enum(['none', 'warning_sent', 'content_removed', 'user_suspended', 'user_banned']).optional()
});

// Middleware pour verifier les permissions de moderation
// `requireModeratorPermission` était une garde LOCALE : elle rejouait une liste de rôles en dur
// (#4153). Elle nomme désormais la permission qu'elle exige, et la matrice
// décide — un seul endroit où lire la loi, un seul où la changer.
const requireModeratorPermission = requirePermission('canModerateContent');

/**
 * Le sursis de `POST /admin/reports`.
 *
 * `depuis` est la date de fermeture de #4155 — le jour où `POST /api/v1/reports`
 * est devenue l'adresse du geste. Aucun `retraitLe` : la règle de retrait du
 * dépôt (#4155 c.5) exige de COMPTER les appels des trois clients, Android
 * compris, et ce compteur est l'objet de #4275. Une date posée ici serait
 * inventée, et un client la croirait.
 */
const ADAPTATEUR_SIGNALEMENT = { depuis: '2026-08-29', successeur: '/api/v1/reports' } as const;

export async function reportRoutes(fastify: FastifyInstance) {
  const reportService = getReportService(fastify.prisma);

  /**
   * `POST /admin/reports` — ADAPTATEUR MINCE vers `POST /reports` (#4155).
   *
   * Et il le DIT désormais (#4274) : `Deprecation`, et un `Link` qui nomme le
   * successeur. Un adaptateur muet oblige chaque client à apprendre sa propre
   * obsolescence en lisant le code du serveur — ce qu'un binaire mobile déjà
   * installé ne peut pas faire. L'annonce est posée en `onRequest`, AVANT
   * `authenticate` : un appelant dont le jeton a expiré reçoit 401 et apprend
   * quand même par quoi migrer.
   *
   * Signaler n'est pas un geste d'administration : c'était pourtant la seule
   * route de ce répertoire ouverte à un utilisateur ordinaire, et la seule que
   * les trois clients appelaient. L'adresse ment donc sur le privilège, et le
   * jour où quelqu'un durcit le préfixe `/admin` — liste blanche d'IP, WAF —
   * il casse le signalement sur iOS, Android et le web sans le savoir.
   *
   * Elle reste montée le temps que les trois clients migrent, et elle ne
   * DÉCIDE plus rien : même corps validé, mêmes trois seuils de débit, même
   * vérification de cible, même identité serveur. Un adaptateur qui recopierait
   * le geste porterait sa propre loi — c'est la forme du défaut, pas sa
   * correction.
   *
   * Avant de la retirer : COMPTER les appels des trois clients. Le client
   * Kotlin (`core/network/.../ReportApi.kt`) n'avait pas été inventorié par
   * l'audit qui a ouvert cette issue.
   */
  fastify.post('/', {
    onRequest: [depreciee(ADAPTATEUR_SIGNALEMENT), fastify.authenticate],
    preHandler: limiteursDeSignalement(fastify)
  }, (request: FastifyRequest, reply: FastifyReply) => signaler(fastify, request, reply));

  /**
   * GET /api/admin/reports
   * Lister les signalements avec pagination et filtres
   */
  fastify.get('/', {
    onRequest: [fastify.authenticate, requireModeratorPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;

      const filters: ReportFilters = {
        reportedType: query.reportedType,
        reportType: query.reportType,
        status: query.status,
        reporterId: query.reporterId,
        moderatorId: query.moderatorId,
        sortBy: query.sortBy || 'createdAt',
        sortOrder: query.sortOrder || 'desc'
      };

      if (query.createdAfter) {
        filters.createdAfter = new Date(query.createdAfter);
      }
      if (query.createdBefore) {
        filters.createdBefore = new Date(query.createdBefore);
      }

      const pagination = validatePagination(query.offset, query.limit);

      const result = await reportService.listReports(filters, pagination);

      const paginationMeta = buildPaginationMeta(
        result.total,
        pagination.offset,
        pagination.limit,
        result.reports.length
      );

      return sendSuccess(reply, { reports: result.reports, pagination: paginationMeta });
    } catch (error) {
      logError(fastify.log, 'List reports error:', error);
      return sendInternalError(reply, 'Erreur lors de la recuperation des signalements');
    }
  });

  /**
   * GET /api/admin/reports/stats
   * Obtenir les statistiques des signalements
   */
  fastify.get('/stats', {
    onRequest: [fastify.authenticate, requireModeratorPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await reportService.getReportStats();

      return sendSuccess(reply, stats);
    } catch (error) {
      logError(fastify.log, 'Get report stats error:', error);
      return sendInternalError(reply, 'Erreur lors de la recuperation des statistiques');
    }
  });

  /**
   * GET /api/admin/reports/recent
   * Obtenir les signalements recents
   */
  fastify.get('/recent', {
    onRequest: [fastify.authenticate, requireModeratorPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      // Clamp via the shared helper: floors to 1, caps at 100 (never leaks an
      // unbounded client `limit` into the DB query), and treats `limit=0` as 1.
      const { limit } = validatePagination('0', query.limit, { defaultLimit: 10, maxLimit: 100 });

      const reports = await reportService.getRecentReports(limit);

      return sendSuccess(reply, reports);
    } catch (error) {
      logError(fastify.log, 'Get recent reports error:', error);
      return sendInternalError(reply, 'Erreur lors de la recuperation des signalements recents');
    }
  });

  /**
   * GET /api/admin/reports/:id
   * Obtenir un signalement par ID
   */
  fastify.get('/:id', {
    onRequest: [fastify.authenticate, requireModeratorPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      const report = await reportService.getReportById(id);

      if (!report) {
        return sendNotFound(reply, 'Signalement non trouve');
      }

      return sendSuccess(reply, report);
    } catch (error) {
      logError(fastify.log, 'Get report error:', error);
      return sendInternalError(reply, 'Erreur lors de la recuperation du signalement');
    }
  });

  /**
   * PATCH /api/admin/reports/:id
   * Mettre a jour un signalement (moderateur uniquement)
   */
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate, requireModeratorPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const moderatorId = authContext.registeredUser.id;
      const { id } = request.params as { id: string };
      const body = updateReportSchema.parse(request.body);

      const report = await reportService.updateReport(id, moderatorId, body as UpdateReportDTO);

      return sendSuccess(reply, report, { message: 'Signalement mis a jour' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, 'Donnees invalides');
      }

      logError(fastify.log, 'Update report error:', error);
      return sendInternalError(reply, 'Erreur lors de la mise a jour du signalement');
    }
  });

  /**
   * DELETE /api/admin/reports/:id
   * Supprimer un signalement
   */
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate, requireModeratorPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      await reportService.deleteReport(id);

      return sendSuccess(reply, { message: 'Signalement supprime' });
    } catch (error) {
      logError(fastify.log, 'Delete report error:', error);
      return sendInternalError(reply, 'Erreur lors de la suppression du signalement');
    }
  });

  /**
   * GET /api/admin/reports/entity/:type/:id
   * Obtenir tous les signalements pour une entite specifique
   */
  fastify.get('/entity/:type/:id', {
    onRequest: [fastify.authenticate, requireModeratorPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { type, id } = request.params as { type: string; id: string };

      const reports = await reportService.getReportsForEntity(type, id);

      return sendSuccess(reply, reports);
    } catch (error) {
      logError(fastify.log, 'Get entity reports error:', error);
      return sendInternalError(reply, 'Erreur lors de la recuperation des signalements');
    }
  });

  /**
   * POST /api/admin/reports/:id/assign
   * Assigner un moderateur a un signalement
   */
  fastify.post('/:id/assign', {
    onRequest: [fastify.authenticate, requireModeratorPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const moderatorId = authContext.registeredUser.id;
      const { id } = request.params as { id: string };

      const report = await reportService.assignModerator(id, moderatorId);

      return sendSuccess(reply, report, { message: 'Moderateur assigne au signalement' });
    } catch (error) {
      logError(fastify.log, 'Assign moderator error:', error);
      return sendInternalError(reply, 'Erreur lors de l\'assignation du moderateur');
    }
  });

  /**
   * GET /api/admin/reports/moderator/mine
   * Obtenir les signalements assignes au moderateur connecte
   */
  fastify.get('/moderator/mine', {
    onRequest: [fastify.authenticate, requireModeratorPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const moderatorId = authContext.registeredUser.id;

      const reports = await reportService.getModeratorReports(moderatorId);

      return sendSuccess(reply, reports);
    } catch (error) {
      logError(fastify.log, 'Get moderator reports error:', error);
      return sendInternalError(reply, 'Erreur lors de la recuperation des signalements');
    }
  });
}

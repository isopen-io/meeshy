import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import { sendSuccess, sendInternalError, sendNotFound, sendUnauthorized, sendForbidden, sendBadRequest, sendConflict, sendPaginatedSuccess } from '../../utils/response';
import { getReportService } from '../../services/admin/report.service';
import { validatePagination, buildPaginationMeta } from '../../utils/pagination';
import type {
  CreateReportDTO,
  UpdateReportDTO,
  ReportFilters
} from '@meeshy/shared/types';
import { UnifiedAuthRequest } from '../../middleware/auth';

// Schemas de validation Zod
const createReportSchema = z.object({
  reportedType: z.enum(['message', 'user', 'conversation', 'community']),
  reportedEntityId: z.string().min(1, 'ID de l\'entite requis'),
  reporterId: z.string().optional(),
  reporterName: z.string().optional(),
  reportType: z.enum(['spam', 'inappropriate', 'harassment', 'violence', 'hate_speech', 'fake_profile', 'impersonation', 'other']),
  reason: z.string().optional()
});

const updateReportSchema = z.object({
  status: z.enum(['pending', 'under_review', 'resolved', 'rejected', 'dismissed']).optional(),
  moderatorNotes: z.string().optional(),
  actionTaken: z.enum(['none', 'warning_sent', 'content_removed', 'user_suspended', 'user_banned']).optional()
});

// Middleware pour verifier les permissions de moderation
const requireModeratorPermission = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as UnifiedAuthRequest).authContext;
  if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
    return sendUnauthorized(reply, 'Authentification requise');
  }

  const userRole = authContext.registeredUser.role;
  const canModerate = ['BIGBOSS', 'ADMIN', 'MODERATOR'].includes(userRole);

  if (!canModerate) {
    return sendForbidden(reply, 'Permission de moderation requise');
  }
};

export async function reportRoutes(fastify: FastifyInstance) {
  const reportService = getReportService(fastify.prisma);

  /**
   * POST /api/admin/reports
   * Creer un nouveau signalement
   */
  fastify.post('/', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const body = createReportSchema.parse(request.body);

      // Si l'utilisateur est authentifie, utiliser son ID
      const reportData: CreateReportDTO = {
        reportedType: body.reportedType,
        reportedEntityId: body.reportedEntityId,
        reportType: body.reportType,
        reporterId: authContext.registeredUser?.id || body.reporterId,
        reporterName: body.reporterName || authContext.anonymousUser?.username,
        reason: body.reason
      };

      const report = await reportService.createReport(reportData);

      return sendSuccess(reply, report, { statusCode: 201, message: 'Signalement cree avec succes' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Donnees invalides',
          errors: error.issues
        });
      }

      logError(fastify.log, 'Create report error:', error);
      return sendInternalError(reply, 'Erreur lors de la creation du signalement');
    }
  });

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
      const limit = parseInt(query.limit) || 10;

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
        return reply.status(400).send({
          success: false,
          message: 'Donnees invalides',
          errors: error.issues
        });
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

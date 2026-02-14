import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { BroadcastTranslationService } from '../../services/admin/broadcast-translation.service';
import { BroadcastSenderJob } from '../../jobs/broadcast-sender';
import { EmailService } from '../../services/EmailService';

const logger = enhancedLogger.child({ module: 'BroadcastRoutes' });

// ---------------------------------------------------------------------------
// Auth middleware - BIGBOSS & ADMIN only
// ---------------------------------------------------------------------------

const requireBroadcastPermission = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as any).authContext;
  if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
    return reply.status(401).send({ success: false, message: 'Authentification requise' });
  }
  const userRole = authContext.registeredUser.role;
  if (!['BIGBOSS', 'ADMIN'].includes(userRole)) {
    return reply.status(403).send({ success: false, message: 'Permission insuffisante' });
  }
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function broadcastRoutes(fastify: FastifyInstance) {

  // =========================================================================
  // GET / - List broadcasts (paginated)
  // =========================================================================

  fastify.get('/', {
    onRequest: [fastify.authenticate, requireBroadcastPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { offset = '0', limit = '20', status } = request.query as {
        offset?: string;
        limit?: string;
        status?: string;
      };

      const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
      const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);

      const where: any = {};
      if (status) {
        where.status = status;
      }

      const [broadcasts, total] = await Promise.all([
        fastify.prisma.adminBroadcast.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum,
        }),
        fastify.prisma.adminBroadcast.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: {
          broadcasts,
          pagination: {
            total,
            offset: offsetNum,
            limit: limitNum,
            hasMore: offsetNum + limitNum < total,
          },
        },
      });
    } catch (error: any) {
      logger.error('Error listing broadcasts');
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la recuperation des broadcasts',
      });
    }
  });

  // =========================================================================
  // POST / - Create broadcast (DRAFT)
  // =========================================================================

  fastify.post('/', {
    onRequest: [fastify.authenticate, requireBroadcastPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const adminId = authContext.registeredUser.id;

      const { name, subject, body, sourceLanguage, targeting } = request.body as {
        name: string;
        subject: string;
        body: string;
        sourceLanguage: string;
        targeting?: any;
      };

      if (!name || !subject || !body || !sourceLanguage) {
        return reply.status(400).send({
          success: false,
          message: 'Les champs name, subject, body et sourceLanguage sont requis',
        });
      }

      const broadcast = await fastify.prisma.adminBroadcast.create({
        data: {
          name,
          subject,
          body,
          sourceLanguage,
          targeting: targeting || {},
          status: 'DRAFT',
          createdById: adminId,
        },
      });

      // Audit log
      await fastify.prisma.adminAuditLog.create({
        data: {
          adminId,
          userId: adminId,
          action: 'CREATE_BROADCAST',
          entity: 'Broadcast',
          entityId: broadcast.id,
          metadata: JSON.stringify({ name, subject, sourceLanguage }),
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      });

      return reply.status(201).send({
        success: true,
        data: broadcast,
      });
    } catch (error: any) {
      logger.error('Error creating broadcast');
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la creation du broadcast',
      });
    }
  });

  // =========================================================================
  // GET /:id - Get broadcast detail
  // =========================================================================

  fastify.get('/:id', {
    onRequest: [fastify.authenticate, requireBroadcastPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      const broadcast = await fastify.prisma.adminBroadcast.findUnique({
        where: { id },
      });

      if (!broadcast) {
        return reply.status(404).send({
          success: false,
          message: 'Broadcast non trouve',
        });
      }

      return reply.send({
        success: true,
        data: broadcast,
      });
    } catch (error: any) {
      logger.error('Error fetching broadcast');
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la recuperation du broadcast',
      });
    }
  });

  // =========================================================================
  // PUT /:id - Update broadcast (DRAFT only)
  // =========================================================================

  fastify.put('/:id', {
    onRequest: [fastify.authenticate, requireBroadcastPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      const existing = await fastify.prisma.adminBroadcast.findUnique({
        where: { id },
      });

      if (!existing) {
        return reply.status(404).send({
          success: false,
          message: 'Broadcast non trouve',
        });
      }

      if (existing.status !== 'DRAFT') {
        return reply.status(400).send({
          success: false,
          message: 'Seuls les broadcasts en statut DRAFT peuvent etre modifies',
        });
      }

      const { name, subject, body, sourceLanguage, targeting } = request.body as {
        name?: string;
        subject?: string;
        body?: string;
        sourceLanguage?: string;
        targeting?: any;
      };

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (subject !== undefined) updateData.subject = subject;
      if (body !== undefined) updateData.body = body;
      if (sourceLanguage !== undefined) updateData.sourceLanguage = sourceLanguage;
      if (targeting !== undefined) updateData.targeting = targeting;

      const broadcast = await fastify.prisma.adminBroadcast.update({
        where: { id },
        data: updateData,
      });

      return reply.send({
        success: true,
        data: broadcast,
      });
    } catch (error: any) {
      logger.error('Error updating broadcast');
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la mise a jour du broadcast',
      });
    }
  });

  // =========================================================================
  // POST /:id/preview - Preview & translate
  // =========================================================================

  fastify.post('/:id/preview', {
    onRequest: [fastify.authenticate, requireBroadcastPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      const broadcast = await fastify.prisma.adminBroadcast.findUnique({
        where: { id },
      });

      if (!broadcast) {
        return reply.status(404).send({
          success: false,
          message: 'Broadcast non trouve',
        });
      }

      // Build recipient filter (same logic as BroadcastSenderJob)
      const targeting = (broadcast.targeting || {}) as any;

      const where: any = {
        emailVerifiedAt: { not: null },
        isActive: true,
        deletedAt: null,
      };

      if (targeting.languages && Array.isArray(targeting.languages) && targeting.languages.length > 0) {
        where.systemLanguage = { in: targeting.languages };
      }

      if (targeting.countries && Array.isArray(targeting.countries) && targeting.countries.length > 0) {
        where.registrationCountry = { in: targeting.countries };
      }

      if (targeting.activityStatus) {
        const now = new Date();
        switch (targeting.activityStatus) {
          case 'active': {
            // Active in last 30 days
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            where.lastActiveAt = { gte: thirtyDaysAgo };
            break;
          }
          case 'inactive': {
            // No activity in last 30 days
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            where.OR = [
              { lastActiveAt: { lt: thirtyDaysAgo } },
              { lastActiveAt: null },
            ];
            break;
          }
          case 'new': {
            // Registered in last 7 days
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            where.createdAt = { gte: sevenDaysAgo };
            break;
          }
          // 'all' or unrecognized -> no additional filter
        }
      }

      // Count total recipients
      const recipientCount = await fastify.prisma.user.count({ where });

      // Group by systemLanguage
      const recipientsByLanguage = await fastify.prisma.user.groupBy({
        by: ['systemLanguage'],
        where,
        _count: true,
      });

      // Group by registrationCountry
      const recipientsByCountry = await fastify.prisma.user.groupBy({
        by: ['registrationCountry'],
        where,
        _count: true,
      });

      // Get unique target languages from recipients
      const targetLanguages = recipientsByLanguage
        .map((g: any) => g.systemLanguage)
        .filter(Boolean) as string[];

      // Translate content
      const translationService = new BroadcastTranslationService();
      const translations = await translationService.translateContent(
        broadcast.subject,
        broadcast.body,
        broadcast.sourceLanguage,
        targetLanguages
      );

      // Save translations to broadcast, set status = READY
      const updatedBroadcast = await fastify.prisma.adminBroadcast.update({
        where: { id },
        data: {
          translatedSubjects: translations.subjects,
          translatedBodies: translations.bodies,
          targetLanguages,
          totalRecipients: recipientCount,
          status: 'READY',
        },
      });

      return reply.send({
        success: true,
        data: {
          recipientCount,
          recipientsByLanguage: recipientsByLanguage.map((g: any) => ({
            language: g.systemLanguage,
            count: g._count,
          })),
          recipientsByCountry: recipientsByCountry.map((g: any) => ({
            country: g.registrationCountry,
            count: g._count,
          })),
          translations,
          broadcast: updatedBroadcast,
        },
      });
    } catch (error: any) {
      logger.error('Error previewing broadcast');
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la preview du broadcast',
      });
    }
  });

  // =========================================================================
  // POST /:id/send - Launch sending
  // =========================================================================

  fastify.post('/:id/send', {
    onRequest: [fastify.authenticate, requireBroadcastPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const authContext = (request as any).authContext;
      const adminId = authContext.registeredUser.id;

      const broadcast = await fastify.prisma.adminBroadcast.findUnique({
        where: { id },
      });

      if (!broadcast) {
        return reply.status(404).send({
          success: false,
          message: 'Broadcast non trouve',
        });
      }

      if (broadcast.status !== 'READY') {
        return reply.status(400).send({
          success: false,
          message: 'Le broadcast doit etre en statut READY pour etre envoye. Lancez d\'abord la preview.',
        });
      }

      // Update status to SENDING
      await fastify.prisma.adminBroadcast.update({
        where: { id },
        data: {
          status: 'SENDING',
          sentById: adminId,
          sentAt: new Date(),
        },
      });

      // Audit log
      await fastify.prisma.adminAuditLog.create({
        data: {
          adminId,
          userId: adminId,
          action: 'SEND_BROADCAST',
          entity: 'Broadcast',
          entityId: id,
          metadata: JSON.stringify({ name: broadcast.name, subject: broadcast.subject }),
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      });

      // Launch BroadcastSenderJob fire-and-forget
      const emailService = new EmailService();
      const job = new BroadcastSenderJob(fastify.prisma, emailService);
      job.execute(id).catch((err: any) => {
        logger.error(`Broadcast job failed for id=${id}: ${err.message}`);
      });

      return reply.send({
        success: true,
        message: 'Envoi en cours',
      });
    } catch (error: any) {
      logger.error('Error sending broadcast');
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors du lancement de l\'envoi du broadcast',
      });
    }
  });

  // =========================================================================
  // DELETE /:id - Delete broadcast (DRAFT or READY only)
  // =========================================================================

  fastify.delete('/:id', {
    onRequest: [fastify.authenticate, requireBroadcastPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const authContext = (request as any).authContext;
      const adminId = authContext.registeredUser.id;

      const broadcast = await fastify.prisma.adminBroadcast.findUnique({
        where: { id },
      });

      if (!broadcast) {
        return reply.status(404).send({
          success: false,
          message: 'Broadcast non trouve',
        });
      }

      if (!['DRAFT', 'READY'].includes(broadcast.status)) {
        return reply.status(400).send({
          success: false,
          message: 'Seuls les broadcasts en statut DRAFT ou READY peuvent etre supprimes',
        });
      }

      // Audit log before deletion
      await fastify.prisma.adminAuditLog.create({
        data: {
          adminId,
          userId: adminId,
          action: 'DELETE_BROADCAST',
          entity: 'Broadcast',
          entityId: id,
          metadata: JSON.stringify({ name: broadcast.name, subject: broadcast.subject, status: broadcast.status }),
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      });

      await fastify.prisma.adminBroadcast.delete({
        where: { id },
      });

      return reply.send({
        success: true,
        message: 'Broadcast supprime',
      });
    } catch (error: any) {
      logger.error('Error deleting broadcast');
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la suppression du broadcast',
      });
    }
  });
}

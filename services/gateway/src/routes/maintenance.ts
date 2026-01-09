/**
 * Routes de maintenance pour Meeshy
 * Endpoints pour la gestion et le monitoring des tâches de maintenance
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MaintenanceService } from '../services/MaintenanceService';
import { AttachmentService } from '../services/AttachmentService';
import { StatusService } from '../services/StatusService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

export async function maintenanceRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma as PrismaClient;
  const attachmentService = new AttachmentService(prisma);
  const maintenanceService = new MaintenanceService(prisma, attachmentService);
  const statusService = new StatusService(prisma);

  // Route pour obtenir les statistiques de maintenance
  fastify.get('/stats', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                onlineUsers: { type: 'number' },
                totalUsers: { type: 'number' },
                anonymousSessions: { type: 'number' },
                offlineThresholdMinutes: { type: 'number' },
                maintenanceActive: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await maintenanceService.getMaintenanceStats();

      if (!stats) {
        return reply.status(500).send({
          success: false,
          error: 'Erreur lors de la récupération des statistiques'
        });
      }

      return reply.send({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('[GATEWAY] Error in /maintenance/stats:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des statistiques de maintenance'
      });
    }
  });

  // Route pour déclencher manuellement le nettoyage des données expirées
  fastify.post('/cleanup', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await maintenanceService.cleanupExpiredData();

      return reply.send({
        success: true,
        data: { message: 'Nettoyage des données expirées terminé' }
      });
    } catch (error) {
      console.error('[GATEWAY] Error in /maintenance/cleanup:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors du nettoyage des données expirées'
      });
    }
  });

  // Route pour mettre à jour manuellement le statut d'un utilisateur
  fastify.post('/user-status', {
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'isOnline'],
        properties: {
          userId: { type: 'string' },
          isOnline: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, isOnline } = request.body as { userId: string; isOnline: boolean };

      await maintenanceService.updateUserOnlineStatus(userId, isOnline);

      return reply.send({
        success: true,
        data: { message: `Statut utilisateur ${userId} mis à jour: ${isOnline ? 'en ligne' : 'hors ligne'}` }
      });
    } catch (error) {
      console.error('[GATEWAY] Error in /maintenance/user-status:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la mise à jour du statut utilisateur'
      });
    }
  });

  // NOUVEAU: Route pour obtenir les métriques du StatusService
  fastify.get('/status-metrics', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                totalRequests: { type: 'number' },
                throttledRequests: { type: 'number' },
                successfulUpdates: { type: 'number' },
                failedUpdates: { type: 'number' },
                cacheSize: { type: 'number' },
                throttleRate: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = statusService.getMetrics();
      const throttleRate = metrics.totalRequests > 0
        ? (metrics.throttledRequests / metrics.totalRequests * 100).toFixed(2)
        : '0.00';

      return reply.send({
        success: true,
        data: {
          ...metrics,
          throttleRate: parseFloat(throttleRate)
        }
      });
    } catch (error) {
      console.error('[GATEWAY] Error in /maintenance/status-metrics:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des métriques de statut'
      });
    }
  });

  // NOUVEAU: Route pour réinitialiser les métriques du StatusService
  fastify.post('/status-metrics/reset', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      statusService.resetMetrics();

      return reply.send({
        success: true,
        data: { message: 'Métriques de statut réinitialisées avec succès' }
      });
    } catch (error) {
      console.error('[GATEWAY] Error in /maintenance/status-metrics/reset:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la réinitialisation des métriques'
      });
    }
  });
}

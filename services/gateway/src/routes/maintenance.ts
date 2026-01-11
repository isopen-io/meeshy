/**
 * Routes de maintenance pour Meeshy
 * Endpoints pour la gestion et le monitoring des tâches de maintenance
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MaintenanceService } from '../services/MaintenanceService';
import { AttachmentService } from '../services/AttachmentService';
import { StatusService } from '../services/StatusService';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

export async function maintenanceRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma as PrismaClient;
  const attachmentService = new AttachmentService(prisma);
  const maintenanceService = new MaintenanceService(prisma, attachmentService);
  const statusService = new StatusService(prisma);

  // Route pour obtenir les statistiques de maintenance
  fastify.get('/stats', {
    schema: {
      description: 'Retrieve comprehensive maintenance statistics including online users, total users, anonymous sessions, and system health metrics. This endpoint provides real-time monitoring data for system administrators.',
      tags: ['maintenance', 'monitoring'],
      summary: 'Get maintenance statistics',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                onlineUsers: { type: 'number', description: 'Number of currently online users', example: 150 },
                totalUsers: { type: 'number', description: 'Total number of registered users', example: 5000 },
                anonymousSessions: { type: 'number', description: 'Number of active anonymous sessions', example: 25 },
                offlineThresholdMinutes: { type: 'number', description: 'Minutes before a user is considered offline', example: 5 },
                maintenanceActive: { type: 'boolean', description: 'Whether maintenance mode is active', example: false }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
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
      description: 'Manually trigger cleanup of expired data including old sessions, inactive anonymous participants, expired share links, and stale attachments. This maintenance operation helps keep the database clean and optimized.',
      tags: ['maintenance', 'admin'],
      summary: 'Trigger cleanup of expired data',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', description: 'Cleanup operation result message', example: 'Nettoyage des données expirées terminé' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
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
      description: 'Manually update the online/offline status of a specific user. This allows administrators to override the automatic status tracking for troubleshooting or testing purposes.',
      tags: ['maintenance', 'admin', 'users'],
      summary: 'Update user online status',
      body: {
        type: 'object',
        required: ['userId', 'isOnline'],
        properties: {
          userId: { type: 'string', description: 'User ID to update', example: 'usr_abc123' },
          isOnline: { type: 'boolean', description: 'Whether the user should be marked as online', example: true }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', description: 'Status update confirmation message', example: 'Statut utilisateur usr_abc123 mis à jour: en ligne' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
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
      description: 'Retrieve detailed performance metrics for the StatusService including request counts, throttling statistics, update success/failure rates, and cache utilization. This endpoint provides insights into the status tracking system performance.',
      tags: ['maintenance', 'monitoring', 'metrics'],
      summary: 'Get status service metrics',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                totalRequests: { type: 'number', description: 'Total number of status update requests processed', example: 10000 },
                throttledRequests: { type: 'number', description: 'Number of requests that were throttled', example: 250 },
                successfulUpdates: { type: 'number', description: 'Number of successful status updates', example: 9500 },
                failedUpdates: { type: 'number', description: 'Number of failed status updates', example: 250 },
                cacheSize: { type: 'number', description: 'Current size of the status cache', example: 500 },
                throttleRate: { type: 'number', description: 'Percentage of requests that were throttled', example: 2.5 }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
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
      description: 'Reset all StatusService performance metrics to zero. This operation clears accumulated request counts, throttling statistics, and update counters. Useful for starting fresh metric collection after maintenance or for testing purposes.',
      tags: ['maintenance', 'admin', 'metrics'],
      summary: 'Reset status service metrics',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', description: 'Metrics reset confirmation message', example: 'Métriques de statut réinitialisées avec succès' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
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

/**
 * Handler Socket.IO pour intégration avec Fastify
 * Point d'entrée pour configurer Socket.IO sur le serveur Fastify
 */

import { FastifyInstance } from 'fastify';
import { Server as HTTPServer } from 'http';
import { MeeshySocketIOManager } from './MeeshySocketIOManager';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

export class MeeshySocketIOHandler {
  private socketIOManager: MeeshySocketIOManager | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtSecret: string
  ) {
    // Ne pas initialiser le manager ici, attendre setupSocketIO
  }

  /**
   * Configure Socket.IO sur l'instance Fastify
   */
  public setupSocketIO(fastify: FastifyInstance): void {
    // Récupérer le serveur HTTP sous-jacent de Fastify
    const httpServer = fastify.server as HTTPServer;

    // Initialiser Socket.IO avec le serveur HTTP
    this.socketIOManager = new MeeshySocketIOManager(httpServer, this.prisma);
    this.socketIOManager.initialize();

    // Ajouter une route pour les statistiques Socket.IO
    fastify.get('/api/socketio/stats', async (request, reply) => {
      try {
        const stats = this.socketIOManager.getStats();
        reply.send({
          success: true,
          data: {
            ...stats,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        logger.error('Erreur récupération stats Socket.IO:', error);
        reply.status(500).send({
          success: false,
          error: 'Erreur serveur lors de la récupération des statistiques'
        });
      }
    });

    // Route pour forcer la déconnexion d'un utilisateur (admin seulement)
    fastify.post('/api/socketio/disconnect-user', async (request, reply) => {
      try {
        const { userId } = request.body as { userId: string };
        
        if (!userId) {
          return reply.status(400).send({
            success: false,
            error: 'userId requis'
          });
        }

        // TODO: Vérifier les permissions admin
        // const userRole = await this.checkUserRole(request);
        // if (userRole !== 'ADMIN') {
        //   return reply.status(403).send({ success: false, error: 'Permission refusée' });
        // }

        if (this.socketIOManager) {
          const disconnected = this.socketIOManager.disconnectUser(userId);
          if (disconnected) {
            reply.send({
              success: true,
              message: `Utilisateur ${userId} déconnecté`
            });
          } else {
            reply.status(404).send({
              success: false,
              error: `Utilisateur ${userId} non trouvé ou non connecté`
            });
          }
        } else {
          reply.status(500).send({
            success: false,
            error: 'Socket.IO non initialisé'
          });
        }
      } catch (error) {
        logger.error('Erreur déconnexion utilisateur:', error);
        reply.status(500).send({
          success: false,
          error: 'Erreur serveur lors de la déconnexion'
        });
      }
    });

    logger.info('✅ Socket.IO configuré et routes ajoutées');
  }

  /**
   * Accès au manager Socket.IO pour des opérations avancées
   */
  public getManager(): MeeshySocketIOManager | null {
    return this.socketIOManager;
  }

  /**
   * Méthode pour envoyer des notifications push via Socket.IO
   */
  public async sendNotificationToUser(userId: string, notification: any): Promise<void> {
    try {
      if (this.socketIOManager) {
        const sent = this.socketIOManager.sendToUser(userId, SERVER_EVENTS.NOTIFICATION, notification);
        if (sent) {
          logger.info(`📱 Notification envoyée à l'utilisateur ${userId}`, notification);
        } else {
          logger.warn(`⚠️ Utilisateur ${userId} non connecté pour notification`);
        }
      }
    } catch (error) {
      logger.error('Erreur envoi notification:', error);
    }
  }

  /**
   * Méthode pour broadcaster un message à tous les utilisateurs connectés
   */
  public async broadcastMessage(message: any): Promise<void> {
    try {
      if (this.socketIOManager) {
        this.socketIOManager.broadcast(SERVER_EVENTS.SYSTEM_MESSAGE, message);
        logger.info('📢 Broadcast message à tous les utilisateurs', message);
      }
    } catch (error) {
      logger.error('Erreur broadcast message:', error);
    }
  }

  /**
   * Méthode pour obtenir la liste des utilisateurs connectés
   */
  public getConnectedUsers(): string[] {
    try {
      if (this.socketIOManager) {
        return this.socketIOManager.getConnectedUsers();
      }
      return [];
    } catch (error) {
      logger.error('Erreur récupération utilisateurs connectés:', error);
      return [];
    }
  }
}

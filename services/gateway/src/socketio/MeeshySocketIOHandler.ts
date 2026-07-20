/**
 * Handler Socket.IO pour intégration avec Fastify
 * Point d'entrée pour configurer Socket.IO sur le serveur Fastify
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Server as HTTPServer } from 'http';
import { MeeshySocketIOManager } from './MeeshySocketIOManager';
import { MessageTranslationService } from '../services/message-translation/MessageTranslationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';
import { requireAdmin } from '../middleware/auth';

export class MeeshySocketIOHandler {
  private socketIOManager: MeeshySocketIOManager | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtSecret: string,
    private readonly translationService: MessageTranslationService
  ) {
    // Ne pas initialiser le manager ici, attendre setupSocketIO
  }

  /**
   * Configure Socket.IO sur l'instance Fastify
   */
  public async setupSocketIO(fastify: FastifyInstance): Promise<void> {
    // Récupérer le serveur HTTP sous-jacent de Fastify
    const httpServer = fastify.server as HTTPServer;

    // Initialiser Socket.IO avec le serveur HTTP et translationService
    this.socketIOManager = new MeeshySocketIOManager(httpServer, this.prisma, this.translationService);
    await this.socketIOManager.initialize();

    // Ajouter une route pour les statistiques Socket.IO (admin seulement)
    fastify.get('/api/socketio/stats', {
      preHandler: [
        (req: FastifyRequest, rep: FastifyReply) => fastify.authenticate(req, rep),
        requireAdmin
      ]
    }, async (request, reply) => {
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
    fastify.post('/api/socketio/disconnect-user', {
      preHandler: [
        (req: FastifyRequest, rep: FastifyReply) => fastify.authenticate(req, rep),
        requireAdmin
      ]
    }, async (request, reply) => {
      try {
        const { userId } = request.body as { userId: string };

        if (!userId) {
          return reply.status(400).send({
            success: false,
            error: 'userId requis'
          });
        }

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
   * Diffuse un nouveau message aux participants de la conversation.
   *
   * Délègue au broadcast par-conversation du manager, qui émet `message:new`
   * vers `ROOMS.conversation(id)`. Les clients (iOS, web) n'écoutent que
   * `message:new` : émettre `system:message` globalement (ancien comportement)
   * ne mettait jamais à jour la conversation ouverte en temps réel.
   */
  public async broadcastMessage(message: any, conversationId: string): Promise<void> {
    try {
      if (this.socketIOManager) {
        await this.socketIOManager.broadcastMessage(message, conversationId);
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

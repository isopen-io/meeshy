/**
 * Handler Socket.IO pour intégration avec Fastify
 * Point d'entrée pour configurer Socket.IO sur le serveur Fastify
 */

import { FastifyInstance } from 'fastify';
import { Server as HTTPServer } from 'http';
import { MeeshySocketIOManager } from './MeeshySocketIOManager';
import { MessageTranslationService } from '../services/message-translation/MessageTranslationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';
import { socketIOAdminRoutes } from './socketio-admin-routes';

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

    // Les deux gestes d'administration vivent dans `socketio-admin-routes.ts`
    // et se MONTENT ici, plutôt que d'être déclarés en ligne. La raison n'est
    // pas cosmétique : cette méthode est appelée par `MeeshyServer.start()`
    // AVANT `setupRoutes()`, donc hors de `registerAllRoutes` — le seul graphe
    // que `route-manifest/collect.ts` monte. Déclarées ici, ces quatre routes
    // étaient SERVIES et invisibles au manifeste, au catalogue client qui en
    // dérive et à tout audit qui s'y appuie (#4376). Extraites en plugin, le
    // collecteur monte EXACTEMENT le même objet que la production.
    //
    // `getManager` plutôt que le manager lui-même : il vient d'être construit
    // ci-dessus, mais le collecteur n'en a aucun — un accesseur sert les deux
    // sans qu'aucun ait à fabriquer l'autre.
    await fastify.register(socketIOAdminRoutes, {
      getManager: () => this.socketIOManager,
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

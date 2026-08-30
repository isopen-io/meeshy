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
import { apiPath } from '@meeshy/shared/api/prefix';
import { depreciee, dateDeRetrait } from '../utils/deprecation';

/**
 * Le jour où l'adresse versionnée devient LA surface des deux gestes
 * d'administration Socket.IO.
 */
const DEPUIS_SOCKETIO_NON_VERSIONNE = '2026-08-30';

/**
 * Les deux gestes, déclarés UNE fois : le relatif, dont l'adresse canonique et
 * l'alias dérivent tous les deux.
 *
 * L'adresse canonique passe par `apiPath()` — source unique du préfixe — parce
 * que la version d'API est une CONFIGURATION : elle peut devenir `/api/v2`, ou
 * se déplacer vers `api.domaine.tld/v2/`. Ces deux routes portaient leur chemin
 * EN DUR, sans version : sur les seize routes du dépôt hors `/api/v1`, treize
 * sont des alias dépréciés qui annoncent leur successeur et deux sont des
 * sondes d'infrastructure (`/health`, `/info`) légitimement hors version.
 * Celles-ci n'étaient ni l'un ni l'autre.
 *
 * Elles avaient échappé à tout le monde pour une raison structurelle :
 * `setupSocketIO` est appelée au démarrage, HORS de `registerAllRoutes`, et le
 * collecteur du manifeste ne monte que `registerAllRoutes`. Elles n'apparaissent
 * donc dans aucun manifeste — ni dans le catalogue client qui en dérive, ni dans
 * les audits d'administration qui s'y appuient. Le défaut de VISIBILITÉ (#4376)
 * protégeait le défaut d'ADRESSE.
 */
const GESTES_SOCKETIO = {
  stats: '/socketio/stats',
  disconnectUser: '/socketio/disconnect-user',
} as const;

/**
 * L'ancienne adresse reste servie et l'ANNONCE, plutôt que de disparaître.
 *
 * Aucun client ne l'appelle — mesuré sur les quatre surfaces. Ce n'est pas une
 * raison suffisante : le dépôt ne retire pas une adresse sur une revue de code
 * client, mais sur un compteur d'accès nul (#4275). Une console
 * d'administration tierce, un signet, un script d'exploitation ne sont dans
 * aucun `grep`.
 */
function aliasNonVersionne(relatif: string) {
  return depreciee({
    depuis: DEPUIS_SOCKETIO_NON_VERSIONNE,
    successeur: apiPath(relatif),
    retraitLe: dateDeRetrait(DEPUIS_SOCKETIO_NON_VERSIONNE),
  });
}

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
    const gardesAdmin = [
      (req: FastifyRequest, rep: FastifyReply) => fastify.authenticate(req, rep),
      requireAdmin
    ];

    /** Le geste, écrit UNE fois — les deux adresses le partagent. */
    const servirStats = async (_request: FastifyRequest, reply: FastifyReply) => {
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
    };

    fastify.get(apiPath(GESTES_SOCKETIO.stats), { preHandler: gardesAdmin }, servirStats);
    fastify.get('/api' + GESTES_SOCKETIO.stats, {
      onRequest: aliasNonVersionne(GESTES_SOCKETIO.stats),
      preHandler: gardesAdmin
    }, servirStats);

    /** Le geste, écrit UNE fois — les deux adresses le partagent. */
    const servirDeconnexion = async (request: FastifyRequest, reply: FastifyReply) => {
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
    };

    fastify.post(apiPath(GESTES_SOCKETIO.disconnectUser), { preHandler: gardesAdmin }, servirDeconnexion);
    fastify.post('/api' + GESTES_SOCKETIO.disconnectUser, {
      onRequest: aliasNonVersionne(GESTES_SOCKETIO.disconnectUser),
      preHandler: gardesAdmin
    }, servirDeconnexion);

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

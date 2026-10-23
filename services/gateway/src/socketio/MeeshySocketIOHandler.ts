/**
 * Handler Socket.IO pour intégration avec Fastify
 * Point d'entrée pour configurer Socket.IO sur le serveur Fastify
 */

import { FastifyInstance } from 'fastify';
import { Server as HTTPServer } from 'http';
import { MeeshySocketIOManager } from './MeeshySocketIOManager';
import { MessageTranslationService } from '../services/message-translation/MessageTranslationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import type { GameBlock } from '@meeshy/shared/types/game';
import { logger } from '../utils/logger';
import { socketIOAdminRoutes } from './socketio-admin-routes';
import { setEngagementEmitIOProvider } from '../services/engagement/engagement-emit-registry';
import { GameStateBroadcast, setGameStateBroadcast } from '../services/game/GameStateBroadcast';
import { gravedGameRevision } from '../services/game/GameRevision';
import { GameBlockService } from '../services/game/GameBlockService';
import { MissionService, READ_ONLY_CREDIT } from '../services/game/MissionService';
import { PersonalMissionService } from '../services/game/PersonalMissionService';
import { mediaQueueEnabled } from '../services/attachments/media-processing/queue';
import { gatewaySweepEnabled, startGatewayPendingSweep } from '../services/attachments/media-processing/gateway-sweep-runner';
import { mediaReadyPorts } from '../services/attachments/media-processing/ready-listener';
import { MessageAttachmentAltTranslationService } from '../services/attachments/MessageAttachmentAltTranslationService';
import { startMediaReadyListener } from '../services/attachments/media-processing/ready-listener';
import { RedisDeliveryQueue } from '../services/RedisDeliveryQueue';
import { getCacheStore } from '../services/CacheStore';

/** Le bloc `game` tel que `GET /me/engagement` le compose : la lecture ne crédite rien (`READ_ONLY_CREDIT`). */
function gameBlockBuilder(prisma: PrismaClient): (userId: string) => Promise<GameBlock | null> {
  const missions = new MissionService(prisma, { creditPoints: READ_ONLY_CREDIT });
  const blocks = new GameBlockService(prisma, { missions, personal: new PersonalMissionService(prisma, { missions }) });
  return (userId) => blocks.build({ userId });
}

export class MeeshySocketIOHandler {
  private socketIOManager: MeeshySocketIOManager | null = null;

  private mediaReadyListener: { close(): Promise<void> } | null = null;
  private mediaPendingSweep: { close(): void } | null = null;

  constructor(
    private readonly prisma: PrismaClient,
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
    // Les crédits d'engagement annoncent « N (M) 🔥 » au crédité (#8906).
    setEngagementEmitIOProvider(() => this.socketIOManager?.getIO());
    // L'état du jeu se propage aux appareils du compte après chaque écriture (#10900).
    setGameStateBroadcast(
      new GameStateBroadcast({
        io: () => this.socketIOManager?.getIO() ?? undefined,
        build: gameBlockBuilder(this.prisma),
        // La révision GRAVÉE du compte (#10912), lue avant le bloc : jamais l'heure de l'émission.
        revision: (userId) => gravedGameRevision(this.prisma, userId),
      }),
    );

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

    this.startMediaPipelines(this.socketIOManager);

    logger.info('✅ Socket.IO configuré et routes ajoutées');
  }

  /**
   * Les trois chemins qui republient une pièce rendue ou traduite. Leurs
   * dépendances (file de livraison Redis, bail) ne se construisent que si l'un
   * d'eux est allumé : éteints, la passerelle ne touche pas à Redis pour eux.
   */
  private startMediaPipelines(manager: MeeshySocketIOManager): void {
    // #11264 — les médias rendus par le worker se signalent ici (file allumée seulement).
    const listenerRedisUrl = mediaQueueEnabled() ? process.env.REDIS_URL : undefined;
    // R1 — sans worker vivant, ou file mise à l'arrêt (`MEDIA_QUEUE=drain`),
    // la passerelle reprend elle-même les pièces restées `pending`.
    const sweepOn = gatewaySweepEnabled();
    // #12333 — la description d'une pièce traduite par NLLB rejoint ses
    // lecteurs par `message:attachment-updated`, sous la loi de `servedDescription`.
    const zmqClient = this.translationService.getZmqClient();
    if (!listenerRedisUrl && !sweepOn && !zmqClient) return;

    const mediaDeps = {
      prisma: this.prisma,
      io: manager.getIO() as never,
      deliveryQueue: new RedisDeliveryQueue(getCacheStore()),
      connectedUsers: () => new Set(manager.getConnectedUsers()),
      socialEvents: () => manager.getSocialEventsHandler(),
      leaseStore: getCacheStore(),
    };
    if (listenerRedisUrl) {
      this.mediaReadyListener = startMediaReadyListener(mediaDeps, listenerRedisUrl);
    }
    if (sweepOn) {
      this.mediaPendingSweep = startGatewayPendingSweep(mediaDeps);
    }
    if (zmqClient) {
      const ports = mediaReadyPorts(mediaDeps);
      MessageAttachmentAltTranslationService.init(this.prisma, zmqClient, async (attachmentId) => {
        const attachment = await ports.loadMessageAttachment(attachmentId);
        const conversationId = attachment?.message?.conversationId;
        if (attachment?.messageId && conversationId) {
          await ports.emitAttachmentUpdated({ conversationId, messageId: attachment.messageId, attachment });
        }
      });
    }
  }

  /**
   * Ferme le temps réel à l'arrêt de la passerelle (#8297) : les appels passent
   * d'abord en mode arrêt — la rafale de déconnexions qui suit n'est pas un
   * raccrochage, le média pair-à-pair continue —, puis les sockets tombent et
   * les clients se reconnectent aussitôt à la nouvelle instance.
   */
  public async close(): Promise<void> {
    const manager = this.socketIOManager;
    if (!manager) return;
    try {
      const calls = manager.getCallEventsHandler();
      calls.prepareForShutdown();
      calls.destroy();
      manager.getCallService().destroy();
      logger.info('✓ Call handler set to shutdown mode (active calls preserved for reconnect)');
    } catch (error) {
      logger.warn('⚠️ Could not set call handler shutdown mode', error);
    }
    await this.mediaReadyListener?.close().catch((error: unknown) => logger.warn('⚠️ Media ready listener close failed', error));
    this.mediaPendingSweep?.close();
    await manager.close();
    logger.info('✓ Socket.IO closed (clients reconnect to the new instance)');
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

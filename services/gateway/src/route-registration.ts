/**
 * Enregistrement de l'intégralité des routes REST du gateway.
 *
 * Extrait de `server.ts` (`MeeshyServer.setupRoutes()`, qui délègue
 * maintenant ici) dans un module SANS effet de bord au chargement, pour que
 * le test de garde (`src/__tests__/security/route-auth-coverage.test.ts`,
 * mission « une nouvelle route non authentifiée doit faire tomber le
 * test ») puisse importer `registerAllRoutes` et assembler EXACTEMENT le
 * même graphe de routes que le serveur de production, sans déclencher le
 * bootstrap réel du serveur.
 *
 * IMPORTANT : `server.ts` instancie `MeeshyServer` et appelle
 * `meeshyServer.start()` à son niveau module (effet de bord — connexions
 * DB/Redis/ZMQ réelles, `listen()` sur un port). Importer quoi que ce soit
 * depuis `server.ts` exécute donc tout le fichier, y compris ce bootstrap.
 * C'est précisément pour l'éviter que cette fonction vit ici et non dans
 * `server.ts` : ce module n'importe et n'exécute que la logique
 * d'enregistrement de routes, rien d'autre.
 *
 * Ne PAS dupliquer cette logique ailleurs : toute route ajoutée ici est
 * automatiquement couverte par le test de garde.
 */

import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService } from './services/message-translation/MessageTranslationService';
import { MessagingService } from './services/MessagingService';
import { MentionService } from './services/MentionService';
import { OrphanMediaCleanupService } from './services/storage/OrphanMediaCleanupService';
import { logger } from './gateway-logger';
import { resolveBuildInfo } from '@meeshy/shared/utils/build-info';

import { authRoutes } from './routes/auth';
import { conversationRoutes } from './routes/conversations';
import { syncRoutes } from './routes/sync';
import { linksRoutes } from './routes/links';
import { trackingLinksRoutes } from './routes/tracking-links';
import { anonymousRoutes } from './routes/anonymous';
import { accountDeletionRoutes } from './routes/account-deletion';
import { directoryAvailabilityRoutes } from './routes/directory/availability';
import { directoryPeopleRoutes } from './routes/directory/people';
import { directoryPersonRoutes } from './routes/directory/person';
import { directoryPresenceRoutes } from './routes/directory/presence';
import { directoryBlocksRoutes } from './routes/directory/blocks';
import { directoryFriendRequestsRoutes } from './routes/directory/friend-requests';
import { directoryContactsRoutes } from './routes/directory/contacts';
import { adminMePermissionsRoutes } from './routes/admin/me-permissions';
import { communityRoutes } from './routes/communities';
// import { adminRoutes } from './routes/admin'; // Not used - individual admin routes registered below
import { dashboardRoutes } from './routes/admin/dashboard';
import { userAdminRoutes } from './routes/admin/users';
import { reportRoutes } from './routes/admin/reports';
import { reportCreationRoutes } from './routes/reports';
import { invitationRoutes } from './routes/admin/invitations';
import { analyticsRoutes } from './routes/admin/analytics';
import { languagesRoutes } from './routes/admin/languages';
import { messagesRoutes } from './routes/admin/messages';
import { registerContentRoutes } from './routes/admin/content';
import { anonymousUsersAdminRoutes } from './routes/admin/anonymous-users';
import { systemRankingsRoutes } from './routes/admin/system-rankings';
import { broadcastRoutes } from './routes/admin/broadcasts';
import { adminPostRoutes } from './routes/admin/posts';
import { agentAdminRoutes } from './routes/admin/agent';
import { agentTopicsRoutes } from './routes/admin/agent-topics';
import { routeUsageRoutes } from './routes/admin/route-usage';
import { userRoutes } from './routes/users';
import meRoutes from './routes/me';
import conversationPreferencesRoutes from './routes/conversation-preferences';
import communityPreferencesRoutes from './routes/community-preferences';
import conversationEncryptionRoutes from './routes/conversation-encryption';
import signalProtocolRoutes from './routes/signal-protocol';
import { translationRoutes } from './routes/translation-non-blocking';
import { translationRoutes as translationBlockingRoutes } from './routes/translation';
import { translationJobsRoutes } from './routes/translation-jobs';
import { maintenanceRoutes } from './routes/maintenance';
import affiliateRoutes from './routes/affiliate';
import { userStatsRoutes } from './routes/user-stats';
import messageRoutes from './routes/messages';
import messageReadStatusRoutes from './routes/message-read-status';
import mentionRoutes from './routes/mentions';
import { notificationRoutes } from './routes/notifications';
import { friendRequestRoutes } from './routes/friends';
import { invitationRoutes as publicInvitationRoutes } from './routes/invitations';
import { attachmentRoutes, attachmentLegacyFileRoutes } from './routes/attachments';
import reactionRoutes from './routes/reactions';
import callRoutes from './routes/calls';
import { voiceProfileRoutes } from './routes/voice-profile';
import { registerVoiceRoutes } from './routes/voice';
import { registerTusRoutes } from './routes/uploads/tus-handler';
import { voiceAnalysisRoutes } from './routes/voice-analysis';
import { getAudioTranslateService } from './services/AudioTranslateService';
import { passwordResetRoutes } from './routes/password-reset';
import { twoFactorRoutes } from './routes/two-factor';
import { magicLinkRoutes } from './routes/magic-link';
import userDeletionsRoutes from './routes/user-deletions';
import { pushTokenRoutes } from './routes/push-tokens';
import { postRoutes } from './routes/posts';
import { appRoutes } from './routes/app';
import { healthProbeRoutes } from './routes/health';

// API versioning
const API_VERSION = 'v1';
const API_PREFIX = `/api/${API_VERSION}`;

/**
 * Dépendances nécessaires à `registerAllRoutes`. Sous-ensemble des champs
 * privés de `MeeshyServer` que le corps de la fonction utilisait via `this`
 * avant l'extraction.
 */
export interface RouteRegistrationDeps {
  prisma: PrismaClient;
  translationService: MessageTranslationService;
  messagingService: MessagingService;
  mentionService: MentionService;
  orphanMediaCleanup: OrphanMediaCleanupService;
}

/**
 * Enregistre l'intégralité des routes REST du gateway sur l'instance Fastify
 * fournie. Corps identique à l'ancien `MeeshyServer.setupRoutes()`.
 */
export async function registerAllRoutes(server: FastifyInstance, deps: RouteRegistrationDeps): Promise<void> {
    logger.info('Configuring REST API routes...');

    // Health check endpoint
    server.get('/health', async (request, reply) => {
      try {
        const [userCount, translationHealthy] = await Promise.all([
          deps.prisma.user.count(),
          deps.translationService.healthCheck().catch(() => false)
        ]);

        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'development',
          version: '1.0.0',
          // Identifie le code réellement en cours d'exécution. Sans lui, savoir
          // si un correctif est en production imposait un `docker inspect` sur
          // l'hôte, ou une corrélation entre l'uptime du container et
          // l'horodatage des tags `sha-<short>` du registre.
          build: resolveBuildInfo(),
          services: {
            database: { status: 'up', userCount },
            translation: { status: translationHealthy ? 'up' : 'down' },
            websocket: { status: 'up' }
          },
          uptime: process.uptime()
        };

        reply.code(200).send(health);
      } catch (error) {
        logger.error('Health check failed:', error);
        reply.code(503).send({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Service information endpoint
    server.get('/info', async (request, reply) => {
      return {
        name: 'Meeshy Translation Gateway',
        version: '1.0.0',
        build: resolveBuildInfo(),
        environment: process.env.NODE_ENV || 'development',
        architecture: {
          frontend: 'WebSocket + REST API',
          backend: 'ZMQ + Protocol Buffers',
          database: 'PostgreSQL + Prisma'
        },
        endpoints: {
          websocket: '/socket.io/',
          health: '/health',
          translate: '/translate'
        },
        supportedLanguages: ['fr', 'en', 'es', 'de', 'pt', 'zh', 'ja', 'ar'],
        features: ['real-time translation', 'multiple language support', 'caching', 'typing indicators']
      };
    });

        // Register translation routes with the translation service
    await server.register(async (fastify) => {
      // Décorer le serveur avec le service de traduction et messaging
      fastify.decorate('translationService', deps.translationService);
      fastify.decorate('messagingService', deps.messagingService);
      fastify.decorate('mentionService', deps.mentionService);

      // Enregistrer les routes de traduction (non-blocking)
      await fastify.register(translationRoutes);

      // Enregistrer les routes de traduction (blocking)
      await fastify.register(translationBlockingRoutes);

      // Enregistrer les routes de gestion des jobs de traduction
      await fastify.register(translationJobsRoutes);
    }, { prefix: API_PREFIX });

    // Register authentication routes with /api/auth prefix
    await server.register(authRoutes, { prefix: `${API_PREFIX}/auth` });

    // Register password reset routes with /api/auth prefix
    await server.register(passwordResetRoutes, { prefix: `${API_PREFIX}/auth` });

    // Register 2FA routes with /api/auth/2fa prefix
    await server.register(twoFactorRoutes, { prefix: `${API_PREFIX}/auth/2fa` });

    // Register magic link routes with /api/auth prefix
    await server.register(magicLinkRoutes, { prefix: `${API_PREFIX}/auth` });

    // Register user deletions routes (delete for me feature)
    await server.register(userDeletionsRoutes, { prefix: '' });

    // Register conversation routes with /api prefix
    await server.register(async (fastify) => {
      await conversationRoutes(fastify);
    }, { prefix: API_PREFIX });
    // Register links management routes
    await server.register(linksRoutes, { prefix: API_PREFIX });
    // SyncEngine unifié — endpoint delta /sync (spec §7, A3)
    await server.register(syncRoutes, { prefix: API_PREFIX });

    // Register tracking links routes
    await server.register(trackingLinksRoutes, { prefix: API_PREFIX });

    // Register anonymous participation routes
    await server.register(anonymousRoutes, { prefix: API_PREFIX });

    // Register community routes
    await server.register(communityRoutes, { prefix: API_PREFIX });

    // Register admin routes - Each admin route is registered individually below with specific prefixes
    // (Removed global adminRoutes registration to avoid duplicate route declarations)

    // Register admin dashboard routes (at /api/admin/dashboard)
    await server.register(adminMePermissionsRoutes, { prefix: `${API_PREFIX}/admin` });
    await server.register(dashboardRoutes, { prefix: `${API_PREFIX}/admin` });

    // Register enhanced admin user management routes (at /api/v1/admin/users)
    await server.register(userAdminRoutes, { prefix: API_PREFIX });

    // Register admin report routes (at /api/admin/reports)
    await server.register(reportRoutes, { prefix: `${API_PREFIX}/admin/reports` });
    // Signaler un contenu est un geste ORDINAIRE (S2), pas un geste
    // d'administration : il a sa propre adresse depuis #4155. `/admin/reports`
    // reste un adaptateur mince le temps que les trois clients migrent.
    await server.register(reportCreationRoutes, { prefix: `${API_PREFIX}/reports` });

    // Register admin invitations routes (at /api/admin/invitations)
    await server.register(invitationRoutes, { prefix: `${API_PREFIX}/admin/invitations` });

    // Register admin analytics routes (at /api/admin/analytics)
    await server.register(analyticsRoutes, { prefix: `${API_PREFIX}/admin/analytics` });

    // Register admin languages routes (at /api/admin/languages)
    await server.register(languagesRoutes, { prefix: `${API_PREFIX}/admin/languages` });

    // Register admin messages routes (at /api/admin/messages/stats|trends|engagement)
    await server.register(messagesRoutes, { prefix: `${API_PREFIX}/admin/messages` });

    // Register admin content routes (messages list, communities, translations, share-links)
    await server.register(registerContentRoutes, { prefix: `${API_PREFIX}/admin` });

    // Register admin anonymous users routes (at /api/admin/anonymous-users)
    await server.register(anonymousUsersAdminRoutes, { prefix: `${API_PREFIX}/admin` });

    // Register admin rankings routes (at /api/admin/ranking)
    await server.register(systemRankingsRoutes, { prefix: `${API_PREFIX}/admin` });

    // Register admin broadcasts routes (at /api/admin/broadcasts)
    await server.register(broadcastRoutes, { prefix: `${API_PREFIX}/admin/broadcasts` });

    // Register admin post moderation routes (at /api/admin/posts)
    await server.register(adminPostRoutes, { prefix: `${API_PREFIX}/admin` });

    // Register agent admin routes (at /api/v1/admin/agent)
    await server.register(agentAdminRoutes, { prefix: `${API_PREFIX}/admin/agent` });
    await server.register(agentTopicsRoutes, { prefix: `${API_PREFIX}/admin/agent` });

    // #4275 — la lecture du compteur d'acces (S5). Elle vit avec les autres
    // routes d'administration : c'est la seule facon de lire le compte sans
    // acces SSH, et donc de prouver qu'une adresse est morte avant de la retirer.
    await server.register(routeUsageRoutes, { prefix: `${API_PREFIX}/admin` });

    // Register user routes
    await server.register(userRoutes, { prefix: API_PREFIX });

    // Register /me routes (NEW unified preferences API)
    await server.register(meRoutes, { prefix: `${API_PREFIX}/me` });

    // La résolution d'un lien de suppression vit HORS de `/me` : elle n'est
    // pas authentifiée par nature — la personne qui annule sa suppression peut
    // avoir perdu l'accès à son compte, c'est même le cas nominal (#4183).
    await server.register(accountDeletionRoutes, { prefix: `${API_PREFIX}/account/deletion` });

    // La porte PUBLIQUE de l'annuaire (S1) — pseudo seulement pour l'existence,
    // forme seulement pour l'adresse et le numéro (#4158).
    await server.register(directoryAvailabilityRoutes, { prefix: `${API_PREFIX}/directory` });
    await server.register(directoryPeopleRoutes, { prefix: `${API_PREFIX}/directory` });
    await server.register(directoryPersonRoutes, { prefix: `${API_PREFIX}/directory` });
    await server.register(directoryPresenceRoutes, { prefix: `${API_PREFIX}/directory` });
    await server.register(directoryBlocksRoutes, { prefix: `${API_PREFIX}/directory` });
    await server.register(directoryFriendRequestsRoutes, { prefix: `${API_PREFIX}/directory` });
    await server.register(directoryContactsRoutes, { prefix: `${API_PREFIX}/directory` });

    // Register push notification token routes (device registration for APNS/FCM/VoIP)
    await server.register(pushTokenRoutes, { prefix: API_PREFIX });

    // Register conversation preferences routes with /api prefix
    await server.register(conversationPreferencesRoutes, { prefix: API_PREFIX });

    // Register community preferences routes with /api prefix
    await server.register(communityPreferencesRoutes, { prefix: API_PREFIX });

    // Register conversation encryption routes with /api prefix
    // (enable + read encryption mode toggle: e2ee / server / hybrid)
    await server.register(conversationEncryptionRoutes, { prefix: API_PREFIX });

    // Register Signal Protocol routes for E2EE key generation
    await server.register(signalProtocolRoutes, { prefix: API_PREFIX });

    // Register affiliate routes
    await server.register(affiliateRoutes, { prefix: API_PREFIX });

    // Register user stats routes (GET /users/me/stats, /timeline, /achievements)
    await server.register(userStatsRoutes, { prefix: API_PREFIX });


    // Register maintenance routes with /api prefix
    await server.register(maintenanceRoutes, { prefix: API_PREFIX });

    // Register message routes with /api prefix
    await server.register(messageRoutes, { prefix: API_PREFIX });

    // Register message read status routes
    await server.register(messageReadStatusRoutes, { prefix: API_PREFIX });

    // Register mention routes with /api prefix
    await server.register(mentionRoutes, { prefix: API_PREFIX });

    // Register attachment routes with /api/v1 prefix
    await server.register(attachmentRoutes, { prefix: API_PREFIX });

    // LEGACY, et RESTREINT : sous `/api` (sans v1) seule la lecture d'octets par
    // chemin est servie — des `fileUrl` de cette forme sont persistees en base
    // depuis des annees et voyagent dans des notifications deja livrees, et une
    // URL en base ne se migre pas par un deploiement. Les neuf autres couples
    // n'ont plus de second chemin (#4187) : une regle de proxy/WAF ecrite pour
    // `/api/v1/attachments/*` ne se contourne plus en retirant « v1 ».
    await server.register(attachmentLegacyFileRoutes, { prefix: '/api' });

    // Register tus resumable upload routes (mounted at /api/v1/uploads)
    await server.register(registerTusRoutes);
    logger.info('✓ TUS resumable upload routes registered');

    // Register reaction routes with /api prefix
    await server.register(reactionRoutes, { prefix: API_PREFIX });

    // Register notification routes with /api prefix
    await server.register(notificationRoutes, { prefix: API_PREFIX });

    // Register friend request routes with /api prefix
    await server.register(friendRequestRoutes, { prefix: API_PREFIX });

    // Register invitation routes with /api prefix
    await server.register(publicInvitationRoutes, { prefix: API_PREFIX });

    // Register call routes with /api prefix (Phase 1A: P2P Video Calls MVP)
    await server.register(callRoutes, { prefix: API_PREFIX });

    // Register voice profile routes with /api/voice/profile prefix
    await server.register(voiceProfileRoutes, { prefix: `${API_PREFIX}/voice/profile` });

    // Register voice analysis routes with /api/voice-analysis prefix
    await server.register(voiceAnalysisRoutes);
    logger.info('✓ Voice Analysis routes registered');

    // Register voice API routes (transcribe, translate, analyze, etc.)
    const zmqClient = deps.translationService.getZmqClient();
    if (zmqClient) {
      const audioTranslateService = getAudioTranslateService(deps.prisma, zmqClient);
      registerVoiceRoutes(server, audioTranslateService, deps.translationService);
      logger.info('✓ Voice API routes registered');
    } else {
      logger.warn('⚠️ ZMQ client not available, voice routes not registered');
    }

    // Register post/feed routes with /api/v1 prefix.
    // Decorate the scoped instance with orphanMediaCleanup so the repost
    // path in PostService can register snapshot files in the outbox before
    // the surrounding transaction commits (Pilier 4 producer side).
    await server.register(async (instance) => {
      instance.decorate('orphanMediaCleanup', deps.orphanMediaCleanup);
      await postRoutes(instance);
    }, { prefix: API_PREFIX });
    logger.info('✓ Post/Feed routes registered');

    // Register app bootstrap routes (GET /app/min-version — porte de version cliente)
    await server.register(appRoutes, { prefix: API_PREFIX });
    logger.info('✓ App bootstrap routes registered');

    // Les trois sondes de santé (#4219). Elles ne peuvent PAS vivre sous le
    // `GET /health` ci-dessus : celui-ci compte les utilisateurs, interroge le
    // traducteur et rend la version, le SHA de build et l'environnement — c'est
    // un point de DIAGNOSTIC, pas une sonde de disponibilité. `/health/ready`
    // est S0 (un orchestrateur l'appelle sans jeton, son corps entier est
    // `{ status }`) ; `/health/metrics` et `/health/circuit-breakers` sont S5.
    await server.register(healthProbeRoutes, { prefix: `${API_PREFIX}/health` });
    logger.info('✓ Health probe routes registered');

    logger.info('✓ REST API routes configured successfully');
}

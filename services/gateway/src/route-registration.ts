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
 *
 * ## La forme du corps de cette fonction (#4278)
 *
 * Ce fichier ne PORTE plus la liste des préfixes : elle vit dans
 * `routes/index.ts`, une table `{ module, prefix, name }` dont les TROIS
 * champs sont REQUIS — voir son commentaire de module pour le détail
 * (pourquoi une table, la SEULE convention d'adressage qui survit, ce qui en
 * est délibérément absent). Ce fichier-ci se réduit à DEUX choses : les huit
 * montages qui exigent PLUS qu'un `{ module, prefix }` (décoration de
 * service, `basePath` au lieu de `prefix`, options dérivées de `deps`, ou
 * identité de manifeste à préserver — chacun commenté à son site), et une
 * boucle sur la table pour tout le reste.
 *
 * ## Pourquoi QUATRE boucles, et pas une
 *
 * `route-manifest/collect.ts` attribue à toute route captée sous un plugin
 * SANS NOM l'étiquette `anonyme`, désambiguïsée par un compteur GLOBAL et
 * PARTAGÉ (`anonyme`, `anonyme~2`, …) — partagé aussi avec des
 * enregistrements anonymes imbriqués À L'INTÉRIEUR de modules que ce
 * fichier ne voit pas (ex. les routeurs par catégorie de
 * `routes/me/preferences/index.ts`, ou les sous-routes de
 * `routes/posts/index.ts`). Ce compteur incrémente dans l'ORDRE
 * D'EXÉCUTION réel. Regrouper les 57 entrées SIMPLES en UNE seule boucle,
 * placée après les huit montages spéciaux, a été TENTÉ pendant ce lot et
 * mesuré : cela décale `anonyme~9`/`anonyme~10` et fait rougir
 * `route-manifest-ratchet` sans qu'aucune route n'ait bougé — un module
 * nommé (`meRoutes`) qui change de POSITION relative à un montage anonyme
 * peut décaler l'étiquette de ce qui s'enregistre anonymement EN SON SEIN,
 * même si `meRoutes` lui-même garde son propre nom.
 *
 * La seule façon de garder le manifeste identique est de préserver la
 * position RELATIVE de chaque groupe de routes simples face aux huit
 * montages spéciaux qui l'encadraient déjà — d'où la table coupée en QUATRE
 * segments (`routes/index.ts` : `ROUTE_TABLE_BEFORE_USER_DELETIONS`,
 * `ROUTE_TABLE_BEFORE_ATTACHMENTS`, `ROUTE_TABLE_BEFORE_VOICE_PLUGIN`,
 * `ROUTE_TABLE_AFTER_POSTS`), chacun bouclé À SA POSITION D'ORIGINE. Cette
 * découpe est une contrainte de Fastify mesurée empiriquement, pas une
 * catégorie métier — voir le commentaire de `routes/index.ts` pour le
 * détail et la preuve.
 */

import { apiBasePath } from '@meeshy/shared/api/prefix';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService } from './services/message-translation/MessageTranslationService';
import { MessagingService } from './services/MessagingService';
import { MentionService } from './services/MentionService';
import { OrphanMediaCleanupService } from './services/storage/OrphanMediaCleanupService';
import { logger } from './gateway-logger';
import { resolveBuildInfo } from '@meeshy/shared/utils/build-info';

import {
  ROUTE_TABLE_BEFORE_USER_DELETIONS,
  ROUTE_TABLE_BEFORE_ATTACHMENTS,
  ROUTE_TABLE_BEFORE_VOICE_PLUGIN,
  ROUTE_TABLE_AFTER_POSTS,
} from './routes/index';

// ── Les huit montages qui exigent PLUS qu'un { module, prefix } — voir le
//    doc-comment ci-dessus et le commentaire de chaque site plus bas.
import { conversationRoutes } from './routes/conversations';
import userDeletionsRoutes from './routes/user-deletions';
import { attachmentRoutes, attachmentLegacyFileRoutes } from './routes/attachments';
import { registerTusRoutes } from './routes/uploads/tus-handler';
import { voiceRoutesPlugin } from './routes/voice';
import { postRoutes } from './routes/posts';
import { getAudioTranslateService } from './services/AudioTranslateService';
// Namespace — même règle que `routes/index.ts` § « Les trois collisions
// d'import DISPARAISSENT » : `translationRoutes` est déclaré IDENTIQUEMENT
// dans ces deux modules, donc un alias local serait de toute façon
// nécessaire pour compiler ; le namespace évite d'avoir à en INVENTER un.
import * as TranslationNonBlocking from './routes/translation-non-blocking';
import * as TranslationBlocking from './routes/translation';
import { translationJobsRoutes } from './routes/translation-jobs';

// API versioning
// #4324 — la version d'API vient de la CONFIGURATION, jamais d'une constante :
// le déploiement peut la changer, ou porter le préfixe autrement
// (`api.domain.tld/v2/`). Site unique : `@meeshy/shared/api/prefix`.
const API_PREFIX = apiBasePath();

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

    // ═══════════════════════════════════════════════════════════════════
    // Traduction : décore le service AVANT d'enregistrer trois sous-modules
    // qui le lisent (`fastify.translationService`, etc.) — aucune des deux
    // formes de table (`{module,prefix}`) ne peut porter une décoration,
    // donc ce bloc reste explicite.
    // ═══════════════════════════════════════════════════════════════════
    await server.register(async (fastify) => {
      // Décorer le serveur avec le service de traduction et messaging
      fastify.decorate('translationService', deps.translationService);
      fastify.decorate('messagingService', deps.messagingService);
      fastify.decorate('mentionService', deps.mentionService);

      // Enregistrer les routes de traduction (non-blocking)
      await fastify.register(TranslationNonBlocking.translationRoutes);

      // Enregistrer les routes de traduction (blocking)
      await fastify.register(TranslationBlocking.translationRoutes);

      // Enregistrer les routes de gestion des jobs de traduction
      await fastify.register(translationJobsRoutes);
    }, { prefix: API_PREFIX });

    // Segment de table 1/4 — auth (4 entrées). Doit s'exécuter ICI, avant
    // userDeletionsRoutes et conversationRoutes : voir « Pourquoi QUATRE
    // boucles » en tête de fichier.
    for (const entry of ROUTE_TABLE_BEFORE_USER_DELETIONS) {
      await server.register(entry.module, { prefix: entry.prefix });
    }

    // ═══════════════════════════════════════════════════════════════════
    // userDeletionsRoutes : `basePath`, jamais `prefix` — le plugin
    // calcule ses propres chemins ABSOLUS (#4277 critère 3). Reste sous
    // `/api` et non `/api/v1` : `DELETE …/conversations/:id/delete-for-me`
    // collisionnerait avec `routes/conversations/delete-for-me.ts`, déjà
    // monté là et plus complet (transfert de propriété, clôture,
    // diffusion). Trancher laquelle survit est une décision produit, pas
    // un rangement d'adresse.
    // ═══════════════════════════════════════════════════════════════════
    await server.register(userDeletionsRoutes, { basePath: '/api' });

    // ═══════════════════════════════════════════════════════════════════
    // conversationRoutes : enveloppé dans une fonction ANONYME — pas
    // par accident. C'est cette forme que `route-manifest.json` a capturée
    // (étiquette `anonyme~2`, 39 routes) ; un appel direct au module nommé
    // changerait ce libellé et ferait rougir `route-manifest-ratchet` sans
    // qu'aucune route n'ait bougé. Voir `routes/index.ts` § « Ce qui N'EST
    // PAS dans cette table ».
    // ═══════════════════════════════════════════════════════════════════
    await server.register(async (fastify) => {
      await conversationRoutes(fastify);
    }, { prefix: API_PREFIX });

    // Segment de table 2/4 — le plus large (43 entrées) : conversations,
    // administration, utilisateur, annuaire, préférences, messages. Doit
    // s'exécuter ICI, après conversationRoutes et avant attachmentRoutes.
    for (const entry of ROUTE_TABLE_BEFORE_ATTACHMENTS) {
      await server.register(entry.module, { prefix: entry.prefix });
    }

    // ═══════════════════════════════════════════════════════════════════
    // attachments : couple à RISQUE (#4187, #4324 — le double montage
    // des pièces jointes). Sous témoin de régression DÉDIÉ qui relit ce
    // fichier VERBATIM (`attachments-unversioned-mount.test.ts`) : ces deux
    // lignes restent explicites, et leur FORME exacte ne doit pas changer
    // sans mettre ce témoin à jour dans le même geste. `attachmentRoutes`
    // sous `/api/v1` ; `attachmentLegacyFileRoutes` — LEGACY et RESTREINT à
    // la lecture d'octets par chemin — sous `/api` (sans v1), pour les
    // `fileUrl` persistées en base depuis des années et les notifications
    // déjà livrées. Il DIT désormais qu'il est en sursis (#4324) : les
    // trois en-têtes de dépréciation sont posés PAR LE MODULE lui-même
    // (`routes/attachments/index.ts`), pas ici — ce site ne fait que
    // MONTER, jamais annoncer.
    // ═══════════════════════════════════════════════════════════════════
    await server.register(attachmentRoutes, { prefix: API_PREFIX });
    await server.register(attachmentLegacyFileRoutes, { prefix: '/api' });

    // ═══════════════════════════════════════════════════════════════════
    // tus : `basePath`, jamais `prefix` — le serveur TUS calcule le
    // `Location` qu'il renvoie au client à partir de cette même chaîne
    // (#4277 critère 2 : le module ne connaît plus `/api/v1` en dur).
    // ═══════════════════════════════════════════════════════════════════
    await server.register(registerTusRoutes, { basePath: `${API_PREFIX}/uploads` });
    logger.info('✓ TUS resumable upload routes registered');

    // Segment de table 3/4 — réactions, notifications, demandes d'ami,
    // invitations publiques, appels, voix (8 entrées). Doit s'exécuter ICI,
    // après le couple attachments/tus et avant voiceRoutesPlugin.
    for (const entry of ROUTE_TABLE_BEFORE_VOICE_PLUGIN) {
      await server.register(entry.module, { prefix: entry.prefix });
    }

    // ═══════════════════════════════════════════════════════════════════
    // voice : ses options (`audioTranslateService`) se calculent À
    // L'ENREGISTREMENT depuis la disponibilité du client ZMQ — une donnée
    // de `deps`, jamais une constante que la table pourrait porter. La
    // route reste TOUJOURS enregistrée (#4277 critère 4) : sans client ZMQ,
    // elle sert un 503 explicite depuis l'intérieur du plugin plutôt que de
    // disparaître en silence.
    // ═══════════════════════════════════════════════════════════════════
    const zmqClient = deps.translationService.getZmqClient();
    const audioTranslateService = zmqClient ? getAudioTranslateService(deps.prisma, zmqClient) : null;
    if (!zmqClient) {
      logger.warn('⚠️ ZMQ client not available — /api/v1/voice/* will respond 503');
    }
    await server.register(voiceRoutesPlugin, {
      prefix: `${API_PREFIX}/voice`,
      audioTranslateService,
      translationService: deps.translationService,
    });
    logger.info(`✓ Voice API routes registered (ZMQ ${zmqClient ? 'connected' : 'unavailable — 503 stub'})`);

    // ═══════════════════════════════════════════════════════════════════
    // posts : décore l'instance encapsulée avec `orphanMediaCleanup` AVANT
    // d'enregistrer, pour que le chemin de republication (`PostService`)
    // puisse inscrire ses fichiers de snapshot dans l'outbox avant que la
    // transaction englobante ne commit (Pilier 4, côté producteur). Même
    // raison qu'au montage de `conversationRoutes` pour la forme anonyme :
    // `route-manifest.json` porte son étiquette `anonyme~10` (52 routes).
    // ═══════════════════════════════════════════════════════════════════
    await server.register(async (instance) => {
      instance.decorate('orphanMediaCleanup', deps.orphanMediaCleanup);
      await postRoutes(instance);
    }, { prefix: API_PREFIX });
    logger.info('✓ Post/Feed routes registered');

    // Segment de table 4/4 — amorçage applicatif, diagnostics (2 entrées).
    // Doit s'exécuter ICI, après postRoutes : c'est la queue de
    // `registerAllRoutes`, comme avant ce lot.
    for (const entry of ROUTE_TABLE_AFTER_POSTS) {
      await server.register(entry.module, { prefix: entry.prefix });
    }

    logger.info('✓ REST API routes configured successfully');
}

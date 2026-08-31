/**
 * Meeshy Fastify Gateway Server
 *
 * A clean, professional WebSocket + REST API gateway for translation services
 * Architecture: Frontend (WebSocket/REST) ↔ Gateway (Fastify) ↔ Translation Service (ZMQ)
 *
 * @version 1.0.0
 * @author Meeshy Team
 */

// Load environment configuration first
import './env';

import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible'; // Ajout pour httpErrors
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '@meeshy/shared/prisma/client';
// Extrait dans `./gateway-logger` pour que `route-registration.ts` puisse
// logger sans importer `server.ts` (effets de bord au chargement du module —
// voir le commentaire en tête de `route-registration.ts`).
import { logger } from './gateway-logger';
import { schemaValidationErrorResponse } from './utils/schema-validation-error';
import * as fs from 'fs';
import * as path from 'path';
import { MessageTranslationService } from './services/message-translation/MessageTranslationService';
import { MessagingService } from './services/MessagingService';
import { MentionService } from './services/MentionService';
import { StatusService } from './services/StatusService';
import { AuthMiddleware, createUnifiedAuthMiddleware } from './middleware/auth';
import { registerGlobalRateLimiter } from './middleware/rate-limiter';
import { registerClientMutationIdHook } from './middleware/clientMutationId';
import { registerRouteUsageHook } from './plugins/route-usage.plugin';
import { createDeviceLocaleMiddleware } from './middleware/deviceLocale';
import { createDeviceCountryMiddleware } from './middleware/deviceCountry';
import { requestIdPlugin } from './middleware/request-id';
import { CORS_METHODS } from './config/cors-methods';
import { fastifyCorsOrigin } from './config/cors-origins';
import { conditionalGetOnSend } from './utils/etag';
import { resolveTrustProxy } from './config/trust-proxy';
import { MutationLogService } from './services/MutationLogService';
// L'enregistrement des routes REST (~50 fichiers) vit dans `./route-registration`,
// un module SANS effet de bord au chargement (voir le commentaire en tête de
// ce fichier) — nécessaire pour que le test de garde des routes puisse
// l'importer sans déclencher `meeshyServer.start()`.
import { registerAllRoutes } from './route-registration';
import { canonicaliserCheminsOpenApi } from './utils/openapi-canonical-paths';
import { InitService } from './services/InitService';
import { MeeshySocketIOHandler } from './socketio/MeeshySocketIOHandler';
import { CallCleanupService } from './services/CallCleanupService';
import { shutdownEncryptionService } from './services/EncryptionService';
import { MultiLevelJobMappingCache } from './services/MultiLevelJobMappingCache';
import { getCacheStore } from './services/CacheStore';
import { BackgroundJobsManager } from './jobs';
import { backfillSearchTokens } from './jobs/backfill-search-tokens';
import { demarrerSondeDeTypage, type SondeDeTypage } from './services/schema-drift.service';
import { EmailService } from './services/EmailService';
import { RedisDeliveryQueue } from './services/RedisDeliveryQueue';
import { TusCleanupService } from './services/TusCleanupService';
import { ExpiredMessagesCleanupService } from './services/ExpiredMessagesCleanupService';
import { ExpiredStoriesCleanupService } from './services/ExpiredStoriesCleanupService';
import { OrphanMediaCleanupService } from './services/storage/OrphanMediaCleanupService';
import { MediaService } from './services/MediaService';
import { ZmqAgentClient } from './services/zmq-agent/ZmqAgentClient';
import { typedErrorResponse } from './errors/custom-errors';

// ============================================================================
// CONFIGURATION & ENVIRONMENT
// ============================================================================

interface Config {
  isDev: boolean;
  jwtSecret: string;
  port: number;
  databaseUrl: string;
  nodeEnv: string;
}

function loadConfiguration(): Config {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isDev = nodeEnv === 'development';
  const dbUrl = process.env.DATABASE_URL || '';
  return {
    nodeEnv,
    isDev,
    jwtSecret: process.env.JWT_SECRET || 'meeshy-secret-key-dev',
    port: parseInt(process.env.PORT || process.env.GATEWAY_PORT || '3000'),
    databaseUrl: process.env.DATABASE_URL || ''
  };
}

const config = loadConfiguration();

// ============================================================================
// LOGGER SETUP (voir `./gateway-logger`)
// ============================================================================

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface WebSocketMessage {
  type: 'translate' | 'translate_multi' | 'typing' | 'stop_typing' | 'new_message' | 'join_conversation' | 'leave_conversation' | 'user_typing';
  messageId?: string;
  text?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  targetLanguages?: string[];
  conversationId?: string;
  userId?: string;
  data?: any; // Pour les données spécifiques au type de message
}

interface WebSocketResponse {
  type: 'translation' | 'translation_multi' | 'error' | 'typing' | 'stop_typing' | 'message_sent' | 'conversation_joined' | 'conversation_left';
  messageId?: string;
  originalText?: string;
  translatedText?: string;
  translations?: Array<{
    language: string;
    text: string;
    confidence: number;
  }>;
  sourceLanguage?: string;
  targetLanguage?: string;
  confidence?: number;
  fromCache?: boolean;
  modelUsed?: string;
  conversationId?: string;
  userId?: string;
  error?: string;
  data?: any; // Pour les données spécifiques au type de réponse
  timestamp: string;
}

interface WebSocketConnection {
  send: (data: string) => void;
}

interface TranslationRequest {
  text: string;
  source_language: string;
  target_language: string;
}

// Fastify type extensions
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    translationService: MessageTranslationService;
    socketIOHandler: MeeshySocketIOHandler;
    jobMappingCache: MultiLevelJobMappingCache;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// ============================================================================
// SERVICES INITIALIZATION
// ============================================================================

class MeeshyServer {
  private server: FastifyInstance;
  private prisma: PrismaClient;
  private translationService: MessageTranslationService;
  private messagingService: MessagingService;
  private mentionService: MentionService;
  private statusService: StatusService;
  private authMiddleware: AuthMiddleware;
  private socketIOHandler: MeeshySocketIOHandler;
  private callCleanupService: CallCleanupService;
  private backgroundJobs: BackgroundJobsManager;
  private jobMappingCache: MultiLevelJobMappingCache;
  private tusCleanup: TusCleanupService;
  private expiredStoriesCleanup: ExpiredStoriesCleanupService;
  private expiredMessagesCleanup: ExpiredMessagesCleanupService;
  private orphanMediaCleanup: OrphanMediaCleanupService;
  private deliveryQueue: RedisDeliveryQueue;
  private agentClient: ZmqAgentClient | null = null;

  /** Sonde de dérive de typage (#4243) — démarrée avec les crons, arrêtée avec eux. */
  private sondeDeTypage: SondeDeTypage | null = null;

  constructor() {
    // Check if HTTPS mode is enabled
    const useHttps = process.env.USE_HTTPS === 'true';

    if (useHttps) {
      // HTTPS mode - load SSL certificates
      const certPath = path.join(__dirname, '..', '..', '..', 'apps', 'web', '.cert');
      const keyPath = path.join(certPath, 'localhost-key.pem');
      const certFilePath = path.join(certPath, 'localhost.pem');

      if (!fs.existsSync(keyPath) || !fs.existsSync(certFilePath)) {
        logger.error('❌ SSL certificates not found for HTTPS mode!');
        logger.error(`   Expected certificates at: ${certPath}`);
        logger.error('   The frontend certificates will be used for the gateway.');
        logger.error('   Ensure apps/web/.cert/ contains the certificates.');
        process.exit(1);
      }

      this.server = fastify({
        logger: false, // We use Winston instead
        disableRequestLogging: !config.isDev,
        bodyLimit: 50 * 1024 * 1024, // 50MB pour les fichiers audio volumineux
        // Sans cette option, `request.ip` est l'adresse du conteneur Traefik —
        // la MÊME pour tous les appelants — et toute limitation « par IP » se
        // réduit à un seau unique pour la plateforme (#4137). Cf.
        // `config/trust-proxy.ts` pour la raison du nombre plutôt que `true`.
        trustProxy: resolveTrustProxy(),
        https: {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certFilePath),
        },
        ajv: {
          customOptions: {
            strict: 'log' as const, // Allow unknown keywords like 'example' (for OpenAPI documentation)
            keywords: ['example'] // Explicitly allow 'example' keyword
          }
        }
      }) as FastifyInstance;

      logger.info('🔒 Gateway starting in HTTPS mode');
    } else {
      // HTTP mode (default)
      this.server = fastify({
        logger: false, // We use Winston instead
        disableRequestLogging: !config.isDev,
        bodyLimit: 50 * 1024 * 1024, // 50MB pour les fichiers audio volumineux
        // Mode NOMINAL en production : le gateway est derrière Traefik. Voir
        // le commentaire de la branche HTTPS ci-dessus et #4137.
        trustProxy: resolveTrustProxy(),
        ajv: {
          customOptions: {
            strict: 'log' as const, // Allow unknown keywords like 'example' (for OpenAPI documentation)
            keywords: ['example'] // Explicitly allow 'example' keyword
          }
        }
      }) as FastifyInstance;

      logger.info('🌐 Gateway starting in HTTP mode');
    }

    const stripDataUri = (v: string | null | undefined) => (v?.startsWith('data:') ? null : v ?? null);
    this.prisma = new PrismaClient({
      log: ['warn', 'error'],
    }).$extends({
      result: {
        user: {
          avatar: { needs: { avatar: true }, compute: (u) => stripDataUri(u.avatar) },
          banner: { needs: { banner: true }, compute: (u) => stripDataUri(u.banner) },
        },
        conversation: {
          avatar: { needs: { avatar: true }, compute: (c) => stripDataUri(c.avatar) },
        },
      },
    }) as unknown as PrismaClient;

    // NOUVEAU: Initialiser le StatusService en premier (requis par AuthMiddleware)
    this.statusService = new StatusService(this.prisma);

    // Initialiser le middleware d'authentification unifié avec StatusService
    this.authMiddleware = new AuthMiddleware(this.prisma, this.statusService);

    // Initialiser le cache multi-niveau partagé pour les mappings de jobs (avant MessageTranslationService)
    this.jobMappingCache = new MultiLevelJobMappingCache(getCacheStore());

    // Initialiser le service de traduction avec le cache partagé
    this.translationService = new MessageTranslationService(this.prisma, this.jobMappingCache);

    // Initialiser le service de messaging
    this.messagingService = new MessagingService(this.prisma, this.translationService);

    // Initialiser le service de mentions
    this.mentionService = new MentionService(this.prisma);

    // Initialiser le handler Socket.IO avec l'instance de translationService qui reçoit les événements ZMQ
    this.socketIOHandler = new MeeshySocketIOHandler(
      this.prisma,
      config.jwtSecret,
      this.translationService // ← Instance initialisée qui reçoit les événements ZMQ
    );

    // Initialiser le service de nettoyage automatique des appels
    this.callCleanupService = new CallCleanupService(this.prisma);

    // Initialiser la delivery queue Redis
    this.deliveryQueue = new RedisDeliveryQueue(getCacheStore());

    // Initialiser les background jobs (cleanup, digest, etc.)
    const emailService = new EmailService();
    this.backgroundJobs = new BackgroundJobsManager(this.prisma, emailService, this.deliveryQueue);

    // Rattrapage des jetons de recherche (#4159), en arrière-plan : une route
    // de recherche adossée à un index vide ne trouve personne, et le
    // rattrapage doit donc précéder l'usage. Il n'est PAS derrière une garde de
    // premier boot — le dépôt a déjà payé ce piège avec `ensurePostGeoIndex`,
    // restée sous `shouldInitialize()` et jamais exécutée en production.
    void backfillSearchTokens(this.prisma).catch((error: unknown) =>
      // Message EXPLICITE, avec sa conséquence : un `error` opaque a laissé ce
      // rattrapage échouer en silence au premier déploiement — la colonne est
      // restée vide sur les 222 comptes, et la recherche ne trouvait personne.
      // Un journal qui ne dit pas ce qui est cassé ne signale rien.
      logger.error(
        '[BackfillSearchTokens] rattrapage INTERROMPU — la recherche de personnes ne trouvera personne tant que la colonne `searchTokens` est vide',
        { error: error instanceof Error ? { name: error.name, message: error.message } : error }
      )
    );

    // Initialiser le service de nettoyage des uploads tus incomplets
    this.tusCleanup = new TusCleanupService();

    // Cron de purge des stories expirees (soft-delete passe le `expiresAt`,
    // hard-delete au-dela de la fenetre de retention).
    this.expiredStoriesCleanup = new ExpiredStoriesCleanupService(this.prisma);

    // Cron de destruction des messages autodestructibles echus. Sans lui,
    // `expiresAt` n'existait que dans l'UI des clients : le clair restait servi
    // par les lectures indefiniment apres l'echeance.
    // `resolveManager` est PARESSEUX : le manager Socket.IO n'existe pas encore
    // a cet instant (il est cree par `socketIOHandler.initialize()`), et une
    // capture ici retiendrait `null` pour toujours.
    this.expiredMessagesCleanup = new ExpiredMessagesCleanupService(this.prisma, {
      resolveManager: () => this.socketIOHandler.getManager(),
    });
    // SOTA audit Pilier 4 — outbox-based ghost media file cleanup. Reaps
    // any orphaned files left behind by partial uploads or crashed
    // transactions (e.g. story repost media snapshots that never made it
    // to the final Post.media row).
    this.orphanMediaCleanup = new OrphanMediaCleanupService(this.prisma, new MediaService());

    // Expose emailService for use in routes (friend requests, etc.)
    this.server.decorate('emailService', emailService);
  }

  // --------------------------------------------------------------------------
  // MIDDLEWARE SETUP
  // --------------------------------------------------------------------------

  private async setupMiddleware(): Promise<void> {
    logger.info('Setting up middleware...');

    // Distributed tracing: attaches X-Request-ID to every request/response.
    // Registered first so all subsequent plugins and hooks see request.id.
    await this.server.register(requestIdPlugin);

    // Register sensible plugin for httpErrors
    await this.server.register(sensible);

    // Bandwidth sprint Phase D6 — app-wide conditional GET (ETag/304).
    // The ETag is computed over the logical (uncompressed) body — Traefik
    // compresses downstream — and an unchanged GET short-circuits to a
    // body-less 304. Generalizes the per-route `sendWithETag` to every
    // eligible read without touching handlers; routes that already set an
    // ETag or `max-age` are left untouched.
    this.server.addHook('onSend', conditionalGetOnSend);

    // HTTP response compression is handled by Traefik (`compress@file`
    // middleware, infrastructure/docker/compose/config/dynamic.yaml), NOT by
    // @fastify/compress. Incident 2026-06-11: the global @fastify/compress
    // onSend hook replaces the payload with a stream; every `async (req,
    // reply) => { sendSuccess(reply, …) }` handler then resolves `undefined`
    // while that stream is still in flight, Fastify issues a second
    // `reply.send(undefined)` and the client receives `content-encoding` with
    // an EMPTY body (plus ERR_HTTP_HEADERS_SENT unhandled rejections). Do not
    // re-register a payload-stream-replacing onSend hook unless every handler
    // returns `reply`. Route-level `compress: false` markers were kept as
    // documentation on media/Range routes.

    // Register multipart plugin for file uploads
    await this.server.register(multipart, {
      limits: {
        fileSize: 4294967296, // 4GB max file size
        files: 30, // Max 30 files per request
      },
    });

    // Security headers
    await this.server.register(helmet, {
      contentSecurityPolicy: config.isDev ? false : {
        directives: {
          // Permet l'affichage des PDFs dans des iframes depuis meeshy.me
          'frame-ancestors': ["'self'", 'https://meeshy.me', 'https://www.meeshy.me'],
          'default-src': ["'self'"],
          'base-uri': ["'self'"],
          'font-src': ["'self'", 'https:', 'data:'],
          'form-action': ["'self'"],
          'frame-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'https:'],
          'object-src': ["'none'"],
          'script-src': ["'self'"],
          'script-src-attr': ["'none'"],
          'style-src': ["'self'", 'https:', "'unsafe-inline'"],
          'upgrade-insecure-requests': []
        }
      }
    });

    // CORS — la règle vit dans `config/cors-origins` (#4480), pas ici : la porte
    // WebSocket applique la MÊME, et deux littéraux jumeaux avaient divergé.
    await this.server.register(cors, {
      origin: fastifyCorsOrigin({
        onRejected: (origin) => logger.warn(`CORS rejected origin: "${origin}"`)
      }),
      credentials: true,
      methods: CORS_METHODS
    });

    // OpenAPI/Swagger documentation
    await this.server.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: 'Meeshy API',
          description: `
Meeshy Gateway API - Real-time multilingual messaging platform.

## Authentication
All endpoints require JWT authentication via Bearer token, unless otherwise specified.

## Rate Limits
- Global: 300 requests/minute per IP
- Messages: 20 messages/minute per user
- Authentication: 5 attempts/15 minutes

## API Versioning
All endpoints are prefixed with \`/api/v1\`. Breaking changes will be introduced in new versions.
          `,
          version: '1.0.0',
          contact: {
            name: 'Meeshy API Support',
            email: 'support@meeshy.me',
            url: 'https://meeshy.me'
          },
          license: {
            name: 'Proprietary',
            url: 'https://meeshy.me/terms'
          }
        },
        servers: [
          { url: 'https://gate.meeshy.me', description: 'Production' },
          { url: 'http://localhost:3000', description: 'Development' }
        ],
        tags: [
          { name: 'auth', description: 'Authentication and registration' },
          { name: 'users', description: 'User management' },
          { name: 'preferences', description: 'User preferences (key-value settings)' },
          { name: 'conversations', description: 'Conversation management' },
          { name: 'messages', description: 'Message operations' },
          { name: 'notifications', description: 'Notification management' },
          { name: 'calls', description: 'Video/voice calls' },
          { name: 'communities', description: 'Community management' },
          { name: 'friends', description: 'Friend requests and contacts' },
          { name: 'attachments', description: 'File uploads and downloads' },
          { name: 'translation', description: 'Translation services' },
          { name: 'categories', description: 'Conversation categories management' },
          { name: 'admin', description: 'Admin operations' },
          { name: 'admin-agent', description: 'Agent AI admin — configs, roles, archetypes, LLM, resets' }
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'JWT token obtained from /api/v1/auth/login'
            },
            sessionToken: {
              type: 'apiKey',
              in: 'header',
              name: 'X-Session-Token',
              description: 'Session token for anonymous users'
            }
          }
        },
        security: [{ bearerAuth: [] }]
      }
    });

    await this.server.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        syntaxHighlight: {
          activate: true,
          theme: 'monokai'
        }
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
      // #4372 — l'OpenAPI publié écrit ses chemins comme les deux AUTRES
      // descriptions de la même API : sans barre finale. `@fastify/swagger`
      // émet la forme DÉCLARÉE, si bien qu'un module monté au préfixe
      // `/api/v1/me` déclarant sa route en `'/'` publiait `/api/v1/me/` —
      // quinze chemins dans ce cas, quand le manifeste (430) et le catalogue
      // client (416) n'en portent aucun. Le serveur sert les deux formes, donc
      // rien ne cassait ; mais toute comparaison entre l'OpenAPI et l'une des
      // deux autres sources rendait quinze faux négatifs.
      //
      // Ici, et pas dans les huit modules concernés : déclarer `''` au lieu de
      // `'/'` chez chacun marcherait, et laisserait le neuvième arriver. C'est
      // le seul point par lequel la spec atteint un consommateur — vérifié,
      // `fastify.swagger()` n'est appelée nulle part ailleurs.
      transformSpecification: (swaggerObject) => {
        const { spec, collisions } = canonicaliserCheminsOpenApi(swaggerObject as never);
        if (collisions.length > 0) {
          // Une collision n'est pas résolue en silence : la forme canonique
          // l'emporte, mais on DIT ce qui n'a pas pu être fusionné.
          logger.warn('OpenAPI : verbes en collision après canonisation des chemins', { collisions });
        }
        return spec as never;
      },
      transformSpecificationClone: true
    });

    logger.info('✅ Swagger UI configured at /docs');

    // JWT authentication
    await this.server.register(jwt, {
      secret: config.jwtSecret
    });

    // SÉCURITÉ P1.1: Rate limiting global (300 requêtes/min par IP)
    await registerGlobalRateLimiter(this.server);
    logger.info('✅ Global rate limiter configured (300 req/min per IP)');

    // Wave 1 Task 3.5 — clientMutationId middleware (cmid validation +
    // request decoration). MUST be registered before any route reads
    // `request.clientMutationId`.
    registerClientMutationIdHook(this.server);
    logger.info('✅ clientMutationId hook registered');

    // Plan B — Device locale 4e priorité Prisme Linguistique.
    // Registered as `preHandler` (not `onRequest`) because the auth layer
    // attaches `request.user` via per-route `preValidation` which fires
    // after `onRequest`. By the time `preHandler` runs, authenticated
    // routes already carry `request.user`; public routes simply no-op.
    this.server.addHook('preHandler', createDeviceLocaleMiddleware(this.prisma));
    logger.info('✅ deviceLocale hook registered (X-Device-Locale → User.deviceLocale)');

    // Guideline 5 (MIIT) CallKit-in-China compliance — continuous device
    // country signal (registrationCountry is only captured once at signup).
    // CallEventsHandler reads User.deviceCountry to route incoming-call
    // pushes away from the PushKit/CallKit 'voip' token type in China.
    this.server.addHook('preHandler', createDeviceCountryMiddleware(this.prisma));
    logger.info('✅ deviceCountry hook registered (X-Meeshy-Country → User.deviceCountry)');

    // Wave 1 Task 3.4 — expose MutationLogService on fastify so routes
    // can wrap their writes in `recordOrReturn(...)` for idempotency.
    const mutationLogService = new MutationLogService(this.prisma);
    this.server.decorate('mutationLogService', mutationLogService);
    logger.info('✅ MutationLogService registered');

    // Client identification logging — enrichit le logger Pino avec version/device/geo client
    this.server.addHook('onRequest', (request, _reply, done) => {
      const get = (key: string): string | undefined => {
        const val = request.headers[key];
        return typeof val === 'string' ? val : undefined;
      };
      const clientContext = {
        appVersion : get('x-meeshy-version'),
        appBuild   : get('x-meeshy-build'),
        platform   : get('x-meeshy-platform'),
        device     : get('x-meeshy-device'),
        osVersion  : get('x-meeshy-os'),
        locale     : get('x-meeshy-locale'),
        timezone   : get('x-meeshy-timezone'),
        country    : get('x-meeshy-country'),
        city       : get('x-meeshy-city'),
        region     : get('x-meeshy-region'),
      };
      const client = Object.fromEntries(
        Object.entries(clientContext).filter(([, v]) => v !== undefined)
      );
      if (Object.keys(client).length > 0) {
        // FastifyRequest.log is readonly in TS types but mutable at runtime
        (request as unknown as { log: FastifyRequest['log'] }).log = request.log.child({ client });
      }
      done();
    });
    logger.info('✅ Client identification hook registered');

    // Request timing — log slow requests (>2s) as warnings
    this.server.addHook('onRequest', (request, _reply, done) => {
      request.__startTime = performance.now();
      done();
    });
    this.server.addHook('onResponse', (request, reply, done) => {
      const start = request.__startTime;
      if (start) {
        const durationMs = Math.round(performance.now() - start);
        const level = durationMs > 5000 ? 'warn' : durationMs > 2000 ? 'info' : 'debug';
        if (level !== 'debug') {
          logger[level](`⏱️ ${request.method} ${request.url} → ${reply.statusCode} (${durationMs}ms)`, {
            module: 'RequestTiming',
            durationMs,
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode
          });
        }
      }
      done();
    });
    logger.info('✅ Request timing hook registered');

    // Compteur d'acces par route et par version cliente (#4275). Quatre issues
    // — #4178, #4181, #4182, #4184 — font d'un compteur a ZERO le critere de
    // retrait d'une adresse depreciee et INTERDISENT de le prouver par revue de
    // code client : sans cette ligne, elles restent inatteignables par
    // construction.
    //
    // Deux contraintes de POSE, et non une seule. Appel DIRECT sur la racine,
    // jamais `register` : un hook pose dans un contexte encapsule ne verrait
    // aucune des routes de production, et le compteur rendrait un tapis de
    // zeros credible. Et arme sur `onResponse`, ou le routage est DEJA resolu :
    // c'est ce qui fait rendre a `routeOptions.url` le GABARIT, jamais l'URL
    // concrete — sans quoi un identifiant d'utilisateur entrerait dans la cle
    // d'agregat au premier appel d'une route parametree.
    //
    // Cout mesure : 0,32 a 0,65 us par requete, aucune E/S, aucune promesse.
    registerRouteUsageHook(this.server);
    logger.info('✅ Route usage counter hook registered');

    // Socket.IO will be configured after server initialization
    // No need to register a plugin as Socket.IO attaches directly to the HTTP server

    // Global error handler
    this.server.setErrorHandler(async (error, request, reply) => {
      logger.error('Uncaught error in request handler', {
        module: 'ErrorHandler',
        func: 'setErrorHandler',
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error,
        path: request.url,
        method: request.method
      });
      // TypeScript may treat catch variables as 'unknown' (useUnknownInCatchVariables).
      // Cast to `any` once to safely access error properties below.
      const err: any = error as any;

      // Refus de SCHÉMA (Ajv, avant le handler) : Fastify le marque par
      // `err.validation`. Sans cette branche il tombait dans le repli
      // générique et ressortait en « Internal Server Error / An unexpected
      // error occurred » sous un code 400 — le client apprenait qu'il avait
      // tort, jamais sur quoi. C'est ce qui rendait illisible le refus de
      // `POST /auth/register` le 2026-08-18.
      //
      // Elle passe AVANT la branche typée : un refus d'Ajv n'est pas une
      // `BaseAppError`, mais il porte `statusCode: 400` et serait donc happé
      // par tout repli qui lit ce champ.
      const schemaRefusal = schemaValidationErrorResponse(error);
      if (schemaRefusal) {
        return reply.code(schemaRefusal.statusCode).send({
          ...schemaRefusal,
          timestamp: new Date().toISOString()
        });
      }

      // TOUTE la hiérarchie typée, en UNE branche (#4212).
      //
      // Trois sous-classes sur dix-neuf avaient la leur ; les seize autres
      // tombaient dans le repli générique. Celui-ci lit bien `err.statusCode`
      // — le CODE était donc juste — mais il REMPLACE le message par « An
      // unexpected error occurred » et jette tout champ propre à la classe.
      //
      // Un compte verrouillé recevait ainsi `423` avec « Internal Server
      // Error » et SANS `lockedUntil` : la personne apprenait qu'on la
      // refusait, jamais quand elle pourrait revenir (#4138).
      //
      // > Un handler qui rend le bon CODE et le mauvais CORPS est plus
      // > trompeur qu'un handler qui échoue franchement : le code juste fait
      // > croire que la couche a compris l'erreur.
      //
      // La DÉCISION vit dans `typedErrorResponse`, une fonction pure : ce
      // handler-ci ne peut s'exercer qu'en montant un serveur, et le critère
      // demande un témoin par sous-classe.
      const typed = typedErrorResponse(error);
      if (typed) {
        return reply.code(typed.statusCode).send({
          ...typed,
          timestamp: new Date().toISOString()
        });
      }

      // Gestion des erreurs de limite de fichiers multipart
      if (err && err.code === 'FST_FILES_LIMIT') {
        return reply.code(413).send({
          error: 'Too Many Files',
          message: `You can only upload a maximum of 30 files at once. Please reduce the number of files.`,
          details: {
            maxFiles: 30,
            limit: 'Files limit reached'
          },
          statusCode: 413,
          timestamp: new Date().toISOString()
        });
      }

      // Gestion des erreurs de taille de fichier
      if (err && err.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({
          error: 'File Too Large',
          message: `File size exceeds the allowed limit of 4 GB. Please reduce the file size.`,
          details: {
            maxFileSize: '4 GB',
            limit: 'File size exceeded'
          },
          statusCode: 413,
          timestamp: new Date().toISOString()
        });
      }

      // Gestion des erreurs de limite de parties (parts) multipart
      if (err && err.code === 'FST_PARTS_LIMIT') {
        return reply.code(413).send({
          error: 'Too Many Parts',
          message: `Too many parts in the multipart request. Please reduce the number of elements.`,
          statusCode: 413,
          timestamp: new Date().toISOString()
        });
      }

      // Default error handling
      const statusCode = (err && err.statusCode) || 500;
      return reply.code(statusCode).send({
        error: 'Internal Server Error',
        message: config.isDev ? (err && err.message) : 'An unexpected error occurred',
        statusCode,
        timestamp: new Date().toISOString(),
        ...(config.isDev && { stack: err && err.stack })
      });
    });

    // Decorators for dependency injection
    this.server.decorate('prisma', this.prisma);
    this.server.decorate('redis', getCacheStore().getNativeClient());
    this.server.decorate('translationService', this.translationService);
    this.server.decorate('mentionService', this.mentionService);
    this.server.decorate('socketIOHandler', this.socketIOHandler);
    this.server.decorate('jobMappingCache', this.jobMappingCache);
    this.server.decorate('authenticate', this.createAuthMiddleware());

    logger.info('✓ Middleware configured successfully');
  }

  private createAuthMiddleware() {
    return createUnifiedAuthMiddleware(this.prisma, {
      requireAuth: true,
      allowAnonymous: false,
      statusService: this.statusService // NOUVEAU: Injecter StatusService
    });
  }

  // --------------------------------------------------------------------------
  // SOCKET.IO SETUP
  // --------------------------------------------------------------------------

  private async setupSocketIO(): Promise<void> {
    logger.info('Configuring Socket.IO...');

    try {
      // Socket.IO sera configuré directement avec le serveur HTTP
      await this.socketIOHandler.setupSocketIO(this.server);
      logger.info('[GWY] ✅ Socket.IO configured with MeeshySocketIOHandler');

      // Expose NotificationService from SocketIOManager for use in routes
      const manager = this.socketIOHandler.getManager();
      if (manager) {
        manager.setDeliveryQueue(this.deliveryQueue);
        logger.info('[GWY] ✅ RedisDeliveryQueue injected into SocketIOManager');

        // Share the Socket.IO layer's CallService with REST call routes so
        // both observe the same in-memory ringingTimeouts/heartbeats maps
        // (previously routes/calls.ts constructed its own, disconnected
        // instance — a call initiated via REST never had its ringing timeout
        // registered on the instance CallCleanupService/CallEventsHandler read).
        this.server.decorate('callService', manager.getCallService());
        logger.info('[GWY] ✅ CallService shared with REST routes');

        const notificationService = manager.getNotificationService();
        this.server.decorate('notificationService', notificationService);
        logger.info('[GWY] ✅ NotificationService exposed for routes');

        const socialEventsHandler = manager.getSocialEventsHandler();
        this.server.decorate('socialEvents', socialEventsHandler);
        logger.info('[GWY] ✅ SocialEventsHandler exposed for routes');

        // Câbler le callback de broadcast sur le StatusService REST
        // Permet aux requêtes REST de marquer un utilisateur en ligne et broadcaster
        this.statusService.setPresenceCallback(manager.getPresenceBroadcastCallback());
        logger.info('[GWY] ✅ StatusService presence callback wired to SocketIO broadcast');

        // Exposer la source de vérité runtime de présence aux routes REST.
        // Utilisé par GET /conversations pour overrider isOnline (potentiellement
        // obsolète en DB) et par GET /users/presence pour le snapshot à la demande.
        this.server.decorate('presenceChecker', {
          isOnline: (id: string) => manager.isPresenceOnline(id),
          bulk: (ids: readonly string[]) => manager.getPresenceForIds(ids),
          listOnlineAmong: (ids: readonly string[]) => manager.listOnlineAmong(ids)
        });
        logger.info('[GWY] ✅ Presence runtime checker exposed for REST routes');
      }
    } catch (error) {
      logger.error('[GWY] ❌ Failed to setup Socket.IO:', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  private sendWebSocketMessage(connection: WebSocketConnection, message: WebSocketResponse): void {
    try {
      connection.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Failed to send WebSocket message:', error);
    }
  }

  private sendWebSocketError(connection: WebSocketConnection, messageId: string | undefined, error: string): void {
    const response: WebSocketResponse = {
      type: 'error',
      messageId,
      error,
      timestamp: new Date().toISOString()
    };
    this.sendWebSocketMessage(connection, response);
  }

  // --------------------------------------------------------------------------
  // REST API ROUTES
  // --------------------------------------------------------------------------

  private async setupRoutes(): Promise<void> {
    // Corps déplacé dans `registerAllRoutes` (module-level, exportée) pour que
    // le test de garde des routes (`__tests__/security/route-auth-coverage.test.ts`)
    // puisse assembler le même graphe de routes sans instancier tout MeeshyServer.
    await registerAllRoutes(this.server, {
      prisma: this.prisma,
      translationService: this.translationService,
      messagingService: this.messagingService,
      mentionService: this.mentionService,
      orphanMediaCleanup: this.orphanMediaCleanup,
    });
  }

  // --------------------------------------------------------------------------
  // SERVER LIFECYCLE
  // --------------------------------------------------------------------------

  private async initializeServices(): Promise<void> {
    logger.info('Initializing external services...');

    // Test database connection
    try {
      logger.info('🔍 Testing database connection...');
      // Test connection with a simple query instead
      await this.prisma.user.findFirst();
      logger.info(`✓ Database connected successfully`);

      // Initialize database with default data
      const initService = new InitService(this.prisma);

      // Invariant de schéma, à CHAQUE boot — avant la porte `shouldInitialize`,
      // qui ne s'ouvre que sur une base vide. Derrière elle, une base déjà
      // peuplée ne recevait jamais l'index géospatial (500 sur /posts/nearby).
      await initService.ensurePostGeoIndex();
      await initService.ensureFriendRequestIndexes();
      await initService.ensureContactDeltaIndex();

      // Check if initialization is needed
      const shouldInit = await initService.shouldInitialize();

      if (shouldInit) {
        const forceReset = process.env.FORCE_DB_RESET === 'true';
        if (forceReset) {
          logger.info('🔄 FORCE_DB_RESET=true - Database will be completely reset and reinitialized');
        } else {
          logger.info('🔧 Database initialization required, starting...');
        }
        await initService.initializeDatabase();
        logger.info('✅ Database initialization completed successfully');
      } else {
        logger.info('✅ Database already initialized, skipping initialization');
      }

    } catch (error) {
      logger.error('✗ Database connection failed:', error);
      logger.info('⚠️ Continuing without database initialization (development mode)');
      logger.info('💡 To fix database issues:');
      logger.info('   1. Check MongoDB credentials in .env file');
      logger.info('   2. Ensure MongoDB is running and accessible');
      logger.info('   3. Verify network connectivity to database');
      // Don't throw error in development mode - continue without database
    }

    // Initialize translation service
    try {
      await this.translationService.initialize();
      const isHealthy = await this.translationService.healthCheck();
      if (isHealthy) {
        logger.info('✓ Translation service initialized successfully');
      } else {
        throw new Error('Translation service health check failed');
      }
    } catch (error) {
      logger.error('✗ Translation service initialization failed:', error);
      if (config.isDev) {
        logger.info('🔧 Development mode: Continuing without translation service');
      } else {
        throw new Error('Translation service initialization failed');
      }
    }

    // Initialize agent ZMQ client (optional — only when AGENT_HOST is set)
    const agentHost = process.env.AGENT_HOST;
    if (agentHost) {
      try {
        this.agentClient = new ZmqAgentClient(agentHost, 5560, 5561);
        await this.agentClient.initialize();
        logger.info(`✓ Agent ZMQ client initialized (${agentHost}:5560/5561)`);
      } catch (error) {
        logger.warn('⚠️ Agent ZMQ client init failed, continuing without agent:', error);
        this.agentClient = null;
      }
    } else {
      logger.info('ℹ️ AGENT_HOST not set — agent service disabled');
    }
  }

  private displayStartupBanner(): void {
    const dbStatus = config.databaseUrl ? 'Connected' : 'Not configured'.padEnd(48);
    const translateUrl = `tcp://0.0.0.0:${(process.env.ZMQ_TRANSLATOR_PORT || '5555').padEnd(37)}`;
    const useHttps = process.env.USE_HTTPS === 'true';
    const localIp = process.env.LOCAL_IP || '192.168.1.39';
    const domain = process.env.DOMAIN || 'localhost';
    const protocol = useHttps ? 'https' : 'http';
    const wsProtocol = useHttps ? 'wss' : 'ws';


    if (useHttps) {
      logger.info(`🔒 Gateway running in HTTPS mode`);
      logger.info(`📱 Network access: ${protocol}://${localIp}:${config.port}`);
      if (domain !== 'localhost') {
        logger.info(`🌐 Custom domain: ${protocol}://${domain}:${config.port}`);
        const banner = `
    ╔══════════════════════════════════════════════════════════════════╗
    ║                       🌍 MEESHY GATEWAY 🌍                       ║
    ╠══════════════════════════════════════════════════════════════════╣
    ║  Environment: ${config.nodeEnv.padEnd(48)}   ║
    ║  Port:        ${config.port.toString().padEnd(48)}   ║
    ║  Database:    ${dbStatus}                                          ║
    ║  Translator:  ${translateUrl}║
    ╠══════════════════════════════════════════════════════════════════╣
    ║  📡 WebSocket:    ${wsProtocol}://localhost:${config.port}/socket.io/${' '.repeat(20 - wsProtocol.length - config.port.toString().length)} ║
    ║  🏥 Health:       ${protocol}://localhost:${config.port}/health${' '.repeat(24 - protocol.length - config.port.toString().length)} ║
    ║  📖 Info:         ${protocol}://localhost:${config.port}/info${' '.repeat(26 - protocol.length - config.port.toString().length)} ║
    ║  📱 Network:      ${protocol}://${localIp}:${config.port}${' '.repeat(38 - protocol.length - localIp.length - config.port.toString().length)} ║
    ╚══════════════════════════════════════════════════════════════════╝
        `.trim();
        logger.info(`🔌 WebSocket: ${wsProtocol}://localhost:${config.port}`);
      }else{
        logger.info(`🌐 Local access only (no custom domain configured)`);

        const banner = `
    ╔══════════════════════════════════════════════════════════════════╗
    ║                       🌍 MEESHY GATEWAY 🌍                       ║
    ╠══════════════════════════════════════════════════════════════════╣
    ║  Environment: ${config.nodeEnv.padEnd(48)}   ║
    ║  Port:        ${config.port.toString().padEnd(48)}   ║
    ║  Database:    ${dbStatus}                                          ║
    ║  Translator:  ${translateUrl}║
    ╠══════════════════════════════════════════════════════════════════╣
    ║  📡 WebSocket:    ${wsProtocol}://gate.${domain}:${config.port}/socket.io/${' '.repeat(20 - wsProtocol.length - config.port.toString().length)} ║
    ║  🏥 Health:       ${protocol}://gate.${domain}:${config.port}/health${' '.repeat(24 - protocol.length - config.port.toString().length)} ║
    ║  📖 Info:         ${protocol}://gate.${domain}:${config.port}/info${' '.repeat(26 - protocol.length - config.port.toString().length)} ║
    ║  📱 Network:      ${protocol}://${localIp}:${config.port}${' '.repeat(38 - protocol.length - localIp.length - config.port.toString().length)} ║
    ╚══════════════════════════════════════════════════════════════════╝
        `.trim();
        logger.info(`🔌 WebSocket: ${wsProtocol}://gate.${domain}:${config.port}`);
      }

    }
  }


  public async start(): Promise<void> {
    try {
      logger.info('🚀 Starting Meeshy Translation Gateway...');

      // Display configuration
      logger.info('Configuration loaded:', {
        environment: config.nodeEnv,
        port: config.port,
        translationPort: parseInt(process.env.ZMQ_TRANSLATOR_PORT || '5558'),
        development: config.isDev
      });

      // Initialize services
      await this.initializeServices();

      // Setup server components
      await this.setupMiddleware();
      await this.setupSocketIO();
      await this.setupRoutes();

      // Wire agent client to Socket.IO manager (fire-and-forget listener)
      if (this.agentClient) {
        const manager = this.socketIOHandler.getManager();
        if (manager) {
          manager.setAgentClient(this.agentClient);
          this.agentClient.onResponse(async (response) => {
            await manager.handleAgentResponse(response as Parameters<typeof manager.handleAgentResponse>[0]);
          });
          this.agentClient.onReaction(async (reaction) => {
            await manager.handleAgentReaction(reaction as Parameters<typeof manager.handleAgentReaction>[0]);
          });
          this.agentClient.startListening().catch((err) => {
            logger.error('[GWY] Agent ZMQ listener error:', err);
          });
          logger.info('✓ Agent ZMQ listener started');
        }
      }

      // Start the server
      await this.server.listen({
        port: config.port,
        host: '0.0.0.0'
      });

      // Display success banner
      this.displayStartupBanner();
      logger.info('🎉 Server started successfully and ready to accept connections');

      // Start automatic call cleanup service
      // Attach the Socket.IO server FIRST so that force-end events emit
      // `call:ended` to the affected clients — otherwise the cleanup just
      // updates the DB and the caller stays in `.ringing` forever.
      const cleanupManager = this.socketIOHandler.getManager();
      if (cleanupManager) {
        this.callCleanupService.attachSocketServer(cleanupManager.getIO());
        // RC-4 — share the socket layer's CallService so the heartbeat-GC
        // tier (spec section 2.6) observes real in-memory heartbeat state
        // instead of staying permanently unwired.
        this.callCleanupService.setCallService(cleanupManager.getCallService());
        // P3 — GC-forced call ends (stale ringing/connecting/active) now post
        // the same call-summary system message as every other terminal path.
        const callEventsHandler = cleanupManager.getCallEventsHandler();
        this.callCleanupService.setPostSummaryCallback(
          (callId) => callEventsHandler.postCallSummaryForTerminatedCall(callId)
        );
        // Live-call message — initiateCall's OWN GC sweeps (phantom stale
        // participations, zombie active call) end calls with garbageCollected
        // without any summary hook: an already-posted live "en cours" message
        // would stay frozen forever. Same conversion path as the GC tiers.
        cleanupManager.getCallService().setReapedCallCallback(
          (callId) => callEventsHandler.postCallSummaryForTerminatedCall(callId)
        );
        // Parité socket (2026-07-12) — les routes REST end/leave n'ont pas d'`io`
        // et ne diffusaient jamais `call:ended` au pair (qui restait « en appel »
        // jusqu'au GC ~120s). Elles délèguent le fanout ici, même audience
        // dédupliquée que les handlers socket call:end/call:leave.
        cleanupManager.getCallService().setCallEndedBroadcaster(
          (callId, conversationId, endedEvent) =>
            callEventsHandler.broadcastCallEndedForTerminatedCall(
              cleanupManager.getIO(), callId, conversationId, endedEvent
            )
        );
        // Sibling of the callEndedBroadcaster wiring above — the REST
        // leave/kick route (`DELETE /calls/:id/participants/:pid`) never
        // broadcast `call:participant-left` at all (only the socket
        // `call:leave` handler did), leaving a departed/kicked group-call
        // member visible in every other participant's roster/video grid
        // until the ~120s GC sweep.
        cleanupManager.getCallService().setParticipantLeftBroadcaster(
          (_callId, event) =>
            callEventsHandler.broadcastParticipantLeftForRest(cleanupManager.getIO(), event)
        );
        // Bug fix (2026-08-01) — initiateCall's own GC sweeps (phantom stale
        // participations, zombie active call) write `CallParticipant.leftAt`
        // exactly like every path above, but had no bridge to
        // CallEventsHandler's `call:signal` session cache: without this, a
        // `call:signal` for that callId could still relay SDP/ICE for up to
        // the cache's 2s TTL after the DB already marked the participant gone.
        cleanupManager.getCallService().setSignalCacheInvalidationCallback(
          (callId) => callEventsHandler.invalidateSignalSession(callId)
        );
        // Sibling-drift fix (2026-07-05) — GC-ended calls (the 4th terminal
        // path) also release their qualityDegradedStreaks entries, matching
        // the three paths CallEventsHandler already hooks into itself.
        this.callCleanupService.setQualityStreakCleanupCallback(
          (callId) => callEventsHandler.clearQualityDegradedStreaks(callId)
        );
        // Same bridge as CallService's sweeps above, for GC's own forceEndCall.
        this.callCleanupService.setSignalCacheInvalidationCallback(
          (callId) => callEventsHandler.invalidateSignalSession(callId)
        );
        // Phantom-ringing safety net — a callee whose VoIP push was
        // delivered but whose socket never joined the call room needs the
        // same `call_cancel` background push every other missed-call path
        // sends, or GC tier 1 (ringing timer never fired) leaves their
        // CallKit screen ringing until its own client-side timeout.
        this.callCleanupService.setMissedCallCancelPushCallback(
          (callId, conversationId, duration) =>
            callEventsHandler.sendMissedCallCancellationPushForTerminatedCall(callId, conversationId, duration)
        );
        // Sibling-drift fix (2026-07-07) — GC tier 1 (initiated/ringing > 120s
        // → missed) now also creates the persisted missed-call notification
        // for unresponded participants, matching the in-process ringing-
        // timeout path (`handleMissedCall`). Calls `createMissedCallNotifications`
        // directly, NOT `handleMissedCall` — GC's own transaction already
        // performed the terminal `missed` write, so re-running
        // `markCallAsMissed` here would be redundant.
        this.callCleanupService.setMissedCallNotificationCallback(
          (callId) => callEventsHandler.createMissedCallNotifications(callId)
        );
        // CALL-RESILIENCE (item H) — re-arm the in-process ringing timers a
        // crash/restart wiped, so pre-answer calls interrupted by the restart
        // resolve to `missed` (with their push notification) on the nominal
        // ringing budget instead of ringing until the GC tier.
        // `.catch` OBLIGATOIRE sur une promesse détachée (leçon 230) : le
        // `try/catch` de ce bloc n'attrape qu'un `throw` synchrone, et un rejet
        // sans écouteur termine le process sous le `--unhandled-rejections=throw`
        // par défaut de Node 22 — le démarrage de la passerelle emporté par une
        // ré-hydratation d'appels dont tout le contrat est d'être best-effort.
        void callEventsHandler
          .rehydrateActiveCalls(cleanupManager.getIO())
          .catch((error: unknown) => logger.warn('[GWY] rehydrateActiveCalls failed', { error }));
      } else {
        logger.warn('[GWY] CallCleanupService starting without Socket.IO server — clients will not receive force-end broadcasts');
      }
      this.callCleanupService.start();
      logger.info('✓ Call cleanup service started');

      // Start background jobs (token cleanup, account unlock, notification digest)
      this.backgroundJobs.startAll();

      // Start tus cleanup cron (hourly, removes uploads older than 24h)
      this.tusCleanup.start();
      logger.info('✓ TUS cleanup service started');

      // Start expired-stories cron (hourly): soft-delete past expiresAt,
      // hard-delete past the retention grace window.
      this.expiredStoriesCleanup.start();
      logger.info('✓ Expired stories cleanup service started');

      // Sonde de DÉRIVE DE TYPAGE (#4243) : une passe au démarrage, puis toutes
      // les 12 h. MongoDB n'impose aucun type et le schéma Prisma ne décrit
      // qu'une INTENTION — une écriture passée hors Prisma a posé un NOMBRE dans
      // `User.phoneNumber`, et comme Prisma relit la ligne après CHAQUE écriture,
      // ce compte ne pouvait plus rien écrire sur lui-même : ni présence, ni
      // `lastLoginIp`, ni compteur d'échecs d'authentification, ni profil. Rien
      // ne le signalait — le défaut n'est sorti qu'en cassant le rattrapage de
      // #4159, des mois après l'écriture fautive.
      //
      // PAS derrière une garde de premier boot : le dépôt a déjà payé ce piège
      // avec `ensurePostGeoIndex`, restée sous `shouldInitialize()` donc jamais
      // exécutée en production jusqu'à ce que `/posts/nearby` rende 500. Un
      // contrôle RÉTROACTIF sur une base qui contient déjà des données est par
      // définition incompatible avec une porte « base vide ».
      this.sondeDeTypage = demarrerSondeDeTypage(this.prisma);
      logger.info('✓ Schema drift probe started');

      // Start expired-messages sweep (per-minute): erase content + ciphertext
      // of self-destructing messages whose expiresAt has lapsed.
      this.expiredMessagesCleanup.start();
      logger.info('✓ Expired messages cleanup service started');

      // Start orphan-media cleanup worker (5-min sweep, deletes files
      // referenced in OrphanMediaCleanup whose cleanupAfter has passed).
      this.orphanMediaCleanup.start();
      logger.info('✓ Orphan media cleanup service started');

    } catch (error) {
      logger.error('❌ Failed to start server: ', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    logger.info('🛑 Shutting down server...');

    try {
      // CALL-RESILIENCE — tell the call handler we're shutting down BEFORE the
      // HTTP/Socket.IO server closes and mass-drops every socket, so it does not
      // interpret the restart's disconnect storm as everyone hanging up and end
      // active peer-to-peer calls. Clients re-join the restarted instance; the
      // media (direct P2P) never dropped.
      try {
        const socketManager = this.socketIOHandler?.getManager?.();
        socketManager?.getCallEventsHandler?.().prepareForShutdown();
        // Release the handler's own periodic buffered-offer cleanup interval
        // and any leftover disconnect-grace timers — `prepareForShutdown()`
        // only flips shutdown mode and clears the grace timers; it does not
        // stop the interval, which would otherwise keep querying a handler
        // that's about to be torn down.
        socketManager?.getCallEventsHandler?.().destroy();
        socketManager?.getCallService?.()?.destroy();
        logger.info('✓ Call handler set to shutdown mode (active calls preserved for reconnect)');
      } catch (callShutdownError) {
        logger.warn('⚠️ Could not set call handler shutdown mode', callShutdownError);
      }

      // Stop call cleanup service
      if (this.callCleanupService) {
        this.callCleanupService.stop();
        logger.info('✓ Call cleanup service stopped');
      }

      // Stop background jobs
      if (this.backgroundJobs) {
        this.backgroundJobs.stopAll();
        logger.info('✓ Background jobs stopped');
      }

      // Stop tus cleanup cron
      if (this.tusCleanup) {
        this.tusCleanup.stop();
        logger.info('✓ TUS cleanup service stopped');
      }

      // Stop expired-stories cleanup cron
      if (this.expiredStoriesCleanup) {
        this.expiredStoriesCleanup.stop();
        logger.info('✓ Expired stories cleanup service stopped');
      }

      // Stop schema drift probe (#4243)
      if (this.sondeDeTypage) {
        this.sondeDeTypage.arreter();
        logger.info('✓ Schema drift probe stopped');
      }

      // Stop expired-messages sweep
      if (this.expiredMessagesCleanup) {
        this.expiredMessagesCleanup.stop();
        logger.info('✓ Expired messages cleanup service stopped');
      }

      // Stop orphan-media cleanup worker
      if (this.orphanMediaCleanup) {
        this.orphanMediaCleanup.stop();
        logger.info('✓ Orphan media cleanup service stopped');
      }

      // SECURITY: Clear all cryptographic material from memory
      try {
        await shutdownEncryptionService();
        logger.info('✓ Encryption service shutdown (sensitive data cleared)');
      } catch (encError) {
        logger.warn('⚠️ Encryption service shutdown error:', encError);
      }

      if (this.agentClient) {
        await this.agentClient.close();
        logger.info('✓ Agent ZMQ client closed');
      }

      if (this.translationService) {
        await this.translationService.close();
        logger.info('✓ Translation service connection closed');
      }

      await this.server.close();
      logger.info('✓ HTTP server closed');

      await this.prisma.$disconnect();
      logger.info('✓ Database connection closed');

      logger.info('✅ Server shutdown completed successfully');
    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
      throw error;
    }
  }
}

// ============================================================================
// APPLICATION BOOTSTRAP
// ============================================================================

const meeshyServer = new MeeshyServer();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM signal');
  try {
    await meeshyServer.stop();
    process.exit(0);
  } catch (error) {
    logger.error('Error during SIGTERM shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT signal (Ctrl+C)');
  try {
    await meeshyServer.stop();
    process.exit(0);
  } catch (error) {
    logger.error('Error during SIGINT shutdown:', error);
    process.exit(1);
  }
});

// Helper pour écrire les crash logs dans un fichier
function writeCrashLog(type: string, error: unknown, promise?: Promise<unknown>): void {
  const timestamp = new Date().toISOString();
  const crashDir = path.join(process.cwd(), 'logs');
  const crashFile = path.join(crashDir, 'gateway-crashes.log');

  // Créer le dossier logs s'il n'existe pas
  if (!fs.existsSync(crashDir)) {
    fs.mkdirSync(crashDir, { recursive: true });
  }

  // Construire le message de crash détaillé
  let crashMessage = `\n${'='.repeat(80)}\n`;
  crashMessage += `[${timestamp}] ${type}\n`;
  crashMessage += `${'='.repeat(80)}\n`;

  if (error instanceof Error) {
    crashMessage += `Name: ${error.name}\n`;
    crashMessage += `Message: ${error.message}\n`;
    crashMessage += `Stack:\n${error.stack || 'No stack trace'}\n`;
    if ((error as any).cause) {
      crashMessage += `Cause: ${JSON.stringify((error as any).cause, null, 2)}\n`;
    }
  } else {
    crashMessage += `Reason: ${JSON.stringify(error, null, 2)}\n`;
    crashMessage += `Type: ${typeof error}\n`;
  }

  if (promise) {
    crashMessage += `Promise: ${promise.toString()}\n`;
  }

  crashMessage += `${'='.repeat(80)}\n`;

  // Écrire dans le fichier
  fs.appendFileSync(crashFile, crashMessage);

  // Aussi logger dans la console avec le stack complet
  logger.error('Crash', { message: crashMessage });
}

process.on('uncaughtException', (error) => {
  logger.error('❌ UNCAUGHT EXCEPTION - See logs/gateway-crashes.log for details');
  writeCrashLog('UNCAUGHT EXCEPTION', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ UNHANDLED REJECTION - See logs/gateway-crashes.log for details');
  writeCrashLog('UNHANDLED REJECTION', reason, promise);
  // Ne pas quitter immédiatement pour permettre de voir plus d'erreurs
  // process.exit(1);
});

// Start the server
meeshyServer.start().catch((error) => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});

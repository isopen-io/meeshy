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
import { Redis } from 'ioredis';
import winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';
import { MessageTranslationService } from './services/message-translation/MessageTranslationService';
import { MessagingService } from './services/MessagingService';
import { MentionService } from './services/MentionService';
import { StatusService } from './services/StatusService';
import { AuthMiddleware, createUnifiedAuthMiddleware } from './middleware/auth';
import { registerGlobalRateLimiter } from './middleware/rate-limiter';
import { authRoutes } from './routes/auth';
import { conversationRoutes } from './routes/conversations';
import { linksRoutes } from './routes/links';
import { trackingLinksRoutes } from './routes/tracking-links';
import { anonymousRoutes } from './routes/anonymous';
import { communityRoutes } from './routes/communities';
// import { adminRoutes } from './routes/admin'; // Not used - individual admin routes registered below
import { dashboardRoutes } from './routes/admin/dashboard';
import { userAdminRoutes } from './routes/admin/users';
import { reportRoutes } from './routes/admin/reports';
import { invitationRoutes } from './routes/admin/invitations';
import { analyticsRoutes } from './routes/admin/analytics';
import { languagesRoutes } from './routes/admin/languages';
import { messagesRoutes } from './routes/admin/messages';
// import { communityAdminRoutes } from './routes/admin/communities';
// import { linksAdminRoutes } from './routes/admin/links';
import { userRoutes } from './routes/users';
// TODO: Migrer user-features vers UserPreferences + ConsentService
// import userFeaturesRoutes from './routes/user-features';
import meRoutes from './routes/me';
import conversationPreferencesRoutes from './routes/conversation-preferences';
import communityPreferencesRoutes from './routes/community-preferences';
import conversationEncryptionRoutes from './routes/conversation-encryption';
import encryptionKeysRoutes from './routes/encryption-keys';
import signalProtocolRoutes from './routes/signal-protocol';
import { translationRoutes } from './routes/translation-non-blocking';
import { translationRoutes as translationBlockingRoutes } from './routes/translation';
import { translationJobsRoutes } from './routes/translation-jobs';
import { maintenanceRoutes } from './routes/maintenance';
import affiliateRoutes from './routes/affiliate';
import messageRoutes from './routes/messages';
import mentionRoutes from './routes/mentions';
import { notificationRoutes } from './routes/notifications';
import { friendRequestRoutes } from './routes/friends';
import { attachmentRoutes } from './routes/attachments';
import reactionRoutes from './routes/reactions';
import callRoutes from './routes/calls';
import { voiceProfileRoutes } from './routes/voice-profile';
import { registerVoiceRoutes } from './routes/voice';
import { voiceAnalysisRoutes } from './routes/voice-analysis';
import { getAudioTranslateService } from './services/AudioTranslateService';
import { passwordResetRoutes } from './routes/password-reset';
import { twoFactorRoutes } from './routes/two-factor';
import { magicLinkRoutes } from './routes/magic-link';
import userDeletionsRoutes from './routes/user-deletions';
import { pushTokenRoutes } from './routes/push-tokens';
import { postRoutes } from './routes/posts';
import { InitService } from './services/InitService';
import { MeeshySocketIOHandler } from './socketio/MeeshySocketIOHandler';
import { CallCleanupService } from './services/CallCleanupService';
import { shutdownEncryptionService } from './services/EncryptionService';
import { MultiLevelJobMappingCache } from './services/MultiLevelJobMappingCache';
import { BackgroundJobsManager } from './jobs';
import { EmailService } from './services/EmailService';

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

// API versioning
const API_VERSION = 'v1';
const API_PREFIX = `/api/${API_VERSION}`;

// ============================================================================
// LOGGER SETUP
// ============================================================================

const logger = winston.createLogger({
  level: config.isDev ? 'debug' : 'warn', // Production: seulement warn et error
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    config.isDev 
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, stack }) => {
            return `${timestamp} [GWY] [${level}] ${message}${stack ? '\n' + stack : ''}`;
          })
        )
      : winston.format.combine(
          winston.format.printf((info) => {
            const { timestamp, level, message, stack, module, func, ...meta } = info;

            // Format structuré : [LEVEL][SERVICE][MODULE][FUNCTION] {data}
            const logParts = [
              `[${level.toUpperCase()}]`,
              '[GWY]',
              module ? `[${module}]` : '',
              func ? `[${func}]` : ''
            ].filter(Boolean);

            const logObj: any = {
              msg: message
            };

            // Ajouter le stack si présent
            if (stack) {
              logObj.stack = stack;
            }

            // Ajouter toutes les métadonnées supplémentaires
            if (Object.keys(meta).length > 0) {
              Object.assign(logObj, meta);
            }

            return `${timestamp} ${logParts.join('')} ${JSON.stringify(logObj)}`;
          })
        )
  ),
  transports: [
    new winston.transports.Console(),
    ...(!config.isDev ? [
      new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      new winston.transports.File({ 
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    ] : [])
  ]
});

// ============================================================================
// CUSTOM ERROR CLASSES
// ============================================================================

class AuthenticationError extends Error {
  public statusCode: number;
  
  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
  }
}

class ValidationError extends Error {
  public statusCode: number;
  
  constructor(message: string = 'Validation failed') {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

class TranslationError extends Error {
  public statusCode: number;
  
  constructor(message: string = 'Translation failed') {
    super(message);
    this.name = 'TranslationError';
    this.statusCode = 500;
  }
}

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
  private redis: Redis | null = null;
  private translationService: MessageTranslationService;
  private messagingService: MessagingService;
  private mentionService: MentionService;
  private statusService: StatusService;
  private authMiddleware: AuthMiddleware;
  private socketIOHandler: MeeshySocketIOHandler;
  private callCleanupService: CallCleanupService;
  private backgroundJobs: BackgroundJobsManager;
  private jobMappingCache: MultiLevelJobMappingCache;

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
        ajv: {
          customOptions: {
            strict: 'log' as const, // Allow unknown keywords like 'example' (for OpenAPI documentation)
            keywords: ['example'] // Explicitly allow 'example' keyword
          }
        }
      }) as FastifyInstance;

      logger.info('🌐 Gateway starting in HTTP mode');
    }
    
    this.prisma = new PrismaClient({
      log: ['warn', 'error'] // Désactivation des logs query et info pour réduire le bruit
    });

    // Initialiser Redis si l'URL est configurée (optionnel)
    if (process.env.REDIS_URL) {
      try {
        this.redis = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        });

        this.redis.on('connect', () => {
          logger.info('🔴 Redis connected successfully');
        });

        this.redis.on('error', (err) => {
          logger.error('❌ Redis connection error:', err);
          // Ne pas faire crash l'app si Redis est down
          // Le cache multi-niveau fonctionnera en mode mémoire seule
        });

        logger.info('🔴 Redis initialization started...');
      } catch (error) {
        logger.error('❌ Failed to initialize Redis:', error);
        logger.warn('⚠️ Continuing without Redis - cache will use memory only');
        this.redis = null;
      }
    } else {
      logger.info('ℹ️ REDIS_URL not configured - cache will use memory only');
    }

    // NOUVEAU: Initialiser le StatusService en premier (requis par AuthMiddleware)
    this.statusService = new StatusService(this.prisma);

    // Initialiser le middleware d'authentification unifié avec StatusService
    this.authMiddleware = new AuthMiddleware(this.prisma, this.statusService);

    // Initialiser le cache multi-niveau partagé pour les mappings de jobs (avant MessageTranslationService)
    this.jobMappingCache = new MultiLevelJobMappingCache(this.redis || undefined);

    // Initialiser le service de traduction avec Redis optionnel et le cache partagé
    this.translationService = new MessageTranslationService(this.prisma, this.redis || undefined, this.jobMappingCache);

    // Initialiser le service de messaging
    this.messagingService = new MessagingService(this.prisma, this.translationService);

    // Initialiser le service de mentions
    this.mentionService = new MentionService(this.prisma);

    // Initialiser le handler Socket.IO avec l'instance de translationService qui reçoit les événements ZMQ
    this.socketIOHandler = new MeeshySocketIOHandler(
      this.prisma,
      config.jwtSecret,
      this.translationService, // ← Instance initialisée qui reçoit les événements ZMQ
      this.redis || undefined
    );

    // Initialiser le service de nettoyage automatique des appels
    this.callCleanupService = new CallCleanupService(this.prisma);

    // Initialiser les background jobs (cleanup, digest, etc.)
    const emailService = new EmailService();
    this.backgroundJobs = new BackgroundJobsManager(this.prisma, emailService);
  }

  // --------------------------------------------------------------------------
  // MIDDLEWARE SETUP
  // --------------------------------------------------------------------------

  private async setupMiddleware(): Promise<void> {
    logger.info('Setting up middleware...');

    // Register sensible plugin for httpErrors
    await this.server.register(sensible);

    // Register multipart plugin for file uploads
    await this.server.register(multipart, {
      limits: {
        fileSize: 2147483648, // 2GB max file size
        files: 100, // Max 100 files per request
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

    // CORS configuration
    await this.server.register(cors, {
      origin: config.isDev ? true : (origin, cb) => {
        // Add your production domains here
        const allowedOrigins = process.env.CORS_ORIGINS?.split(',') ||
                               process.env.ALLOWED_ORIGINS?.split(',') ||
                               [
                                 // Local development
                                 'http://localhost:3100',
                                 'http://localhost',
                                 'http://localhost:80',
                                 'http://127.0.0.1',
                                 'http://127.0.0.1:80',
                                 // Production
                                 'https://meeshy.me',
                                 'https://www.meeshy.me',
                                 'https://gate.meeshy.me',
                                 'https://ml.meeshy.me',
                                 // Staging
                                 'https://staging.meeshy.me:8443',
                                 'https://gate.staging.meeshy.me:8443',
                                 'https://ml.staging.meeshy.me:8443'
                               ];

        logger.info(`CORS check: origin="${origin}", allowed="${allowedOrigins.join(',')}"`);

        // Allow requests without origin (e.g., mobile apps, Postman, curl)
        // Allow requests from allowed origins
        if (!origin || allowedOrigins.includes(origin)) {
          return cb(null, true);
        }

        // Log the rejection for debugging
        logger.warn(`CORS rejected origin: "${origin}"`);
        return cb(new Error('Not allowed by CORS'), false);
      },
      credentials: true
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
          { name: 'admin', description: 'Admin operations' }
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
      transformSpecification: (swaggerObject) => swaggerObject,
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

      if (err instanceof AuthenticationError) {
        return reply.code(401).send({
          error: 'Authentication Failed',
          message: err.message,
          statusCode: 401,
          timestamp: new Date().toISOString()
        });
      }

      if (error instanceof ValidationError) {
        return reply.code(400).send({
          error: 'Validation Error',
          message: err.message,
          statusCode: 400,
          timestamp: new Date().toISOString()
        });
      }

      if (error instanceof TranslationError) {
        return reply.code(500).send({
          error: 'Translation Error',
          message: err.message,
          statusCode: 500,
          timestamp: new Date().toISOString()
        });
      }

      // Gestion des erreurs de limite de fichiers multipart
      if (err && err.code === 'FST_FILES_LIMIT') {
        return reply.code(413).send({
          error: 'Too Many Files',
          message: `You can only upload a maximum of 100 files at once. Please reduce the number of files.`,
          details: {
            maxFiles: 100,
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
          message: `File size exceeds the allowed limit of 2 GB. Please reduce the file size.`,
          details: {
            maxFileSize: '2 GB',
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
    this.server.decorate('redis', this.redis);
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
        const notificationService = manager.getNotificationService();
        this.server.decorate('notificationService', notificationService);
        logger.info('[GWY] ✅ NotificationService exposed for routes');
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
    logger.info('Configuring REST API routes...');

    // Health check endpoint
    this.server.get('/health', async (request, reply) => {
      try {
        const [userCount, translationHealthy] = await Promise.all([
          this.prisma.user.count(),
          this.translationService.healthCheck().catch(() => false)
        ]);
        
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          environment: config.nodeEnv,
          version: '1.0.0',
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
    this.server.get('/info', async (request, reply) => {
      return {
        name: 'Meeshy Translation Gateway',
        version: '1.0.0',
        environment: config.nodeEnv,
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
    await this.server.register(async (fastify) => {
      // Décorer le serveur avec le service de traduction et messaging
      fastify.decorate('translationService', this.translationService);
      fastify.decorate('messagingService', this.messagingService);
      fastify.decorate('mentionService', this.mentionService);

      // Enregistrer les routes de traduction (non-blocking)
      await fastify.register(translationRoutes);

      // Enregistrer les routes de traduction (blocking)
      await fastify.register(translationBlockingRoutes);

      // Enregistrer les routes de gestion des jobs de traduction
      await fastify.register(translationJobsRoutes);
    }, { prefix: API_PREFIX });
    
    // Register authentication routes with /api/auth prefix
    await this.server.register(authRoutes, { prefix: `${API_PREFIX}/auth` });

    // Register password reset routes with /api/auth prefix
    await this.server.register(passwordResetRoutes, { prefix: `${API_PREFIX}/auth` });

    // Register 2FA routes with /api/auth/2fa prefix
    await this.server.register(twoFactorRoutes, { prefix: `${API_PREFIX}/auth/2fa` });

    // Register magic link routes with /api/auth prefix
    await this.server.register(magicLinkRoutes, { prefix: `${API_PREFIX}/auth` });

    // Register user deletions routes (delete for me feature)
    await this.server.register(userDeletionsRoutes, { prefix: '' });

    // Register conversation routes with /api prefix
    await this.server.register(async (fastify) => {
      await conversationRoutes(fastify);
    }, { prefix: API_PREFIX });
    // Register links management routes
    await this.server.register(linksRoutes, { prefix: API_PREFIX });
    
    // Register tracking links routes
    await this.server.register(trackingLinksRoutes, { prefix: API_PREFIX });
    
    // Register anonymous participation routes
    await this.server.register(anonymousRoutes, { prefix: API_PREFIX });
    
    // Register community routes
    await this.server.register(communityRoutes, { prefix: API_PREFIX });

    // Register admin routes - Each admin route is registered individually below with specific prefixes
    // (Removed global adminRoutes registration to avoid duplicate route declarations)

    // Register admin dashboard routes (at /api/admin/dashboard)
    await this.server.register(dashboardRoutes, { prefix: `${API_PREFIX}/admin` });

    // Register enhanced admin user management routes (at /api/v1/admin/users)
    await this.server.register(userAdminRoutes, { prefix: API_PREFIX });

    // Register admin report routes (at /api/admin/reports)
    await this.server.register(reportRoutes, { prefix: `${API_PREFIX}/admin/reports` });

    // Register admin invitations routes (at /api/admin/invitations)
    await this.server.register(invitationRoutes, { prefix: `${API_PREFIX}/admin/invitations` });

    // Register admin analytics routes (at /api/admin/analytics)
    await this.server.register(analyticsRoutes, { prefix: `${API_PREFIX}/admin/analytics` });

    // Register admin languages routes (at /api/admin/languages)
    await this.server.register(languagesRoutes, { prefix: `${API_PREFIX}/admin/languages` });

    // Register admin messages routes (at /api/admin/messages)
    await this.server.register(messagesRoutes, { prefix: `${API_PREFIX}/admin/messages` });

    // Register admin communities routes (at /api/admin/communities)
    //     await this.server.register(communityAdminRoutes, { prefix: '/api/admin/communities' });
    //
    //     // Register admin links routes (at /api/admin/links)
    //     await this.server.register(linksAdminRoutes, { prefix: '/api/admin/links' });

    // Register user routes
    await this.server.register(userRoutes, { prefix: API_PREFIX });

    // Register /me routes (NEW unified preferences API)
    await this.server.register(meRoutes, { prefix: `${API_PREFIX}/me` });

    // Register push notification token routes (device registration for APNS/FCM/VoIP)
    await this.server.register(pushTokenRoutes, { prefix: API_PREFIX });

    // Register user features routes with /api prefix (GDPR consents, feature toggles)
    // TODO: Réactiver après migration vers UserPreferences + ConsentService
    // await this.server.register(userFeaturesRoutes, { prefix: API_PREFIX });

    // Register conversation preferences routes with /api prefix
    await this.server.register(conversationPreferencesRoutes, { prefix: API_PREFIX });

    // Register community preferences routes with /api prefix
    await this.server.register(communityPreferencesRoutes, { prefix: API_PREFIX });

    // Register conversation encryption routes with /api prefix
    // TEMPORAIREMENT COMMENTÉ - timeout au démarrage
    // TODO: Investiguer et corriger le timeout dans conversation-encryption.ts
    // await this.server.register(conversationEncryptionRoutes, { prefix: '' });

    // Register encryption key exchange routes with /api prefix
    // TEMPORAIREMENT COMMENTÉ - timeout au démarrage (getEncryptionService prend trop de temps)
    // TODO: Investiguer et corriger le timeout dans encryption-keys.ts
    // await this.server.register(encryptionKeysRoutes, { prefix: '' });

    // Register Signal Protocol routes for E2EE key generation
    await this.server.register(signalProtocolRoutes, { prefix: API_PREFIX });

    // Register affiliate routes
    await this.server.register(affiliateRoutes, { prefix: API_PREFIX });


    // Register maintenance routes with /api prefix
    await this.server.register(maintenanceRoutes, { prefix: API_PREFIX });
    
    // Register message routes with /api prefix
    await this.server.register(messageRoutes, { prefix: API_PREFIX });

    // Register mention routes with /api prefix
    await this.server.register(mentionRoutes, { prefix: API_PREFIX });

    // Register attachment routes with /api/v1 prefix
    await this.server.register(attachmentRoutes, { prefix: API_PREFIX });

    // LEGACY: Register attachment routes with /api prefix (without v1) for backward compatibility
    // Existing data in DB uses /api/attachments/file/... URLs without v1
    await this.server.register(attachmentRoutes, { prefix: '/api' });

    // Register reaction routes with /api prefix
    await this.server.register(reactionRoutes, { prefix: API_PREFIX });

    // Register notification routes with /api prefix
    await this.server.register(notificationRoutes, { prefix: API_PREFIX });
    
    // Register friend request routes with /api prefix
    await this.server.register(friendRequestRoutes, { prefix: API_PREFIX });

    // Register call routes with /api prefix (Phase 1A: P2P Video Calls MVP)
    await this.server.register(callRoutes, { prefix: API_PREFIX });

    // Register voice profile routes with /api/voice/profile prefix
    await this.server.register(voiceProfileRoutes, { prefix: `${API_PREFIX}/voice/profile` });

    // Register voice analysis routes with /api/voice-analysis prefix
    await this.server.register(voiceAnalysisRoutes);
    logger.info('✓ Voice Analysis routes registered');

    // Register voice API routes (transcribe, translate, analyze, etc.)
    const zmqClient = this.translationService.getZmqClient();
    if (zmqClient) {
      const audioTranslateService = getAudioTranslateService(this.prisma, zmqClient);
      registerVoiceRoutes(this.server, audioTranslateService, this.translationService);
      logger.info('✓ Voice API routes registered');
    } else {
      logger.warn('⚠️ ZMQ client not available, voice routes not registered');
    }

    // Register post/feed routes with /api/v1 prefix
    await this.server.register(async (instance) => {
      await postRoutes(instance);
    }, { prefix: API_PREFIX });
    logger.info('✓ Post/Feed routes registered');

    logger.info('✓ REST API routes configured successfully');
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

      // Start the server
      await this.server.listen({ 
        port: config.port, 
        host: '0.0.0.0' 
      });

      // Display success banner
      this.displayStartupBanner();
      logger.info('🎉 Server started successfully and ready to accept connections');

      // Start automatic call cleanup service
      this.callCleanupService.start();
      logger.info('✓ Call cleanup service started');

      // Start background jobs (token cleanup, account unlock, notification digest)
      this.backgroundJobs.startAll();

    } catch (error) {
      logger.error('❌ Failed to start server: ', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    logger.info('🛑 Shutting down server...');

    try {
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

      // SECURITY: Clear all cryptographic material from memory
      try {
        await shutdownEncryptionService();
        logger.info('✓ Encryption service shutdown (sensitive data cleared)');
      } catch (encError) {
        logger.warn('⚠️ Encryption service shutdown error:', encError);
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
  console.error(crashMessage);
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
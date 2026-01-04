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
import { PrismaClient } from '@meeshy/shared/prisma/client';
import winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';
import { TranslationService } from './services/TranslationService';
import { MessagingService } from './services/MessagingService';
import { MentionService } from './services/MentionService';
import { StatusService } from './services/status.service';
import { AuthMiddleware, createUnifiedAuthMiddleware } from './middleware/auth';
import { registerGlobalRateLimiter } from './middleware/rate-limiter';
import { authRoutes } from './routes/auth';
import { conversationRoutes } from './routes/conversations';
import { linksRoutes } from './routes/links';
import { trackingLinksRoutes } from './routes/tracking-links';
import { anonymousRoutes } from './routes/anonymous';
import { communityRoutes } from './routes/communities';
import { adminRoutes } from './routes/admin';
import { userAdminRoutes } from './routes/admin/users';
import { reportRoutes } from './routes/admin/reports';
import { invitationRoutes } from './routes/admin/invitations';
import { analyticsRoutes } from './routes/admin/analytics';
import { languagesRoutes } from './routes/admin/languages';
import { messagesRoutes } from './routes/admin/messages';
// import { communityAdminRoutes } from './routes/admin/communities';
// import { linksAdminRoutes } from './routes/admin/links';
import { userRoutes } from './routes/users';
import userPreferencesRoutes from './routes/user-preferences';
import conversationPreferencesRoutes from './routes/conversation-preferences';
import { translationRoutes } from './routes/translation-non-blocking';
import { translationRoutes as translationBlockingRoutes } from './routes/translation';
import { maintenanceRoutes } from './routes/maintenance';
import { authTestRoutes } from './routes/auth-test';
import affiliateRoutes from './routes/affiliate';
import messageRoutes from './routes/messages';
import mentionRoutes from './routes/mentions';
import { notificationRoutes } from './routes/notifications';
import { friendRequestRoutes } from './routes/friends';
import { attachmentRoutes } from './routes/attachments';
import reactionRoutes from './routes/reactions';
import callRoutes from './routes/calls';
import { voiceProfileRoutes } from './routes/voice-profile';
import { InitService } from './services/init.service';
import { MeeshySocketIOHandler } from './socketio/MeeshySocketIOHandler';
import { CallCleanupService } from './services/CallCleanupService';

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
          winston.format.printf(({ timestamp, level, message, stack }) => {
            const logObj: any = {
              timestamp,
              service: 'GWY',
              level,
              message
            };
            if (stack) {
              logObj.stack = stack;
            }
            return JSON.stringify(logObj);
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
    translationService: TranslationService;
    socketIOHandler: MeeshySocketIOHandler;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// ============================================================================
// SERVICES INITIALIZATION
// ============================================================================

class MeeshyServer {
  private server: FastifyInstance;
  private prisma: PrismaClient;
  private translationService: TranslationService;
  private messagingService: MessagingService;
  private mentionService: MentionService;
  private statusService: StatusService;
  private authMiddleware: AuthMiddleware;
  private socketIOHandler: MeeshySocketIOHandler;
  private callCleanupService: CallCleanupService;

  constructor() {
    // Check if HTTPS mode is enabled
    const useHttps = process.env.USE_HTTPS === 'true';

    if (useHttps) {
      // HTTPS mode - load SSL certificates
      const certPath = path.join(__dirname, '..', '..', 'frontend', '.cert');
      const keyPath = path.join(certPath, 'localhost-key.pem');
      const certFilePath = path.join(certPath, 'localhost.pem');

      if (!fs.existsSync(keyPath) || !fs.existsSync(certFilePath)) {
        logger.error('❌ SSL certificates not found for HTTPS mode!');
        logger.error(`   Expected certificates at: ${certPath}`);
        logger.error('   The frontend certificates will be used for the gateway.');
        logger.error('   Ensure frontend/.cert/ contains the certificates.');
        process.exit(1);
      }

      this.server = fastify({
        logger: false, // We use Winston instead
        disableRequestLogging: !config.isDev,
        https: {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certFilePath),
        },
      });

      logger.info('🔒 Gateway starting in HTTPS mode');
    } else {
      // HTTP mode (default)
      this.server = fastify({
        logger: false, // We use Winston instead
        disableRequestLogging: !config.isDev
      });

      logger.info('🌐 Gateway starting in HTTP mode');
    }
    
    this.prisma = new PrismaClient({
      log: ['warn', 'error'] // Désactivation des logs query et info pour réduire le bruit
    });

    // NOUVEAU: Initialiser le StatusService en premier (requis par AuthMiddleware)
    this.statusService = new StatusService(this.prisma);

    // Initialiser le middleware d'authentification unifié avec StatusService
    this.authMiddleware = new AuthMiddleware(this.prisma, this.statusService);

    // Initialiser le service de traduction
    this.translationService = new TranslationService(this.prisma);

    // Initialiser le service de messaging
    this.messagingService = new MessagingService(this.prisma, this.translationService);

    // Initialiser le service de mentions
    this.mentionService = new MentionService(this.prisma);

    this.socketIOHandler = new MeeshySocketIOHandler(this.prisma, config.jwtSecret);

    // Initialiser le service de nettoyage automatique des appels
    this.callCleanupService = new CallCleanupService(this.prisma);
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
                               ['http://localhost:3100', 'http://localhost', 'http://localhost:80', 'http://127.0.0.1', 'http://127.0.0.1:80', 'https://meeshy.me', 'https://www.meeshy.me', 'https://gate.meeshy.me', 'https://ml.meeshy.me'];
        
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
      logger.error('Global error handler:', error);
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
    this.server.decorate('translationService', this.translationService);
    this.server.decorate('mentionService', this.mentionService);
    this.server.decorate('socketIOHandler', this.socketIOHandler);
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
      this.socketIOHandler.setupSocketIO(this.server);
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
    }, { prefix: '/api' });
    
    // Register authentication routes with /api/auth prefix
    await this.server.register(authRoutes, { prefix: '/api/auth' });
    
    // Register authentication test routes for Phase 3.1.1
    await this.server.register(authTestRoutes, { prefix: '/api' });
    
    // Register conversation routes with /api prefix
    await this.server.register(async (fastify) => {
      await conversationRoutes(fastify);
    }, { prefix: '/api' });
    // Register links management routes
    await this.server.register(linksRoutes, { prefix: '/api' });
    
    // Register tracking links routes
    await this.server.register(trackingLinksRoutes, { prefix: '/api' });
    
    // Register anonymous participation routes
    await this.server.register(anonymousRoutes, { prefix: '/api' });
    
    // Register community routes
    await this.server.register(communityRoutes, { prefix: '/api' });
    
    // Register admin routes with /api/admin prefix
    await this.server.register(adminRoutes, { prefix: '/api/admin' });

    // Register enhanced admin user management routes (at /api/admin/user-management)
    await this.server.register(userAdminRoutes, { prefix: '/api' });

    // Register admin report routes (at /api/admin/reports)
    await this.server.register(reportRoutes, { prefix: '/api/admin/reports' });

    // Register admin invitations routes (at /api/admin/invitations)
    await this.server.register(invitationRoutes, { prefix: '/api/admin/invitations' });

    // Register admin analytics routes (at /api/admin/analytics)
    await this.server.register(analyticsRoutes, { prefix: '/api/admin/analytics' });

    // Register admin languages routes (at /api/admin/languages)
    await this.server.register(languagesRoutes, { prefix: '/api/admin/languages' });

    // Register admin messages routes (at /api/admin/messages)
    await this.server.register(messagesRoutes, { prefix: '/api/admin/messages' });

    // Register admin communities routes (at /api/admin/communities)
    //     await this.server.register(communityAdminRoutes, { prefix: '/api/admin/communities' });
    //
    //     // Register admin links routes (at /api/admin/links)
    //     await this.server.register(linksAdminRoutes, { prefix: '/api/admin/links' });

    // Register user routes
    await this.server.register(userRoutes, { prefix: '/api' });
    
    // Register user preferences routes with /api prefix
    await this.server.register(userPreferencesRoutes, { prefix: '/api' });

    // Register conversation preferences routes with /api prefix
    await this.server.register(conversationPreferencesRoutes, { prefix: '/api' });

    // Register affiliate routes
    await this.server.register(affiliateRoutes, { prefix: '/api' });


    // Register maintenance routes with /api prefix
    await this.server.register(maintenanceRoutes, { prefix: '/api' });
    
    // Register message routes with /api prefix
    await this.server.register(messageRoutes, { prefix: '/api' });

    // Register mention routes with /api prefix
    await this.server.register(mentionRoutes, { prefix: '/api' });

    // Register attachment routes with /api prefix
    await this.server.register(attachmentRoutes, { prefix: '/api' });

    // Register reaction routes with /api prefix
    await this.server.register(reactionRoutes, { prefix: '/api' });

    // Register notification routes with /api prefix
    await this.server.register(notificationRoutes, { prefix: '/api' });
    
    // Register friend request routes with /api prefix
    await this.server.register(friendRequestRoutes, { prefix: '/api' });

    // Register call routes with /api prefix (Phase 1A: P2P Video Calls MVP)
    await this.server.register(callRoutes, { prefix: '/api' });

    // Register voice profile routes with /api/voice/profile prefix
    await this.server.register(voiceProfileRoutes, { prefix: '/api/voice/profile' });

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

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
meeshyServer.start().catch((error) => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});
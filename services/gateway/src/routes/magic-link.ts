import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { MagicLinkService } from '../services/MagicLinkService';
import { getCacheStore } from '../services/CacheStore';
import { EmailService } from '../services/EmailService';
import { GeoIPService, getRequestContext } from '../services/GeoIPService';
import { initSessionService, markSessionTrusted } from '../services/SessionService';
import { rememberPendingDeviceTrust } from './auth/pending-device-trust';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { sendSuccess, sendBadRequest, sendInternalError } from '../utils/response.js';
import { userSchema, sessionSchema, errorResponseSchema } from '@meeshy/shared/types/api-schemas';
const logger = enhancedLogger.child({ module: 'MagicLinkRoutes' });

// Validation schemas
const requestMagicLinkSchema = z.object({
  email: z.email('Invalid email address').max(255),
  rememberDevice: z.boolean().optional().default(false) // Stored server-side for security
});

const validateMagicLinkSchema = z.object({
  token: z.string().min(1, 'Token is required')
  // rememberDevice is retrieved from server-side storage, not from client
});

export async function magicLinkRoutes(fastify: FastifyInstance) {
  // Use shared singleton instance to avoid multiple Redis connections
  const cacheStore = getCacheStore();
  const emailService = new EmailService();
  const geoIPService = new GeoIPService();

  // Initialize session service for the routes
  initSessionService(fastify.prisma);

  const magicLinkService = new MagicLinkService(
    fastify.prisma,
    cacheStore,
    emailService,
    geoIPService
  );

  /**
   * POST /auth/magic-link/request
   * Request a magic link to be sent via email
   */
  fastify.post('/magic-link/request', {
    schema: {
      description: 'Request a magic link for passwordless login. A link valid for 1 minute will be sent to the provided email address.',
      tags: ['auth'],
      summary: 'Request magic link',
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'Email address associated with the account',
            example: 'user@example.com'
          },
          rememberDevice: {
            type: 'boolean',
            description: 'Remember device for long session (365 days). Stored server-side for security.',
            default: false
          }
        }
      },
      response: {
        200: {
          description: 'Magic link request processed (always returns success to prevent email enumeration)',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'If an account exists, a login link has been sent.' },
            data: {
              type: 'object',
              properties: {
                expiresInSeconds: { type: 'number', example: 600, description: 'Token expiry duration in seconds' }
              }
            }
          }
        },
        400: {
          description: 'Invalid request',
          ...errorResponseSchema
        }
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate input
      const validationResult = requestMagicLinkSchema.safeParse(request.body);
      if (!validationResult.success) {
        /* istanbul ignore next -- Zod always produces a non-falsy message; the || branch is unreachable */
        return sendBadRequest(reply, validationResult.error.issues[0]?.message || 'Invalid email address');
      }

      const { email, rememberDevice } = validationResult.data;

      // Get request context
      const requestContext = await getRequestContext(request);

      // Request magic link - rememberDevice is stored server-side with the token
      const result = await magicLinkService.requestMagicLink({
        email,
        ipAddress: requestContext.ip,
        userAgent: requestContext.userAgent,
        deviceFingerprint: (request.body as any)?.deviceFingerprint,
        rememberDevice // Stored server-side for security
      });

      return sendSuccess(reply, { expiresInSeconds: (result as any).expiresInSeconds }, { message: result.message });

    } catch (error) {
      logger.error('MagicLink error', error as Error);
      return sendInternalError(reply, 'An error occurred. Please try again.');
    }
  });

  // ─── La jumelle GET de la validation a été RETIRÉE (#4186) ────────────────
  //
  // `GET /auth/magic-link/validate?token=…` ouvrait une session comme la POST
  // ci-dessous, mais en moins bien, et sur deux points qui se paient chez
  // l'utilisateur :
  //
  //   1. elle n'appliquait NI `rememberDevice` NI `markSessionTrusted`, et
  //      figeait `expiresIn` à 86 400. Celui qui avait coché « se souvenir de
  //      moi » à la DEMANDE du lien — un choix conservé côté SERVEUR,
  //      justement pour qu'aucun client ne puisse le forger — se retrouvait
  //      déconnecté au bout de 24 h au lieu de 365 jours, sans rien pour le
  //      lui expliquer. Deux verbes, un seul nom, deux durées de session ;
  //   2. elle faisait voyager le jeton de connexion à USAGE UNIQUE en QUERY
  //      STRING : journalisé par tout proxy et tout serveur d'accès, gardé
  //      dans l'historique du navigateur, transmis en `Referer`.
  //
  // Aucun client ne l'appelait — mesuré sur les trois : le SDK iOS
  // (`AuthService.swift:102`), le web (`services/magic-link.service.ts:150`)
  // et Android (`AuthApi.kt:147`) font tous les trois un POST. Et le lien
  // ENVOYÉ PAR E-MAIL ne la visait pas non plus : `MagicLinkService:430`
  // compose `${FRONTEND_URL}/auth/magic-link?token=…`, une page WEB, qui
  // relaie ensuite vers la POST. Aucun lien déjà dans une boîte mail ne se
  // brise donc — c'est ce qui rend ce retrait possible sans redirection.
  //
  // Témoin d'absence : `__tests__/unit/routes/identity-twins-retired.test.ts`.

  /**
   * POST /auth/magic-link/validate
   * Alternative POST endpoint for magic link validation
   */
  fastify.post('/magic-link/validate', {
    schema: {
      description: 'Validate a magic link token and log the user in (POST alternative).',
      tags: ['auth'],
      summary: 'Validate magic link (POST)',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            description: 'Magic link token from email'
          }
          // rememberDevice is retrieved from server-side storage (set during request)
        }
      },
      response: {
        200: {
          description: 'Successful login via magic link',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                // Même défaut, même correctif (voir la route ci-dessus).
                user: userSchema,
                token: { type: 'string' },
                sessionToken: { type: 'string' },
                session: sessionSchema,
                expiresIn: { type: 'number', example: 86400 },

                // Branche « second facteur attendu » (#4534). Elle DOIT être
                // déclarée : `fast-json-stringify` retire tout champ absent du
                // schéma, et une garde dont l'annonce n'atteint aucun client
                // n'a fermé la porte que pour la murer — le compte protégé
                // resterait sans sortie. Même défaut qu'à `POST /login` avant
                // #4138 (`routes/auth/login.ts:66-77`).
                //
                // Les deux branches sont EXCLUSIVES : celle-ci ne porte ni
                // `token`, ni `sessionToken`, ni `session`, ni `expiresIn`.
                requires2FA: { type: 'boolean', description: 'True when the account carries a second factor — no access token is granted yet', example: true },
                twoFactorToken: { type: 'string', description: 'Short-lived token identifying the pending login; present it to POST /auth/login/2fa with the user code' },
                message: { type: 'string', description: 'Human-readable prompt for the second factor' }
              }
            }
          }
        },
        400: {
          description: 'Invalid or expired token',
          ...errorResponseSchema
        }
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate input
      const validationResult = validateMagicLinkSchema.safeParse(request.body);

      if (!validationResult.success) {
        /* istanbul ignore next -- Zod always produces a non-falsy message; the || branch is unreachable */
        return sendBadRequest(reply, validationResult.error.issues[0]?.message || 'Token is required');
      }

      const { token } = validationResult.data;

      // Get request context
      const requestContext = await getRequestContext(request);

      // Validate magic link
      const result = await magicLinkService.validateMagicLink({
        token,
        requestContext
      });

      if (!result.success) {
        return sendBadRequest(reply, result.error);
      }

      // Second facteur attendu : aucune session n'existe, il n'y a donc rien à
      // marquer de confiance — seulement à RETENIR (#4534). Depuis #4471 la
      // préférence est gardée par le SERVEUR entre les deux étapes, indexée
      // par l'empreinte du jeton d'étape 2 : le lien magique rejoint cette
      // mémoire sans rien faire transporter au client, donc sans qu'aucune
      // asymétrie ne puisse se rouvrir entre les deux portes de connexion.
      if (result.requires2FA) {
        await rememberPendingDeviceTrust({
          store: cacheStore,
          twoFactorToken: result.twoFactorToken,
          rememberDevice: result.rememberDevice
        });

        return sendSuccess(reply, {
          requires2FA: true,
          twoFactorToken: result.twoFactorToken,
          user: result.user,
          message: 'Veuillez entrer votre code d\'authentification à deux facteurs'
        });
      }

      // Use rememberDevice from SERVER-SIDE storage (not from client request)
      // This prevents client-side manipulation via sessionStorage
      const rememberDevice = result.rememberDevice || false;

      // If remember device is enabled, mark session as trusted (365 days)
      if (rememberDevice && result.session?.id) {
        const marked = await markSessionTrusted(result.session.id, {
          userId: result.user?.id,
          ipAddress: requestContext.ip,
          userAgent: requestContext.userAgent,
          source: 'magic_link'
        });
        if (!marked) {
          logger.warn('Échec du marquage session trusted');
        }
      }

      // Calculate expiration time
      const expiresIn = rememberDevice ? 365 * 24 * 60 * 60 : 24 * 60 * 60; // 365 days or 24 hours

      // Return success with user data
      return sendSuccess(reply, {
        user: result.user,
        token: result.token,
        sessionToken: result.sessionToken,
        session: { ...result.session, isTrusted: rememberDevice },
        expiresIn
      });

    } catch (error) {
      logger.error('MagicLink validation error', error as Error);
      return sendInternalError(reply, 'An error occurred. Please try again.');
    }
  });
}

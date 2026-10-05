import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { MagicLinkService } from '../services/MagicLinkService';
import { getCacheStore } from '../services/CacheStore';
import { EmailService } from '../services/EmailService';
import { GeoIPService, getRequestContext } from '../services/GeoIPService';
import { initSessionService, markSessionTrusted } from '../services/SessionService';
import { rememberPendingDeviceTrust } from './auth/pending-device-trust';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { sendSuccess, sendBadRequest, sendError, sendInternalError } from '../utils/response.js';
import { userSchema, sessionSchema, errorResponseSchema, pendingSessionTokenProperty } from '@meeshy/shared/types/api-schemas';
import { pendingSessionTokenFor } from '../services/auth/email-verification-watch';
import { AuthService } from '../services/AuthService';
import { LOGIN_CODE_TTL_MINUTES } from '../services/auth/email-code';
import { getJwtSecret } from '../utils/secrets';
import { deferAfterResponse } from '../utils/after-response';
import { localeDeLaRequete } from './auth/request-locale';
const logger = enhancedLogger.child({ module: 'MagicLinkRoutes' });

// Validation schemas
const requestMagicLinkSchema = z.object({
  email: z.email('Invalid email address').max(255),
  rememberDevice: z.boolean().optional().default(false), // Stored server-side for security
  /** OÙ REVENIR une fois connecté (#6742) — clampé côté SERVICE
   * (`clampMagicLinkReturnUrl`), jamais cru ici : une valeur hostile n'échoue
   * pas la requête, elle est simplement absente du lien envoyé. */
  returnUrl: z.string().max(2048).optional()
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

  // #8033 — la porte « e-mail seul » passe par la fonction UNIQUE que partage
  // `POST /auth/login` : code + lien `/auth/verify-email`, compte créé si
  // l'adresse est inconnue. Construit à la PREMIÈRE demande, jamais à
  // l'enregistrement : le secret JWT et le manager Socket.IO se résolvent à
  // l'appel, comme partout ailleurs.
  let accountService: AuthService | null = null;
  const accounts = (): AuthService => {
    accountService ??= new AuthService(fastify.prisma, getJwtSecret(), {
      resolveSocketManager: () => fastify.socketIOHandler?.getManager(),
      accountThrottle: cacheStore,
    });
    return accountService;
  };

  /**
   * POST /auth/magic-link/request
   * Request a magic link to be sent via email
   */
  fastify.post('/magic-link/request', {
    schema: {
      description: 'Email-only sign-in (#8033). Sends ONE email carrying a 6-digit code and a link to `/auth/verify-email` — to an existing account, or to an unknown address, whose account is then created without a password. Present the code or the link to POST /auth/verify-email to open the session. The response never reveals whether the account existed.',
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
          },
          returnUrl: {
            type: 'string',
            description: 'Internal path to return to after a successful login (#6742). Clamped server-side to a same-origin path; a suspect value is dropped, never trusted.',
            example: '/chat/mshy_equipe_7f3a'
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
                expiresInSeconds: { type: 'number', example: 600, description: 'Token expiry duration in seconds' },
                pendingSessionToken: pendingSessionTokenProperty
              }
            }
          }
        },
        400: {
          description: 'Invalid request',
          ...errorResponseSchema
        },
        429: {
          description:
            'Rate limited. Distinct from the 200 above: the refusal concerns the CALLER, not the existence of the address — the limiter is checked BEFORE the account lookup, so saying it enumerates nothing.',
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

      const { email } = validationResult.data;

      const requestContext = await getRequestContext(request);

      const issue = await accounts().startAccountFromEmail(
        { email, door: 'email-only', requestContext, deviceLocale: localeDeLaRequete(request) },
        { afterResponse: deferAfterResponse }
      );

      /**
       * UN REFUS DU LIMITEUR SE DIT (#6655) — 429, jamais un 200 qui ferait
       * croire qu'un e-mail est parti. Il n'énumère rien : le débit est compté
       * AVANT toute lecture du compte (`startAccountFromEmail`, porte
       * `email-only`), donc il parle de l'APPELANT.
       *
       * Tout autre cas — compte créé, compte existant, compte supprimé — rend
       * la MÊME réponse : c'est la garde anti-énumération.
       */
      if (issue.kind === 'rate-limited') {
        return sendError(reply, 429, 'Too many requests. Please try again in about an hour.', { code: 'RATE_LIMITED' });
      }

      // #8083 — le jeton d'attente de CET appareil, dans TOUS les cas servis :
      // une adresse sans compte actif en reçoit un aussi (non lié, toujours
      // `pending`), sans quoi sa présence dirait si le compte existe.
      const attente = await pendingSessionTokenFor(fastify.prisma, email);

      return sendSuccess(
        reply,
        { expiresInSeconds: LOGIN_CODE_TTL_MINUTES * 60, ...attente },
        { message: 'If an account exists, a login link has been sent.' }
      );

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

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  userSchema,
  registerRequestSchema,
  validationErrorResponseSchema,
  errorResponseSchema
} from '@meeshy/shared/types';
import { AuthSchemas, validateSchema } from '@meeshy/shared/utils/validation';
import { MeeshyError } from '@meeshy/shared/utils/errors';
import { ErrorCode } from '@meeshy/shared/types/errors';
import { RegisterData } from '../../services/AuthService';
import { getRequestContext } from '../../services/GeoIPService';
import { createRegisterRateLimiter, createAuthGlobalRateLimiter } from '../../utils/rate-limiter.js';
import { AuthRouteContext, formatUserResponse } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sendSuccess, sendError, sendBadRequest, sendInternalError } from '../../utils/response.js';
import { candidatsDePseudo } from '../directory/availability';

const logger = enhancedLogger.child({ module: 'AuthRegisterRoute' });

/**
 * Register registration and availability check routes
 */
export function registerRegistrationRoutes(context: AuthRouteContext) {
  const { fastify, authService, phoneTransferService, redis } = context;

  const registerRateLimiter = createRegisterRateLimiter(redis);
  const authGlobalRateLimiter = createAuthGlobalRateLimiter(redis);

  // POST /register - Main registration endpoint
  fastify.post('/register', {
    schema: {
      description: 'Register a new user account. An email verification will be sent to the provided email address. The user is automatically added to the global "meeshy" conversation.',
      tags: ['auth'],
      summary: 'User registration',
      body: registerRequestSchema,
      response: {
        200: {
          description: 'Account created successfully - verification email sent. When the phone number already belongs to another account, NO account is created and the response carries `phoneOwnershipConflict` instead, so the client can offer a transfer.',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              // Comme `POST /login`, cette route sert DEUX charges utiles sous
              // le même 200 et n'en déclarait qu'une. Les trois clés du conflit
              // de numéro étaient donc retirées à la sérialisation : `data`
              // partait vide, et le client (`use-registration-submit.ts`, qui
              // branche sur `data.data.phoneOwnershipConflict`) retombait sur un
              // « Registration failed » générique. La modale de transfert de
              // numéro ne s'ouvrait jamais.
              properties: {
                // Branche « compte créé »
                user: userSchema,
                token: { type: 'string', description: 'JWT access token for API authentication (absent on a phone-ownership conflict)' },
                expiresIn: { type: 'number', description: 'Token expiration time in seconds', example: 86400 },

                // Branche « numéro déjà détenu » — aucun compte n'a été créé
                phoneOwnershipConflict: { type: 'boolean', description: 'True when the phone number belongs to another account; no account was created', example: true },
                phoneOwnerInfo: {
                  type: 'object',
                  description: 'Masked identity of the current owner, to be shown in the transfer prompt',
                  properties: {
                    maskedDisplayName: { type: 'string' },
                    maskedUsername: { type: 'string' },
                    maskedEmail: { type: 'string' },
                    avatar: { type: 'string', nullable: true },
                    phoneNumber: { type: 'string' },
                    phoneCountryCode: { type: 'string' }
                  }
                },
                pendingRegistration: {
                  type: 'object',
                  // `password` n'est PAS déclaré, et n'est plus envoyé : le
                  // secret n'a aucune raison de faire l'aller-retour. Les deux
                  // reprises côté client réémettent depuis leur propre
                  // `formData`, jamais depuis cet écho.
                  description: 'Echo of the submitted profile so the client can resume registration after resolving the conflict — never carries the password',
                  properties: {
                    username: { type: 'string' },
                    email: { type: 'string' },
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    systemLanguage: { type: 'string' },
                    regionalLanguage: { type: 'string' }
                  }
                }
              }
            }
          }
        },
        400: validationErrorResponseSchema,
        429: {
          description: 'Too many registration attempts',
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            retryAfter: { type: 'number' },
          }
        },
        500: errorResponseSchema
      },
      security: []
    },
    preHandler: [registerRateLimiter.middleware(), authGlobalRateLimiter.middleware()]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(AuthSchemas.register, request.body, 'register') as RegisterData & {
        phoneTransferToken?: string;
        skipPhoneConflictCheck?: boolean;
      };

      const requestContext = await getRequestContext(request);

      // Check if phoneTransferToken is provided
      let phoneTransferValidated = false;
      if (validatedData.phoneTransferToken) {
        logger.info('Phone transfer token provided — validating');
        const transferData = await phoneTransferService.getTransferDataByToken(validatedData.phoneTransferToken);

        if (!transferData.valid) {
          return sendBadRequest(reply, 'Token de transfert invalide ou expiré', { code: 'INVALID_TRANSFER_TOKEN' });
        }

        logger.info('Phone transfer token valid');
        phoneTransferValidated = true;
        validatedData.skipPhoneConflictCheck = true;
      }

      const result = await authService.register(validatedData as RegisterData, requestContext);

      if (!result) {
        return sendBadRequest(reply, 'Erreur lors de la création du compte');
      }

      // Handle phone ownership conflict
      if (result.phoneOwnershipConflict && result.phoneOwnerInfo) {
        logger.warn('Phone ownership conflict — account NOT created');
        return sendSuccess(reply, {
          phoneOwnershipConflict: true,
          phoneOwnerInfo: {
            maskedDisplayName: result.phoneOwnerInfo.maskedDisplayName,
            maskedUsername: result.phoneOwnerInfo.maskedUsername,
            maskedEmail: result.phoneOwnerInfo.maskedEmail,
            avatar: result.phoneOwnerInfo.avatar,
            phoneNumber: result.phoneOwnerInfo.phoneNumber,
            phoneCountryCode: result.phoneOwnerInfo.phoneCountryCode
          },
          // Le mot de passe EN CLAIR figurait ici. Il ne sortait pas — le
          // schéma 200 ne déclarait aucune de ces clés et les retirait toutes —
          // si bien que déclarer la branche du conflit, sans plus, aurait
          // OUVERT un aller-retour du secret. Le client n'en a pas besoin : ses
          // deux reprises (`handleContinueWithoutPhone`, `handlePhoneTransferred`)
          // réémettent depuis `...formData`, son propre état. Retiré à la
          // SOURCE plutôt que laissé au sérialiseur : compter sur une omission
          // de schéma pour retenir un secret, c'est le piège armé du cycle 84.
          pendingRegistration: {
            username: validatedData.username,
            email: validatedData.email,
            firstName: validatedData.firstName,
            lastName: validatedData.lastName,
            systemLanguage: validatedData.systemLanguage,
            regionalLanguage: validatedData.regionalLanguage
          }
        });
      }

      const { user } = result;

      if (!user) {
        return sendBadRequest(reply, 'Erreur lors de la création du compte');
      }

      // Execute phone transfer if validated
      if (phoneTransferValidated && validatedData.phoneTransferToken) {
        logger.info('Executing phone transfer for new user');
        const transferResult = await phoneTransferService.executeRegistrationTransfer(
          validatedData.phoneTransferToken,
          user.id,
          requestContext.ip || 'unknown'
        );

        if (!transferResult.success) {
          logger.error('Phone transfer failed', { error: transferResult.error });
        } else {
          logger.info('Phone transfer completed successfully');
        }
      }

      const token = authService.generateToken(user);
      const permissions = authService.getUserPermissions(user);

      return sendSuccess(reply, {
        user: formatUserResponse(user, permissions),
        token,
        expiresIn: 24 * 60 * 60
      });

    } catch (error) {
      if (error instanceof MeeshyError && error.code === ErrorCode.VALIDATION_ERROR) {
        const violations = Array.isArray(error.details?.errors) ? error.details.errors : [];
        const fieldSummary = violations
          .map((v) => `${(v as { path?: string }).path}: ${(v as { message?: string }).message}`)
          .join(' — ');

        logger.warn('Registration payload rejected by validation', { violations });

        return sendError(reply, 400, fieldSummary ? `Données invalides — ${fieldSummary}` : 'Données invalides', {
          code: 'VALIDATION_ERROR',
          violations
        });
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('Registration error', error as Error);

      // Erreurs de validation connues
      if (errorMessage.includes('déjà utilisé') || errorMessage.includes('already exists')) {
        return sendBadRequest(reply, errorMessage, { code: 'DUPLICATE_FIELD' });
      }

      if (errorMessage.includes('Email invalide') || errorMessage.includes('Format d\'email')) {
        return sendBadRequest(reply, errorMessage, { code: 'INVALID_EMAIL' });
      }

      if (errorMessage.includes('mot de passe') || errorMessage.includes('password')) {
        return sendBadRequest(reply, errorMessage, { code: 'INVALID_PASSWORD' });
      }

      if (errorMessage.includes('username') || errorMessage.includes('utilisateur')) {
        return sendBadRequest(reply, errorMessage, { code: 'INVALID_USERNAME' });
      }

      // Erreur générique avec détails en dev
      const isDev = process.env.NODE_ENV !== 'production';
      sendError(reply, 500, isDev ? errorMessage : 'Erreur lors de la création du compte', { code: 'REGISTRATION_ERROR' });
    }
  });

  // GET /check-availability - Check username/email/phone availability
  // ALIAS rétro-compatible vers `GET /directory/availability` (#4158).
  //
  // Ce que l'ancienne route faisait, et qui ne peut pas être conservé : elle
  // confirmait **sans compte** qu'un pseudo, une adresse OU un numéro
  // appartient à un utilisateur Meeshy — pendant que `/forgot-password` et
  // `/magic-link/request` répondent délibérément « succès » dans tous les cas
  // pour ne rien révéler. La même plateforme appliquait deux doctrines opposées
  // à la même question.
  //
  // C'est la SEULE bascule de ce lot qui change une réponse et pas seulement
  // une adresse, et le coût est nommé : le formulaire d'inscription ne peut
  // plus dire « vous avez déjà un compte » avant la soumission. C'est la
  // soumission qui le dit. Coût réel côté web : NUL — la branche qui affichait
  // cet avertissement (`use-registration-validation.ts:94`) lit
  // `data.data.accountInfo`, un champ que le gateway n'émet nulle part.
  //
  // `usernameAvailable` et `suggestions` restent servis à l'identique : un
  // pseudo est une clé publique, déjà énumérable par `GET /u/:username`.
  // `emailAvailable` et `phoneNumberAvailable` deviennent des verdicts de
  // FORME, ce que porte `phoneNumberValid` — déjà présent dans l'ancienne
  // réponse.
  fastify.get('/check-availability', {
    schema: {
      deprecated: true,
      description:
        'DEPRECATED — use GET /directory/availability. Email and phone no longer reveal whether an account exists (#4158).',
      tags: ['auth'],
      querystring: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          phoneNumber: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                usernameAvailable: { type: 'boolean' },
                suggestions: { type: 'array', items: { type: 'string' } },
                // Verdicts de FORME. Ils ne disent plus l'existence.
                emailValid: { type: 'boolean' },
                phoneNumberValid: { type: 'boolean' },
                phoneNumberE164: { type: 'string', nullable: true }
              }
            }
          }
        },
        400: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { username, email, phoneNumber } = request.query as {
      username?: string;
      email?: string;
      phoneNumber?: string;
    };

    if (!username && !email && !phoneNumber) {
      return sendBadRequest(reply, 'Username, email ou numéro de téléphone requis');
    }

    try {
      const result: Record<string, unknown> = {};

      if (username) {
        const demande = username.trim();
        const pris = await fastify.prisma.user.findFirst({
          where: { username: { equals: demande, mode: 'insensitive' } },
          select: { id: true }
        });
        result.usernameAvailable = !pris;

        if (pris) {
          const candidats = candidatsDePseudo(demande);
          const dejaPris = await fastify.prisma.user.findMany({
            where: { username: { in: candidats, mode: 'insensitive' } },
            select: { username: true }
          });
          const occupes = new Set(
            (dejaPris as Array<{ username: string }>).map((u) => u.username.toLowerCase())
          );
          result.suggestions = candidats.filter((c) => !occupes.has(c.toLowerCase())).slice(0, 3);
        }
      }

      if (email) {
        result.emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim());
      }

      if (phoneNumber) {
        const requestContext = await getRequestContext(request);
        const defaultCountry = requestContext?.geoData?.country || 'FR';
        const { normalizePhoneWithCountry } = await import('../../utils/normalize');
        const normalise = normalizePhoneWithCountry(phoneNumber, defaultCountry);
        result.phoneNumberValid = Boolean(normalise && normalise.isValid);
        result.phoneNumberE164 = normalise && normalise.isValid ? normalise.phoneNumber : null;
      }

      return sendSuccess(reply, result);
    } catch (error) {
      logger.error('Error checking availability', error as Error);
      return sendInternalError(reply, 'Erreur lors de la vérification');
    }
  });

  // `POST /force-init` a été retirée.
  //
  // Elle était publique et déclenchait `InitService.initializeDatabase()`, qui
  // crée un compte BIGBOSS dont le mot de passe retombe sur une valeur écrite
  // dans le code source quand la variable d'environnement n'est pas posée.
  // N'importe qui pouvait donc s'octroyer — ou réactiver — un compte de plus
  // haut privilège dont le mot de passe est public, sur un service joignable
  // depuis l'Internet.
  //
  // Rien n'est perdu : `initializeDatabase()` s'exécute déjà à chaque démarrage
  // du serveur (`server.ts`), et aucun appelant de cette route n'existait dans
  // le dépôt. Un redémarrage fait exactement le même travail.
}

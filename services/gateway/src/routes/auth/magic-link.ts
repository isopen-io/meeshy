import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  userSchema,
  errorResponseSchema,
  sessionsListResponseSchema,
  refreshTokenRequestSchema,
  verifyEmailRequestSchema,
  resendVerificationRequestSchema,
  sendPhoneCodeRequestSchema,
  verifyPhoneRequestSchema
} from '@meeshy/shared/types';
import { AuthSchemas, validateSchema } from '@meeshy/shared/utils/validation';
import { createUnifiedAuthMiddleware, findTrustedSession, UnifiedAuthRequest} from '../../middleware/auth';
import { AuthRouteContext, formatUserResponse } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendNotFound, sendInternalError } from '../../utils/response';
import { disconnectSession } from '../../socketio/disconnectSession';
import { hashSessionToken } from '../../utils/session-token';
import {
  legacyTokenRefusal,
  type SessionBoundTokenPayload,
} from '../../services/auth/session-jwt';
import { depreciee, dateDeRetrait } from '../../utils/deprecation';
import { handleGetMe, meRouteSharedOptions } from '../me/get-me';

// Logger dédié pour magic-link
const logger = enhancedLogger.child({ module: 'magic-link' });

/**
 * L'ALIAS déprécié de la lecture de soi (#4178, critère 3).
 *
 * `depuis` est le jour où `GET /api/v1/me` est devenue l'adresse cible ;
 * `retraitLe` en dérive par la fenêtre par défaut de 180 jours
 * (`identity.md` § « Ordre des étapes », point 5 — `dateDeRetrait`). Le
 * retrait RÉEL reste gouverné par le compteur d'accès par route
 * (`ROUTES_SURVEILLEES`, `services/route-usage.service.ts`, qui surveille
 * déjà `GET /api/v1/auth/me` sous ce numéro d'issue) — cette date INFORME,
 * elle ne décide pas (`utils/deprecation.ts`, § « Pourquoi `Sunset` est
 * OPTIONNEL »).
 *
 * L'issue #4178 (critère 3) écrit « `Deprecation: true` » : c'est la forme du
 * brouillon RFC de 2019, PAS celle que `utils/deprecation.ts` sert — le
 * fichier documente explicitement avoir corrigé cette attribution
 * (RFC 9745, `Deprecation: @<epoch>`, une date structurée plutôt qu'un
 * booléen sans information). Suivre l'énoncé de l'issue à la lettre aurait
 * réécrit une deuxième forme de l'en-tête à côté de celle déjà choisie pour
 * les quinze autres alias du dépôt (#4154, #4155, #4161, #4164) — la
 * divergence exacte que ce site unique existe pour fermer.
 */
const ALIAS_LECTURE_DE_SOI = {
  depuis: '2026-08-29',
  successeur: '/api/v1/me',
  retraitLe: dateDeRetrait('2026-08-29'),
} as const;

/**
 * Register magic link, email/phone verification, session management, and /me routes
 */
export function registerMagicLinkRoutes(context: AuthRouteContext) {
  const { fastify, authService } = context;

  // GET /me — ALIAS de GET /api/v1/me (#4178). Le calcul est PARTAGÉ
  // (`handleGetMe`, `routes/me/get-me.ts`) : aucune réponse propre à cette
  // adresse, seulement l'annonce de dépréciation en plus.
  //
  // `allowAnonymous: true` CORRIGE un défaut préexistant, pas seulement une
  // unification : l'ancien montage (`{ requireAuth: true }` sans
  // `allowAnonymous`) faisait REFUSER en 403, par `createUnifiedAuthMiddleware`
  // lui-même, tout porteur de `X-Session-Token` — avant d'atteindre le
  // handler. La branche anonyme du handler ci-dessous existait et était
  // TESTÉE, mais la suite mockait `createUnifiedAuthMiddleware` et injectait
  // `authContext` directement : elle ne pouvait pas voir que la vraie garde
  // ne laissait jamais passer cette branche en production. C'est exactement
  // le témoin que le critère 6 de #4178 demande : « au rang JWT, une route
  // régressée vers "authentifié seulement" rendrait le même verdict qu'une
  // route juste » — sauf qu'ici la régression précédait le correctif.
  fastify.get('/me', {
    ...meRouteSharedOptions,
    onRequest: depreciee(ALIAS_LECTURE_DE_SOI),
    preValidation: [createUnifiedAuthMiddleware(fastify.prisma, { requireAuth: true, allowAnonymous: true })],
  }, handleGetMe);

  // POST /refresh - Refresh JWT token
  fastify.post('/refresh', {
    schema: {
      description: 'Refresh an existing JWT token to get a new one. Supports indefinite session renewal: passing a long-lived sessionToken (returned by /auth/login) lets the server issue a fresh JWT even when the current one is expired, and slides the session expiration forward (sliding window).',
      tags: ['auth'],
      summary: 'Refresh token',
      body: refreshTokenRequestSchema,
      response: {
        200: {
          description: 'Token refreshed successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                user: userSchema,
                token: { type: 'string', description: 'New JWT token' },
                sessionToken: { type: 'string', description: 'Same session token (rotated forward in TTL)' },
                expiresIn: { type: 'number', description: 'JWT expiration in seconds' }
              }
            }
          }
        },
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(AuthSchemas.refreshToken, request.body, 'refresh');
      const { token, sessionToken } = validatedData;

      // Try to decode the JWT — accept expired tokens (ignoreExpiration) so that
      // the client can rotate a valid-but-stale JWT without a sessionToken round-trip.
      // If the signature itself is invalid (tampered), jwt.verify will still throw.
      let decoded: Partial<SessionBoundTokenPayload> | null = null;
      // Signature réellement vérifiée, ou simple lecture du contenu ? La
      // distinction est TOUT : `jwt.decode` ne vérifie rien, il désérialise.
      // Sans ce drapeau, un jeton forgé avec une signature quelconque suffisait
      // à obtenir un JWT valide signé par le serveur pour le compte visé — la
      // garde en aval ne testait que la PRÉSENCE de `userId`.
      let signatureVerified = false;
      try {
        decoded = jwt.verify(token, authService['jwtSecret'], { ignoreExpiration: true }) as Partial<SessionBoundTokenPayload>;
        signatureVerified = true;
      } catch {
        // Signature invalide : le contenu n'est plus qu'une prétention.
        // task-1-fix-round-6 — AVANT (round 5) : ce contenu non vérifié
        // pouvait encore être rattrapé plus bas par une session de confiance
        // trouvée pour ce `userId`. Le propriétaire a explicitement écarté ce
        // mélange de DEUX FORMES de justificatif (« une forme de connexion à
        // la fois ») : une signature invalide est désormais refusée sans
        // AUCUN recours, qu'une session de confiance existe ou non. On décode
        // quand même pour distinguer « aucun userId du tout » (401 générique
        // ci-dessous) d'une signature invalide (401 explicite juste après).
        decoded = jwt.decode(token) as Partial<SessionBoundTokenPayload> | null;
      }

      if (!decoded?.userId) {
        return sendUnauthorized(reply, 'Token invalide ou expiré');
      }

      if (!signatureVerified) {
        logger.warn('Refus de refresh : signature invalide — aucun rattrapage par session (round 6)', {
          claimedUserId: decoded.userId
        });
        return sendUnauthorized(reply, 'Token invalide ou expiré');
      }

      // À partir d'ici, la signature est AUTHENTIQUE — éventuellement
      // expirée, ce qui est la raison d'être de cette route
      // (`ignoreExpiration` ci-dessus). C'est la SEULE forme acceptée :
      // `activeSession`, si une session de confiance existe pour ce même
      // utilisateur, ne fait plus que glisser sa fenêtre d'expiration
      // (sliding window) plus bas — elle ne décide plus jamais de
      // l'authentification elle-même, et ne discrimine plus par application
      // (task-1-fix-round-6 retire la règle du round 5 : être connecté
      // depuis plusieurs applications à la fois est légitime).
      let activeSession: { id: string } | null = null;

      if (sessionToken) {
        const session = await findTrustedSession(context.prisma, {
          userId: decoded.userId,
          sessionToken,
        });
        if (session) {
          activeSession = session;
          logger.info('Session de confiance retrouvée pour glisser sa fenêtre d\'expiration', { userId: decoded.userId });
        }
      }

      // La RÉVOCATION doit atteindre cette route (#4213), et elle doit
      // atteindre LA session révoquée, pas seulement le compte vidé (#4264).
      //
      // Jusqu'à #4213, un JWT authentique mais EXPIRÉ suffisait à obtenir un
      // JWT neuf, sans jeton de session ni consultation d'aucune liste de
      // révocation : couper les sockets ne servait à rien, le porteur d'un
      // jeton volé se reconnectait dans la seconde.
      //
      // #4213 ne pouvait garder que l'EXISTENCE d'une session valide pour le
      // compte, faute de pouvoir dire de QUELLE session ce jeton provenait —
      // sa charge ne portait que `userId`, `username`, `role`. Révoquer UNE
      // session laissait donc le jeton volé passer tant que son propriétaire
      // restait connecté ailleurs, ce qui est le cas NOMINAL : on révoque une
      // session tierce depuis un appareil qu'on garde.
      //
      // Le claim `sid` (voir `services/auth/session-jwt.ts`) permet enfin de
      // NOMMER au lieu de compter. Deux régimes, et un seul est permanent :
      const sid = decoded.sid;

      if (sid) {
        // Régime NOMINAL — le jeton dit sa session ; c'est celle-là, et aucune
        // autre, qui décide. `userId` est dans le `where` : sans lui, un `sid`
        // valide appartenant à un AUTRE compte suffirait à passer la garde.
        //
        // Le filtre s'arrête à `isValid`, comme la règle de compte qu'il
        // remplace : y ajouter `expiresAt` resserrerait au-delà de l'issue et
        // déconnecterait des porteurs que #4213 laissait passer. Ce
        // durcissement se mesure à part.
        const sessionNommee = await context.prisma.userSession.findFirst({
          where: { id: sid, userId: decoded.userId, isValid: true },
          select: { id: true },
        });

        if (!sessionNommee) {
          logger.warn('Refus de refresh : la session nommée par le jeton n\'est plus valide', {
            userId: decoded.userId,
            sid,
          });
          return sendUnauthorized(reply, 'Session révoquée — veuillez vous reconnecter');
        }
      } else {
        // Régime de TRANSITION — un jeton émis avant #4264 ne nomme rien.
        //
        // Le refuser d'emblée déconnecterait tout le parc installé pour fermer
        // un cas étroit : c'est le compromis que #4213 avait déjà écarté. Mais
        // cette route vérifie avec `{ ignoreExpiration: true }` — sa raison
        // d'être — si bien qu'un tel jeton resterait rafraîchissable
        // INDÉFINIMENT : « jusqu'à son expiration naturelle » est faux ici,
        // puisque l'expiration est précisément ignorée. Sans butoir, le repli
        // devient permanent et la garde ci-dessus n'atteint jamais personne.
        //
        // Le butoir est daté et double (âge du jeton + fermeture de la
        // fenêtre) — voir `legacyTokenRefusal`, qui porte le raisonnement.
        const refus = legacyTokenRefusal(decoded, new Date());

        if (refus) {
          logger.warn('Refus de refresh : jeton hérité hors de la fenêtre de transition (#4264)', {
            userId: decoded.userId,
            motif: refus,
          });
          return sendUnauthorized(reply, 'Session révoquée — veuillez vous reconnecter');
        }

        // Dans la fenêtre, la règle de #4213 s'applique telle quelle.
        const sessionsValides = await context.prisma.userSession.count({
          where: { userId: decoded.userId, isValid: true },
        });

        if (sessionsValides === 0) {
          logger.warn('Refus de refresh : aucune session valide — toutes révoquées', {
            userId: decoded.userId,
          });
          return sendUnauthorized(reply, 'Session révoquée — veuillez vous reconnecter');
        }
      }

      const user = await authService.getUserById(decoded.userId);

      if (!user) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      // Le jeton renouvelé garde le nom de SA session (#4264, critère 1 :
      // « `refresh` lui-même »). Pour un jeton hérité, la session de confiance
      // présentée sert de porte de sortie de la fenêtre de transition : le
      // client bascule silencieusement sur un jeton nommé dès qu'il envoie son
      // `sessionToken`. S'il n'en envoie aucun, le jeton reste anonyme et le
      // butoir daté reste sa seule échéance — il ne se ré-arme pas, la
      // fermeture de fenêtre ne dépendant pas du jeton.
      const newToken = authService.generateToken(user, sid ?? activeSession?.id);

      // Sliding window: extend the trusted session another full cycle on every
      // successful refresh and bump lastActiveAt. As long as the user opens the
      // app at least once per session lifetime (365d for mobile), the session
      // never expires — the same sessionToken stays valid indefinitely.
      if (activeSession) {
        const now = new Date();
        const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
        const nextExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
        await context.prisma.userSession.update({
          where: { id: activeSession.id },
          data: {
            expiresAt: nextExpiresAt,
            // P7-3 : le champ du modèle UserSession est `lastActivityAt` —
            // `lastActiveAt` (champ du modèle User) levait
            // PrismaClientValidationError sur CHAQUE refresh, avalée par le
            // .catch ci-dessous → le sliding window n'a jamais fonctionné.
            lastActivityAt: now
          }
        }).catch((err: unknown) => {
          logger.warn('Failed to slide session expiresAt on refresh', { err });
        });
      }

      const permissions = authService.getUserPermissions(user as any);

      sendSuccess(reply, {
        user: formatUserResponse(user, permissions),
        token: newToken,
        sessionToken: sessionToken ?? undefined,
        expiresIn: 24 * 60 * 60
      });

    } catch (error) {
      logger.error('Error in /auth/refresh', error);
      sendInternalError(reply, 'Erreur lors du rafraîchissement du token');
    }
  });

  // POST /verify-email - Verify email with token
  fastify.post('/verify-email', {
    schema: {
      description: 'Verify user email address with a token sent via email',
      tags: ['auth'],
      summary: 'Verify email',
      body: verifyEmailRequestSchema,
      response: {
        200: {
          description: 'Email verified successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                alreadyVerified: { type: 'boolean' },
                verifiedAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        400: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(AuthSchemas.verifyEmail, request.body, 'verify-email');
      const { token, code, email } = validatedData;

      logger.info(`[AUTH] Tentative de vérification email pour email=${email} (method=${code ? 'code' : 'token'})`);

      const result = code
        ? await authService.verifyEmail(code, email, true)
        : await authService.verifyEmail(token!, email, false);

      if (!result.success) {
        logger.warn(`[AUTH] ❌ Échec de vérification email result.error=${result.error}`);
        return sendBadRequest(reply, result.error as string);
      }

      if (result.alreadyVerified && result.verifiedAt) {
        logger.info(`[AUTH] ℹ️ Email déjà vérifié pour email=${email} le result.verifiedAt.toISOString()=${result.verifiedAt.toISOString()}`);
        return sendSuccess(reply, {
          message: 'Votre adresse email est déjà vérifiée.',
          alreadyVerified: true,
          verifiedAt: result.verifiedAt.toISOString()
        });
      }

      logger.info(`[AUTH] ✅ Email vérifié avec succès pour email=${email}`);

      return sendSuccess(reply, {
        message: 'Votre adresse email a été vérifiée avec succès !',
        alreadyVerified: false,
        verifiedAt: result.verifiedAt?.toISOString()
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur lors de la vérification email', error);
      return sendInternalError(reply, 'Erreur lors de la vérification');
    }
  });

  // POST /resend-verification - Resend email verification
  fastify.post('/resend-verification', {
    schema: {
      description: 'Resend email verification link to user',
      tags: ['auth'],
      summary: 'Resend verification email',
      body: resendVerificationRequestSchema,
      response: {
        200: {
          description: 'Verification email sent (if account exists)',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: { message: { type: 'string' } } }
          }
        },
        400: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(AuthSchemas.resendVerification, request.body, 'resend-verification');
      const { email } = validatedData;

      logger.info(`[AUTH] Demande de renvoi de vérification pour email=${email}`);

      const result = await authService.resendVerificationEmail(email);

      if (!result.success) {
        if (result.error?.includes('déjà vérifiée')) {
          return sendBadRequest(reply, result.error);
        }
      }

      logger.info('[AUTH] ✅ Email de vérification envoyé (si compte existe)');

      return sendSuccess(reply, { message: 'Si un compte existe avec cette adresse email, un email de vérification a été envoyé.' });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur lors du renvoi de vérification', error);
      return sendInternalError(reply, 'Erreur lors de l\'envoi de l\'email');
    }
  });

  // POST /send-phone-code - Send SMS verification code
  fastify.post('/send-phone-code', {
    schema: {
      description: 'Send SMS verification code to phone number',
      tags: ['auth'],
      summary: 'Send phone verification code',
      body: sendPhoneCodeRequestSchema,
      response: {
        200: {
          description: 'SMS code sent successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: { message: { type: 'string' } } }
          }
        },
        400: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(AuthSchemas.sendPhoneCode, request.body, 'send-phone-code');
      const { phoneNumber } = validatedData;

      logger.info(`[AUTH] Envoi code SMS pour phoneNumber=${phoneNumber}`);

      const result = await authService.sendPhoneVerificationCode(phoneNumber);

      if (!result.success) {
        logger.warn(`[AUTH] ❌ Échec envoi code SMS result.error=${result.error}`);
        return sendBadRequest(reply, result.error as string);
      }

      logger.info('[AUTH] ✅ Code SMS envoyé');

      return sendSuccess(reply, { message: 'Code de vérification envoyé par SMS.' });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur envoi code SMS', error);
      return sendInternalError(reply, 'Erreur lors de l\'envoi du code');
    }
  });

  // POST /verify-phone - Verify phone number with SMS code
  fastify.post('/verify-phone', {
    schema: {
      description: 'Verify phone number with SMS code',
      tags: ['auth'],
      summary: 'Verify phone number',
      body: verifyPhoneRequestSchema,
      response: {
        200: {
          description: 'Phone number verified successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: { message: { type: 'string' } } }
          }
        },
        400: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(AuthSchemas.verifyPhone, request.body, 'verify-phone');
      const { phoneNumber, code } = validatedData;

      logger.info(`[AUTH] Vérification téléphone phoneNumber=${phoneNumber}`);

      const result = await authService.verifyPhone(phoneNumber, code);

      if (!result.success) {
        logger.warn(`[AUTH] ❌ Échec vérification téléphone result.error=${result.error}`);
        return sendBadRequest(reply, result.error as string);
      }

      logger.info('[AUTH] ✅ Téléphone vérifié');

      return sendSuccess(reply, { message: 'Numéro de téléphone vérifié avec succès !' });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur vérification téléphone', error);
      return sendInternalError(reply, 'Erreur lors de la vérification');
    }
  });

  // GET /sessions - List all active sessions
  fastify.get('/sessions', {
    schema: {
      description: 'List all active sessions for the authenticated user',
      tags: ['auth', 'sessions'],
      summary: 'Get active sessions',
      headers: {
        type: 'object',
        properties: {
          'x-session-token': { type: 'string', description: 'Current session token (optional, to mark current session)' }
        }
      },
      response: {
        200: sessionsListResponseSchema,
        401: errorResponseSchema
      }
    },
    preValidation: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user!.userId;
      const currentToken = request.headers['x-session-token'] as string | undefined;

      logger.info(`[AUTH] Récupération des sessions pour: ${userId}`);

      const sessions = await authService.getUserActiveSessions(userId, currentToken);

      return sendSuccess(reply, {
        sessions: sessions.map(session => ({
          id: session.id,
          deviceType: session.deviceType,
          deviceVendor: session.deviceVendor,
          deviceModel: session.deviceModel,
          osName: session.osName,
          osVersion: session.osVersion,
          browserName: session.browserName,
          browserVersion: session.browserVersion,
          isMobile: session.isMobile,
          ipAddress: session.ipAddress,
          country: session.country,
          city: session.city,
          location: session.location,
          createdAt: session.createdAt,
          lastActivityAt: session.lastActivityAt,
          isCurrentSession: session.isCurrentSession,
          isTrusted: session.isTrusted
        })),
        totalCount: sessions.length
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur récupération sessions', error);
      return sendInternalError(reply, 'Erreur lors de la récupération des sessions');
    }
  });

  // DELETE /sessions/:sessionId - Revoke specific session
  fastify.delete('/sessions/:sessionId', {
    schema: {
      description: 'Revoke a specific session (log out from a specific device)',
      tags: ['auth', 'sessions'],
      summary: 'Revoke a session',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string', description: 'Session ID to revoke' }
        }
      },
      response: {
        200: {
          description: 'Session revoked successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' }
              }
            }
          }
        },
        404: {
          description: 'Session not found',
          ...errorResponseSchema
        }
      }
    },
    preValidation: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user!.userId;
      const { sessionId } = request.params as { sessionId: string };

      logger.info(`[AUTH] Révocation session:', sessionId, 'pour user userId=${userId}`);

      const sessions = await authService.getUserActiveSessions(userId);
      const sessionBelongsToUser = sessions.some(s => s.id === sessionId);

      if (!sessionBelongsToUser) {
        return sendNotFound(reply, 'Session non trouvée');
      }

      const revoked = await authService.revokeSession(sessionId);

      if (!revoked) {
        return sendNotFound(reply, 'Impossible de révoquer cette session');
      }

      // Le socket de CET appareil, et lui seul (#4213).
      //
      // Jusqu'ici, révoquer une session passait la ligne à `isValid: false` et
      // l'appareil continuait de TOUT recevoir — `message:new`,
      // `conversation:updated` — indéfiniment : un socket n'est authentifié
      // qu'une fois, au connect, et jamais revérifié.
      //
      // `disconnectRevokedSessions` était le mauvais outil ici : elle coupe
      // TOUS les sockets de l'utilisateur, donc aussi celui depuis lequel on
      // fait le ménage. `disconnectSession` filtre sur l'identifiant de session
      // rangé au handshake.
      await disconnectSession({
        io: fastify.socketIOHandler?.getManager?.()?.getIO(),
        userId,
        sessionId,
        onError: (error) => fastify.log.warn({ err: error }, '[AUTH] socket cut failed on session revoke'),
      });

      logger.info(`[AUTH] ✅ Session révoquée sessionId=${sessionId}`);

      return sendSuccess(reply, { message: 'Session révoquée avec succès' });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur révocation session', error);
      return sendInternalError(reply, 'Erreur lors de la révocation de la session');
    }
  });

  // DELETE /sessions - Revoke all sessions except current
  fastify.delete('/sessions', {
    schema: {
      description: 'Revoke all sessions except the current one (log out from all other devices)',
      tags: ['auth', 'sessions'],
      summary: 'Revoke all other sessions',
      headers: {
        type: 'object',
        properties: {
          'x-session-token': { type: 'string', description: 'Current session token to keep active' }
        }
      },
      response: {
        200: {
          description: 'Sessions revoked successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                revokedCount: { type: 'number' }
              }
            }
          }
        }
      }
    },
    preValidation: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user!.userId;
      const currentToken = request.headers['x-session-token'] as string | undefined;

      logger.info(`Révocation de toutes les sessions pour userId=${userId} (sauf courante)`);

      // Les identifiants sont relevés AVANT la révocation (#4213) : après, la
      // ligne n'est plus « active » et la liste ne la rend plus. Sans eux, on
      // saurait combien de sessions ont été coupées et aucune ne saurait
      // laquelle — donc aucun socket ne pourrait être fermé.
      const courante = currentToken
        ? await fastify.prisma.userSession.findFirst({
            where: { userId, sessionToken: hashSessionToken(currentToken) },
            select: { id: true },
          })
        : null;

      const aCouper = (await authService.getUserActiveSessions(userId))
        .map((session) => session.id)
        .filter((id) => id !== courante?.id);

      const revokedCount = await authService.revokeAllSessionsExceptCurrent(userId, currentToken);

        logger.info(`Sessions révoquées count=${revokedCount}`);

      // Chaque session révoquée voit SON socket coupé — jamais celui de
      // l'appareil courant, qui est précisément celui depuis lequel on fait le
      // ménage. `disconnectRevokedSessions` les couperait tous, y compris lui.
      const io = fastify.socketIOHandler?.getManager?.()?.getIO();
      for (const sessionId of aCouper) {
        await disconnectSession({
          io,
          userId,
          sessionId,
          message: 'This device was signed out from another device.',
          onError: (error) => fastify.log.warn({ err: error }, '[AUTH] socket cut failed on revoke-others'),
        });
      }

      return sendSuccess(reply, {
        message: `${revokedCount} session(s) révoquée(s) avec succès`,
        revokedCount
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur révocation sessions', error);
      return sendInternalError(reply, 'Erreur lors de la révocation des sessions');
    }
  });

  // ─── POST /validate-session a été RETIRÉE (#4186) ───
  // Un oracle pur, sans débit et sans appelant sur les trois clients (mesuré :
  // zéro occurrence de `validate-session` hors gateway, iOS/SDK, web et Android
  // compris). Elle rendait la session ENTIÈRE — appareil, navigateur, OS,
  // LOCALISATION — à un appelant sans `Authorization`, sur simple présentation
  // d'un sessionToken. Ce que la validité d'une session doit produire, c'est un
  // ACTE (une lecture, une écriture) qui échoue en 401 ; pas un verdict servi à
  // qui le demande.
  // Témoin d'absence : `__tests__/unit/routes/identity-twins-retired.test.ts`.
}

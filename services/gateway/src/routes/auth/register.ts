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
import type { RegisterData } from '../../services/AuthService';
import { getRequestContext, lookupGeoIp, isPrivateIp } from '../../services/GeoIPService';
import { createSession, generateSessionToken } from '../../services/SessionService';
import { isRegistrationRefusal } from '../../services/auth/registration-refusal';
import { createRegisterRateLimiter, createAuthGlobalRateLimiter, type RateLimiter } from '../../utils/rate-limiter.js';
import { deferAfterResponse, type AfterResponse } from '../../utils/after-response';
import { preferredAcceptLanguage } from '../../utils/accept-language';
import { depreciee } from '../../utils/deprecation';
import { AuthRouteContext, formatUserResponse } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sendSuccess, sendError, sendBadRequest, sendInternalError } from '../../utils/response.js';
import { candidatsDePseudo } from '../../utils/username-candidates';
import { apiPath } from '@meeshy/shared/api/prefix';

const logger = enhancedLogger.child({ module: 'AuthRegisterRoute' });

/**
 * Combien de temps l'inscription attend le tiers de géolocalisation AVANT de
 * répondre (#5216).
 *
 * `lookupGeoIp` accorde trois secondes par défaut — trois secondes ajoutées
 * telles quelles au temps qu'une personne passe devant un écran de chargement,
 * pour une donnée dont AUCUN champ de la réponse ne dépend. La borne courte
 * garde le cas nominal (le tiers répond en quelques dizaines de millisecondes,
 * et le cache sert les suivantes) et abandonne le cas lent — que la reprise
 * post-réponse rattrape, sans que personne n'attende.
 */
const GEO_AVANT_REPONSE_MS = 400;

/**
 * Le rang 4 du Prisme, tel que la REQUÊTE le porte.
 *
 * Deux sources, dans cet ordre : `X-Device-Locale`, que les clients Meeshy
 * posent explicitement, puis `Accept-Language`, que tout navigateur envoie sans
 * qu'on le lui demande. La seconde est une liste PONDÉRÉE et non ordonnée —
 * d'où `preferredAcceptLanguage` plutôt qu'un `split(',')[0]`, qui rendrait
 * `en` sur `en;q=0.5, fr`.
 *
 * Elle n'écrase JAMAIS une préférence exprimée : `registrationLanguages` ne la
 * consulte que lorsque l'inscription n'exprime AUCUN rang, exactement là où le
 * code écrivait auparavant le littéral `'fr'`.
 */
function localeDeLaRequete(request: FastifyRequest): string | undefined {
  const entete = request.headers['x-device-locale'];
  const declaree = Array.isArray(entete) ? entete[0] : entete;
  if (typeof declaree === 'string' && declaree.trim() !== '') return declaree.trim();

  return preferredAcceptLanguage(request.headers['accept-language']);
}

/**
 * REND la tentative comptée par le limiteur — sur un 400, et sur lui seul.
 *
 * Un 400 dit « ta saisie est mal formée » : rien n'a été touché, rien n'a été
 * appris sur autrui. Un 409 apprend au contraire qu'un pseudo ou une adresse
 * EXISTE — c'est un oracle, et un oracle remboursable est un oracle gratuit,
 * donc énumérable à volonté. Un 200 et un 429 comptent évidemment.
 *
 * Best-effort et DÉTACHÉ : le remboursement ne doit pas retarder la réponse
 * d'un aller-retour Redis. La garde `.catch` est obligatoire — un rejet sans
 * écouteur termine le process sous Node 22 (leçon 230).
 */
function rembourserLaTentative(limiteurs: readonly RateLimiter[], request: FastifyRequest): void {
  for (const limiteur of limiteurs) {
    void limiteur.refund(limiteur.keyFor(request)).catch((error: unknown) => {
      logger.warn('remboursement de tentative impossible', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

/**
 * REPREND la géolocalisation APRÈS la réponse, et complète la ligne du compte.
 *
 * Trois colonnes d'inscription en dépendent — `registrationLocation`,
 * `registrationCountry`, `timezone` — plus `lastLoginLocation`. Aucune n'est
 * servie dans la réponse : les faire attendre revenait à ajouter un
 * aller-retour vers un tiers au chemin d'entrée du produit pour des données que
 * personne ne lit avant longtemps.
 *
 * On ne reprend que ce qui a MANQUÉ, et seulement quand il y avait quelque
 * chose à trouver : une adresse PRIVÉE a déjà rendu tout ce qu'elle rendra
 * (`location: 'Local'`, sans appel réseau), et une géolocalisation déjà obtenue
 * a été écrite à la création.
 */
function completerLaGeolocalisation(
  context: AuthRouteContext,
  afterResponse: AfterResponse,
  userId: string,
  requestContext: { ip: string; geoData: unknown },
): void {
  if (requestContext.geoData) return;
  if (!requestContext.ip || isPrivateIp(requestContext.ip)) return;

  afterResponse(async () => {
    const geoData = await lookupGeoIp(requestContext.ip);
    if (!geoData) return;

    await context.prisma.user.update({
      where: { id: userId },
      data: {
        registrationLocation: geoData.location,
        registrationCountry: geoData.country,
        timezone: geoData.timezone,
        lastLoginLocation: geoData.location,
      },
    });
  }, 'registration-geoip-backfill');
}

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
                // Déclaré parce qu'un champ non déclaré est RETIRÉ à la
                // sérialisation — le piège que la branche du conflit de numéro
                // a déjà payé juste en dessous.
                sessionToken: { type: 'string', description: 'Session token of the device that created the account — presentable to POST /auth/refresh (absent on a phone-ownership conflict)' },
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
                    displayName: { type: 'string' },
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
        // `field` est DÉCLARÉ ici, et c'est la moitié qui compte : `sendError`
        // étale son `details` à la RACINE de l'enveloppe, et
        // `fast-json-stringify` retire tout ce que le schéma ne déclare pas —
        // en silence. Un `PHONE_INVALID` dont le client ne saurait pas quel
        // champ surligner ne vaut pas mieux qu'un 400 muet (piège du #4487,
        // rejoué cinq fois dans ce dépôt).
        400: {
          description: 'Malformed payload — the response names the field to fix',
          ...validationErrorResponseSchema,
          properties: {
            ...validationErrorResponseSchema.properties,
            field: { type: 'string', description: 'Form field to highlight (e.g. "phoneNumber")' }
          }
        },
        409: {
          description: 'The username or the email address is already taken. No account was created.',
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            field: { type: 'string', description: 'Form field to highlight — "username" or "email"' },
            suggestions: {
              type: 'array',
              items: { type: 'string' },
              description: 'Free usernames to offer instead (USERNAME_TAKEN only)'
            }
          }
        },
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
    const limiteurs = [registerRateLimiter, authGlobalRateLimiter];
    // Le différé est une décision de la surface HTTP — c'est elle qui a une
    // réponse à rendre. Le service, appelé sans requête (seed, création admin),
    // exécute ses travaux EN LIGNE.
    const afterResponse = context.afterResponse ?? deferAfterResponse;

    try {
      const validatedData = validateSchema(AuthSchemas.register, request.body, 'register') as RegisterData & {
        skipPhoneConflictCheck?: boolean;
      };

      // Le rang 4 du Prisme entre ICI, avec la requête — c'est la seule couche
      // qui voit les en-têtes. Le service, lui, ne le consulte que si
      // l'inscription n'exprime aucune préférence.
      const inscription: RegisterData = {
        ...validatedData,
        deviceLocale: localeDeLaRequete(request),
      };

      const requestContext = await getRequestContext(request, { geoTimeoutMs: GEO_AVANT_REPONSE_MS });

      // Check if phoneTransferToken is provided
      let phoneTransferValidated = false;
      let inscriptionFinale = inscription;
      if (inscription.phoneTransferToken) {
        logger.info('Phone transfer token provided — validating');
        const transferData = await phoneTransferService.getTransferDataByToken(inscription.phoneTransferToken);

        if (!transferData.valid) {
          rembourserLaTentative(limiteurs, request);
          return sendBadRequest(reply, 'Token de transfert invalide ou expiré', { code: 'INVALID_TRANSFER_TOKEN' });
        }

        logger.info('Phone transfer token valid');
        phoneTransferValidated = true;
        inscriptionFinale = { ...inscription, skipPhoneConflictCheck: true };
      }

      // Le même exécuteur post-réponse traverse jusqu'au service : l'e-mail de
      // vérification et l'annonce d'arrivée dans le salon global n'ont, eux non
      // plus, aucun champ de la réponse à alimenter.
      const result = await authService.register(inscriptionFinale, requestContext, {
        afterResponse,
      });

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
            username: inscriptionFinale.username,
            email: inscriptionFinale.email,
            displayName: inscriptionFinale.displayName,
            firstName: inscriptionFinale.firstName,
            lastName: inscriptionFinale.lastName,
            systemLanguage: inscriptionFinale.systemLanguage,
            regionalLanguage: inscriptionFinale.regionalLanguage
          }
        });
      }

      const { user } = result;

      if (!user) {
        return sendBadRequest(reply, 'Erreur lors de la création du compte');
      }

      // Execute phone transfer if validated
      if (phoneTransferValidated && inscriptionFinale.phoneTransferToken) {
        logger.info('Executing phone transfer for new user');
        const transferResult = await phoneTransferService.executeRegistrationTransfer(
          inscriptionFinale.phoneTransferToken,
          user.id,
          requestContext.ip || 'unknown'
        );

        if (!transferResult.success) {
          logger.error('Phone transfer failed', { error: transferResult.error });
        } else {
          logger.info('Phone transfer completed successfully');
        }
      }

      // #4264 — CHANGEMENT DE COMPORTEMENT ASSUMÉ : l'inscription crée
      // désormais une session, comme la connexion.
      //
      // `AuthService.register` n'appelait JAMAIS `createSession` : un compte
      // frais repartait avec un JWT rattaché à RIEN. Depuis #4213 cela n'était
      // plus seulement incohérent, c'était cassé — sa garde refuse
      // `POST /refresh` quand `count({ userId, isValid: true })` vaut zéro,
      // ce qui est exactement l'état d'un compte qui vient d'être créé et ne
      // s'est pas encore connecté. Le premier renouvellement, 24 h plus tard,
      // rendait 401 « Session révoquée » à quelqu'un qui n'avait rien révoqué.
      //
      // Nommer la session dans le jeton IMPOSAIT donc d'en créer une ; on y
      // gagne au passage que le premier appareil d'un compte devient
      // révocable et visible dans `GET /auth/sessions`, comme tous les autres.
      // Le `sessionToken` est renvoyé pour que le client puisse le présenter
      // (fenêtre glissante), sur la même clé que `POST /login`.
      const sessionToken = generateSessionToken();
      const session = await createSession({
        userId: user.id,
        token: sessionToken,
        requestContext
      });

      const token = authService.generateToken(user, session.id);
      const permissions = authService.getUserPermissions(user);

      completerLaGeolocalisation(context, afterResponse, user.id, requestContext);

      return sendSuccess(reply, {
        user: formatUserResponse(user, permissions),
        token,
        sessionToken,
        expiresIn: 24 * 60 * 60
      });

    } catch (error) {
      if (error instanceof MeeshyError && error.code === ErrorCode.VALIDATION_ERROR) {
        const violations = Array.isArray(error.details?.errors) ? error.details.errors : [];
        const fieldSummary = violations
          .map((v) => `${(v as { path?: string }).path}: ${(v as { message?: string }).message}`)
          .join(' — ');

        logger.warn('Registration payload rejected by validation', { violations });

        rembourserLaTentative(limiteurs, request);

        return sendError(reply, 400, fieldSummary ? `Données invalides — ${fieldSummary}` : 'Données invalides', {
          code: 'VALIDATION_ERROR',
          violations,
          // Le PREMIER champ fautif, servi à part : un client qui surligne un
          // champ n'a pas à parser une phrase française pour savoir lequel.
          details: { field: (violations[0] as { path?: string } | undefined)?.path }
        });
      }

      // Un REFUS de formulaire — pseudo pris, adresse prise, numéro illisible.
      //
      // Ces trois cas rendaient auparavant un 400 « Erreur lors de la création
      // du compte », sans code ni champ : le service rattrapait tout et
      // renvoyait `null`, si bien que les branches de ce `catch` qui
      // prétendaient les distinguer par le TEXTE de l'erreur
      // (`errorMessage.includes('déjà utilisé')`) étaient INATTEIGNABLES. Elles
      // ont été retirées avec le `null` qui les rendait mortes ; les témoins
      // qui les exerçaient simulaient un rejet que la production n'a jamais
      // produit.
      if (isRegistrationRefusal(error)) {
        logger.info('Registration refused', { code: error.code, field: error.field });

        // Un 400 rend la tentative (la saisie est à corriger, rien n'a été
        // touché) ; un 409 la garde — il APPREND qu'un identifiant existe, et
        // un oracle remboursable est un oracle gratuit.
        if (error.status === 400) rembourserLaTentative(limiteurs, request);

        return sendError(reply, error.status, error.message, {
          code: error.code,
          details: {
            field: error.field,
            ...(error.suggestions ? { suggestions: [...error.suggestions] } : {})
          }
        });
      }

      logger.error('Registration error', error as Error);

      // Erreur générique avec détails en dev
      const errorMessage = error instanceof Error ? error.message : String(error);
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
    onRequest: depreciee({ depuis: '2026-08-29', successeur: apiPath('/directory/availability') }),
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

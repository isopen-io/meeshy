import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../utils/logger';
import { sendSuccess, sendError, sendInternalError, sendNotFound, sendUnauthorized, sendBadRequest } from '../utils/response';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import {
  errorResponseSchema,
  validationErrorResponseSchema,
  anonymousParticipantSchema,
  conversationLinkSchema,
  conversationMinimalSchema,
  userMinimalSchema
} from '@meeshy/shared/types/api-schemas';
// #4167 — `POST /anonymous/join|refresh|leave` sont désormais des
// ADAPTATEURS MINCES vers la loi d'admission UNIQUE (`admitLinkEntry`,
// appelée par `performLinkJoin`) et les cœurs partagés de session invitée,
// que `POST /links/:key/members` et `PATCH|DELETE /guest-sessions/me`
// (les portes CIBLES) appellent de la même façon — voir
// `routes/conversations/link-admission.ts`. Ce fichier ne recopie plus la
// séquence de contrôles : une loi écrite à deux endroits est une loi dont la
// version la plus permissive décide, exactement le défaut que #4167 ferme.
import {
  performLinkJoin,
  refreshGuestSession,
  endGuestSession,
  participantConversationPayload,
  resolveClientIp,
} from './conversations/link-admission';
// #4167 — les trois portes ci-dessous sont des ALIAS des portes cibles
// (`POST /links/:key/members`, `PATCH|DELETE /guest-sessions/me`) : elles
// annoncent leur sursis comme le fait déjà tout alias du dépôt (#4274,
// `POST /conversations/:id/new-link` dans `sharing.ts` pour le même chantier
// d'API-simplification) — jamais un `Deprecation`/`Link` écrit à la main ici.
import { depreciee } from '../utils/deprecation';

// #4165 — plafond de l'échantillon de participants actifs lu par
// `GET /anonymous/link/:identifier` pour estimer les langues parlées d'un
// lien AVANT de le rejoindre (voir le `findMany` de ce handler). Aligné sur
// le plafond de `validatePagination` (`utils/pagination.ts`) : ce n'est pas
// une pagination cliente (aucun `offset`/`limit` en entrée), donc pas
// d'appel à l'utilitaire lui-même, mais le MÊME nombre — un aperçu avant de
// rejoindre n'a pas besoin d'un échantillon plus large qu'une page de liste.
const LINK_PREVIEW_LANGUAGE_SAMPLE_CAP = 100;

// Schemas de validation
const joinAnonymousSchema = z.object({
  firstName: z.string().min(1, 'Le prenom est requis').max(50),
  lastName: z.string().min(1, 'Le nom est requis').max(50),
  username: z.string().optional(),
  email: z.email().optional().or(z.literal('')),
  birthday: z.iso.datetime().optional().or(z.literal('')),
  // Normalise at the write boundary: the participant `language` feeds the
  // translation-target set (MessageTranslationService), which is keyed lowercase.
  // Storing 'EN' / 'en-US' verbatim would inject a duplicated, never-matching NLLB
  // target (Prisme rule #1 miss). `normalizeLanguageForDedup` also strips region subtags.
  language: z.string().transform((v) => normalizeLanguageForDedup(v)).default('fr'),
  deviceFingerprint: z.string().optional()
});

const refreshSessionSchema = z.object({
  sessionToken: z.string().min(1, 'Session token requis')
});

export async function anonymousRoutes(fastify: FastifyInstance) {
  /**
   * Resout l'ID de ConversationShareLink reel a partir d'un identifiant (peut etre un ObjectID ou un identifier)
   */
  async function resolveShareLinkId(identifier: string): Promise<string | null> {
    // Si c'est deja un ObjectID valide (24 caracteres hexadecimaux), le retourner directement
    if (isValidMongoId(identifier)) {
      return identifier;
    }

    // Sinon, chercher par le champ identifier
    const shareLink = await fastify.prisma.conversationShareLink.findFirst({
      where: { identifier: identifier }
    });

    return shareLink ? shareLink.id : null;
  }

  // Route pour rejoindre une conversation de maniere anonyme
  fastify.post('/anonymous/join/:linkId', {
    schema: {
      description: 'Join a conversation anonymously using a share link. Validates link availability, checks security restrictions (country, IP, language), and creates an anonymous participant session. Returns session token for subsequent authenticated requests.',
      tags: ['anonymous'],
      summary: 'Join conversation anonymously',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: { type: 'string', description: 'Share link identifier (format: mshy_...)' }
        }
      },
      body: {
        type: 'object',
        required: ['firstName', 'lastName'],
        properties: {
          firstName: { type: 'string', minLength: 1, maxLength: 50, description: 'First name (required)' },
          lastName: { type: 'string', minLength: 1, maxLength: 50, description: 'Last name (required)' },
          username: { type: 'string', description: 'Optional username (auto-generated if not provided)' },
          email: { type: 'string', format: 'email', description: 'Email address (required if link requires email)' },
          birthday: { type: 'string', format: 'date-time', description: 'Date of birth (required if link requires birthday)' },
          language: { type: 'string', default: 'fr', description: 'Preferred language code' },
          deviceFingerprint: { type: 'string', description: 'Optional device fingerprint for session tracking' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                sessionToken: { type: 'string', description: 'Session token for authentication' },
                participant: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    username: { type: 'string', description: 'Profile username (from anonymousSession.profile)' },
                    displayName: { type: 'string', description: 'Conversation display name (Participant.displayName)' },
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    avatar: { type: 'string', nullable: true },
                    banner: { type: 'string', nullable: true },
                    language: { type: 'string' },
                    isMeeshyer: { type: 'boolean', example: false },
                    canSendMessages: { type: 'boolean' },
                    canSendFiles: { type: 'boolean' },
                    canSendImages: { type: 'boolean' }
                  }
                },
                conversation: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    type: { type: 'string', enum: ['direct', 'group'] },
                    allowViewHistory: { type: 'boolean' }
                  }
                },
                linkId: { type: 'string', description: 'Original link ID' },
                id: { type: 'string', description: 'Share link database ID' }
              }
            }
          }
        },
        // Voir `utils/response.ts` : l'enveloppe pose `error`, `message` et
        // `code`. Ce bloc n'en declarait qu'un, et nommait `errors` un tableau
        // que rien ne produit — `violations` est celui que l'enveloppe porte.
        400: { description: 'Validation error', ...validationErrorResponseSchema },
        403: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            message: { type: 'string', description: 'Access denied (region, IP, language, or account restriction)' },
            requiresAccount: { type: 'boolean', description: 'True if account is required' },
          }
        },
        404: errorResponseSchema,
        409: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            message: { type: 'string', description: 'Username already taken' },
            suggestedNickname: { type: 'string', description: 'Alternative username suggestion' },
          }
        },
        410: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            message: { type: 'string', description: 'Link expired, inactive, or max uses reached' },
          }
        },
        429: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            message: { type: 'string', example: 'Nombre maximum d\'utilisateurs concurrent atteint' },
          }
        },
        500: errorResponseSchema
      }
    },
    // ALIAS de `POST /links/:key/members` (#4167) — le successeur porte un
    // paramètre (`:key`), donc une FONCTION de la requête plutôt qu'un
    // gabarit non suivable (cf. `utils/deprecation.ts` § « Le successeur
    // peut dépendre de la requête »). `linkId` est le MÊME identifiant que
    // `key` sur la porte cible : les deux acceptent linkId/identifier/id.
    onRequest: [depreciee({
      depuis: '2026-08-30',
      successeur: (request) => `/api/v1/links/${(request.params as { linkId: string }).linkId}/members`,
    })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { linkId } = request.params as { linkId: string };
      const body = joinAnonymousSchema.parse(request.body);

      // #4167 — cette porte DÉLÈGUE à `performLinkJoin` (la loi d'admission
      // UNIQUE, `admitLinkEntry`, appliquée pour les deux identités) plutôt
      // que de recopier la séquence de contrôles. Elle reste PUREMENT
      // anonyme comme elle l'a toujours été (aucun
      // `preValidation` ne lit `Authorization` ici) : `authContext: undefined`
      // le dit explicitement — l'identité vient de la créance, jamais du
      // chemin, et cette route ne regarde aucune créance.
      const result = await performLinkJoin({
        prisma: fastify.prisma,
        key: linkId,
        authContext: undefined,
        requestIp: resolveClientIp(request),
        profile: {
          firstName: body.firstName,
          lastName: body.lastName,
          requestedUsername: body.username,
          email: body.email,
          birthday: body.birthday,
          language: body.language,
          deviceFingerprint: body.deviceFingerprint
        },
        broadcast: (message, conversationId) =>
          fastify.socketIOHandler?.getManager()?.broadcastMessage(message as never, conversationId)
            ?? Promise.resolve()
      });

      switch (result.kind) {
        case 'not-found':
          return sendNotFound(reply, 'Lien de conversation introuvable');
        case 'refused':
          // `admitLinkEntry` rend le statut ET le code — mêmes six codes que
          // `POST /links/:key/members` (#4167 critère 2) : plus deux polices
          // pour le même lien. `LINK_MAX_USES`/`MAX_CONCURRENT_USERS`
          // (410/429) fusionnent en `LINK_EXHAUSTED` (409), et
          // `allowedCountries` n'y figure plus — critère 5, décision du
          // 2026-08-29 (voir `linkAdmission.ts`).
          return sendError(reply, result.refusal.status, result.refusal.code, { message: result.refusal.message });
        case 'language-not-allowed':
          return sendError(reply, 403, 'LANGUAGE_NOT_ALLOWED', { message: 'Langue non autorisee pour ce lien' });
        case 'validation':
          return sendBadRequest(reply, result.message);
        case 'username-taken':
          return sendError(reply, 409, 'USERNAME_TAKEN_IN_CONVERSATION', {
            message: 'Ce nom d\'utilisateur est deja utilise dans cette conversation',
            details: { suggestedNickname: result.suggestion }
          });
        case 'joined':
          return sendSuccess(reply, {
              sessionToken: result.sessionToken,
              ...participantConversationPayload(result.participant, result.shareLink),
              linkId: result.shareLink.linkId,
              id: result.shareLink.id // ID pour l'acces authentifie aux endpoints /links
            }, { statusCode: 201 });
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, 'Donnees invalides');
      }

      logError(fastify.log, 'Anonymous join error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // Route pour rafraichir une session anonyme (maintenir la session active)
  fastify.post('/anonymous/refresh', {
    schema: {
      description: 'Refresh an anonymous session to keep it active. Updates lastActiveAt timestamp and validates that the share link is still valid. Returns updated participant and conversation information.',
      tags: ['anonymous'],
      summary: 'Refresh anonymous session',
      body: {
        type: 'object',
        required: ['sessionToken'],
        properties: {
          sessionToken: { type: 'string', minLength: 1, description: 'Session token from join response' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                participant: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    username: { type: 'string', description: 'Profile username (from anonymousSession.profile)' },
                    displayName: { type: 'string', description: 'Conversation display name (Participant.displayName)' },
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    avatar: { type: 'string', nullable: true },
                    banner: { type: 'string', nullable: true },
                    language: { type: 'string' },
                    isMeeshyer: { type: 'boolean', example: false },
                    canSendMessages: { type: 'boolean' },
                    canSendFiles: { type: 'boolean' },
                    canSendImages: { type: 'boolean' }
                  }
                },
                conversation: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    type: { type: 'string', enum: ['direct', 'group'] },
                    allowViewHistory: { type: 'boolean' }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Invalid data', ...validationErrorResponseSchema },
        401: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            message: { type: 'string', example: 'Session invalide ou expiree' },
          }
        },
        410: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            message: { type: 'string', description: 'Link expired or deactivated' },
          }
        },
        500: errorResponseSchema
      }
    },
    // ALIAS de `PATCH /guest-sessions/me` (#4167).
    onRequest: [depreciee({ depuis: '2026-08-30', successeur: '/api/v1/guest-sessions/me' })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = refreshSessionSchema.parse(request.body);

      // #4167 — cette porte DÉLÈGUE à `refreshGuestSession`, le cœur partagé
      // avec `PATCH /guest-sessions/me`. Gagne au passage la garde
      // `isConversationClosed` que cette route n'avait jamais eue (critère 4) :
      // le jeton continue de voyager dans le CORPS ici — c'est le défaut que la
      // nouvelle porte corrige, cette porte-ci reste un alias fonctionnel.
      const result = await refreshGuestSession({ prisma: fastify.prisma, sessionToken: body.sessionToken });

      switch (result.kind) {
        case 'invalid':
          return sendUnauthorized(reply, 'Session invalide ou expiree');
        case 'link-gone':
          return sendError(reply, 410, 'LINK_DEACTIVATED', { message: 'Le lien a ete desactive' });
        case 'link-expired':
          return sendError(reply, 410, 'LINK_EXPIRED', { message: 'Le lien a expire' });
        case 'conversation-closed':
          return sendError(reply, 410, 'CONVERSATION_CLOSED', { message: 'Cette conversation est terminee' });
        case 'refreshed':
          return sendSuccess(reply, participantConversationPayload(result.participant, result.shareLink));
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, 'Donnees invalides');
      }

      logError(fastify.log, 'Anonymous refresh error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // Route pour quitter une session anonyme
  fastify.post('/anonymous/leave', {
    schema: {
      description: 'Leave an anonymous session and clean up resources. Marks participant as inactive, sets offline status, decrements concurrent user counter, and records leave timestamp.',
      tags: ['anonymous'],
      summary: 'Leave anonymous session',
      body: {
        type: 'object',
        required: ['sessionToken'],
        properties: {
          sessionToken: { type: 'string', minLength: 1, description: 'Session token from join response' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Session fermee avec succes' }
              }
            }
          }
        },
        404: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            message: { type: 'string', example: 'Session introuvable' },
          }
        },
        500: errorResponseSchema
      }
    },
    // ALIAS de `DELETE /guest-sessions/me` (#4167).
    onRequest: [depreciee({ depuis: '2026-08-30', successeur: '/api/v1/guest-sessions/me' })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = refreshSessionSchema.parse(request.body);

      // #4167 — cette porte DÉLÈGUE à `endGuestSession`, le cœur partagé avec
      // `DELETE /guest-sessions/me`. IDEMPOTENT désormais (critère 4) : un
      // second appel sur la même session ne décrémente plus une seconde fois
      // `currentConcurrentUsers`, qui ne peut donc plus passer sous zéro.
      const result = await endGuestSession({ prisma: fastify.prisma, sessionToken: body.sessionToken });

      if (result.kind === 'not-found') {
        return sendNotFound(reply, 'Session introuvable');
      }

      return sendSuccess(reply, { message: 'Session fermee avec succes' });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, 'Donnees invalides');
      }

      logError(fastify.log, 'Anonymous leave error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // Route pour verifier les informations d'un lien (avant de rejoindre)
  // Accepte soit un linkId (format mshy_...) soit un conversationShareLinkId (ID de base de donnees)
  fastify.get('/anonymous/link/:identifier', {
    schema: {
      description: 'Get share link information before joining. Validates link availability, returns conversation details, creator info, requirements (email, nickname, birthday), and statistics (participants, languages). Accepts either linkId (format: mshy_...) or database ID.',
      tags: ['anonymous'],
      summary: 'Get share link information',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: { type: 'string', description: 'Share link ID (format: mshy_...) or database ID (24 hex chars)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Database ID of share link' },
                linkId: { type: 'string', description: 'Share link identifier (mshy_...)' },
                name: { type: 'string', description: 'Link name/title' },
                description: { type: 'string', nullable: true, description: 'Link description' },
                expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration date' },
                maxUses: { type: 'number', nullable: true, description: 'Maximum uses allowed' },
                currentUses: { type: 'number', description: 'Current usage count' },
                maxConcurrentUsers: { type: 'number', nullable: true, description: 'Max concurrent users' },
                currentConcurrentUsers: { type: 'number', description: 'Current concurrent users' },
                requireAccount: { type: 'boolean', description: 'Account required to join' },
                requireNickname: { type: 'boolean', description: 'Username required' },
                requireEmail: { type: 'boolean', description: 'Email required' },
                requireBirthday: { type: 'boolean', description: 'Birthday required' },
                allowedLanguages: { type: 'array', items: { type: 'string' }, description: 'Allowed language codes' },
                conversation: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string', nullable: true },
                    type: { type: 'string', enum: ['direct', 'group'] },
                    createdAt: { type: 'string', format: 'date-time' }
                  }
                },
                creator: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    username: { type: 'string' },
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    displayName: { type: 'string' },
                    avatar: { type: 'string', nullable: true }
                  }
                },
                stats: {
                  type: 'object',
                  properties: {
                    totalParticipants: { type: 'number', description: 'Total active participants' },
                    memberCount: { type: 'number', description: 'Registered members' },
                    anonymousCount: { type: 'number', description: 'Anonymous participants' },
                    languageCount: { type: 'number', description: 'Unique languages spoken' },
                    spokenLanguages: { type: 'array', items: { type: 'string' }, description: 'List of spoken languages' }
                  }
                }
              }
            }
          }
        },
        404: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            message: { type: 'string', example: 'Lien de conversation introuvable' },
          }
        },
        410: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            message: { type: 'string', description: 'Link expired, inactive, or max uses reached' },
          }
        },
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { identifier } = request.params as { identifier: string };

      // Resoudre l'ID de ConversationShareLink reel
      let shareLink;

      // Si c'est un linkId au format mshy_..., chercher directement
      if (identifier.startsWith('mshy_')) {
        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { linkId: identifier },
          include: {
            conversation: {
              select: {
                id: true,
                title: true,
                description: true,
                type: true,
                createdAt: true
              }
            },
            creator: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                displayName: true,
                avatar: true
              }
            }
          }
        });
      } else {
        // Sinon, resoudre l'ID (peut etre un ObjectID ou un identifier)
        const shareLinkId = await resolveShareLinkId(identifier);
        if (!shareLinkId) {
          return sendNotFound(reply, 'Lien de partage non trouve');
        }

        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { id: shareLinkId },
          include: {
            conversation: {
              select: {
                id: true,
                title: true,
                description: true,
                type: true,
                createdAt: true
              }
            },
            creator: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                displayName: true,
                avatar: true
              }
            }
          }
        });
      }

      if (!shareLink) {
        return sendNotFound(reply, 'Lien de conversation introuvable');
      }

      // Verifications de base
      if (!shareLink.isActive) {
        return sendError(reply, 410, 'LINK_INACTIVE', { message: 'Ce lien n\'est plus actif' });
      }

      if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
        return sendError(reply, 410, 'LINK_EXPIRED', { message: 'Ce lien a expire' });
      }

      if (shareLink.maxUses && shareLink.currentUses >= shareLink.maxUses) {
        return sendError(reply, 410, 'LINK_MAX_USES', { message: 'Ce lien a atteint sa limite d\'utilisation' });
      }

      // Recuperer les statistiques de la conversation
      const [memberCount, anonymousCount, allActiveParticipants] = await Promise.all([
        fastify.prisma.participant.count({
          where: {
            conversationId: shareLink.conversation.id,
            type: 'user',
            isActive: true
          }
        }),
        fastify.prisma.participant.count({
          where: {
            conversationId: shareLink.conversation.id,
            type: 'anonymous',
            isActive: true
          }
        }),
        // BORNÉ (#4165). Sans `take`, cette requête ramenait TOUT participant
        // actif de la conversation — sur un lien viral, potentiellement des
        // dizaines de milliers de lignes — pour n'en tirer qu'un ENSEMBLE de
        // langues (`spokenLanguages`, quelques éléments au plus). Le coût
        // était proportionnel au fil ; le résultat exposé, minuscule. Cette
        // route s'appelle AVANT de rejoindre (aperçu public) : un échantillon
        // aligné sur le plafond de pagination du dépôt est un compromis
        // assumé — une langue portée UNIQUEMENT par des participants au-delà
        // de l'échantillon peut manquer à `spokenLanguages`. `memberCount`/
        // `anonymousCount` restent EXACTS : ce sont des `.count()` séparés,
        // non affectés par ce plafond.
        fastify.prisma.participant.findMany({
          where: {
            conversationId: shareLink.conversation.id,
            isActive: true
          },
          orderBy: { joinedAt: 'asc' },
          take: LINK_PREVIEW_LANGUAGE_SAMPLE_CAP,
          select: {
            type: true,
            language: true,
            user: {
              select: {
                systemLanguage: true,
                regionalLanguage: true,
                customDestinationLanguage: true
              }
            }
          }
        })
      ]);

      const totalParticipants = memberCount + anonymousCount;

      const languageSet = new Set<string>();

      allActiveParticipants.forEach(p => {
        if (p.type === 'user' && p.user) {
          // Canonicalise BCP-47/casse via le SSOT : 'en', 'EN' et 'en-US' comptent
          // pour UNE langue (`.toLowerCase()` brut laissait 'en-us' ≠ 'en' → stat gonflée)
          if (p.user.systemLanguage) languageSet.add(normalizeLanguageForDedup(p.user.systemLanguage));
          if (p.user.regionalLanguage) languageSet.add(normalizeLanguageForDedup(p.user.regionalLanguage));
          if (p.user.customDestinationLanguage) languageSet.add(normalizeLanguageForDedup(p.user.customDestinationLanguage));
        } else {
          if (p.language) languageSet.add(normalizeLanguageForDedup(p.language));
        }
      });

      // Convertir en tableau et trier
      const spokenLanguages = Array.from(languageSet).sort();
      const languageCount = spokenLanguages.length;

      return sendSuccess(reply, {
          id: shareLink.id, // ID de la conversationShareLink pour les appels ulterieurs
          linkId: shareLink.linkId,
          name: shareLink.name,
          description: shareLink.description,
          expiresAt: shareLink.expiresAt,
          maxUses: shareLink.maxUses,
          currentUses: shareLink.currentUses,
          maxConcurrentUsers: shareLink.maxConcurrentUsers,
          currentConcurrentUsers: shareLink.currentConcurrentUsers,
          requireAccount: shareLink.requireAccount,
          requireNickname: shareLink.requireNickname,
          requireEmail: shareLink.requireEmail,
          requireBirthday: shareLink.requireBirthday,
          allowedLanguages: shareLink.allowedLanguages,
          conversation: shareLink.conversation,
          creator: shareLink.creator,
          // Nouvelles statistiques
          stats: {
            totalParticipants,
            memberCount,
            anonymousCount,
            languageCount,
            spokenLanguages
          }
        });

    } catch (error) {
      logError(fastify.log, 'Get anonymous link error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}

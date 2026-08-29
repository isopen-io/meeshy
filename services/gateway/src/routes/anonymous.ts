import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { logError } from '../utils/logger';
import { sendSuccess, sendError, sendInternalError, sendNotFound, sendUnauthorized, sendForbidden, sendBadRequest } from '../utils/response';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import { isIpInRange } from '../utils/ip-range';
import { SecuritySanitizer } from '../utils/sanitize';
import { generateNickname } from '../utils/anonymous-nickname';
import { isConversationClosed } from '../services/messaging/conversationWriteAdmission';
import { postJoinSystemMessage } from '../services/conversations/joinSystemMessage';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { toAnonymousUsername, suffixAnonymousUsername } from '@meeshy/shared/utils/anonymous-username';
import {
  errorResponseSchema,
  validationErrorResponseSchema,
  anonymousParticipantSchema,
  conversationLinkSchema,
  conversationMinimalSchema,
  userMinimalSchema
} from '@meeshy/shared/types/api-schemas';

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

// Helper pour generer un sessionToken unique
function generateSessionToken(deviceFingerprint?: string): string {
  const timestamp = Date.now().toString();
  const randomPart = crypto.randomBytes(16).toString('hex');
  const devicePart = deviceFingerprint ? crypto.createHash('md5').update(deviceFingerprint).digest('hex').slice(0, 8) : '';
  return `anon_${timestamp}_${randomPart}_${devicePart}`;
}

// Helper pour verifier l'IP et extraire le pays (simulation)
function extractCountryFromIP(ipAddress: string): string | null {
  // En production, utiliser un service de geolocalisation IP comme MaxMind ou IP2Location
  // Pour le developpement, on simule quelques cas
  if (ipAddress.startsWith('192.168.') || ipAddress.startsWith('127.') || ipAddress.startsWith('::1')) {
    return 'FR'; // IP locale = France par defaut
  }

  // Simulation de quelques plages IP pour les tests
  const ipNum = parseInt(ipAddress.split('.')[0]) || 0;
  if (ipNum >= 1 && ipNum <= 50) return 'FR';
  if (ipNum >= 51 && ipNum <= 100) return 'GB';
  if (ipNum >= 101 && ipNum <= 150) return 'US';
  if (ipNum >= 151 && ipNum <= 200) return 'DE';

  return 'FR'; // Defaut France
}

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

  /**
   * Premier pseudo libre de la série `ano_bob`, `ano_bob2`, `ano_bob3`… dans
   * CETTE conversation — la seule portée où deux pseudos identiques se voient.
   *
   * Rend `null` quand la série est épuisée. La borne n'est pas un détail de
   * confort : les deux boucles qu'elle remplace étaient des `while (true)` que
   * seule la part aléatoire de `generateNickname` faisait terminer. Un pseudo
   * demandé explicitement et durablement pris les faisait tourner jusqu'à
   * l'OOM du process — un déni de service à un POST non authentifié.
   */
  const MAX_USERNAME_RANKS = 25;

  async function findFreeAnonymousUsername(
    desired: string,
    conversationId: string
  ): Promise<string | null> {
    for (let rank = 1; rank <= MAX_USERNAME_RANKS; rank++) {
      const candidate = rank === 1 ? desired : suffixAnonymousUsername(desired, rank);

      const taken = await fastify.prisma.participant.findFirst({
        where: {
          conversationId,
          displayName: candidate,
          type: 'anonymous',
          isActive: true
        },
        select: { id: true }
      });

      if (!taken) return candidate;
    }

    return null;
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
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { linkId } = request.params as { linkId: string };
      const body = joinAnonymousSchema.parse(request.body);
      const firstName = SecuritySanitizer.sanitizeText(body.firstName);
      const lastName = SecuritySanitizer.sanitizeText(body.lastName);
      const clientIP = request.ip || (request.headers['x-forwarded-for'] as string) || '127.0.0.1';


      // 1. Verifier que le lien existe et est valide.
      // Accepter linkId OU identifier (iOS partage l'identifier, web le linkId)
      // — sinon toute invitation anonyme partagée depuis iOS tombait en 404.
      const shareLink = await fastify.prisma.conversationShareLink.findFirst({
        where: { OR: [{ linkId }, { identifier: linkId }] },
        include: {
          conversation: {
            select: { id: true, title: true, type: true, isActive: true, closedAt: true }
          }
        }
      });

      if (!shareLink) {
        return sendNotFound(reply, 'Lien de conversation introuvable');
      }

      // 2. Verifications de validite du lien
      if (!shareLink.isActive) {
        return sendError(reply, 410, 'LINK_INACTIVE', { message: 'Ce lien n\'est plus actif' });
      }

      // Et de validite de ce vers quoi il POINTE. Les neuf verifications de
      // cette section portent toutes sur le LIEN ; aucune ne portait sur la
      // conversation, et une cloture n'eteint aucun lien de partage. Un lien qui
      // circule restait donc joignable apres la mort du fil, et l'anonyme y
      // obtenait un 200, une ligne active, puis une conversation absente de sa
      // liste et un premier message refuse par `conversationWriteAdmission` —
      // sans recours, ce participant etant sa seule identite.
      //
      // La porte enregistree passe par `resolveConversationEntry`, dont le
      // parametre `conversation` est requis ; celle-ci est keyee sur un
      // `User.id` que l'anonyme n'a pas, donc elle appelle le predicat
      // directement. Meme regle, meme deux colonnes.
      if (isConversationClosed(shareLink.conversation)) {
        return sendError(reply, 410, 'CONVERSATION_CLOSED', { message: 'Cette conversation est terminee' });
      }

      if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
        return sendError(reply, 410, 'LINK_EXPIRED', { message: 'Ce lien a expire' });
      }

      if (shareLink.maxUses && shareLink.currentUses >= shareLink.maxUses) {
        return sendError(reply, 410, 'LINK_MAX_USES', { message: 'Ce lien a atteint sa limite d\'utilisation' });
      }

      if (shareLink.maxConcurrentUsers && shareLink.currentConcurrentUsers >= shareLink.maxConcurrentUsers) {
        return sendError(reply, 429, 'MAX_CONCURRENT_USERS', { message: 'Nombre maximum d\'utilisateurs concurrent atteint' });
      }

      // 3. Verifications de securite/restrictions
      const country = extractCountryFromIP(clientIP);

      // Verifier pays autorises
      if (shareLink.allowedCountries.length > 0 && country && !shareLink.allowedCountries.includes(country)) {
        return sendForbidden(reply, 'Acces non autorise depuis votre region');
      }

      // Verifier langues autorisees. `body.language` est deja canonicalise au
      // boundary Zod via `normalizeLanguageForDedup` (casse repliee, region
      // strippee, 3-lettres/legacy reduits). Les `allowedLanguages` viennent de
      // la BASE, configurees a la main par le createur du lien : elles peuvent
      // porter un tag de region (`fr-FR`), un code 3-lettres (`fra`) ou une casse
      // mixte. Un `.toLowerCase()` brut sur ce cote-la les fait diverger de la
      // forme canonique du joignant et REFUSE un acces qui doit etre accorde —
      // decision d'acces, severite superieure a un defaut d'affichage. On
      // canonicalise donc les DEUX cotes via la meme SSOT (suivi #1 de l'iter.
      // 247).
      if (
        shareLink.allowedLanguages.length > 0 &&
        !shareLink.allowedLanguages.some((l) => normalizeLanguageForDedup(l) === body.language)
      ) {
        return sendForbidden(reply, 'Langue non autorisee pour ce lien');
      }

      // Verifier plages IP autorisees
      if (shareLink.allowedIpRanges.length > 0) {
        const isIpAllowed = shareLink.allowedIpRanges.some(range => isIpInRange(clientIP, range));
        if (!isIpAllowed) {
          return sendForbidden(reply, 'Acces non autorise depuis votre adresse IP');
        }
      }

      // 4. Verifier si un compte est requis (bloque l'acces anonyme)
      if (shareLink.requireAccount) {
        return sendForbidden(reply, 'REQUIRES_ACCOUNT', { message: 'Un compte est requis pour rejoindre cette conversation' });
      }

      // 5. Verifier si l'email est requis
      if (shareLink.requireEmail && (!body.email || body.email.trim() === '')) {
        return sendBadRequest(reply, 'L\'email est obligatoire pour rejoindre cette conversation');
      }

      // 6. Verifier si la date de naissance est requise
      if (shareLink.requireBirthday && (!body.birthday || body.birthday.trim() === '')) {
        return sendBadRequest(reply, 'La date de naissance est obligatoire pour rejoindre cette conversation');
      }

      // 7. Résoudre le pseudo — dans l'ESPACE RÉSERVÉ `ano_`, et sans jamais
      //    refuser l'entrée pour cause d'homonymie.
      //
      //    L'ancienne porte comparait le pseudo demandé aux `User.username` du
      //    site et rendait 409 sur collision. Deux torts : elle faisait payer à
      //    un anonyme la présence d'un INSCRIT qu'il ne croisera jamais, et le
      //    409 est terminal pour lui — ce lien est sa seule identité. Elle
      //    calculait bien une alternative, dans deux `while (true)`, puis la
      //    jetait : `sendError` ne la transportait pas jusqu'au client.
      //
      //    Les deux `while (true)` ne terminaient d'ailleurs QUE parce que
      //    `generateNickname` tire au hasard. Sur une collision stable — un
      //    pseudo explicitement demandé et déjà pris — la boucle interrogeait
      //    la base sans fin, jusqu'à l'OOM du process.
      //
      //    Le pseudo d'un anonyme ne se compare donc plus à ceux des comptes :
      //    ce qui distingue les deux populations n'est pas le nom mais le
      //    GLYPHE FANTÔME, apposé au rendu devant le nom et le pseudo de tout
      //    participant sans compte. `ano_` reste un préfixe lisible, PAS un
      //    espace réservé — un compte peut s'appeler `ano_bob`, il n'aura
      //    simplement pas le fantôme. Reste à départager les anonymes d'une
      //    MÊME conversation, ce que le rang tranche.
      if (shareLink.requireNickname && (!body.username || body.username.trim() === '')) {
        return sendBadRequest(reply, 'Le nom d\'utilisateur est obligatoire pour rejoindre cette conversation');
      }

      const requestedUsername = body.username && body.username.trim() !== ''
        ? SecuritySanitizer.sanitizeUsername(body.username.trim())
        : generateNickname(firstName, lastName);

      const desiredUsername = toAnonymousUsername(requestedUsername);
      const username = await findFreeAnonymousUsername(desiredUsername, shareLink.conversationId);

      if (!username) {
        return sendError(reply, 409, 'USERNAME_TAKEN_IN_CONVERSATION', {
          message: 'Ce nom d\'utilisateur est deja utilise dans cette conversation',
          details: { suggestedNickname: toAnonymousUsername(generateNickname(firstName, lastName)) }
        });
      }

      // 8. Generer le sessionToken unique
      const sessionToken = generateSessionToken(body.deviceFingerprint);

      // 9. Creer le participant anonyme (unified Participant model)
      const { hashSessionToken } = await import('../utils/session-token');
      const sessionTokenHash = hashSessionToken(sessionToken);

      const anonymousParticipant = await fastify.prisma.participant.create({
        data: {
          conversationId: shareLink.conversationId,
          type: 'anonymous',
          displayName: username,
          language: body.language,
          sessionTokenHash: sessionTokenHash,
          shareLinkId: shareLink.id,
          role: 'member',
          permissions: {
            canSendMessages: shareLink.allowAnonymousMessages,
            canSendFiles: shareLink.allowAnonymousFiles,
            canSendImages: shareLink.allowAnonymousImages,
            canSendVideos: false,
            canSendAudios: false,
            canSendLocations: false,
            canSendLinks: false,
            // Figé comme les sept autres : on entre sous les conditions du
            // MOMENT. Un hôte qui décoche `allowViewHistory` ensuite ne referme
            // rien à qui est déjà là — son levier sur les personnes déjà
            // entrées est la surcharge par participant.
            canViewHistory: shareLink.allowViewHistory
          },
          anonymousSession: {
            shareLinkId: shareLink.id,
            session: {
              sessionTokenHash: sessionTokenHash,
              ipAddress: clientIP,
              country: country,
              deviceFingerprint: body.deviceFingerprint || null,
              connectedAt: new Date()
            },
            profile: {
              firstName: firstName,
              lastName: lastName,
              username: username,
              email: body.email || null,
              birthday: body.birthday ? new Date(body.birthday) : null
            }
          }
        }
      });

      // 10. Mettre a jour les compteurs du lien
      await fastify.prisma.conversationShareLink.update({
        where: { id: shareLink.id },
        data: {
          currentUses: { increment: 1 },
          currentConcurrentUsers: { increment: 1 },
          currentUniqueSessions: { increment: 1 }
        }
      });

      // 11. Annoncer l'arrivée dans le fil. Les membres présents voyaient sinon
      //     un inconnu prendre la parole sans avoir vu entrer personne — et rien
      //     ne disait que ce visiteur n'a PAS de compte, la distinction la plus
      //     utile quand la porte est un lien public.
      //
      //     `postJoinSystemMessage` ne rejette jamais : l'avis est un accessoire
      //     de l'entrée, pas sa condition. Un anonyme déjà admis ne doit pas se
      //     voir refuser pour une panne d'écriture ou de socket.
      await postJoinSystemMessage(
        {
          prisma: fastify.prisma,
          broadcast: (message, conversationId) =>
            fastify.socketIOHandler?.getManager()?.broadcastMessage(message as never, conversationId)
              ?? Promise.resolve()
        },
        {
          conversationId: shareLink.conversationId,
          participantId: anonymousParticipant.id,
          displayName: username,
          isAnonymous: true,
          viaShareLink: true,
          // La carte d'arrivée sépare l'identité stable (pseudo `ano_…`) du
          // nom humain donné au formulaire, et dit ce que le lien autorise.
          username,
          givenName: [firstName, lastName].filter(Boolean).join(' ') || undefined,
          linkRules: {
            canSendMessages: shareLink.allowAnonymousMessages,
            canSendFiles: shareLink.allowAnonymousFiles,
            canSendImages: shareLink.allowAnonymousImages
          }
        }
      );

      return sendSuccess(reply, {
          sessionToken: sessionToken,
          participant: {
            id: anonymousParticipant.id,
            username: anonymousParticipant.anonymousSession?.profile?.username ?? anonymousParticipant.displayName,
            displayName: anonymousParticipant.displayName,
            firstName: anonymousParticipant.anonymousSession?.profile?.firstName ?? '',
            lastName: anonymousParticipant.anonymousSession?.profile?.lastName ?? '',
            avatar: anonymousParticipant.avatar ?? null,
            banner: null,
            language: anonymousParticipant.language,
            isMeeshyer: false,
            canSendMessages: anonymousParticipant.permissions?.canSendMessages ?? false,
            canSendFiles: anonymousParticipant.permissions?.canSendFiles ?? false,
            canSendImages: anonymousParticipant.permissions?.canSendImages ?? false
          },
          conversation: {
            id: shareLink.conversation.id,
            title: shareLink.conversation.title,
            type: shareLink.conversation.type,
            allowViewHistory: shareLink.allowViewHistory
          },
          linkId: shareLink.linkId,
          id: shareLink.id // ID pour l'acces authentifie aux endpoints /links
        }, { statusCode: 201 });

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
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = refreshSessionSchema.parse(request.body);
      const clientIP = request.ip || (request.headers['x-forwarded-for'] as string) || '127.0.0.1';

      // Trouver le participant anonyme par sessionTokenHash
      const { hashSessionToken } = await import('../utils/session-token');
      const tokenHash = hashSessionToken(body.sessionToken);

      const participant = await fastify.prisma.participant.findFirst({
        where: { sessionTokenHash: tokenHash, type: 'anonymous' }
      });

      if (!participant || !participant.isActive) {
        return sendUnauthorized(reply, 'Session invalide ou expiree');
      }

      // Lookup shareLink from anonymousSession
      const shareLinkId = participant.anonymousSession?.shareLinkId;
      const shareLink = shareLinkId ? await fastify.prisma.conversationShareLink.findUnique({
        where: { id: shareLinkId },
        include: {
          conversation: {
            select: { id: true, title: true, type: true }
          }
        }
      }) : null;

      if (!shareLink) {
        return sendError(reply, 410, 'LINK_DEACTIVATED', { message: 'Le lien a ete desactive' });
      }

      if (!shareLink.isActive) {
        return sendError(reply, 410, 'LINK_DEACTIVATED', { message: 'Le lien a ete desactive' });
      }

      if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
        return sendError(reply, 410, 'LINK_EXPIRED', { message: 'Le lien a expire' });
      }

      await fastify.prisma.participant.update({
        where: { id: participant.id },
        data: {
          lastActiveAt: new Date(),
          isOnline: true
        }
      });

      return sendSuccess(reply, {
          participant: {
            id: participant.id,
            username: participant.anonymousSession?.profile?.username ?? participant.displayName,
            displayName: participant.displayName,
            firstName: participant.anonymousSession?.profile?.firstName ?? '',
            lastName: participant.anonymousSession?.profile?.lastName ?? '',
            avatar: participant.avatar ?? null,
            banner: null,
            language: participant.language,
            isMeeshyer: false,
            canSendMessages: participant.permissions?.canSendMessages ?? false,
            canSendFiles: participant.permissions?.canSendFiles ?? false,
            canSendImages: participant.permissions?.canSendImages ?? false
          },
          conversation: {
            id: shareLink.conversation.id,
            title: shareLink.conversation.title,
            type: shareLink.conversation.type,
            allowViewHistory: shareLink.allowViewHistory
          }
        });

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
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = refreshSessionSchema.parse(request.body);

      const { hashSessionToken: hashToken } = await import('../utils/session-token');
      const leaveTokenHash = hashToken(body.sessionToken);

      const participant = await fastify.prisma.participant.findFirst({
        where: { sessionTokenHash: leaveTokenHash, type: 'anonymous' }
      });

      if (!participant) {
        return sendNotFound(reply, 'Session introuvable');
      }

      await fastify.prisma.participant.update({
        where: { id: participant.id },
        data: {
          isActive: false,
          isOnline: false,
          leftAt: new Date()
        }
      });

      const leaveShareLinkId = participant.anonymousSession?.shareLinkId;
      if (leaveShareLinkId) {
        await fastify.prisma.conversationShareLink.update({
          where: { id: leaveShareLinkId },
          data: {
            currentConcurrentUsers: { decrement: 1 }
          }
        });
      }

      return sendSuccess(reply, { message: 'Session fermee avec succes' });

    } catch (error) {
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

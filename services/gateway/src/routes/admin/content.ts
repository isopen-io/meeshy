import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendPaginatedSuccess, sendSuccess, sendUnauthorized, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { permissionsService } from './services/PermissionsService';
import {
  type UserRole,
  type MessageListQuery,
  type CommunityListQuery,
  type TranslationListQuery,
  type ShareLinkListQuery
} from './types';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { attachmentMediaSelect } from '../../services/attachments/attachmentIncludes';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { validatePagination } from '../../utils/pagination';
import { withAnonymousParticipantCounts } from '../../utils/share-link-participant-counts';
import { requirePermission, requireSovereign, withAudit } from '../../middleware/authorize';
// #4333 bonus — `attachmentMediaSelect` est délibérément SANS drapeau de
// sécurité (voir son doc-comment : « No consumption-tracking, no security
// flags »), et cette route est une liste PLATEFORME-ENTIÈRE, pas un contexte
// qui gate déjà la protection en amont. Même classe de défaut que #4157 c.4 :
// le prédicat PARTAGÉ, jamais une copie (`routes/admin/media-protection.ts`).
import {
  attachmentProtectionSelect,
  messageProtectionSelect,
  mediaAttachmentIsProtected,
  type MessageProtectionContext
} from './media-protection';
// #4384 — le prédicat de CONTENU, réutilisé et non recopié. Il vit chez la
// lecture souveraine (`GET /admin/conversations/:id/messages`) parce que c'est
// elle qui l'a écrit le premier ; la question qu'il tranche — « le texte de ce
// message a-t-il le droit de voyager en clair ? » — est identique ici, sur la
// même colonne du même modèle. Une seconde écriture ne pourrait que diverger,
// et elle divergerait en silence : c'est exactement la classe de défaut que
// `media-protection.ts` ferme pour les MÉDIAS.
import { messageContentIsProtected } from './conversation-messages-sovereign';

/**
 * Plafond de SCAN de `GET /admin/translations` (#4165).
 *
 * Le pas de pagination de cette route est la TRADUCTION — une ligne par couple
 * message × langue cible, aplatie depuis la colonne JSON `Message.translations`
 * — et non le message. Un `skip`/`take` posé sur `message.findMany` ne peut donc
 * PAS servir la fenêtre demandée : il décalerait une seconde fois un `offset`
 * déjà appliqué au tableau aplati, et les pages 2+ sauteraient des lignes.
 *
 * Ce qui est borné ici est donc le SCAN, pas la page. Le plafond est volontairement
 * généreux : en deçà, `total` reste le VRAI compte des traductions filtrées et la
 * route répond exactement comme avant ; au-delà, la troncature est DÉCLARÉE par
 * `hasMore` plutôt que passée sous silence. Ce qui disparaît est le pire cas que
 * l'audit nomme — « TOUS les messages traduits », sans borne d'aucune sorte.
 */
const TRANSLATIONS_MESSAGE_SCAN_CAP = 5_000;

/**
 * Lignes des deux listes d'administration de ce fichier.
 *
 * Elles étaient déclarées `data: { type: 'array', items: { type: 'object' } }`.
 * Sans `properties`, fast-json-stringify applique `additionalProperties: false`
 * par défaut et sérialise CHAQUE élément en `{}` — la liste sortait donc de la
 * bonne longueur, avec sa pagination juste, et toutes ses lignes vides. C'est
 * la forme la plus trompeuse de ce défaut : une réponse valide en apparence.
 *
 * Les deux tableaux de bord web qui les lisent (`admin.service.ts`) rendaient
 * donc des rangées sans contenu.
 *
 * Source de vérité de la forme : le `select` Prisma de chaque handler, dont la
 * valeur part telle quelle dans `sendPaginatedSuccess`.
 */
const adminMessageRowSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    content: { type: 'string', nullable: true },
    // #4384 — le FAIT qu'une ligne soit amputée, jamais le MÉCANISME qui l'a
    // décidé : les six drapeaux (`isViewOnce`, `isBlurred`, `effectFlags`,
    // `expiresAt`, `isEncrypted`, `encryptionMode`) sont retirés à la SOURCE,
    // dans le `map` du handler. Sans cette ligne, fast-json-stringify
    // éjecterait `isProtected` et la liste rendrait un `content: null` que
    // rien ne distingue d'un message vide.
    isProtected: { type: 'boolean' },
    messageType: { type: 'string', nullable: true },
    originalLanguage: { type: 'string', nullable: true },
    isEdited: { type: 'boolean', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    sender: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        userId: { type: 'string', nullable: true },
        displayName: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true },
        type: { type: 'string', nullable: true },
        language: { type: 'string', nullable: true },
        user: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            username: { type: 'string', nullable: true },
            displayName: { type: 'string', nullable: true },
            firstName: { type: 'string', nullable: true },
            lastName: { type: 'string', nullable: true },
            avatar: { type: 'string', nullable: true }
          }
        }
      }
    },
    conversation: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        identifier: { type: 'string', nullable: true },
        title: { type: 'string', nullable: true },
        type: { type: 'string', nullable: true }
      }
    },
    attachments: {
      type: 'array',
      items: {
        type: 'object',
        // `attachmentMediaSelect` porte une quinzaine de champs et évolue avec
        // le pipeline média. Une pièce jointe est ici une donnée d'inspection,
        // pas un contrat client : `additionalProperties: true` la laisse
        // passer entière plutôt que de figer une copie qui dériverait.
        additionalProperties: true
      }
    },
    _count: {
      type: 'object',
      properties: { replies: { type: 'number' } }
    }
  }
} as const;

const adminCommunityRowSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    identifier: { type: 'string', nullable: true },
    name: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true },
    isPrivate: { type: 'boolean', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    creator: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        username: { type: 'string', nullable: true },
        displayName: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true }
      }
    },
    _count: {
      type: 'object',
      properties: {
        members: { type: 'number' },
        Conversation: { type: 'number' }
      }
    }
  }
} as const;

// Middleware d'autorisation admin
// `requireAdmin` était une garde LOCALE : elle rejouait une liste de rôles en dur
// (#4153). Elle nomme désormais la permission qu'elle exige, et la matrice
// décide — un seul endroit où lire la loi, un seul où la changer.
const requireAdmin = requirePermission('canAccessAdmin');

export async function registerContentRoutes(fastify: FastifyInstance) {
  // Gestion des messages - Liste avec pagination
  fastify.get('/messages', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get paginated list of messages with filtering by content, type, and time period. Requires canModerateContent permission.',
      tags: ['admin'],
      summary: 'List messages with pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Pagination offset', default: '0' },
          limit: { type: 'string', description: 'Pagination limit (max 100)', default: '20' },
          search: { type: 'string', description: 'Search in message content' },
          type: { type: 'string', description: 'Filter by message type' },
          period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Filter by time period' }
        }
      },
      response: {
        200: {
          description: 'Messages list successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: adminMessageRowSchema },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role as UserRole);

      if (!permissions.canModerateContent) {
        return sendForbidden(reply, 'Permission insuffisante pour gerer les messages');
      }

      /* istanbul ignore next -- Fastify schema applies defaults; destructuring defaults never reached */
      const { offset = '0', limit = '20', search, type, period } = request.query as MessageListQuery;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      // Construire les filtres
      const where: any = { deletedAt: null };

      if (search) {
        where.content = { contains: search, mode: 'insensitive' };
      }

      if (type) {
        where.messageType = type;
      }

      // Filtre par periode
      if (period) {
        const now = new Date();
        let startDate = new Date();

        switch (period) {
          case 'today':
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'week':
            startDate.setDate(startDate.getDate() - 7);
            break;
          case 'month':
            startDate.setDate(startDate.getDate() - 30);
            break;
        }

        where.createdAt = { gte: startDate };
      }

      const [messages, totalCount] = await Promise.all([
        fastify.prisma.message.findMany({
          where,
          select: {
            id: true,
            content: true,
            messageType: true,
            originalLanguage: true,
            isEdited: true,
            createdAt: true,
            ...messageProtectionSelect,
            // #4384 — les DEUX dimensions qu'un TEXTE exige et qu'un média
            // n'a pas. `messageProtectionSelect` est la forme du prédicat
            // MÉDIA : elle s'arrête aux cinq colonnes que
            // `mediaAttachmentIsProtected` lit. Un message CHIFFRÉ n'a pas de
            // pendant côté pièce jointe dans ce prédicat-là, et sans ces deux
            // colonnes chargées `messageContentIsProtected` ne peut rien
            // trancher — « un champ de protection présent au modèle et absent
            // de toute requête » ne garde rien.
            isEncrypted: true,
            encryptionMode: true,
            sender: {
              select: {
                id: true,
                userId: true,
                displayName: true,
                avatar: true,
                type: true,
                language: true,
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                    avatar: true
                  }
                }
              }
            },
            conversation: {
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true
              }
            },
            attachments: { select: { ...attachmentMediaSelect, ...attachmentProtectionSelect } },
            _count: {
              select: {
                replies: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.message.count({ where })
      ]);

      // #4333 bonus — un média à vue unique / flouté / éphémère-expiré ne
      // sort plus entier par cette liste platefome-entière : même prédicat,
      // même forme que #4157 c.4 sur `GET /admin/users/:userId/media`. Les
      // cinq colonnes de protection du MESSAGE (`...messageProtectionSelect`
      // ci-dessus) ne servent qu'à ce calcul et ne sont pas déclarées dans
      // `adminMessageRowSchema` : elles sont retirées ici, à la SOURCE,
      // plutôt que laissées à une omission de schéma pour les taire.
      const data = messages.map((message) => {
        const {
          isViewOnce, isBlurred, effectFlags, expiresAt, deletedAt,
          isEncrypted, encryptionMode,
          attachments, ...rest
        } = message;
        const messageContext: MessageProtectionContext = { isViewOnce, isBlurred, effectFlags, expiresAt, deletedAt };
        // #4384 — le TEXTE, gardé par le prédicat que la lecture souveraine
        // applique déjà à la même colonne. La ligne reste LISTÉE (auteur,
        // dates, conversation, nombre de pièces jointes) : un modérateur doit
        // pouvoir CONSTATER qu'un message existe. Seul son contenu tombe.
        const contenuProtege = messageContentIsProtected(message);
        return {
          ...rest,
          content: contenuProtege ? null : rest.content,
          isProtected: contenuProtege,
          attachments: attachments.map((attachment) => {
            const protege = mediaAttachmentIsProtected(attachment, messageContext);
            // Comme #4157 c.4 : seul `isProtected` sort, jamais les trois
            // drapeaux bruts qui l'ont décidé — la ligne annonce l'EFFET,
            // pas le mécanisme.
            const { isViewOnce: _iv, isBlurred: _ib, effectFlags: _ef, ...attachmentRest } = attachment;
            return {
              ...attachmentRest,
              fileUrl: protege ? null : attachment.fileUrl,
              thumbnailUrl: protege ? null : attachment.thumbnailUrl,
              // #4384 — ce qui partait À CÔTÉ des deux URL que #4333 a coupées.
              // `attachmentMediaSelect` porte le Prisme Linguistique et les
              // variantes d'image, et la ligne sort sous
              // `additionalProperties: true` : tout ce qui est chargé est
              // SERVI. Sur un vocal à vue unique, `transcription.text` EST le
              // message, et `translations[lang]` le redit dans toutes les
              // langues AVEC l'URL de sa piste TTS ; `imageVariants` porte les
              // URL WebP de la MÊME image en d'autres tailles — un contournement
              // direct de `fileUrl: null` — et `thumbHash` en rend une version
              // basse résolution sans réseau, soit la vignette que la ligne
              // au-dessus vient de retirer. `metadata` est libre par contrat
              // (EXIF, analyse IA) : on ferme, on ne parie pas.
              transcription: protege ? null : attachment.transcription,
              translations: protege ? null : attachment.translations,
              imageVariants: protege ? null : attachment.imageVariants,
              thumbHash: protege ? null : attachment.thumbHash,
              metadata: protege ? null : attachment.metadata,
              isProtected: protege
            };
          })
        };
      });

      return sendPaginatedSuccess(reply, data, {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + messages.length < totalCount
      });

    } catch (error) {
      logError(fastify.log, 'Get admin messages error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // Gestion des communautes - Liste avec pagination
  fastify.get('/communities', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get paginated list of communities with filtering options. Requires canManageCommunities permission.',
      tags: ['admin'],
      summary: 'List communities with pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Pagination offset', default: '0' },
          limit: { type: 'string', description: 'Pagination limit (max 100)', default: '20' },
          search: { type: 'string', description: 'Search by name, identifier, description' },
          isPrivate: { type: 'string', enum: ['true', 'false'], description: 'Filter by privacy status' }
        }
      },
      response: {
        200: {
          description: 'Communities list successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: adminCommunityRowSchema },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role as UserRole);

      if (!permissions.canManageCommunities) {
        return sendForbidden(reply, 'Permission insuffisante pour gerer les communautes');
      }

      /* istanbul ignore next -- Fastify schema applies defaults; destructuring defaults never reached */
      const { offset = '0', limit = '20', search, isPrivate } = request.query as CommunityListQuery;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      // Construire les filtres
      const where: any = {};

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { identifier: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (isPrivate !== undefined) {
        where.isPrivate = isPrivate === 'true';
      }

      const [communities, totalCount] = await Promise.all([
        fastify.prisma.community.findMany({
          where,
          select: {
            id: true,
            identifier: true,
            name: true,
            description: true,
            avatar: true,
            isPrivate: true,
            createdAt: true,
            creator: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            },
            _count: {
              select: {
                members: true,
                Conversation: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.community.count({ where })
      ]);

      return sendPaginatedSuccess(reply, communities, {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + communities.length < totalCount
      });

    } catch (error) {
      logError(fastify.log, 'Get admin communities error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // Gestion des traductions - Liste avec pagination
  fastify.get('/translations', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get paginated list of message translations with filtering by source/target language and time period. Requires canManageTranslations permission.',
      tags: ['admin'],
      summary: 'List translations with pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Pagination offset', default: '0' },
          limit: { type: 'string', description: 'Pagination limit (max 100)', default: '20' },
          sourceLanguage: { type: 'string', description: 'Filter by source language code' },
          targetLanguage: { type: 'string', description: 'Filter by target language code' },
          period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Filter by time period' }
        }
      },
      response: {
        200: {
          description: 'Translations list successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: { type: 'object', additionalProperties: true } },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role as UserRole);

      if (!permissions.canManageTranslations) {
        return sendForbidden(reply, 'Permission insuffisante pour gerer les traductions');
      }

      /* istanbul ignore next -- Fastify schema applies defaults; destructuring defaults never reached */
      const { offset = '0', limit = '20', sourceLanguage, targetLanguage, period } = request.query as TranslationListQuery;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      // Construire les filtres
      const where: any = {};

      if (sourceLanguage) {
        where.originalLanguage = sourceLanguage;
      }

      // Filtre par periode
      if (period) {
        const now = new Date();
        let startDate = new Date();

        switch (period) {
          case 'today':
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'week':
            startDate.setDate(startDate.getDate() - 7);
            break;
          case 'month':
            startDate.setDate(startDate.getDate() - 30);
            break;
        }

        where.createdAt = { gte: startDate };
      }

      // Récupérer messages avec translations (JSON)
      const messages = await fastify.prisma.message.findMany({
        where: {
          ...where,
          translations: {
            not: null
          }
        },
        select: {
          id: true,
          content: true,
          originalLanguage: true,
          translations: true,
          createdAt: true,
          sender: {
            select: {
              id: true,
              userId: true,
              displayName: true,
              user: { select: { username: true } }
            }
          },
          conversation: {
            select: {
              id: true,
              identifier: true,
              title: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: TRANSLATIONS_MESSAGE_SCAN_CAP
      });

      // Le scan a-t-il été tronqué ? Si oui, `total` ne compte que la fenêtre
      // lue et `hasMore` doit le dire — il ne peut alors qu'être trop prudent,
      // jamais trop optimiste.
      const scanTronque = messages.length === TRANSLATIONS_MESSAGE_SCAN_CAP;

      // "Dé-normaliser" le JSON translations vers array plat
      interface FlatTranslation {
        id: string;
        messageId: string;
        sourceLanguage: string;
        targetLanguage: string;
        translatedContent: string;
        translationModel: string;
        confidenceScore: number | null;
        createdAt: Date;
        message: {
          id: string;
          content: string;
          originalLanguage: string;
          sender: any;
          conversation: any;
        };
      }

      const allTranslations: FlatTranslation[] = [];

      messages.forEach(msg => {
        const translations = msg.translations as unknown as Record<string, any>;
        if (translations) {
          Object.entries(translations).forEach(([targetLang, transData]: [string, any]) => {
            allTranslations.push({
              id: `${msg.id}-${targetLang}`,
              messageId: msg.id,
              sourceLanguage: msg.originalLanguage || 'unknown',
              targetLanguage: targetLang,
              translatedContent: transData.text,
              translationModel: transData.translationModel,
              confidenceScore: transData.confidenceScore ?? null,
              createdAt: transData.createdAt || msg.createdAt,
              message: {
                id: msg.id,
                content: msg.content,
                originalLanguage: msg.originalLanguage,
                sender: msg.sender,
                conversation: msg.conversation
              }
            });
          });
        }
      });

      // Apply targetLanguage filter in-memory (translations are stored as JSON keys)
      const filteredTranslations = targetLanguage
        ? allTranslations.filter(t => t.targetLanguage === targetLanguage)
        : allTranslations;

      // Appliquer pagination sur le array plat
      const totalCount = filteredTranslations.length;
      const paginatedTranslations = filteredTranslations.slice(offsetNum, offsetNum + limitNum);

      return sendPaginatedSuccess(reply, paginatedTranslations.map(translation => ({
        id: translation.id,
        sourceLanguage: translation.sourceLanguage,
        targetLanguage: translation.targetLanguage,
        translatedContent: translation.translatedContent,
        translationModel: translation.translationModel,
        confidenceScore: translation.confidenceScore,
        createdAt: translation.createdAt,
        message: /* istanbul ignore next -- message is always set in allTranslations.push above */ translation.message ? {
          id: translation.message.id,
          content: translation.message.content,
          originalLanguage: translation.message.originalLanguage,
          originalContent: translation.message.content,
          sender: translation.message.sender,
          conversation: translation.message.conversation
        } : null
      })), {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: scanTronque || offsetNum + paginatedTranslations.length < totalCount
      });

    } catch (error) {
      logError(fastify.log, 'Get admin translations error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // Gestion des liens de partage - Liste avec pagination
  fastify.get('/share-links', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get paginated list of conversation share links with filtering options. Requires canManageConversations permission.',
      tags: ['admin'],
      summary: 'List share links with pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Pagination offset', default: '0' },
          limit: { type: 'string', description: 'Pagination limit (max 100)', default: '20' },
          search: { type: 'string', description: 'Search by linkId, identifier, name' },
          isActive: { type: 'string', enum: ['true', 'false'], description: 'Filter by active status' }
        }
      },
      response: {
        200: {
          description: 'Share links list successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            // additionalProperties obligatoire : sans lui, fast-json-stringify
            // sérialise chaque lien en `{}` (tous les champs sont éjectés).
            data: { type: 'array', items: { type: 'object', additionalProperties: true } },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role as UserRole);

      if (!permissions.canManageConversations) {
        return sendForbidden(reply, 'Permission insuffisante pour gerer les liens de partage');
      }

      /* istanbul ignore next -- Fastify schema applies defaults; destructuring defaults never reached */
      const { offset = '0', limit = '20', search, isActive } = request.query as ShareLinkListQuery;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      // Construire les filtres
      const where: any = {};

      if (search) {
        where.OR = [
          { linkId: { contains: search, mode: 'insensitive' } },
          { identifier: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const [shareLinks, totalCount] = await Promise.all([
        fastify.prisma.conversationShareLink.findMany({
          where,
          // #4157 — `linkId` EST le secret qui permet de REJOINDRE la
          // conversation (`middleware`/résolution de lien, cf. `content.ts`
          // ligne ~ci-dessous pour son homologue de recherche) : le servir en
          // LISTE à tout rôle `canManageConversations` (MODERATOR compris)
          // revient à distribuer autant d'invitations que de lignes de cette
          // page. `id` (l'ObjectId, déjà servi) reste la référence OPAQUE sur
          // laquelle la liste agit ; le secret lui-même ne se lit plus qu'au
          // travers du geste dédié `POST /share-links/:id/reveal` (S6, motif
          // écrit, tracé — voir plus bas).
          select: {
            id: true,
            identifier: true,
            name: true,
            description: true,
            maxUses: true,
            currentUses: true,
            maxConcurrentUsers: true,
            currentConcurrentUsers: true,
            expiresAt: true,
            isActive: true,
            allowAnonymousMessages: true,
            allowAnonymousFiles: true,
            allowAnonymousImages: true,
            createdAt: true,
            creator: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            },
            conversation: {
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.conversationShareLink.count({ where })
      ]);

      return sendPaginatedSuccess(
        reply,
        await withAnonymousParticipantCounts(fastify.prisma, shareLinks),
        {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + shareLinks.length < totalCount
        }
      );

    } catch (error) {
      logError(fastify.log, 'Get admin share links error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  /**
   * POST /api/admin/share-links/:id/reveal
   *
   * Le GESTE dédié qui révèle le `linkId` retiré de la liste ci-dessus (#4157,
   * critère 3). Rang SOUVERAIN (BIGBOSS seul — `requireSovereign`, pas
   * `canManageConversations` : une permission de domaine ne doit pas pouvoir
   * délivrer, en série, le secret de jointure de CHAQUE conversation de la
   * plateforme) ; motif écrit obligatoire, imposé par le schéma de requête
   * (`minLength: 10`, Fastify/AJV rejette AVANT que le handler ne s'exécute —
   * la garde du corps n'est donc pas redondante à réécrire ici) ; trace
   * d'audit écrite APRÈS la lecture réussie, jamais avant (`withAudit` est
   * best-effort et ne doit pas conditionner un geste qui a déjà eu lieu).
   */
  fastify.post('/share-links/:id/reveal', {
    onRequest: [fastify.authenticate, requireSovereign()],
    schema: {
      description: 'Révèle le linkId (secret de jointure) d\'un lien de partage. Rang souverain, motif écrit obligatoire, geste tracé — #4157.',
      tags: ['admin'],
      summary: 'Reveal a share link secret',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } }
      },
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 10, description: 'Motif écrit de la révélation (10 caractères minimum), consigné dans AdminAuditLog' }
        }
      },
      response: {
        200: {
          description: 'Secret révélé',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: { id: { type: 'string' }, linkId: { type: 'string' } }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason: string };

      const shareLink = await fastify.prisma.conversationShareLink.findUnique({
        where: { id },
        select: { id: true, linkId: true }
      });

      if (!shareLink) {
        return sendNotFound(reply, 'Lien de partage non trouvé');
      }

      const authContext = (request as UnifiedAuthRequest).authContext;
      await withAudit(request, {
        action: 'ADMIN_SHARE_LINK_REVEALED',
        entity: 'ConversationShareLink',
        entityId: shareLink.id,
        userId: authContext.registeredUser.id,
        reason,
      });

      return sendSuccess(reply, { id: shareLink.id, linkId: shareLink.linkId });
    } catch (error) {
      logError(fastify.log, 'Reveal admin share link error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}

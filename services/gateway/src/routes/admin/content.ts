import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendPaginatedSuccess, sendUnauthorized, sendForbidden, sendInternalError } from '../../utils/response.js';
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
import { requirePermission } from '../../middleware/authorize';

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
            attachments: { select: attachmentMediaSelect },
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

      return sendPaginatedSuccess(reply, messages, {
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
          select: {
            id: true,
            linkId: true,
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
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { permissionsService } from './services/PermissionsService';
import {
  validatePagination,
  type MessageListQuery,
  type CommunityListQuery,
  type TranslationListQuery,
  type ShareLinkListQuery
} from './types';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

// Middleware d'autorisation admin
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as any).authContext;
  if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
    return reply.status(401).send({
      success: false,
      message: 'Authentification requise'
    });
  }

  const permissions = permissionsService.getUserPermissions(authContext.registeredUser.role);
  if (!permissions.canAccessAdmin) {
    return reply.status(403).send({
      success: false,
      message: 'Acces administrateur requis'
    });
  }
};

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
            data: { type: 'array', items: { type: 'object' } },
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
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canModerateContent) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gerer les messages'
        });
      }

      const { offset = '0', limit = '20', search, type, period } = request.query as MessageListQuery;
      const { offsetNum, limitNum } = validatePagination(offset, limit);

      // Construire les filtres
      const where: any = { isDeleted: false };

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
                username: true,
                displayName: true,
                avatar: true
              }
            },
            anonymousSender: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true
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
            attachments: {
              select: {
                id: true,
                fileName: true,
                originalName: true,
                mimeType: true,
                fileSize: true,
                fileUrl: true,
                thumbnailUrl: true,
                width: true,
                height: true,
                duration: true,
                bitrate: true,
                sampleRate: true,
                codec: true,
                channels: true,
                fps: true,
                videoCodec: true,
                pageCount: true,
                lineCount: true,
                uploadedBy: true,
                isAnonymous: true,
                createdAt: true
              }
            },
            _count: {
              select: {
                translations: true,
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

      return reply.send({
        success: true,
        data: messages,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + messages.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get admin messages error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
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
            data: { type: 'array', items: { type: 'object' } },
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
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageCommunities) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gerer les communautes'
        });
      }

      const { offset = '0', limit = '20', search, isPrivate } = request.query as CommunityListQuery;
      const { offsetNum, limitNum } = validatePagination(offset, limit);

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

      return reply.send({
        success: true,
        data: communities,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + communities.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get admin communities error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
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
            data: { type: 'array', items: { type: 'object' } },
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
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageTranslations) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gerer les traductions'
        });
      }

      const { offset = '0', limit = '20', sourceLanguage, targetLanguage, period } = request.query as TranslationListQuery;
      const { offsetNum, limitNum } = validatePagination(offset, limit);

      // Construire les filtres
      const where: any = {};

      if (sourceLanguage) {
        where.message = {
          originalLanguage: sourceLanguage
        };
      }

      if (targetLanguage) {
        where.targetLanguage = targetLanguage;
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

      const [translations, totalCount] = await Promise.all([
        fastify.prisma.messageTranslation.findMany({
          where,
          include: {
            message: {
              select: {
                id: true,
                content: true,
                originalLanguage: true,
                sender: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true
                  }
                },
                conversation: {
                  select: {
                    id: true,
                    identifier: true,
                    title: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.messageTranslation.count({ where })
      ]);

      return reply.send({
        success: true,
        data: translations.map(translation => ({
          id: translation.id,
          sourceLanguage: translation.message?.originalLanguage || null,
          targetLanguage: translation.targetLanguage,
          translatedContent: translation.translatedContent,
          translationModel: translation.translationModel,
          confidenceScore: translation.confidenceScore,
          createdAt: translation.createdAt,
          message: translation.message ? {
            id: translation.message.id,
            content: translation.message.content,
            originalLanguage: translation.message.originalLanguage,
            originalContent: translation.message.content,
            sender: translation.message.sender,
            conversation: translation.message.conversation
          } : null
        })),
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + translations.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get admin translations error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
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
            data: { type: 'array', items: { type: 'object' } },
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
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageConversations) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gerer les liens de partage'
        });
      }

      const { offset = '0', limit = '20', search, isActive } = request.query as ShareLinkListQuery;
      const { offsetNum, limitNum } = validatePagination(offset, limit);

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
            },
            _count: {
              select: {
                anonymousParticipants: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.conversationShareLink.count({ where })
      ]);

      return reply.send({
        success: true,
        data: shareLinks,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + shareLinks.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get admin share links error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });
}

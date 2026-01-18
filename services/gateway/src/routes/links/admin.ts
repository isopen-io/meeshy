import type { FastifyInstance, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest,
  isRegisteredUser
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { shareLinkSchema } from './types';

export async function registerAdminRoutes(fastify: FastifyInstance) {
  const authRequired = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  // Route pour obtenir tous les liens créés par l'utilisateur
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/links/my-links', {
    onRequest: [authRequired],
    schema: {
      description: 'Get all share links created by the authenticated user with pagination. Returns links with conversation details, participant statistics, and language information. Maximum 50 links per request.',
      tags: ['links'],
      summary: 'List user\'s share links',
      querystring: {
        type: 'object',
        properties: {
          limit: {
            type: 'string',
            default: '20',
            description: 'Maximum number of links to return (max 50)',
            example: '20'
          },
          offset: {
            type: 'string',
            default: '0',
            description: 'Number of links to skip for pagination',
            example: '0'
          }
        }
      },
      response: {
        200: {
          description: 'Links retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                allOf: [
                  shareLinkSchema,
                  {
                    type: 'object',
                    properties: {
                      conversation: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          title: { type: 'string' },
                          type: { type: 'string' },
                          description: { type: 'string', nullable: true },
                          conversationUrl: { type: 'string', description: 'URL to conversation', example: '/conversations/:id' }
                        }
                      },
                      creator: {
                        type: 'object',
                        description: 'Link creator information'
                      },
                      stats: {
                        type: 'object',
                        properties: {
                          totalParticipants: { type: 'number' },
                          memberCount: { type: 'number' },
                          anonymousCount: { type: 'number' },
                          languageCount: { type: 'number' },
                          spokenLanguages: { type: 'array', items: { type: 'string' } }
                        }
                      }
                    }
                  }
                ]
              }
            },
            pagination: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                offset: { type: 'number' },
                total: { type: 'number', description: 'Total number of links' },
                hasMore: { type: 'boolean', description: 'Whether more links are available' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      const authContext = request.authContext;
      if (!authContext || !isRegisteredUser(authContext)) {
        return reply.status(401).send({
          success: false,
          error: 'Utilisateur non autorisé'
        });
      }

      const limit = Math.min(parseInt((request.query as any).limit || '20', 10), 50);
      const offset = parseInt((request.query as any).offset || '0', 10);

      const totalCount = await fastify.prisma.conversationShareLink.count({
        where: {
          createdBy: authContext.registeredUser.id
        }
      });

      const links = await fastify.prisma.conversationShareLink.findMany({
        where: {
          createdBy: authContext.registeredUser.id
        },
        include: {
          conversation: {
            select: {
              id: true,
              title: true,
              type: true,
              description: true
            }
          },
          anonymousParticipants: {
            select: {
              id: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: offset,
        take: limit
      });

      const transformedLinks = links.map(link => ({
        ...link,
        conversation: {
          ...link.conversation,
          conversationUrl: `/conversations/${link.conversation.id}`
        },
        creator: {
          id: authContext.registeredUser.id,
          username: authContext.registeredUser.username,
          firstName: authContext.registeredUser.firstName,
          lastName: authContext.registeredUser.lastName,
          displayName: authContext.registeredUser.displayName,
          avatar: authContext.registeredUser.avatar
        },
        stats: {
          totalParticipants: link.anonymousParticipants.length,
          memberCount: 0,
          anonymousCount: link.anonymousParticipants.length,
          languageCount: link.allowedLanguages?.length || 0,
          spokenLanguages: link.allowedLanguages || []
        }
      }));

      return reply.send({
        success: true,
        data: transformedLinks,
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore: offset + links.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get user links error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des liens'
      });
    }
  });

  // Route pour basculer l'état actif/inactif d'un lien
  fastify.patch('/links/:linkId/toggle', {
    onRequest: [authRequired],
    schema: {
      description: 'Toggle a share link\'s active status (activate or deactivate). Only the link creator or conversation administrators/moderators can toggle. When deactivated, the link becomes inaccessible to new and existing anonymous users.',
      tags: ['links'],
      summary: 'Toggle link status',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: {
            type: 'string',
            description: 'Public link identifier (mshy_*)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      body: {
        type: 'object',
        required: ['isActive'],
        properties: {
          isActive: {
            type: 'boolean',
            description: 'New active status for the link',
            example: true
          }
        }
      },
      response: {
        200: {
          description: 'Link status toggled successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: shareLinkSchema,
            message: { type: 'string', description: 'Success message' }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - insufficient permissions',
          ...errorResponseSchema
        },
        404: {
          description: 'Link not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({
          error: 'Utilisateur enregistré requis'
        });
      }

      const userId = request.authContext.registeredUser!.id;
      const { linkId } = request.params as { linkId: string };
      const { isActive } = request.body as { isActive: boolean };

      const link = await fastify.prisma.conversationShareLink.findFirst({
        where: {
          linkId,
          createdBy: userId
        },
        include: {
          conversation: {
            include: {
              members: {
                where: { userId, isActive: true }
              }
            }
          }
        }
      });

      if (!link) {
        return reply.status(404).send({
          success: false,
          message: 'Lien non trouvé'
        });
      }

      const isCreator = link.createdBy === userId;
      const isConversationAdmin = link.conversation.members.some(member =>
        member.role === 'ADMIN' || member.role === 'MODERATOR'
      );

      if (!isCreator && !isConversationAdmin) {
        return reply.status(403).send({
          success: false,
          message: 'Permissions insuffisantes pour modifier ce lien'
        });
      }

      const updatedLink = await fastify.prisma.conversationShareLink.update({
        where: { id: link.id },
        data: { isActive },
        include: {
          conversation: {
            select: {
              id: true,
              title: true,
              description: true,
              type: true,
              isActive: true,
              createdAt: true,
              updatedAt: true
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

      return reply.send({
        success: true,
        data: updatedLink,
        message: isActive ? 'Lien activé avec succès' : 'Lien désactivé avec succès'
      });

    } catch (error) {
      logError(fastify.log, 'Toggle link status error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la modification du statut du lien'
      });
    }
  });

  // Route pour prolonger la durée d'un lien
  fastify.patch('/links/:linkId/extend', {
    onRequest: [authRequired],
    schema: {
      description: 'Extend a share link\'s expiration date. Only the link creator or conversation administrators/moderators can extend. Provide a new expiresAt timestamp in ISO 8601 format.',
      tags: ['links'],
      summary: 'Extend link expiration',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: {
            type: 'string',
            description: 'Public link identifier (mshy_*)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      body: {
        type: 'object',
        required: ['expiresAt'],
        properties: {
          expiresAt: {
            type: 'string',
            format: 'date-time',
            description: 'New expiration timestamp (ISO 8601)',
            example: '2024-12-31T23:59:59Z'
          }
        }
      },
      response: {
        200: {
          description: 'Link expiration extended successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: shareLinkSchema,
            message: { type: 'string', example: 'Lien prolongé avec succès' }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - insufficient permissions',
          ...errorResponseSchema
        },
        404: {
          description: 'Link not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({
          error: 'Utilisateur enregistré requis'
        });
      }

      const userId = request.authContext.registeredUser!.id;
      const { linkId } = request.params as { linkId: string };
      const { expiresAt } = request.body as { expiresAt: string };

      const link = await fastify.prisma.conversationShareLink.findFirst({
        where: {
          linkId,
          createdBy: userId
        },
        include: {
          conversation: {
            include: {
              members: {
                where: { userId, isActive: true }
              }
            }
          }
        }
      });

      if (!link) {
        return reply.status(404).send({
          success: false,
          message: 'Lien non trouvé'
        });
      }

      const isCreator = link.createdBy === userId;
      const isConversationAdmin = link.conversation.members.some(member =>
        member.role === 'ADMIN' || member.role === 'MODERATOR'
      );

      if (!isCreator && !isConversationAdmin) {
        return reply.status(403).send({
          success: false,
          message: 'Permissions insuffisantes pour modifier ce lien'
        });
      }

      const updatedLink = await fastify.prisma.conversationShareLink.update({
        where: { id: link.id },
        data: { expiresAt: new Date(expiresAt) },
        include: {
          conversation: {
            select: {
              id: true,
              title: true,
              description: true,
              type: true,
              isActive: true,
              createdAt: true,
              updatedAt: true
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

      return reply.send({
        success: true,
        data: updatedLink,
        message: 'Lien prolongé avec succès'
      });

    } catch (error) {
      logError(fastify.log, 'Extend link duration error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la prolongation du lien'
      });
    }
  });

  // Route pour supprimer un lien
  fastify.delete('/links/:linkId', {
    onRequest: [authRequired],
    schema: {
      description: 'Permanently delete a share link. Only the link creator or conversation administrators/moderators can delete. This action is irreversible and will immediately invalidate all anonymous participants using this link.',
      tags: ['links'],
      summary: 'Delete share link',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: {
            type: 'string',
            description: 'Public link identifier (mshy_*)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      response: {
        200: {
          description: 'Link deleted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Lien supprimé avec succès' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - insufficient permissions to delete link',
          ...errorResponseSchema
        },
        404: {
          description: 'Link not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({
          error: 'Utilisateur enregistré requis'
        });
      }

      const userId = request.authContext.registeredUser!.id;
      const { linkId } = request.params as { linkId: string };

      const link = await fastify.prisma.conversationShareLink.findFirst({
        where: {
          linkId,
          createdBy: userId
        },
        include: {
          conversation: {
            include: {
              members: {
                where: { userId, isActive: true }
              }
            }
          }
        }
      });

      if (!link) {
        return reply.status(404).send({
          success: false,
          message: 'Lien non trouvé'
        });
      }

      const isCreator = link.createdBy === userId;
      const isConversationAdmin = link.conversation.members.some(member =>
        member.role === 'ADMIN' || member.role === 'MODERATOR'
      );

      if (!isCreator && !isConversationAdmin) {
        return reply.status(403).send({
          success: false,
          message: 'Permissions insuffisantes pour supprimer ce lien'
        });
      }

      await fastify.prisma.conversationShareLink.delete({
        where: { id: link.id }
      });

      return reply.send({
        success: true,
        data: { message: 'Lien supprimé avec succès' }
      });

    } catch (error) {
      logError(fastify.log, 'Delete link error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la suppression du lien'
      });
    }
  });
}

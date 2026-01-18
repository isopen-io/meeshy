/**
 * Settings and modification routes for communities
 */
import { FastifyInstance } from 'fastify';
import {
  communitySchema,
  updateCommunityRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import {
  UpdateCommunitySchema,
  generateIdentifier
} from './types';

export async function registerSettingsRoutes(fastify: FastifyInstance) {
  // Route pour mettre a jour une communaute
  fastify.put('/communities/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update a community. Only the community creator can update community details. All fields are optional. If a new identifier is provided, it will be validated for uniqueness.',
      tags: ['communities'],
      summary: 'Update a community',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID'
          }
        }
      },
      body: updateCommunityRequestSchema,
      response: {
        200: {
          description: 'Community successfully updated',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: communitySchema
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        403: {
          description: 'Access denied - only the community creator can update the community',
          ...errorResponseSchema
        },
        404: {
          description: 'Community not found',
          ...errorResponseSchema
        },
        409: {
          description: 'New identifier already exists',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const validatedData = UpdateCommunitySchema.parse(request.body);

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Verifier que l'utilisateur est le createur de la communaute
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: { createdBy: true, identifier: true }
      });

      if (!community) {
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      if (community.createdBy !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Only community creator can update community'
        });
      }

      // Preparer les donnees de mise a jour
      const updateData: any = {
        name: validatedData.name,
        description: validatedData.description,
        avatar: validatedData.avatar,
        isPrivate: validatedData.isPrivate
      };

      // Gerer l'identifier si fourni
      if (validatedData.identifier !== undefined) {
        const newIdentifier = generateIdentifier(validatedData.name || '', validatedData.identifier);

        // Verifier que le nouvel identifier est unique (sauf si c'est le meme)
        if (newIdentifier !== community.identifier) {
          const existingCommunity = await fastify.prisma.community.findUnique({
            where: { identifier: newIdentifier }
          });

          if (existingCommunity) {
            return reply.status(409).send({
              success: false,
              error: `A community with identifier "${newIdentifier}" already exists`
            });
          }
        }

        updateData.identifier = newIdentifier;
      }

      const updatedCommunity = await fastify.prisma.community.update({
        where: { id },
        data: updateData,
        include: {
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
        }
      });

      reply.send({
        success: true,
        data: updatedCommunity
      });
    } catch (error) {
      console.error('Error updating community:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to update community'
      });
    }
  });

  // Route pour supprimer une communaute
  fastify.delete('/communities/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Delete a community permanently. Only the community creator can delete the community. This will also cascade delete all associated members and conversations.',
      tags: ['communities'],
      summary: 'Delete a community',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID'
          }
        }
      },
      response: {
        200: {
          description: 'Community successfully deleted',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Community deleted successfully' }
              }
            }
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        403: {
          description: 'Access denied - only the community creator can delete the community',
          ...errorResponseSchema
        },
        404: {
          description: 'Community not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Verifier que l'utilisateur est le createur de la communaute
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: { createdBy: true }
      });

      if (!community) {
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      if (community.createdBy !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Only community creator can delete community'
        });
      }

      await fastify.prisma.community.delete({
        where: { id }
      });

      reply.send({
        success: true,
        data: { message: 'Community deleted successfully' }
      });
    } catch (error) {
      console.error('Error deleting community:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to delete community'
      });
    }
  });
}

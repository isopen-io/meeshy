import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { logError } from '../../utils/logger';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest,
  isRegisteredUser
} from '../../middleware/auth';
import {
  trackingLinkSchema,
  errorResponseSchema,
  validationErrorResponseSchema,
} from '@meeshy/shared/types/api-schemas';
import {
  createTrackingLinkSchema,
  enrichTrackingLink
} from './types';

/**
 * Routes de création et gestion des liens de tracking
 */
export async function registerCreationRoutes(fastify: FastifyInstance) {
  const trackingLinkService = new TrackingLinkService(fastify.prisma);

  const authOptional = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: false,
    allowAnonymous: true
  });
  const authRequired = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  /**
   * 1. Créer un lien de tracking
   * POST /api/tracking-links
   */
  fastify.post('/tracking-links', {
    onRequest: [authOptional],
    schema: {
      description: 'Create a new tracking link for URL analytics. Supports both authenticated and anonymous users. If a tracking link already exists for the same URL and conversation, returns the existing link. Each link gets a unique 6-character alphanumeric token used for redirection.',
      tags: ['tracking-links'],
      summary: 'Create tracking link',
      body: {
        type: 'object',
        required: ['originalUrl'],
        properties: {
          originalUrl: {
            type: 'string',
            format: 'uri',
            description: 'The original URL to track'
          },
          name: {
            type: 'string',
            maxLength: 32,
            description: 'Optional display name for the link'
          },
          campaign: {
            type: 'string',
            maxLength: 100,
            description: 'UTM campaign name'
          },
          source: {
            type: 'string',
            maxLength: 100,
            description: 'UTM source (e.g., facebook, newsletter)'
          },
          medium: {
            type: 'string',
            maxLength: 100,
            description: 'UTM medium (e.g., social, email, cpc)'
          },
          conversationId: {
            type: 'string',
            description: 'Optional conversation ID to associate with this link'
          },
          messageId: {
            type: 'string',
            description: 'Optional message ID to associate with this link'
          },
          expiresAt: {
            type: 'string',
            format: 'date-time',
            description: 'Optional expiration date for the tracking link'
          },
          customToken: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]{2,50}$',
            description: 'Optional custom token (2-50 alphanumeric chars, dashes, underscores)'
          }
        }
      },
      response: {
        200: {
          description: 'Existing tracking link found and returned',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                trackingLink: {
                  ...trackingLinkSchema,
                  properties: {
                    ...trackingLinkSchema.properties,
                    fullUrl: { type: 'string', description: 'Complete tracking URL' }
                  }
                },
                existed: { type: 'boolean', example: true }
              }
            }
          }
        },
        201: {
          description: 'New tracking link created successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                trackingLink: {
                  ...trackingLinkSchema,
                  properties: {
                    ...trackingLinkSchema.properties,
                    fullUrl: { type: 'string', description: 'Complete tracking URL' }
                  }
                }
              }
            }
          }
        },
        400: {
          description: 'Invalid request data',
          ...validationErrorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      const body = createTrackingLinkSchema.parse(request.body);

      let createdBy: string | undefined;
      if (isRegisteredUser(request.authContext)) {
        createdBy = request.authContext.registeredUser!.id;
      }

      const existingLink = await trackingLinkService.findExistingTrackingLink(
        body.originalUrl,
        body.conversationId
      );

      if (existingLink) {
        return reply.send({
          success: true,
          data: {
            trackingLink: enrichTrackingLink(existingLink, request),
            existed: true
          }
        });
      }

      const trackingLink = await trackingLinkService.createTrackingLink({
        originalUrl: body.originalUrl,
        name: body.name,
        campaign: body.campaign,
        source: body.source,
        medium: body.medium,
        createdBy,
        conversationId: body.conversationId,
        messageId: body.messageId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        customToken: body.customToken
      });

      return reply.status(201).send({
        success: true,
        data: {
          trackingLink: enrichTrackingLink(trackingLink, request)
        }
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Données invalides',
          details: error.errors
        });
      }
      if (error instanceof Error && error.message === 'Token already exists') {
        return reply.status(409).send({
          success: false,
          error: 'Ce token existe déjà'
        });
      }
      logError(fastify.log, 'Create tracking link error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  /**
   * 4. Récupérer les informations d'un lien de tracking
   * GET /api/tracking-links/:token
   */
  fastify.get('/tracking-links/:token', {
    onRequest: [authOptional],
    schema: {
      description: 'Get tracking link details by token. Only the creator of the link can view its full details. Returns complete tracking link information including click counts and metadata.',
      tags: ['tracking-links'],
      summary: 'Get tracking link details',
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]{2,50}$',
            description: 'Unique alphanumeric tracking token (2-50 chars)'
          }
        }
      },
      response: {
        200: {
          description: 'Tracking link details retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                trackingLink: trackingLinkSchema
              }
            }
          }
        },
        403: {
          description: 'Access denied - only creator can view details',
          ...errorResponseSchema
        },
        404: {
          description: 'Tracking link not found',
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
      const { token } = request.params as { token: string };

      const trackingLink = await trackingLinkService.getTrackingLinkByToken(token);

      if (!trackingLink) {
        return reply.status(404).send({
          success: false,
          error: 'Lien de tracking non trouvé'
        });
      }

      if (trackingLink.createdBy) {
        if (!isRegisteredUser(request.authContext) ||
            request.authContext.registeredUser!.id !== trackingLink.createdBy) {
          return reply.status(403).send({
            success: false,
            error: 'Accès non autorisé'
          });
        }
      }

      return reply.send({
        success: true,
        data: {
          trackingLink
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get tracking link error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  /**
   * 6. Récupérer tous les liens de tracking d'un utilisateur
   * GET /api/tracking-links/user/me?limit=20&offset=0
   */
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/tracking-links/user/me', {
    onRequest: [authRequired],
    schema: {
      description: 'Get all tracking links created by the authenticated user. Supports pagination with configurable limit (max 50) and offset. Returns links ordered by creation date (newest first) with pagination metadata.',
      tags: ['tracking-links'],
      summary: 'List user tracking links',
      querystring: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 50,
            default: 20,
            description: 'Maximum number of links to return (default: 20, max: 50)'
          },
          offset: {
            type: 'number',
            minimum: 0,
            default: 0,
            description: 'Number of links to skip for pagination (default: 0)'
          }
        }
      },
      response: {
        200: {
          description: 'Tracking links retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                trackingLinks: {
                  type: 'array',
                  items: trackingLinkSchema
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                limit: { type: 'number', description: 'Items per page' },
                offset: { type: 'number', description: 'Number of items skipped' },
                total: { type: 'number', description: 'Total number of links' },
                hasMore: { type: 'boolean', description: 'Whether more links exist' }
              }
            }
          }
        },
        403: {
          description: 'Access denied - registered user required',
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
          success: false,
          error: 'Utilisateur enregistré requis'
        });
      }

      const limit = Math.min(parseInt((request.query as any).limit || '20', 10), 50);
      const offset = parseInt((request.query as any).offset || '0', 10);

      const userId = request.authContext.registeredUser!.id;

      const [totalCount, links] = await Promise.all([
        fastify.prisma.trackingLink.count({
          where: { createdBy: userId }
        }),
        fastify.prisma.trackingLink.findMany({
          where: { createdBy: userId },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit
        })
      ]);

      return reply.send({
        success: true,
        data: {
          trackingLinks: links
        },
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore: offset + links.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get user tracking links error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  /**
   * 7. Récupérer tous les liens de tracking d'une conversation
   * GET /api/tracking-links/conversation/:conversationId
   */
  fastify.get('/tracking-links/conversation/:conversationId', {
    onRequest: [authRequired],
    schema: {
      description: 'Get all tracking links associated with a specific conversation. Only active conversation members can access these links. Returns all tracking links created within the conversation context.',
      tags: ['tracking-links', 'conversations'],
      summary: 'List conversation tracking links',
      params: {
        type: 'object',
        required: ['conversationId'],
        properties: {
          conversationId: {
            type: 'string',
            description: 'Unique conversation identifier'
          }
        }
      },
      response: {
        200: {
          description: 'Conversation tracking links retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                trackingLinks: {
                  type: 'array',
                  items: trackingLinkSchema
                }
              }
            }
          }
        },
        403: {
          description: 'Access denied - not a member of this conversation',
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
      const { conversationId } = request.params as { conversationId: string };

      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({
          success: false,
          error: 'Utilisateur enregistré requis'
        });
      }

      const userId = request.authContext.registeredUser!.id;

      const member = await fastify.prisma.conversationMember.findFirst({
        where: {
          conversationId,
          userId,
          isActive: true
        }
      });

      if (!member) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'êtes pas membre de cette conversation'
        });
      }

      const links = await trackingLinkService.getConversationTrackingLinks(conversationId);

      return reply.send({
        success: true,
        data: {
          trackingLinks: links
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get conversation tracking links error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  /**
   * 8. Désactiver un lien de tracking
   * PATCH /api/tracking-links/:token/deactivate
   */
  fastify.patch('/tracking-links/:token/deactivate', {
    onRequest: [authRequired],
    schema: {
      description: 'Deactivate a tracking link to prevent further clicks. Only the creator can deactivate their links. Deactivated links will return 410 Gone status when accessed. This is reversible (can be reactivated via update endpoint).',
      tags: ['tracking-links'],
      summary: 'Deactivate tracking link',
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]{2,50}$',
            description: 'Unique alphanumeric tracking token (2-50 chars)'
          }
        }
      },
      response: {
        200: {
          description: 'Tracking link deactivated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                trackingLink: trackingLinkSchema
              }
            },
            message: { type: 'string', example: 'Lien désactivé avec succès' }
          }
        },
        403: {
          description: 'Access denied - only creator can deactivate',
          ...errorResponseSchema
        },
        404: {
          description: 'Tracking link not found',
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
      const { token } = request.params as { token: string };

      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({
          success: false,
          error: 'Utilisateur enregistré requis'
        });
      }

      const userId = request.authContext.registeredUser!.id;

      const trackingLink = await trackingLinkService.getTrackingLinkByToken(token);

      if (!trackingLink) {
        return reply.status(404).send({
          success: false,
          error: 'Lien de tracking non trouvé'
        });
      }

      if (trackingLink.createdBy && trackingLink.createdBy !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Seul le créateur peut désactiver ce lien'
        });
      }

      const updatedLink = await trackingLinkService.deactivateTrackingLink(token);

      return reply.send({
        success: true,
        data: {
          trackingLink: updatedLink
        },
        message: 'Lien désactivé avec succès'
      });

    } catch (error) {
      logError(fastify.log, 'Deactivate tracking link error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  /**
   * 9. Supprimer un lien de tracking
   * DELETE /api/tracking-links/:token
   */
  fastify.delete('/tracking-links/:token', {
    onRequest: [authRequired],
    schema: {
      description: 'Permanently delete a tracking link and all associated click data. Only the creator can delete their links. This action is irreversible and will remove all analytics data.',
      tags: ['tracking-links'],
      summary: 'Delete tracking link',
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]{2,50}$',
            description: 'Unique alphanumeric tracking token (2-50 chars)'
          }
        }
      },
      response: {
        200: {
          description: 'Tracking link deleted successfully',
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
        403: {
          description: 'Access denied - only creator can delete',
          ...errorResponseSchema
        },
        404: {
          description: 'Tracking link not found',
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
      const { token } = request.params as { token: string };

      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({
          success: false,
          error: 'Utilisateur enregistré requis'
        });
      }

      const userId = request.authContext.registeredUser!.id;

      const trackingLink = await trackingLinkService.getTrackingLinkByToken(token);

      if (!trackingLink) {
        return reply.status(404).send({
          success: false,
          error: 'Lien de tracking non trouvé'
        });
      }

      if (trackingLink.createdBy && trackingLink.createdBy !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Seul le créateur peut supprimer ce lien'
        });
      }

      await trackingLinkService.deleteTrackingLink(token);

      return reply.send({
        success: true,
        data: { message: 'Lien supprimé avec succès' }
      });

    } catch (error) {
      logError(fastify.log, 'Delete tracking link error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  /**
   * 10. Mettre à jour un lien de tracking
   * PATCH /api/tracking-links/:token
   */
  fastify.patch('/tracking-links/:token', {
    onRequest: [authRequired],
    schema: {
      description: 'Update tracking link properties. Only the creator can update their links. Allows changing the original URL, expiration date, active status, or even the token itself. All fields are optional - only provided fields will be updated.',
      tags: ['tracking-links'],
      summary: 'Update tracking link',
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]{2,50}$',
            description: 'Current unique alphanumeric tracking token (2-50 chars)'
          }
        }
      },
      body: {
        type: 'object',
        properties: {
          originalUrl: {
            type: 'string',
            format: 'uri',
            description: 'New original URL to redirect to'
          },
          expiresAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'New expiration date (null to remove expiration)'
          },
          isActive: {
            type: 'boolean',
            description: 'Whether the link is active'
          },
          newToken: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]{2,50}$',
            description: 'New token to replace current token (2-50 chars)'
          }
        }
      },
      response: {
        200: {
          description: 'Tracking link updated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                trackingLink: {
                  ...trackingLinkSchema,
                  properties: {
                    ...trackingLinkSchema.properties,
                    fullUrl: { type: 'string', description: 'Complete tracking URL' }
                  }
                }
              }
            },
            message: { type: 'string', example: 'Lien mis à jour avec succès' }
          }
        },
        400: {
          description: 'Invalid request data (bad URL or token format)',
          ...errorResponseSchema
        },
        403: {
          description: 'Access denied - only creator can update',
          ...errorResponseSchema
        },
        404: {
          description: 'Tracking link not found',
          ...errorResponseSchema
        },
        409: {
          description: 'Conflict - new token already exists',
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
      const { token } = request.params as { token: string };
      const body = request.body as {
        originalUrl?: string;
        expiresAt?: string | null;
        isActive?: boolean;
        newToken?: string;
      };

      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({
          success: false,
          error: 'Utilisateur enregistré requis'
        });
      }

      const userId = request.authContext.registeredUser!.id;

      const trackingLink = await trackingLinkService.getTrackingLinkByToken(token);

      if (!trackingLink) {
        return reply.status(404).send({
          success: false,
          error: 'Lien de tracking non trouvé'
        });
      }

      if (trackingLink.createdBy && trackingLink.createdBy !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Seul le créateur peut modifier ce lien'
        });
      }

      if (body.newToken && !/^[a-zA-Z0-9_-]{2,50}$/.test(body.newToken)) {
        return reply.status(400).send({
          success: false,
          error: 'Le token doit contenir entre 2 et 50 caractères alphanumériques, tirets ou underscores'
        });
      }

      if (body.originalUrl) {
        try {
          new URL(body.originalUrl);
        } catch {
          return reply.status(400).send({
            success: false,
            error: 'URL invalide'
          });
        }
      }

      const updatedLink = await trackingLinkService.updateTrackingLink({
        token,
        originalUrl: body.originalUrl,
        expiresAt: body.expiresAt === null ? null : (body.expiresAt ? new Date(body.expiresAt) : undefined),
        isActive: body.isActive,
        newToken: body.newToken
      });

      return reply.send({
        success: true,
        data: {
          trackingLink: enrichTrackingLink(updatedLink, request)
        },
        message: 'Lien mis à jour avec succès'
      });

    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Tracking link not found') {
          return reply.status(404).send({
            success: false,
            error: 'Lien de tracking non trouvé'
          });
        }
        if (error.message === 'Token already exists') {
          return reply.status(409).send({
            success: false,
            error: 'Ce token existe déjà'
          });
        }
      }

      logError(fastify.log, 'Update tracking link error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  /**
   * 11. Vérifier la disponibilité d'un token
   * GET /api/tracking-links/check-token/:token
   */
  fastify.get('/tracking-links/check-token/:token', {
    onRequest: [authRequired],
    schema: {
      description: 'Check if a tracking token is available for use. Useful when creating custom tokens to verify uniqueness before creation. Returns availability status for the requested token.',
      tags: ['tracking-links'],
      summary: 'Check token availability',
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]{2,50}$',
            description: 'Token to check (2-50 alphanumeric characters, dashes, underscores)'
          }
        }
      },
      response: {
        200: {
          description: 'Token availability checked successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                token: { type: 'string', description: 'The checked token' },
                available: { type: 'boolean', description: 'Whether the token is available' }
              }
            }
          }
        },
        400: {
          description: 'Invalid token format',
          ...errorResponseSchema
        },
        403: {
          description: 'Access denied - registered user required',
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
      const { token } = request.params as { token: string };

      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({
          success: false,
          error: 'Utilisateur enregistré requis'
        });
      }

      if (!/^[a-zA-Z0-9_-]{2,50}$/.test(token)) {
        return reply.status(400).send({
          success: false,
          error: 'Le token doit contenir entre 2 et 50 caractères alphanumériques, tirets ou underscores'
        });
      }

      const isAvailable = await trackingLinkService.isTokenAvailable(token);

      return reply.send({
        success: true,
        data: {
          token,
          available: isAvailable
        }
      });

    } catch (error) {
      logError(fastify.log, 'Check token availability error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });
}

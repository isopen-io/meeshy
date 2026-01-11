import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TrackingLinkService } from '../services/TrackingLinkService';
import { logError } from '../utils/logger';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest,
  isRegisteredUser
} from '../middleware/auth';
import type { TrackingLink } from '@meeshy/shared/types/tracking-link';
import {
  trackingLinkSchema,
  trackingLinkClickSchema,
  errorResponseSchema,
  validationErrorResponseSchema,
} from '@meeshy/shared/types/api-schemas';

/**
 * Helper pour enrichir un TrackingLink avec l'URL complète
 * Construit l'URL basée sur FRONTEND_URL ou le domaine de la requête
 */
function enrichTrackingLink(link: TrackingLink, request?: FastifyRequest): TrackingLink & { fullUrl?: string } {
  const trackingService = new TrackingLinkService(null as any); // Just for the helper method
  const fullUrl = trackingService.buildTrackingUrl(link.token);
  
  return {
    ...link,
    fullUrl // Ajouter l'URL complète pour le client
  };
}

// Schémas de validation Zod
const createTrackingLinkSchema = z.object({
  originalUrl: z.string().url('URL invalide'),
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
  expiresAt: z.string().datetime().optional()
});

const recordClickSchema = z.object({
  ipAddress: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  userAgent: z.string().optional(),
  browser: z.string().optional(),
  os: z.string().optional(),
  device: z.string().optional(),
  language: z.string().optional(),
  referrer: z.string().optional(),
  deviceFingerprint: z.string().optional()
});

const getStatsSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

/**
 * Routes pour les liens de tracking
 */
export async function trackingLinksRoutes(fastify: FastifyInstance) {
  const trackingLinkService = new TrackingLinkService(fastify.prisma);

  // Middleware d'authentification
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

      // Vérifier si un lien existe déjà pour cette URL dans cette conversation
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

      // Créer un nouveau lien de tracking
      const trackingLink = await trackingLinkService.createTrackingLink({
        originalUrl: body.originalUrl,
        createdBy,
        conversationId: body.conversationId,
        messageId: body.messageId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined
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
      logError(fastify.log, 'Create tracking link error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  /**
   * 2. Rediriger un lien de tracking et enregistrer le clic
   * GET /l/:token
   */
  fastify.get('/l/:token', {
    onRequest: [authOptional],
    schema: {
      description: 'Redirect to the original URL and record click analytics. Automatically captures visitor information including IP address, user agent, browser, OS, device type, referrer, and language. Associates clicks with authenticated or anonymous users if available.',
      tags: ['tracking-links'],
      summary: 'Redirect tracking link',
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            pattern: '^[a-zA-Z0-9]{6}$',
            description: 'Unique 6-character alphanumeric tracking token'
          }
        }
      },
      response: {
        302: {
          description: 'Redirect to original URL'
        },
        400: {
          description: 'Invalid token format',
          ...errorResponseSchema
        },
        404: {
          description: 'Tracking link not found',
          ...errorResponseSchema
        },
        410: {
          description: 'Link inactive or expired',
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

      // Valider le token (6 caractères alphanumériques)
      if (!/^[a-zA-Z0-9]{6}$/.test(token)) {
        return reply.status(400).send({
          success: false,
          error: 'Token invalide'
        });
      }

      // Récupérer le lien de tracking
      const trackingLink = await trackingLinkService.getTrackingLinkByToken(token);

      if (!trackingLink) {
        return reply.status(404).send({
          success: false,
          error: 'Lien de tracking non trouvé'
        });
      }

      // Vérifier si le lien est actif
      if (!trackingLink.isActive) {
        return reply.status(410).send({
          success: false,
          error: 'Ce lien n\'est plus actif'
        });
      }

      // Vérifier si le lien a expiré
      if (trackingLink.expiresAt && new Date() > trackingLink.expiresAt) {
        return reply.status(410).send({
          success: false,
          error: 'Ce lien a expiré'
        });
      }

      // Extraire les informations du visiteur
      const ipAddress = (request.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || 
                        (request.headers['x-real-ip'] as string) ||
                        request.ip;
      const userAgent = request.headers['user-agent'] as string;
      const referrer = request.headers['referer'] as string;
      const language = (request.headers['accept-language'] as string)?.split(',')[0].split('-')[0];

      // Détecter le navigateur et l'OS à partir du user agent
      const browser = detectBrowser(userAgent);
      const os = detectOS(userAgent);
      const device = detectDevice(userAgent);

      // Récupérer l'ID de l'utilisateur si connecté
      let userId: string | undefined;
      let anonymousId: string | undefined;

      if (isRegisteredUser(request.authContext)) {
        userId = request.authContext.registeredUser!.id;
      } else if (request.authContext.type === 'session' && request.authContext.anonymousUser) {
        anonymousId = request.authContext.anonymousUser.id;
      }

      // Enregistrer le clic
      await trackingLinkService.recordClick({
        token,
        userId,
        anonymousId,
        ipAddress,
        userAgent,
        browser,
        os,
        device,
        language,
        referrer
      });

      // Rediriger vers l'URL originale
      return reply.redirect(trackingLink.originalUrl);

    } catch (error) {
      logError(fastify.log, 'Redirect tracking link error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  /**
   * 3. Enregistrer un clic manuellement (pour les SPAs)
   * POST /api/tracking-links/:token/click
   */
  fastify.post('/tracking-links/:token/click', {
    onRequest: [authOptional],
    schema: {
      description: 'Manually record a click on a tracking link. Designed for Single Page Applications (SPAs) that handle navigation client-side. Accepts optional visitor metadata or auto-detects from request headers. Returns the original URL and tracking link details.',
      tags: ['tracking-links'],
      summary: 'Record tracking click',
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            pattern: '^[a-zA-Z0-9]{6}$',
            description: 'Unique 6-character alphanumeric tracking token'
          }
        }
      },
      body: {
        type: 'object',
        properties: {
          ipAddress: { type: 'string', description: 'Visitor IP address (auto-detected if not provided)' },
          country: { type: 'string', description: 'Visitor country code' },
          city: { type: 'string', description: 'Visitor city' },
          region: { type: 'string', description: 'Visitor region/state' },
          userAgent: { type: 'string', description: 'Browser user agent (auto-detected if not provided)' },
          browser: { type: 'string', description: 'Browser name (auto-detected if not provided)' },
          os: { type: 'string', description: 'Operating system (auto-detected if not provided)' },
          device: { type: 'string', enum: ['mobile', 'tablet', 'desktop'], description: 'Device type (auto-detected if not provided)' },
          language: { type: 'string', description: 'Preferred language code' },
          referrer: { type: 'string', description: 'Referrer URL' },
          deviceFingerprint: { type: 'string', description: 'Unique device fingerprint for tracking unique visitors' }
        }
      },
      response: {
        200: {
          description: 'Click recorded successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                originalUrl: { type: 'string', description: 'Original destination URL' },
                trackingLink: trackingLinkSchema
              }
            }
          }
        },
        400: {
          description: 'Invalid token format or request data',
          ...validationErrorResponseSchema
        },
        404: {
          description: 'Tracking link not found',
          ...errorResponseSchema
        },
        410: {
          description: 'Link inactive or expired',
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
      const body = recordClickSchema.parse(request.body);

      // Valider le token
      if (!/^[a-zA-Z0-9]{6}$/.test(token)) {
        return reply.status(400).send({
          success: false,
          error: 'Token invalide'
        });
      }

      // Extraire les informations du visiteur
      const ipAddress = body.ipAddress || 
                        (request.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || 
                        (request.headers['x-real-ip'] as string) ||
                        request.ip;
      const userAgent = body.userAgent || request.headers['user-agent'] as string;

      let userId: string | undefined;
      let anonymousId: string | undefined;

      if (isRegisteredUser(request.authContext)) {
        userId = request.authContext.registeredUser!.id;
      } else if (request.authContext.type === 'session' && request.authContext.anonymousUser) {
        anonymousId = request.authContext.anonymousUser.id;
      }

      // Enregistrer le clic
      const result = await trackingLinkService.recordClick({
        token,
        userId,
        anonymousId,
        ipAddress,
        userAgent,
        browser: body.browser || detectBrowser(userAgent),
        os: body.os || detectOS(userAgent),
        device: body.device || detectDevice(userAgent),
        country: body.country,
        city: body.city,
        region: body.region,
        language: body.language,
        referrer: body.referrer,
        deviceFingerprint: body.deviceFingerprint
      });

      return reply.send({
        success: true,
        data: {
          originalUrl: result.trackingLink.originalUrl,
          trackingLink: result.trackingLink
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
      
      if (error instanceof Error) {
        if (error.message === 'Tracking link not found') {
          return reply.status(404).send({
            success: false,
            error: 'Lien de tracking non trouvé'
          });
        }
        if (error.message === 'Tracking link is inactive') {
          return reply.status(410).send({
            success: false,
            error: 'Ce lien n\'est plus actif'
          });
        }
        if (error.message === 'Tracking link has expired') {
          return reply.status(410).send({
            success: false,
            error: 'Ce lien a expiré'
          });
        }
      }

      logError(fastify.log, 'Record click error:', error);
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
            pattern: '^[a-zA-Z0-9]{6}$',
            description: 'Unique 6-character alphanumeric tracking token'
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

      // Vérifier les permissions (seul le créateur peut voir les détails)
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
   * 5. Récupérer les statistiques d'un lien de tracking
   * GET /api/tracking-links/:token/stats
   */
  fastify.get('/tracking-links/:token/stats', {
    onRequest: [authRequired],
    schema: {
      description: 'Get detailed analytics and statistics for a tracking link. Only authenticated users who created the link can access stats. Supports optional date range filtering. Returns aggregated click data, geographic distribution, device/browser breakdown, and temporal patterns.',
      tags: ['tracking-links'],
      summary: 'Get tracking link statistics',
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            pattern: '^[a-zA-Z0-9]{6}$',
            description: 'Unique 6-character alphanumeric tracking token'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter clicks from this date (ISO 8601 format)'
          },
          endDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter clicks until this date (ISO 8601 format)'
          }
        }
      },
      response: {
        200: {
          description: 'Statistics retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                totalClicks: { type: 'number', description: 'Total number of clicks' },
                uniqueClicks: { type: 'number', description: 'Number of unique visitors' },
                clicksByCountry: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      country: { type: 'string' },
                      count: { type: 'number' }
                    }
                  }
                },
                clicksByDevice: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      device: { type: 'string' },
                      count: { type: 'number' }
                    }
                  }
                },
                clicksByBrowser: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      browser: { type: 'string' },
                      count: { type: 'number' }
                    }
                  }
                },
                clicksByOS: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      os: { type: 'string' },
                      count: { type: 'number' }
                    }
                  }
                },
                clicksByDate: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      date: { type: 'string', format: 'date' },
                      count: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        },
        400: {
          description: 'Invalid query parameters',
          ...validationErrorResponseSchema
        },
        403: {
          description: 'Access denied - only creator can view statistics',
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
      const query = getStatsSchema.parse(request.query);

      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({
          success: false,
          error: 'Utilisateur enregistré requis'
        });
      }

      const userId = request.authContext.registeredUser!.id;

      // Vérifier que l'utilisateur est le créateur du lien
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
          error: 'Accès non autorisé'
        });
      }

      const stats = await trackingLinkService.getTrackingLinkStats(token, {
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined
      });

      return reply.send({
        success: true,
        data: stats
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Paramètres invalides',
          details: error.errors
        });
      }
      logError(fastify.log, 'Get tracking link stats error:', error);
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

      // Pagination parameters
      const limit = Math.min(parseInt((request.query as any).limit || '20', 10), 50); // Max 50
      const offset = parseInt((request.query as any).offset || '0', 10);

      const userId = request.authContext.registeredUser!.id;

      // Get total count for pagination
      const totalCount = await fastify.prisma.trackingLink.count({
        where: { createdBy: userId }
      });

      // Get tracking links with pagination
      const links = await fastify.prisma.trackingLink.findMany({
        where: { createdBy: userId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit
      });

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

      // Vérifier que l'utilisateur est membre de la conversation
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
            pattern: '^[a-zA-Z0-9]{6}$',
            description: 'Unique 6-character alphanumeric tracking token'
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

      // Vérifier que l'utilisateur est le créateur du lien
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
            pattern: '^[a-zA-Z0-9]{6}$',
            description: 'Unique 6-character alphanumeric tracking token'
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

      // Vérifier que l'utilisateur est le créateur du lien
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
            pattern: '^[a-zA-Z0-9]{6}$',
            description: 'Current unique 6-character alphanumeric tracking token'
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
            pattern: '^[a-zA-Z0-9]{6}$',
            description: 'New 6-character token to replace current token'
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

      // Vérifier que l'utilisateur est le créateur du lien
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

      // Valider le nouveau token si fourni (6 caractères alphanumériques)
      if (body.newToken && !/^[a-zA-Z0-9]{6}$/.test(body.newToken)) {
        return reply.status(400).send({
          success: false,
          error: 'Le token doit contenir exactement 6 caractères alphanumériques'
        });
      }

      // Valider l'URL si fournie
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

      // Mettre à jour le lien
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
            pattern: '^[a-zA-Z0-9]{6}$',
            description: 'Token to check (must be exactly 6 alphanumeric characters)'
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

      // Valider le format du token (6 caractères alphanumériques)
      if (!/^[a-zA-Z0-9]{6}$/.test(token)) {
        return reply.status(400).send({
          success: false,
          error: 'Le token doit contenir exactement 6 caractères alphanumériques'
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

// Fonctions utilitaires pour détecter le navigateur, l'OS et le type d'appareil

function detectBrowser(userAgent: string): string {
  if (!userAgent) return 'Unknown';
  
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';
  
  return 'Other';
}

function detectOS(userAgent: string): string {
  if (!userAgent) return 'Unknown';
  
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  
  return 'Other';
}

function detectDevice(userAgent: string): string {
  if (!userAgent) return 'Unknown';
  
  if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
    return 'mobile';
  }
  if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
    return 'tablet';
  }
  
  return 'desktop';
}


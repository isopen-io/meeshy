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
  recordClickSchema,
  getStatsSchema,
  detectBrowser,
  detectOS,
  detectDevice
} from './types';

/**
 * Routes de suivi et analytics des liens de tracking
 */
export async function registerTrackingRoutes(fastify: FastifyInstance) {
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

      if (!/^[a-zA-Z0-9]{6}$/.test(token)) {
        return reply.status(400).send({
          success: false,
          error: 'Token invalide'
        });
      }

      const trackingLink = await trackingLinkService.getTrackingLinkByToken(token);

      if (!trackingLink) {
        return reply.status(404).send({
          success: false,
          error: 'Lien de tracking non trouvé'
        });
      }

      if (!trackingLink.isActive) {
        return reply.status(410).send({
          success: false,
          error: 'Ce lien n\'est plus actif'
        });
      }

      if (trackingLink.expiresAt && new Date() > trackingLink.expiresAt) {
        return reply.status(410).send({
          success: false,
          error: 'Ce lien a expiré'
        });
      }

      const ipAddress = (request.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
                        (request.headers['x-real-ip'] as string) ||
                        request.ip;
      const userAgent = request.headers['user-agent'] as string;
      const referrer = request.headers['referer'] as string;
      const language = (request.headers['accept-language'] as string)?.split(',')[0].split('-')[0];

      const browser = detectBrowser(userAgent);
      const os = detectOS(userAgent);
      const device = detectDevice(userAgent);

      let userId: string | undefined;
      let anonymousId: string | undefined;

      if (isRegisteredUser(request.authContext)) {
        userId = request.authContext.registeredUser!.id;
      } else if (request.authContext.type === 'session' && request.authContext.anonymousUser) {
        anonymousId = request.authContext.anonymousUser.id;
      }

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

      if (!/^[a-zA-Z0-9]{6}$/.test(token)) {
        return reply.status(400).send({
          success: false,
          error: 'Token invalide'
        });
      }

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
}

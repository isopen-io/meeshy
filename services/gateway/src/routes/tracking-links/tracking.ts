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
  requireAnalyticsPermission
} from '../../middleware/admin-permissions.middleware';
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
            pattern: '^[a-zA-Z0-9_-]{2,50}$',
            description: 'Unique alphanumeric tracking token (2-50 chars)'
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

      if (!/^[a-zA-Z0-9_-]{2,50}$/.test(token)) {
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
            pattern: '^[a-zA-Z0-9_-]{2,50}$',
            description: 'Unique alphanumeric tracking token (2-50 chars)'
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
          languages: { type: 'string', description: 'Full language list (e.g. "fr,en-US,en")' },
          referrer: { type: 'string', description: 'Referrer URL' },
          deviceFingerprint: { type: 'string', description: 'Unique device fingerprint for tracking unique visitors' },
          screenResolution: { type: 'string', description: 'Screen resolution (e.g. "1920x1080")' },
          viewportSize: { type: 'string', description: 'Viewport size (e.g. "1440x900")' },
          pixelRatio: { type: 'number', description: 'Device pixel ratio' },
          colorDepth: { type: 'integer', description: 'Screen color depth' },
          timezone: { type: 'string', description: 'IANA timezone (e.g. "Europe/Paris")' },
          connectionType: { type: 'string', description: 'Connection type (4g, wifi, etc.)' },
          connectionSpeed: { type: 'number', description: 'Connection downlink in Mbps' },
          touchSupport: { type: 'boolean', description: 'Touch screen support' },
          platform: { type: 'string', description: 'Navigator platform' },
          cookiesEnabled: { type: 'boolean', description: 'Cookies enabled' },
          hardwareConcurrency: { type: 'integer', description: 'CPU core count' },
          deviceMemory: { type: 'number', description: 'Device memory in GB' },
          socialSource: { type: 'string', description: 'Detected social source (whatsapp, telegram, etc.)' },
          utmClickSource: { type: 'string', description: 'UTM source from click URL' },
          utmClickMedium: { type: 'string', description: 'UTM medium from click URL' },
          utmClickCampaign: { type: 'string', description: 'UTM campaign from click URL' },
          utmClickTerm: { type: 'string', description: 'UTM term from click URL' },
          utmClickContent: { type: 'string', description: 'UTM content from click URL' }
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
                clickId: { type: 'string', description: 'ID of the recorded click' },
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

      if (!/^[a-zA-Z0-9_-]{2,50}$/.test(token)) {
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
        languages: body.languages,
        referrer: body.referrer,
        deviceFingerprint: body.deviceFingerprint,
        screenResolution: body.screenResolution,
        viewportSize: body.viewportSize,
        pixelRatio: body.pixelRatio,
        colorDepth: body.colorDepth,
        timezone: body.timezone,
        connectionType: body.connectionType,
        connectionSpeed: body.connectionSpeed,
        touchSupport: body.touchSupport,
        platform: body.platform,
        cookiesEnabled: body.cookiesEnabled,
        hardwareConcurrency: body.hardwareConcurrency,
        deviceMemory: body.deviceMemory,
        socialSource: body.socialSource,
        utmClickSource: body.utmClickSource,
        utmClickMedium: body.utmClickMedium,
        utmClickCampaign: body.utmClickCampaign,
        utmClickTerm: body.utmClickTerm,
        utmClickContent: body.utmClickContent,
      });

      return reply.send({
        success: true,
        data: {
          originalUrl: result.trackingLink.originalUrl,
          clickId: result.click.id,
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
   * 4. Confirmer ou signaler l'échec d'une redirection (sendBeacon)
   * POST /api/tracking-links/:token/redirect-status
   */
  fastify.post('/tracking-links/:token/redirect-status', {
    schema: {
      description: 'Update the redirect status of a click. Designed for sendBeacon() calls during page unload. No authentication required.',
      tags: ['tracking-links'],
      summary: 'Update click redirect status',
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
      body: {
        type: 'object',
        required: ['clickId', 'status'],
        properties: {
          clickId: { type: 'string', description: 'ID of the click to update' },
          status: { type: 'string', enum: ['confirmed', 'failed'], description: 'Redirect outcome' }
        }
      },
      response: {
        200: {
          description: 'Status updated',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true }
          }
        },
        400: {
          description: 'Invalid request',
          ...errorResponseSchema
        },
        404: {
          description: 'Click or tracking link not found',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { token } = request.params as { token: string };
      const { clickId, status } = request.body as { clickId: string; status: string };

      if (!clickId || !['confirmed', 'failed'].includes(status)) {
        return reply.status(400).send({ success: false, error: 'Invalid clickId or status' });
      }

      const trackingLink = await trackingLinkService.getTrackingLinkByToken(token);
      if (!trackingLink) {
        return reply.status(404).send({ success: false, error: 'Tracking link not found' });
      }

      await trackingLinkService.updateRedirectStatus(clickId, trackingLink.id, status);

      return reply.send({ success: true });
    } catch (error) {
      logError(fastify.log, 'Update redirect status error:', error);
      return reply.status(404).send({ success: false, error: 'Click not found' });
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
            pattern: '^[a-zA-Z0-9_-]{2,50}$',
            description: 'Unique alphanumeric tracking token (2-50 chars)'
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
              additionalProperties: true,
              properties: {
                trackingLink: { type: 'object', additionalProperties: true },
                totalClicks: { type: 'number', description: 'Total number of clicks' },
                uniqueClicks: { type: 'number', description: 'Number of unique visitors' },
                clicksByCountry: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                  description: 'Click counts keyed by country name'
                },
                clicksByDevice: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                  description: 'Click counts keyed by device type'
                },
                clicksByBrowser: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                  description: 'Click counts keyed by browser name'
                },
                clicksByOS: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                  description: 'Click counts keyed by OS name'
                },
                clicksByLanguage: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                  description: 'Click counts keyed by language code'
                },
                clicksByHour: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                  description: 'Click counts keyed by hour (00-23)'
                },
                clicksBySocialSource: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                  description: 'Click counts keyed by social source (WhatsApp, Telegram, etc.)'
                },
                clicksByDate: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                  description: 'Click counts keyed by ISO date string'
                },
                topReferrers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      referrer: { type: 'string' },
                      count: { type: 'number' }
                    }
                  },
                  description: 'Top referrer sources sorted by count'
                },
                confirmedClicks: { type: 'number', description: 'Number of clicks with confirmed redirect' }
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

  /**
   * 6. Statistiques agrégées des liens de tracking de l'utilisateur connecté
   * GET /api/tracking-links/stats
   */
  fastify.get('/tracking-links/stats', {
    onRequest: [authRequired],
    schema: {
      description: 'Get aggregated statistics for all tracking links created by the authenticated user. Returns total link counts, active link counts, and summed click metrics.',
      tags: ['tracking-links'],
      summary: 'Get user tracking link stats',
      response: {
        200: {
          description: 'Statistics retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                totalLinks: { type: 'number', description: 'Total number of tracking links created by user' },
                activeLinks: { type: 'number', description: 'Number of currently active links' },
                totalClicks: { type: 'number', description: 'Sum of all clicks across user links' },
                uniqueClicks: { type: 'number', description: 'Sum of unique clicks across user links' }
              }
            }
          }
        },
        403: {
          description: 'Registered user required',
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
        return reply.status(403).send({ success: false, error: 'Utilisateur enregistré requis' });
      }

      const userId = request.authContext.registeredUser!.id;

      const [totalLinks, activeLinks, clickAgg, uniqueAgg] = await Promise.all([
        fastify.prisma.trackingLink.count({ where: { createdBy: userId } }),
        fastify.prisma.trackingLink.count({ where: { createdBy: userId, isActive: true } }),
        fastify.prisma.trackingLink.aggregate({
          where: { createdBy: userId },
          _sum: { totalClicks: true },
        }),
        fastify.prisma.trackingLink.aggregate({
          where: { createdBy: userId },
          _sum: { uniqueClicks: true },
        }),
      ]);

      return reply.send({
        success: true,
        data: {
          totalLinks,
          activeLinks,
          totalClicks: clickAgg._sum.totalClicks ?? 0,
          uniqueClicks: uniqueAgg._sum.uniqueClicks ?? 0,
        },
      });
    } catch (error) {
      logError(fastify.log, 'Get user tracking link stats error:', error);
      return reply.status(500).send({ success: false, error: 'Erreur interne du serveur' });
    }
  });

  /**
   * 7. Liste des clics individuels d'un lien de tracking (user-scoped)
   * GET /api/tracking-links/:token/clicks
   */
  fastify.get('/tracking-links/:token/clicks', {
    onRequest: [authRequired],
    schema: {
      description: 'Get individual click records for a tracking link owned by the authenticated user. Only the creator of the link can access its click details. Supports pagination.',
      tags: ['tracking-links'],
      summary: 'Get click details for user tracking link',
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
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      },
      response: {
        200: {
          description: 'Click details retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                link: { type: 'object', additionalProperties: true },
                clicks: { type: 'array', items: { type: 'object', additionalProperties: true } },
                total: { type: 'number' }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' }
              }
            }
          }
        },
        403: {
          description: 'Access denied — only the creator can view clicks',
          ...errorResponseSchema
        },
        404: {
          description: 'Tracking link not found or not owned by user',
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
        return reply.status(403).send({ success: false, error: 'Utilisateur enregistré requis' });
      }

      const userId = request.authContext.registeredUser!.id;
      const { token } = request.params as { token: string };
      const limit = Math.min(parseInt((request.query as any).limit || '50', 10), 100);
      const offset = parseInt((request.query as any).offset || '0', 10);

      const link = await fastify.prisma.trackingLink.findFirst({
        where: { token, createdBy: userId },
      });

      if (!link) {
        return reply.status(404).send({ success: false, error: 'Lien de tracking non trouvé' });
      }

      const result = await trackingLinkService.getTrackingLinkClicks(link.id, limit, offset);

      return reply.send({
        success: true,
        data: { link, clicks: result.clicks, total: result.total },
        pagination: { total: result.total, limit, offset },
      });
    } catch (error) {
      logError(fastify.log, 'Get tracking link clicks error:', error);
      return reply.status(500).send({ success: false, error: 'Erreur interne du serveur' });
    }
  });

  /**
   * ADMIN: Liste tous les tracking links avec pagination et recherche
   * GET /api/v1/tracking-links/admin/all
   */
  fastify.get<{ Querystring: { limit?: string; offset?: string; search?: string } }>('/tracking-links/admin/all', {
    preHandler: [fastify.authenticate, requireAnalyticsPermission],
    schema: {
      description: 'Admin: List all tracking links with pagination and search',
      tags: ['tracking-links', 'admin'],
      summary: 'List all tracking links (admin)',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 },
          search: { type: 'string', description: 'Search by token, name, or URL' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            trackingLinks: { type: 'array', items: { type: 'object', additionalProperties: true } },
            total: { type: 'number' }
          }
        },
        403: { ...errorResponseSchema },
        500: { ...errorResponseSchema }
      }
    }
  }, async (request, reply) => {
    try {
      const limit = Math.min(parseInt((request.query as any).limit || '20', 10), 100);
      const offset = parseInt((request.query as any).offset || '0', 10);
      const search = (request.query as any).search || undefined;

      const result = await trackingLinkService.getAllTrackingLinks({ limit, offset, search });

      return reply.send({
        success: true,
        trackingLinks: result.trackingLinks,
        total: result.total
      });
    } catch (error) {
      logError(fastify.log, 'Admin get all tracking links error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  /**
   * ADMIN: Récupère les clics individuels d'un tracking link
   * GET /api/v1/tracking-links/admin/:token/clicks
   */
  fastify.get<{ Params: { token: string }; Querystring: { limit?: string; offset?: string } }>('/tracking-links/admin/:token/clicks', {
    preHandler: [fastify.authenticate, requireAnalyticsPermission],
    schema: {
      description: 'Admin: Get individual clicks for a tracking link',
      tags: ['tracking-links', 'admin'],
      summary: 'Get tracking link clicks (admin)',
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', pattern: '^[a-zA-Z0-9_-]{2,50}$' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            clicks: { type: 'array', items: { type: 'object', additionalProperties: true } },
            total: { type: 'number' }
          }
        },
        404: { ...errorResponseSchema },
        403: { ...errorResponseSchema },
        500: { ...errorResponseSchema }
      }
    }
  }, async (request, reply) => {
    try {
      const { token } = request.params;
      const limit = Math.min(parseInt((request.query as any).limit || '50', 10), 100);
      const offset = parseInt((request.query as any).offset || '0', 10);

      const trackingLink = await trackingLinkService.getTrackingLinkByToken(token);
      if (!trackingLink) {
        return reply.status(404).send({
          success: false,
          error: 'Tracking link not found'
        });
      }

      const result = await trackingLinkService.getTrackingLinkClicks(trackingLink.id, limit, offset);

      return reply.send({
        success: true,
        clicks: result.clicks,
        total: result.total
      });
    } catch (error) {
      logError(fastify.log, 'Admin get tracking link clicks error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });
}

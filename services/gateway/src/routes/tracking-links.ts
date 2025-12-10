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
    onRequest: [authOptional]
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
    onRequest: [authOptional]
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
    onRequest: [authOptional]
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
    onRequest: [authOptional]
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
    onRequest: [authRequired]
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
    onRequest: [authRequired]
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
    onRequest: [authRequired]
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
    onRequest: [authRequired]
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
    onRequest: [authRequired]
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
        message: 'Lien supprimé avec succès'
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
    onRequest: [authRequired]
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
    onRequest: [authRequired]
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


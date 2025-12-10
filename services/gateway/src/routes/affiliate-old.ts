import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AffiliateTrackingService } from '../services/AffiliateTrackingService';

// Schémas de validation Zod
const createAffiliateTokenSchema = z.object({
  name: z.string().min(1).max(100),
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
});

const affiliateLinkSchema = z.object({
  token: z.string().min(1),
});

const affiliateStatsSchema = z.object({
  tokenId: z.string().optional(),
  status: z.enum(['pending', 'completed', 'expired']).optional(),
});

const trackVisitSchema = z.object({
  token: z.string(),
  visitorData: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    referrer: z.string().optional(),
    country: z.string().optional(),
    language: z.string().optional(),
  }).optional()
});

const registerAffiliateSchema = z.object({
  token: z.string(),
  referredUserId: z.string(),
  sessionKey: z.string().optional(),
});

export default async function affiliateRoutes(fastify: FastifyInstance) {
  // Créer un token d'affiliation
  fastify.post('/affiliate/tokens', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const body = createAffiliateTokenSchema.parse(request.body);
      const { name, maxUses, expiresAt } = body;

      // Générer un token unique
      const token = `aff_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      
      // Créer le token d'affiliation
      const affiliateToken = await fastify.prisma.affiliateToken.create({
        data: {
          token,
          name,
          createdBy: userId,
          maxUses,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
            }
          }
        }
      });

      // Construire le lien d'affiliation
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3100';
      const affiliateLink = `${baseUrl}/signin?affiliate=${token}`;

      return reply.send({
        success: true,
        data: {
          id: affiliateToken.id,
          token: affiliateToken.token,
          name: affiliateToken.name,
          affiliateLink,
          maxUses: affiliateToken.maxUses,
          currentUses: affiliateToken.currentUses,
          expiresAt: affiliateToken.expiresAt?.toISOString(),
          createdAt: affiliateToken.createdAt.toISOString()
        }
      });
    } catch (error) {
      console.error('Erreur création token affiliation:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la création du token d\'affiliation'
      });
    }
  });

  // Récupérer les tokens d'affiliation de l'utilisateur
  fastify.get('/affiliate/tokens', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;

      const tokens = await fastify.prisma.affiliateToken.findMany({
        where: {
          createdBy: userId,
        },
        include: {
          _count: {
            select: {
              affiliations: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3100';
      
      const tokensWithLinks = tokens.map(token => ({
        id: token.id,
        token: token.token,
        name: token.name,
        affiliateLink: `${baseUrl}/signin?affiliate=${token.token}`,
        maxUses: token.maxUses,
        currentUses: token.currentUses,
        expiresAt: token.expiresAt?.toISOString(),
        isActive: token.isActive,
        createdAt: token.createdAt.toISOString(),
        _count: token._count
      }));

      return reply.send({
        success: true,
        data: tokensWithLinks
      });
    } catch (error) {
      console.error('Erreur récupération tokens:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des tokens'
      });
    }
  });

  // Récupérer les statistiques d'affiliation
  fastify.get('/affiliate/stats', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const query = affiliateStatsSchema.parse(request.query);
      const { tokenId, status } = query;

      const filters: any = {};
      if (tokenId) filters.tokenId = tokenId;
      if (status) filters.status = status;

      const result = await AffiliateTrackingService.getAffiliateStats(fastify.prisma, userId, filters);

      if (result.success) {
        return reply.send({
          success: true,
          data: {
            ...result.data,
            referrals: result.data.referrals.map(rel => ({
              ...rel,
              createdAt: rel.createdAt.toISOString(),
              completedAt: rel.completedAt?.toISOString()
            }))
          }
        });
      } else {
        return reply.status(500).send({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Erreur récupération stats affiliation:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des statistiques'
      });
    }
  });

  // Tracker une visite d'affiliation (pour persistance même si pas d'inscription immédiate)
  fastify.post('/affiliate/track-visit', {
    schema: {
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string' },
          visitorData: {
            type: 'object',
            properties: {
              ipAddress: { type: 'string' },
              userAgent: { type: 'string' },
              referrer: { type: 'string' },
              country: { type: 'string' },
              language: { type: 'string' }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                sessionKey: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token, visitorData } = request.body as { 
        token: string; 
        visitorData?: any;
      };

      const result = await AffiliateTrackingService.trackAffiliateVisit(fastify.prisma, token, visitorData || {});

      if (result.success) {
        return reply.send({
          success: true,
          data: {
            sessionKey: result.data.sessionKey
          }
        });
      } else {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Erreur tracking visite:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors du tracking de la visite'
      });
    }
  });

  // Valider un token d'affiliation (pour la page signin)
  fastify.get('/affiliate/validate/:token', {
    schema: {
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', minLength: 1 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                isValid: { type: 'boolean' },
                token: { type: 'object' },
                affiliateUser: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token } = request.params as { token: string };

      const affiliateToken = await fastify.prisma.affiliateToken.findUnique({
        where: { token },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true,
            }
          }
        }
      });

      if (!affiliateToken) {
        return reply.send({
          success: true,
          data: {
            isValid: false,
            token: null,
            affiliateUser: null
          }
        });
      }

      // Vérifier si le token est actif
      if (!affiliateToken.isActive) {
        return reply.send({
          success: true,
          data: {
            isValid: false,
            token: null,
            affiliateUser: null
          }
        });
      }

      // Vérifier la date d'expiration
      if (affiliateToken.expiresAt && affiliateToken.expiresAt < new Date()) {
        return reply.send({
          success: true,
          data: {
            isValid: false,
            token: null,
            affiliateUser: null
          }
        });
      }

      // Vérifier la limite d'utilisation
      if (affiliateToken.maxUses && affiliateToken.currentUses >= affiliateToken.maxUses) {
        return reply.send({
          success: true,
          data: {
            isValid: false,
            token: null,
            affiliateUser: null
          }
        });
      }

      return reply.send({
        success: true,
        data: {
          isValid: true,
          token: {
            id: affiliateToken.id,
            name: affiliateToken.name,
            token: affiliateToken.token,
            maxUses: affiliateToken.maxUses,
            currentUses: affiliateToken.currentUses,
            expiresAt: affiliateToken.expiresAt?.toISOString()
          },
          affiliateUser: affiliateToken.creator
        }
      });
    } catch (error) {
      console.error('Erreur validation token:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la validation du token'
      });
    }
  });

  // Créer une relation d'affiliation (appelé lors de l'inscription)
  fastify.post('/affiliate/register', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'referredUserId'],
        properties: {
          token: { type: 'string' },
          referredUserId: { type: 'string' },
          sessionKey: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token, referredUserId, sessionKey } = request.body as { 
        token: string; 
        referredUserId: string;
        sessionKey?: string;
      };

      const result = await AffiliateTrackingService.convertAffiliateVisit(
        fastify.prisma,
        token, 
        referredUserId, 
        sessionKey
      );

      if (result.success) {
        return reply.send({
          success: true,
          data: result.data
        });
      } else {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Erreur création relation affiliation:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la création de la relation d\'affiliation'
      });
    }
  });

  // Supprimer un token d'affiliation
  fastify.delete('/affiliate/tokens/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const { id } = request.params as { id: string };

      // Vérifier que l'utilisateur est le créateur du token
      const affiliateToken = await fastify.prisma.affiliateToken.findFirst({
        where: {
          id: id,
          createdBy: userId
        }
      });

      if (!affiliateToken) {
        return reply.status(404).send({
          success: false,
          error: 'Token d\'affiliation non trouvé'
        });
      }

      // Supprimer le token
      await fastify.prisma.affiliateToken.delete({
        where: { id: id }
      });

      return reply.send({
        success: true
      });
    } catch (error) {
      console.error('Erreur suppression token:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la suppression du token'
      });
    }
  });
}

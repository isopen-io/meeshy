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
              displayName: true,
              avatar: true
            }
          }
        }
      });

      // Construire le lien d'affiliation
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3100';
      const affiliateLink = `${baseUrl}/?affiliate=${token}`;

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
      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };

      const offsetNum = parseInt(offset, 10);
      const limitNum = Math.min(parseInt(limit, 10), 100);

      const whereClause = { createdBy: userId };

      const [tokens, totalCount] = await Promise.all([
        fastify.prisma.affiliateToken.findMany({
          where: whereClause,
          include: {
            _count: {
              select: {
                affiliations: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.affiliateToken.count({ where: whereClause })
      ]);

      // Fallback: si _count n'est pas disponible, compter manuellement
      const tokensWithCounts = await Promise.all(tokens.map(async (token) => {
        if (token._count === undefined || token._count.affiliations === undefined) {
          const count = await fastify.prisma.affiliateRelation.count({
            where: {
              affiliateTokenId: token.id
            }
          });
          return {
            ...token,
            _count: {
              affiliations: count
            }
          };
        }
        return token;
      }));

      // Construire les liens d'affiliation
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3100';
      const tokensWithLinks = tokensWithCounts.map(token => ({
        ...token,
        affiliateLink: `${baseUrl}/?affiliate=${token.token}`,
        createdAt: token.createdAt.toISOString(),
        expiresAt: token.expiresAt?.toISOString()
      }));

      return reply.send({
        success: true,
        data: tokensWithLinks,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + tokens.length < totalCount
        }
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
          data: result.data
        });
      } else {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Erreur récupération stats:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des statistiques'
      });
    }
  });

  // Valider un token d'affiliation (pour la page signin)
  fastify.get('/affiliate/validate/:token', {
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = affiliateLinkSchema.parse(request.params);
      const { token } = params;

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
              avatar: true
            }
          }
        }
      });

      if (!affiliateToken) {
        return reply.send({
          success: true,
          data: {
            isValid: false
          }
        });
      }

      // Vérifier si le token est actif
      if (!affiliateToken.isActive) {
        return reply.send({
          success: true,
          data: {
            isValid: false
          }
        });
      }

      // Vérifier si le token a expiré
      if (affiliateToken.expiresAt && new Date() > affiliateToken.expiresAt) {
        return reply.send({
          success: true,
          data: {
            isValid: false
          }
        });
      }

      // Vérifier si le token a atteint sa limite d'utilisation
      if (affiliateToken.maxUses && affiliateToken.currentUses >= affiliateToken.maxUses) {
        return reply.send({
          success: true,
          data: {
            isValid: false
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
          affiliateUser: {
            id: affiliateToken.creator.id,
            username: affiliateToken.creator.username,
            firstName: affiliateToken.creator.firstName,
            lastName: affiliateToken.creator.lastName,
            displayName: affiliateToken.creator.displayName,
            avatar: affiliateToken.creator.avatar
          }
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

  // Tracker une visite d'affiliation (pour persistance même si pas d'inscription immédiate)
  fastify.post('/affiliate/track-visit', {
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = trackVisitSchema.parse(request.body);
      const { token, visitorData } = body;

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

  // Créer une relation d'affiliation (appelé lors de l'inscription)
  fastify.post('/affiliate/register', {
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = registerAffiliateSchema.parse(request.body);
      const { token, referredUserId, sessionKey } = body;

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
      console.error('Erreur enregistrement affiliation:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la création de la relation d\'affiliation'
      });
    }
  });

  // Supprimer un token d'affiliation
  fastify.delete('/affiliate/tokens/:id', {
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
      const params = z.object({ id: z.string() }).parse(request.params);
      const { id } = params;

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

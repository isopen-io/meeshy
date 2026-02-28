/**
 * Routes API pour la gestion du système d'affiliation
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AffiliateTrackingService } from '../services/AffiliateTrackingService';
import { validatePagination } from '../utils/pagination';
import {
  affiliateTokenSchema,
  affiliateRelationSchema,
  errorResponseSchema,
} from '@meeshy/shared/types/api-schemas';

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
  /**
   * POST /affiliate/tokens
   * Create a new affiliate/referral token for user invitations
   */
  fastify.post('/affiliate/tokens', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Create a new affiliate token for user referrals. Generates a unique token and affiliate link that can be shared to track new user signups. Authenticated users only.',
      tags: ['affiliate'],
      summary: 'Create affiliate token',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'Friendly name for this affiliate token (e.g., "Twitter Campaign", "Friend Invite")'
          },
          maxUses: {
            type: 'number',
            minimum: 1,
            description: 'Maximum number of times this token can be used (optional, unlimited if not specified)'
          },
          expiresAt: {
            type: 'string',
            format: 'date-time',
            description: 'Token expiration date in ISO 8601 format (optional, never expires if not specified)',
            example: '2024-12-31T23:59:59Z'
          }
        }
      },
      response: {
        200: {
          description: 'Affiliate token created successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Token database ID' },
                token: { type: 'string', description: 'Unique affiliate token code' },
                name: { type: 'string', description: 'Token friendly name' },
                affiliateLink: {
                  type: 'string',
                  format: 'uri',
                  description: 'Complete shareable affiliate link',
                  example: 'https://app.meeshy.me/signup/affiliate/aff_1234567890_abc'
                },
                maxUses: { type: 'number', nullable: true, description: 'Maximum uses allowed' },
                currentUses: { type: 'number', description: 'Current use count' },
                expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration date' },
                createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' }
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

      // Construire le lien d'affiliation avec le format /signup/affiliate/TOKEN
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3100';
      const affiliateLink = `${baseUrl}/signup/affiliate/${token}`;

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

  /**
   * GET /affiliate/tokens
   * Get all affiliate tokens created by the authenticated user
   */
  fastify.get('/affiliate/tokens', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Retrieve all affiliate tokens created by the authenticated user with pagination support. Returns tokens with usage statistics and full affiliate links.',
      tags: ['affiliate'],
      summary: 'List user affiliate tokens',
      querystring: {
        type: 'object',
        properties: {
          offset: {
            type: 'number',
            minimum: 0,
            default: 0,
            description: 'Number of tokens to skip (for pagination)'
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 50,
            description: 'Maximum number of tokens to return'
          }
        }
      },
      response: {
        200: {
          description: 'Affiliate tokens retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Token ID' },
                  token: { type: 'string', description: 'Unique affiliate token' },
                  name: { type: 'string', description: 'Token friendly name' },
                  affiliateLink: { type: 'string', format: 'uri', description: 'Complete affiliate link' },
                  maxUses: { type: 'number', nullable: true, description: 'Maximum uses allowed' },
                  currentUses: { type: 'number', description: 'Current use count' },
                  isActive: { type: 'boolean', description: 'Whether token is active' },
                  expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration date' },
                  createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
                  _count: {
                    type: 'object',
                    properties: {
                      affiliations: { type: 'number', description: 'Number of successful referrals' }
                    }
                  }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number', description: 'Total number of tokens' },
                limit: { type: 'number', description: 'Items per page' },
                offset: { type: 'number', description: 'Current offset' },
                hasMore: { type: 'boolean', description: 'Whether more items exist' }
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
      const { offset, limit } = request.query as { offset?: string; limit?: string };

      const pagination = validatePagination(offset, limit, 100);

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
          skip: pagination.offset,
          take: pagination.limit
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

      // Construire les liens d'affiliation avec le format /signup/affiliate/TOKEN
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3100';
      const tokensWithLinks = tokensWithCounts.map(token => ({
        ...token,
        affiliateLink: `${baseUrl}/signup/affiliate/${token.token}`,
        createdAt: token.createdAt.toISOString(),
        expiresAt: token.expiresAt?.toISOString()
      }));

      return reply.send({
        success: true,
        data: tokensWithLinks,
        pagination: {
          total: totalCount,
          limit: pagination.limit,
          offset: pagination.offset,
          hasMore: pagination.offset + tokens.length < totalCount
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

  /**
   * GET /affiliate/stats
   * Get affiliate statistics and performance metrics
   */
  fastify.get('/affiliate/stats', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Retrieve affiliate performance statistics for the authenticated user. Filter by specific token or status. Returns aggregated metrics including total referrals, conversions, and earnings.',
      tags: ['affiliate'],
      summary: 'Get affiliate statistics',
      querystring: {
        type: 'object',
        properties: {
          tokenId: {
            type: 'string',
            description: 'Filter statistics for a specific affiliate token'
          },
          status: {
            type: 'string',
            enum: ['pending', 'completed', 'expired'],
            description: 'Filter by affiliation status'
          }
        }
      },
      response: {
        200: {
          description: 'Affiliate statistics retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              description: 'Affiliate statistics and metrics'
            }
          }
        },
        400: {
          description: 'Bad request - invalid filter parameters',
          ...errorResponseSchema
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

  /**
   * GET /affiliate/validate/:token
   * Validate an affiliate token for the signup page
   */
  fastify.get('/affiliate/validate/:token', {
    schema: {
      description: 'Validate an affiliate/referral token before user signup. Checks if token is active, not expired, and within usage limits. Returns token details and affiliate user information if valid. No authentication required (public endpoint for signup flow).',
      tags: ['affiliate'],
      summary: 'Validate affiliate token',
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            description: 'Affiliate token code to validate',
            example: 'aff_1234567890_abc'
          }
        }
      },
      response: {
        200: {
          description: 'Token validation result (always returns 200 even if invalid)',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                isValid: {
                  type: 'boolean',
                  description: 'Whether the token is valid and can be used'
                },
                token: {
                  type: 'object',
                  nullable: true,
                  description: 'Token details (only present if valid)',
                  properties: {
                    id: { type: 'string', description: 'Token ID' },
                    name: { type: 'string', description: 'Token friendly name' },
                    token: { type: 'string', description: 'Token code' },
                    maxUses: { type: 'number', nullable: true, description: 'Maximum uses' },
                    currentUses: { type: 'number', description: 'Current use count' },
                    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration date' }
                  }
                },
                affiliateUser: {
                  type: 'object',
                  nullable: true,
                  description: 'Affiliate user who created the token (only present if valid)',
                  properties: {
                    id: { type: 'string', description: 'User ID' },
                    username: { type: 'string', description: 'Username' },
                    firstName: { type: 'string', nullable: true, description: 'First name' },
                    lastName: { type: 'string', nullable: true, description: 'Last name' },
                    displayName: { type: 'string', nullable: true, description: 'Display name' },
                    avatar: { type: 'string', nullable: true, description: 'Avatar URL' }
                  }
                }
              }
            }
          }
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
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

  /**
   * POST /affiliate/track-visit
   * Track an affiliate link visit for conversion tracking
   */
  fastify.post('/affiliate/track-visit', {
    schema: {
      description: 'Track a visit through an affiliate link. Creates a session that can be converted to a full referral when the visitor signs up. This allows tracking even if signup does not happen immediately. Returns a session key to associate the visitor with the token. No authentication required (public endpoint).',
      tags: ['affiliate'],
      summary: 'Track affiliate visit',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            description: 'Affiliate token code from the referral link'
          },
          visitorData: {
            type: 'object',
            description: 'Optional visitor metadata for analytics',
            properties: {
              ipAddress: { type: 'string', description: 'Visitor IP address' },
              userAgent: { type: 'string', description: 'Browser user agent' },
              referrer: { type: 'string', description: 'HTTP referrer URL' },
              country: { type: 'string', description: 'Visitor country code' },
              language: { type: 'string', description: 'Browser language preference' }
            }
          }
        }
      },
      response: {
        200: {
          description: 'Visit tracked successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                sessionKey: {
                  type: 'string',
                  description: 'Unique session key to associate future signup with this visit'
                }
              }
            }
          }
        },
        400: {
          description: 'Bad request - invalid token or tracking failed',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
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

  /**
   * POST /affiliate/register
   * Create affiliate relationship when user signs up
   */
  fastify.post('/affiliate/register', {
    schema: {
      description: 'Convert an affiliate visit into a confirmed referral relationship when a user signs up. Links the new user to the affiliate who shared the token. Can use session key from track-visit or directly provide token. No authentication required (called during signup flow).',
      tags: ['affiliate'],
      summary: 'Register affiliate referral',
      body: {
        type: 'object',
        required: ['token', 'referredUserId'],
        properties: {
          token: {
            type: 'string',
            description: 'Affiliate token code from the referral link'
          },
          referredUserId: {
            type: 'string',
            description: 'ID of the newly registered user being referred'
          },
          sessionKey: {
            type: 'string',
            description: 'Optional session key from track-visit to link with prior tracking data'
          }
        }
      },
      response: {
        200: {
          description: 'Affiliate relationship created successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              description: 'Created affiliate relationship details'
            }
          }
        },
        400: {
          description: 'Bad request - invalid token or registration failed',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
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

  /**
   * POST /affiliate/click/:token
   * Track a click on an affiliate link (no auth required)
   */
  fastify.post('/affiliate/click/:token', {
    schema: {
      description: 'Record a click on a public affiliate link. Increments the click counter for the token. No authentication required (public endpoint for landing pages).',
      tags: ['affiliate'],
      summary: 'Track affiliate link click',
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            description: 'Affiliate token code'
          }
        }
      },
      response: {
        200: {
          description: 'Click tracked successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                tracked: { type: 'boolean', example: true }
              }
            }
          }
        },
        404: {
          description: 'Affiliate token not found or inactive',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = z.object({ token: z.string() }).parse(request.params);
      const { token } = params;

      const affiliateToken = await fastify.prisma.affiliateToken.findFirst({
        where: { token, isActive: true },
      });

      if (!affiliateToken) {
        return reply.status(404).send({
          success: false,
          error: 'Token d\'affiliation non trouvé ou inactif'
        });
      }

      await fastify.prisma.affiliateToken.update({
        where: { id: affiliateToken.id },
        data: { clickCount: { increment: 1 } },
      });

      return reply.send({ success: true, data: { tracked: true } });
    } catch (error) {
      console.error('Erreur tracking clic affiliation:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors du tracking du clic'
      });
    }
  });

  /**
   * DELETE /affiliate/tokens/:id
   * Delete an affiliate token
   */
  fastify.delete('/affiliate/tokens/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Delete an affiliate token created by the authenticated user. Only the token creator can delete their own tokens. This permanently removes the token and prevents future use, but does not affect existing referral relationships.',
      tags: ['affiliate'],
      summary: 'Delete affiliate token',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Affiliate token ID to delete'
          }
        }
      },
      response: {
        200: {
          description: 'Affiliate token deleted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Token not found or user does not own this token',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
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

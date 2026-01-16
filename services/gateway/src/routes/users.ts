import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ApiResponse, PaginationMeta } from '@meeshy/shared/types';
import { z } from 'zod';
import { logError } from '../utils/logger';
import bcrypt from 'bcryptjs';
import { normalizeEmail, capitalizeName, normalizeDisplayName, normalizePhoneNumber } from '../utils/normalize';
import { buildPaginationMeta } from '../utils/pagination';
import {
  updateUserProfileSchema,
  updateAvatarSchema,
  updatePasswordSchema,
  containsEmoji,
  validateSchema
} from '@meeshy/shared/utils/validation';
import {
  userSchema,
  userMinimalSchema,
  userStatsSchema,
  updateUserRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';

/**
 * Validate and sanitize pagination parameters
 * - Ensures offset is never negative
 * - Ensures limit is between 1 and maxLimit (default 100)
 */
function validatePagination(
  offset: string = '0',
  limit: string = '20',
  defaultLimit: number = 20,
  maxLimit: number = 100
): { offsetNum: number; limitNum: number } {
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || defaultLimit), maxLimit);
  return { offsetNum, limitNum };
}

export async function userRoutes(fastify: FastifyInstance) {
  // NOTE: Username availability check has been moved to /auth/check-availability
  // which supports username, email, and phone number checks in a unified API

  // Route de test simple
  fastify.get('/users/me/test', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Test endpoint for authenticated users. Verifies authentication token and returns user ID with timestamp.',
      tags: ['users'],
      summary: 'Test authentication endpoint',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                userId: { type: 'string', description: 'Authenticated user ID' },
                message: { type: 'string', example: 'Test endpoint working' },
                timestamp: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      fastify.log.info(`[TEST] Getting test data for user ${userId}`);

      return reply.send({
        success: true,
        data: {
          userId,
          message: "Test endpoint working",
          timestamp: new Date()
        }
      });
    } catch (error) {
      fastify.log.error(`[TEST] Error: ${error instanceof Error ? error.message : String(error)}`);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Route pour obtenir les statistiques du tableau de bord de l'utilisateur connecte
  fastify.get('/users/me/dashboard-stats', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get comprehensive dashboard statistics for the authenticated user. Returns conversation counts, message stats, communities, and recent activity.',
      tags: ['users'],
      summary: 'Get user dashboard statistics',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                stats: {
                  type: 'object',
                  properties: {
                    totalConversations: { type: 'number', description: 'Total conversations user is member of' },
                    totalCommunities: { type: 'number', description: 'Total communities joined' },
                    totalMessages: { type: 'number', description: 'Messages sent this week' },
                    activeConversations: { type: 'number', description: 'Conversations with activity in last 24h' },
                    translationsToday: { type: 'number', description: 'Estimated translations today' },
                    totalLinks: { type: 'number', description: 'Share links created' },
                    lastUpdated: { type: 'string', format: 'date-time' }
                  }
                },
                recentConversations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      type: { type: 'string', enum: ['direct', 'group'] },
                      isActive: { type: 'boolean' },
                      lastMessage: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          content: { type: 'string' },
                          createdAt: { type: 'string', format: 'date-time' },
                          sender: {
                            type: 'object',
                            properties: {
                              username: { type: 'string' },
                              displayName: { type: 'string' }
                            }
                          }
                        }
                      },
                      members: { type: 'array', items: userMinimalSchema }
                    }
                  }
                },
                recentCommunities: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string', nullable: true },
                      isPrivate: { type: 'boolean' },
                      members: { type: 'array', items: userMinimalSchema },
                      memberCount: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      fastify.log.info(`[DASHBOARD] Getting stats for user ${userId}`);

      // Recuperer les statistiques en parallele
      const [
        // Conversations ou l'utilisateur est membre actif
        totalConversations,
        activeConversations,
        recentConversations,

        // Communautes ou l'utilisateur est membre actif
        totalCommunities,
        recentCommunities,

        // Messages envoyes par l'utilisateur
        totalMessages,
        messagesThisWeek,

        // Liens de partage crees par l'utilisateur
        totalLinks,

        // Traductions effectuees (estimation basee sur les messages)
        translationsToday
      ] = await Promise.all([
        // Total conversations
        fastify.prisma.conversationMember.count({
          where: {
            userId,
            isActive: true
          }
        }),

        // Conversations actives (avec messages recents)
        fastify.prisma.conversationMember.count({
          where: {
            userId,
            isActive: true,
            conversation: {
              messages: {
                some: {
                  createdAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24h
                  },
                  isDeleted: false
                }
              }
            }
          }
        }),

        // Conversations recentes (optimise - limiter les donnees)
        fastify.prisma.conversation.findMany({
          where: {
            members: {
              some: {
                userId,
                isActive: true
              }
            }
          },
          select: {
            id: true,
            identifier: true,
            title: true,
            type: true,
            updatedAt: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                content: true,
                createdAt: true,
                sender: {
                  select: {
                    username: true,
                    displayName: true
                  }
                }
              }
            },
            members: {
              where: { isActive: true },
              take: 5, // Limiter a 5 membres max
              select: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true
                  }
                }
              }
            }
          },
          orderBy: { updatedAt: 'desc' },
          take: 5
        }),

        // Total communautes
        fastify.prisma.communityMember.count({
          where: {
            userId
          }
        }),

        // Communautes recentes (optimise - limiter les membres)
        fastify.prisma.community.findMany({
          where: {
            members: {
              some: {
                userId
              }
            }
          },
          select: {
            id: true,
            name: true,
            description: true,
            isPrivate: true,
            updatedAt: true,
            _count: {
              select: { members: true }
            },
            members: {
              take: 5, // Limiter a 5 membres
              select: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true
                  }
                }
              }
            }
          },
          orderBy: { updatedAt: 'desc' },
          take: 5
        }),

        // Total messages de l'utilisateur
        fastify.prisma.message.count({
          where: {
            senderId: userId,
            isDeleted: false
          }
        }),

        // Messages cette semaine
        fastify.prisma.message.count({
          where: {
            senderId: userId,
            isDeleted: false,
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 jours
            }
          }
        }),

        // Total liens crees
        fastify.prisma.conversationShareLink.count({
          where: {
            createdBy: userId
          }
        }),

        // Estimation des traductions aujourd'hui (basee sur les messages multilingues)
        fastify.prisma.message.count({
          where: {
            senderId: userId,
            isDeleted: false,
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24h
            }
            // Simplification: compter tous les messages recents comme traductions potentielles
          }
        })
      ]);

      // Transformer les donnees pour le frontend
      const stats = {
        totalConversations,
        totalCommunities,
        totalMessages: messagesThisWeek, // Messages cette semaine
        activeConversations,
        translationsToday,
        totalLinks,
        lastUpdated: new Date()
      };

      // Transformer les conversations recentes
      const transformedConversations = recentConversations.map(conv => {
        // S'assurer qu'un titre existe toujours
        let displayTitle = conv.title;
        if (!displayTitle || displayTitle.trim() === '') {
          if (conv.type === 'direct' && conv.members && conv.members.length > 0) {
            const otherMember = conv.members.find((m: any) => m.user?.id !== userId);
            if (otherMember?.user) {
              displayTitle = otherMember.user.displayName ||
                            `${otherMember.user.username || ''}`.trim() ||
                            'Conversation';
            } else {
              displayTitle = 'Direct Conversation';
            }
          } else {
            displayTitle = conv.identifier || `Conversation ${conv.id.slice(-4)}`;
          }
        }

        return {
          id: conv.id,
          title: displayTitle,
          type: conv.type,
          isActive: activeConversations > 0,
          lastMessage: conv.messages && conv.messages.length > 0 ? {
            content: conv.messages[0].content,
            createdAt: conv.messages[0].createdAt,
            sender: conv.messages[0].sender
          } : null,
          members: conv.members.map((member: any) => member.user)
        };
      });

      // Transformer les communautes recentes
      const transformedCommunities = recentCommunities.map((community: any) => ({
        id: community.id,
        name: community.name,
        description: community.description,
        isPrivate: community.isPrivate,
        members: community.members.map((member: any) => member.user),
        memberCount: community._count?.members || community.members.length
      }));

      return reply.send({
        success: true,
        data: {
          stats,
          recentConversations: transformedConversations,
          recentCommunities: transformedCommunities
        }
      });

    } catch (error) {
      fastify.log.error(`[DASHBOARD] Error getting stats: ${error instanceof Error ? error.message : String(error)}`);
      logError(fastify.log, 'Get user dashboard stats error:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Route pour obtenir les statistiques d'un utilisateur specifique (par ID ou username)
  fastify.get('/users/:userId/stats', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get activity statistics for a specific user by ID or username. Returns message counts, conversation stats, and last activity information.',
      tags: ['users'],
      summary: 'Get user statistics',
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'User ID (MongoDB ObjectId) or username' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                messagesSent: { type: 'number', description: 'Total messages sent by user' },
                messagesReceived: { type: 'number', description: 'Total messages received' },
                conversationsCount: { type: 'number', description: 'Total conversations (all types)' },
                groupsCount: { type: 'number', description: 'Group conversations only' },
                totalConversations: { type: 'number', description: 'Total conversations (duplicate of conversationsCount)' },
                averageResponseTime: { type: 'number', nullable: true, description: 'Average response time in seconds' },
                lastActivity: { type: 'string', format: 'date-time', description: 'Last activity timestamp' }
              }
            }
          }
        },
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const { userId: userIdOrUsername } = request.params;
      fastify.log.info(`[USER_STATS] Getting stats for user ${userIdOrUsername}`);

      // Determiner si c'est un ID MongoDB (24 caracteres hexadecimaux) ou un username
      const isMongoId = /^[a-f\d]{24}$/i.test(userIdOrUsername);

      // Recuperer l'utilisateur pour obtenir son ID reel
      const user = await fastify.prisma.user.findFirst({
        where: isMongoId
          ? { id: userIdOrUsername }
          : {
              username: {
                equals: userIdOrUsername,
                mode: 'insensitive'  // Recherche insensible a la casse
              }
            },
        select: {
          id: true,
          createdAt: true,
          isOnline: true,
          lastActiveAt: true
        }
      });

      if (!user) {
        fastify.log.warn(`[USER_STATS] User not found: ${userIdOrUsername}`);
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      fastify.log.info(`[USER_STATS] User found: ${user.id}`);


      const userId = user.id;

      // Recuperer les statistiques de base de l'utilisateur
      const [
        totalConversations,
        messagesSent,
        messagesReceived,
        groupsCount
      ] = await Promise.all([
        // Nombre de conversations ou l'utilisateur est membre
        fastify.prisma.conversationMember.count({
          where: {
            userId: userId,
            isActive: true
          }
        }),
        // Nombre de messages envoyes
        fastify.prisma.message.count({
          where: {
            senderId: userId,
            isDeleted: false
          }
        }),
        // Nombre de messages recus (dans les conversations ou l'utilisateur est membre)
        fastify.prisma.message.count({
          where: {
            senderId: { not: userId },
            isDeleted: false,
            conversation: {
              members: {
                some: {
                  userId: userId,
                  isActive: true
                }
              }
            }
          }
        }),
        // Nombre de groupes (conversations de type groupe)
        fastify.prisma.conversationMember.count({
          where: {
            userId: userId,
            isActive: true,
            conversation: {
              type: 'group'
            }
          }
        })
      ]);

      const stats = {
        messagesSent,
        messagesReceived,
        conversationsCount: totalConversations,
        groupsCount,
        totalConversations,
        averageResponseTime: undefined,
        lastActivity: user.lastActiveAt || user.createdAt
      };

      return reply.send({
        success: true,
        data: stats
      });

    } catch (error) {
      fastify.log.error(`[USER_STATS] Error getting user stats: ${error instanceof Error ? error.message : String(error)}`);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Route pour mettre a jour le profil utilisateur connecte
  fastify.patch('/users/me', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update the authenticated user profile. Allows updating personal information, language preferences, and translation settings. Email and phone number uniqueness is enforced.',
      tags: ['users'],
      summary: 'Update user profile',
      body: updateUserRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: userSchema,
                message: { type: 'string', example: 'Profile updated successfully' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'Validation error or duplicate email/phone' },
            details: { type: 'array', items: { type: 'object' } }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Utiliser le nouveau systeme d'authentification unifie
    const authContext = (request as any).authContext;

    try {
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;

      // Logger les donnees recues pour debug
      fastify.log.info(`[PROFILE_UPDATE] User ${userId} updating profile. Body keys: ${Object.keys(request.body || {}).join(', ')}`);

      const body = updateUserProfileSchema.parse(request.body);

      // Construire l'objet de mise a jour avec uniquement les champs fournis
      const updateData: any = {};

      // Champs de profil de base avec normalisation
      if (body.firstName !== undefined) updateData.firstName = capitalizeName(body.firstName);
      if (body.lastName !== undefined) updateData.lastName = capitalizeName(body.lastName);
      if (body.displayName !== undefined) updateData.displayName = normalizeDisplayName(body.displayName);
      if (body.email !== undefined) updateData.email = normalizeEmail(body.email);
      if (body.phoneNumber !== undefined) {
        // Convertir les chaines vides et null en null, sinon normaliser au format E.164
        updateData.phoneNumber = (body.phoneNumber === '' || body.phoneNumber === null)
          ? null
          : normalizePhoneNumber(body.phoneNumber);
      }
      if (body.bio !== undefined) updateData.bio = body.bio;

      // Champs de configuration des langues
      if (body.systemLanguage !== undefined) updateData.systemLanguage = body.systemLanguage;
      if (body.regionalLanguage !== undefined) updateData.regionalLanguage = body.regionalLanguage;
      if (body.customDestinationLanguage !== undefined) {
        // Convert empty string to null for "None" option
        updateData.customDestinationLanguage = body.customDestinationLanguage === '' ? null : body.customDestinationLanguage;
      }

      // Champs de configuration de traduction (stored in UserFeature)
      const featureUpdateData: any = {};
      if (body.autoTranslateEnabled !== undefined) featureUpdateData.autoTranslateEnabled = body.autoTranslateEnabled;
      if (body.translateToSystemLanguage !== undefined) featureUpdateData.translateToSystemLanguage = body.translateToSystemLanguage;
      if (body.translateToRegionalLanguage !== undefined) featureUpdateData.translateToRegionalLanguage = body.translateToRegionalLanguage;
      if (body.useCustomDestination !== undefined) featureUpdateData.useCustomDestination = body.useCustomDestination;

      // Logique exclusive pour les options de traduction
      // Si une option de traduction est activee, desactiver les autres
      if (body.translateToSystemLanguage === true) {
        featureUpdateData.translateToRegionalLanguage = false;
        featureUpdateData.useCustomDestination = false;
      } else if (body.translateToRegionalLanguage === true) {
        featureUpdateData.translateToSystemLanguage = false;
        featureUpdateData.useCustomDestination = false;
      } else if (body.useCustomDestination === true) {
        featureUpdateData.translateToSystemLanguage = false;
        featureUpdateData.translateToRegionalLanguage = false;
      }

      // Verifier si l'email est unique (si modifie) - comparaison case-insensitive
      if (body.email) {
        const normalizedEmail = normalizeEmail(body.email);
        const existingUser = await fastify.prisma.user.findFirst({
          where: {
            email: {
              equals: normalizedEmail,
              mode: 'insensitive'
            },
            id: { not: userId }
          }
        });

        if (existingUser) {
          return reply.status(400).send({
            success: false,
            error: 'This email address is already in use'
          });
        }
      }

      // Verifier si le numero de telephone est unique (si modifie et non vide)
      if (body.phoneNumber && body.phoneNumber !== null && body.phoneNumber.trim() !== '') {
        const normalizedPhone = normalizePhoneNumber(body.phoneNumber);
        const existingUser = await fastify.prisma.user.findFirst({
          where: {
            phoneNumber: normalizedPhone,
            id: { not: userId }
          }
        });

        if (existingUser) {
          return reply.status(400).send({
            success: false,
            error: 'This phone number is already in use'
          });
        }
      }

      // Mettre a jour l'utilisateur
      const updatedUser = await fastify.prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          displayName: true,
          avatar: true,
          bio: true,
          isOnline: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          role: true,
          isActive: true,
          lastActiveAt: true,
          createdAt: true,
          updatedAt: true,
          userFeature: {
            select: {
              autoTranslateEnabled: true,
              translateToSystemLanguage: true,
              translateToRegionalLanguage: true,
              useCustomDestination: true
            }
          }
        }
      });

      // Update UserFeature if there are translation preference changes
      if (Object.keys(featureUpdateData).length > 0) {
        await fastify.prisma.userFeature.upsert({
          where: { userId },
          update: featureUpdateData,
          create: { userId, ...featureUpdateData }
        });
      }

      // Flatten the response to maintain backward compatibility
      const responseUser = {
        ...updatedUser,
        autoTranslateEnabled: updatedUser.userFeature?.autoTranslateEnabled ?? true,
        translateToSystemLanguage: updatedUser.userFeature?.translateToSystemLanguage ?? true,
        translateToRegionalLanguage: updatedUser.userFeature?.translateToRegionalLanguage ?? false,
        useCustomDestination: updatedUser.userFeature?.useCustomDestination ?? false
      };
      delete (responseUser as any).userFeature;

      return reply.send({
        success: true,
        data: {
          user: responseUser,
          message: 'Profile updated successfully'
        }
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        const userId = authContext?.userId || 'unknown';
        fastify.log.error(`[PROFILE_UPDATE] Validation error for user ${userId}: ${JSON.stringify(error.errors)}`);
        return reply.status(400).send({
          success: false,
          error: 'Invalid data',
          details: error.errors
        });
      }

      logError(fastify.log, 'Update user profile error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Route pour mettre a jour l'avatar de l'utilisateur connecte
  fastify.patch('/users/me/avatar', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update the authenticated user avatar image. Accepts a URL pointing to the avatar image.',
      tags: ['users'],
      summary: 'Update user avatar',
      body: {
        type: 'object',
        required: ['avatar'],
        properties: {
          avatar: { type: 'string', format: 'uri', description: 'Avatar image URL' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                avatar: { type: 'string', description: 'Updated avatar URL' },
                message: { type: 'string', example: 'Avatar updated successfully' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Invalid image format' },
            details: { type: 'array', items: { type: 'object' } }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;

      // Logger les donnees recues pour debug
      fastify.log.info(`[AVATAR_UPDATE] User ${userId} updating avatar. Body: ${JSON.stringify(request.body)}`);

      const body = updateAvatarSchema.parse(request.body);

      fastify.log.info(`[AVATAR_UPDATE] Avatar URL validated: ${body.avatar}`);

      // Mettre a jour l'avatar de l'utilisateur
      const updatedUser = await fastify.prisma.user.update({
        where: { id: userId },
        data: { avatar: body.avatar },
        select: {
          id: true,
          username: true,
          avatar: true
        }
      });

      fastify.log.info(`[AVATAR_UPDATE] Avatar updated successfully for user ${userId}`);

      return reply.send({
        success: true,
        data: {
          avatar: updatedUser.avatar,
          message: 'Avatar updated successfully'
        }
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        fastify.log.error(`[AVATAR_UPDATE] Validation error: ${JSON.stringify(error.errors)}`);
        return reply.status(400).send({
          success: false,
          error: 'Invalid image format',
          details: error.errors
        });
      }

      logError(fastify.log, 'Update user avatar error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Route pour changer le mot de passe de l'utilisateur connecte
  fastify.patch('/users/me/password', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Change the authenticated user password. Requires current password for verification. New password must meet security requirements.',
      tags: ['users'],
      summary: 'Change user password',
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 8, description: 'Current password for verification' },
          newPassword: { type: 'string', minLength: 8, description: 'New password (min 8 characters)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Password updated successfully' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'Validation error or incorrect current password' },
            details: { type: 'array', items: { type: 'object' } }
          }
        },
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;

      // Valider le body de la requete
      const body = updatePasswordSchema.parse(request.body);

      // Recuperer l'utilisateur avec son mot de passe
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, password: true }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      // Verifier que l'ancien mot de passe est correct
      const isPasswordValid = await bcrypt.compare(body.currentPassword, user.password);

      if (!isPasswordValid) {
        return reply.status(400).send({
          success: false,
          error: 'Current password is incorrect'
        });
      }

      // Hasher le nouveau mot de passe (bcrypt cost=12 for enhanced security)
      const BCRYPT_COST = 12;
      const hashedPassword = await bcrypt.hash(body.newPassword, BCRYPT_COST);

      // Mettre a jour le mot de passe
      await fastify.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
      });

      return reply.send({
        success: true,
        data: { message: 'Password updated successfully' }
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: error.errors[0]?.message || 'Invalid data',
          details: error.errors
        });
      }

      logError(fastify.log, 'Update password error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Route pour rechercher des utilisateurs
  fastify.get('/users/search', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Search for users by name, username, email, or display name. Returns paginated results with active users only. Minimum query length is 2 characters.',
      tags: ['users'],
      summary: 'Search users',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', minLength: 2, description: 'Search query (name, username, email, displayName)' },
          offset: { type: 'string', default: '0', description: 'Pagination offset' },
          limit: { type: 'string', default: '20', description: 'Results per page (max 100)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  username: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  displayName: { type: 'string' },
                  email: { type: 'string' },
                  isOnline: { type: 'boolean' },
                  lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
                  systemLanguage: { type: 'string' }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                offset: { type: 'number' },
                limit: { type: 'number' },
                returned: { type: 'number' }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const { q, offset = '0', limit = '20' } = request.query as { q?: string; offset?: string; limit?: string };

      const { offsetNum, limitNum } = validatePagination(offset, limit);

      if (!q || q.trim().length < 2) {
        return reply.send({
          success: true,
          data: [],
          pagination: buildPaginationMeta(0, offsetNum, limitNum, 0)
        });
      }

      const searchTerm = q.trim();

      const whereClause = {
        AND: [
          {
            isActive: true, // Seulement les utilisateurs actifs
            OR: [
              { deletedAt: null }, // Champ existe et est null
              { deletedAt: { isSet: false } } // Champ n'existe pas (MongoDB)
            ]
          },
          {
            OR: [
              {
                firstName: {
                  contains: searchTerm,
                  mode: 'insensitive' as const
                }
              },
              {
                lastName: {
                  contains: searchTerm,
                  mode: 'insensitive' as const
                }
              },
              {
                username: {
                  contains: searchTerm,
                  mode: 'insensitive' as const
                }
              },
              {
                email: {
                  contains: searchTerm,
                  mode: 'insensitive' as const
                }
              },
              {
                displayName: {
                  contains: searchTerm,
                  mode: 'insensitive' as const
                }
              }
            ]
          }
        ]
      };

      // Rechercher les utilisateurs par nom, prenom, username ou email
      const [users, totalCount] = await Promise.all([
        fastify.prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            displayName: true,
            email: true,
            isOnline: true,
            lastActiveAt: true,
            systemLanguage: true
          },
          orderBy: [
            { isOnline: 'desc' },
            { firstName: 'asc' },
            { lastName: 'asc' }
          ],
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.user.count({ where: whereClause })
      ]);

      reply.send({
        success: true,
        data: users,
        pagination: buildPaginationMeta(totalCount, offsetNum, limitNum, users.length)
      });
    } catch (error) {
      logError(fastify.log, 'Error searching users', error);
      reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Route pour obtenir tous les utilisateurs
  fastify.get('/users', {
    schema: {
      description: 'Get all users (to be implemented). This endpoint will return a paginated list of all users in the system.',
      tags: ['users'],
      summary: 'Get all users',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Get all users - to be implemented' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    reply.send({
      success: true,
      data: { message: 'Get all users - to be implemented' }
    });
  });

  // Route pour obtenir un utilisateur par username (profil public)
  // Format: /u/username (ex: meeshy.me/u/johndoe)
  fastify.get('/u/:username', {
    schema: {
      description: 'Get public user profile by username. Returns public information only (excludes email, phone, password). Case-insensitive username matching.',
      tags: ['users'],
      summary: 'Get user profile by username',
      params: {
        type: 'object',
        required: ['username'],
        properties: {
          username: { type: 'string', description: 'Username to lookup (case-insensitive)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                displayName: { type: 'string' },
                avatar: { type: 'string', nullable: true },
                bio: { type: 'string', nullable: true },
                role: { type: 'string' },
                isOnline: { type: 'boolean' },
                lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
                createdAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{
    Params: { username: string }
  }>, reply: FastifyReply) => {
    try {
      const { username } = request.params;

      fastify.log.info(`[USER_PROFILE_U] Fetching user profile for: ${username}`);

      // Recuperer l'utilisateur par username avec selection de champs publics uniquement
      // Recherche case-insensitive pour plus de flexibilite
      const user = await fastify.prisma.user.findFirst({
        where: {
          username: {
            equals: username,
            mode: 'insensitive'  // Recherche insensible a la casse
          }
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          bio: true,
          role: true,
          isOnline: true,
          lastActiveAt: true,
          createdAt: true,
          // Exclure les champs sensibles: email, phoneNumber, password
        }
      });

      if (!user) {
        fastify.log.warn(`[USER_PROFILE_U] User not found: ${username}`);
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      fastify.log.info(`[USER_PROFILE_U] User found: ${user.username} (${user.id})`);


      return reply.status(200).send({
        success: true,
        data: user
      });

    } catch (error) {
      logError(fastify.log, 'Get user profile error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Route pour obtenir un utilisateur par ID ou username (profil public)
  fastify.get('/users/:id', {
    schema: {
      description: 'Get public user profile by MongoDB ID or username. Returns public information including language settings. Automatically detects whether ID is MongoDB ObjectId or username.',
      tags: ['users'],
      summary: 'Get user profile by ID or username',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User MongoDB ID (24 hex chars) or username' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                displayName: { type: 'string' },
                avatar: { type: 'string', nullable: true },
                bio: { type: 'string', nullable: true },
                role: { type: 'string' },
                isOnline: { type: 'boolean' },
                lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
                systemLanguage: { type: 'string' },
                regionalLanguage: { type: 'string' },
                customDestinationLanguage: { type: 'string', nullable: true },
                autoTranslateEnabled: { type: 'boolean' },
                translateToSystemLanguage: { type: 'boolean' },
                translateToRegionalLanguage: { type: 'boolean' },
                useCustomDestination: { type: 'boolean' },
                isActive: { type: 'boolean' },
                deactivatedAt: { type: 'string', format: 'date-time', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
                email: { type: 'string', description: 'Masked for security' },
                phoneNumber: { type: 'string', nullable: true, description: 'Masked for security' },
                permissions: { type: 'object', nullable: true },
                isAnonymous: { type: 'boolean', example: false },
                isMeeshyer: { type: 'boolean', example: true }
              }
            }
          }
        },
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      // Determiner si c'est un ID MongoDB (24 caracteres hexadecimaux) ou un username
      const isMongoId = /^[a-f\d]{24}$/i.test(id);

      fastify.log.info(`[USER_PROFILE] Fetching user profile for: ${id} (isMongoId: ${isMongoId})`);

      // Recuperer l'utilisateur avec selection de champs publics uniquement
      // Chercher soit par ID MongoDB, soit par username (case-insensitive)
      const user = await fastify.prisma.user.findFirst({
        where: isMongoId
          ? { id }
          : {
              username: {
                equals: id,
                mode: 'insensitive'  // Recherche insensible a la casse
              }
            },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          bio: true,
          role: true,
          isOnline: true,
          lastActiveAt: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          isActive: true,
          deactivatedAt: true,
          createdAt: true,
          updatedAt: true,
          userFeature: {
            select: {
              autoTranslateEnabled: true,
              translateToSystemLanguage: true,
              translateToRegionalLanguage: true,
              useCustomDestination: true
            }
          }
          // Exclure les champs sensibles: email, phoneNumber, password
          // Exclure aussi: emailVerified, phoneVerified, lastLoginAt, etc.
        }
      });

      if (!user) {
        fastify.log.warn(`[USER_PROFILE] User not found: ${id}`);
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      fastify.log.info(`[USER_PROFILE] User found: ${user.username} (${user.id})`);

      // Flatten userFeature data for backward compatibility
      const { userFeature, ...userWithoutFeature } = user;

      // Ajouter les champs manquants pour completer le type SocketIOUser
      const publicUserProfile = {
        ...userWithoutFeature,
        autoTranslateEnabled: userFeature?.autoTranslateEnabled ?? true,
        translateToSystemLanguage: userFeature?.translateToSystemLanguage ?? true,
        translateToRegionalLanguage: userFeature?.translateToRegionalLanguage ?? false,
        useCustomDestination: userFeature?.useCustomDestination ?? false,
        email: '', // Masque pour la securite
        phoneNumber: undefined, // Masque pour la securite
        permissions: undefined, // Non applicable pour les profils publics
        isAnonymous: false, // Toujours false pour les utilisateurs enregistres
        isMeeshyer: true, // Toujours true pour les utilisateurs enregistres
      };

      return reply.status(200).send({
        success: true,
        data: publicUserProfile
      });

    } catch (error) {
      logError(fastify.log, 'Get user profile error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Route pour mettre a jour un utilisateur
  fastify.put('/users/:id', {
    schema: {
      description: 'Update a specific user by ID (to be implemented). Admin-only endpoint for managing user accounts.',
      tags: ['users'],
      summary: 'Update user by ID',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User MongoDB ID' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Update user - to be implemented' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    reply.send({
      success: true,
      data: { message: 'Update user - to be implemented' }
    });
  });

  // Route pour supprimer un utilisateur
  fastify.delete('/users/:id', {
    schema: {
      description: 'Delete a specific user by ID (to be implemented). Admin-only endpoint for removing user accounts.',
      tags: ['users'],
      summary: 'Delete user by ID',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User MongoDB ID' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Delete user - to be implemented' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    reply.send({
      success: true,
      data: { message: 'Delete user - to be implemented' }
    });
  });

  // ============================================================================
  // FRIEND REQUESTS ROUTES
  // ============================================================================

  // Recuperer les friend requests de l'utilisateur
  fastify.get('/users/friend-requests', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all friend requests for the authenticated user. Returns both sent and received requests with full user details.',
      tags: ['users', 'friends'],
      summary: 'Get friend requests',
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', default: '0', description: 'Pagination offset' },
          limit: { type: 'string', default: '20', description: 'Results per page (max 100)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  senderId: { type: 'string' },
                  receiverId: { type: 'string' },
                  status: { type: 'string', enum: ['pending', 'accepted', 'rejected'] },
                  createdAt: { type: 'string', format: 'date-time' },
                  sender: userMinimalSchema,
                  receiver: userMinimalSchema
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                offset: { type: 'number' },
                limit: { type: 'number' },
                returned: { type: 'number' }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };

      const { offsetNum, limitNum } = validatePagination(offset, limit);

      const whereClause = {
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ]
      };

      const [friendRequests, totalCount] = await Promise.all([
        fastify.prisma.friendRequest.findMany({
          where: whereClause,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                displayName: true,
                avatar: true,
                isOnline: true,
                lastActiveAt: true
              }
            },
            receiver: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                displayName: true,
                avatar: true,
                isOnline: true,
                lastActiveAt: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.friendRequest.count({ where: whereClause })
      ]);

      return reply.send({
        success: true,
        data: friendRequests,
        pagination: buildPaginationMeta(totalCount, offsetNum, limitNum, friendRequests.length)
      });
    } catch (error) {
      console.error('Error retrieving friend requests:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Envoyer une friend request
  fastify.post('/users/friend-requests', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Send a friend request to another user. Validates that users exist, prevents duplicate requests, and ensures users cannot add themselves.',
      tags: ['users', 'friends'],
      summary: 'Send friend request',
      body: {
        type: 'object',
        required: ['receiverId'],
        properties: {
          receiverId: { type: 'string', description: 'User ID to send friend request to' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                friendRequest: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    senderId: { type: 'string' },
                    receiverId: { type: 'string' },
                    status: { type: 'string', example: 'pending' },
                    createdAt: { type: 'string', format: 'date-time' },
                    sender: userMinimalSchema,
                    receiver: userMinimalSchema
                  }
                },
                message: { type: 'string', example: 'Friend request sent successfully' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const senderId = authContext.userId;
      const body = z.object({ receiverId: z.string() }).parse(request.body);
      const { receiverId } = body;

      // Verifier que l'utilisateur n'essaie pas de s'ajouter lui-meme
      if (senderId === receiverId) {
        return reply.status(400).send({
          success: false,
          error: 'You cannot add yourself as a friend'
        });
      }

      // Verifier que l'utilisateur destinataire existe
      const receiver = await fastify.prisma.user.findUnique({
        where: { id: receiverId }
      });

      if (!receiver) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      // Verifier qu'il n'y a pas deja une demande en cours
      const existingRequest = await fastify.prisma.friendRequest.findFirst({
        where: {
          OR: [
            { senderId, receiverId },
            { senderId: receiverId, receiverId: senderId }
          ]
        }
      });

      if (existingRequest) {
        return reply.status(400).send({
          success: false,
          error: 'A friend request already exists between these users'
        });
      }

      // Creer la friend request
      const friendRequest = await fastify.prisma.friendRequest.create({
        data: {
          senderId,
          receiverId,
          status: 'pending'
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true
            }
          },
          receiver: {
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
        data: {
          friendRequest,
          message: 'Friend request sent successfully'
        }
      });
    } catch (error) {
      console.error('Error sending friend request:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Repondre a une friend request (accepter/refuser/annuler)
  fastify.patch('/users/friend-requests/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Respond to a friend request. Sender can cancel, receiver can accept or reject. Only pending requests can be modified.',
      tags: ['users', 'friends'],
      summary: 'Respond to friend request',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Friend request ID' }
        }
      },
      body: {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['accept', 'reject', 'cancel'],
            description: 'Action to perform (accept/reject by receiver, cancel by sender)'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                request: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string' },
                    senderId: { type: 'string' },
                    receiverId: { type: 'string' },
                    status: { type: 'string' },
                    sender: userMinimalSchema,
                    receiver: userMinimalSchema
                  }
                },
                message: { type: 'string' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ action: z.enum(['accept', 'reject', 'cancel']) }).parse(request.body);
      const { id } = params;
      const { action } = body;

      // Trouver la friend request
      const friendRequest = await fastify.prisma.friendRequest.findFirst({
        where: {
          id: id,
          status: 'pending'
        }
      });

      if (!friendRequest) {
        return reply.status(404).send({
          success: false,
          error: 'Friend request not found or already processed'
        });
      }

      // Verifier les permissions selon l'action
      if (action === 'cancel') {
        // Seul l'expediteur peut annuler sa demande
        if (friendRequest.senderId !== userId) {
          return reply.status(403).send({
            success: false,
            error: 'Only the sender can cancel a friend request'
          });
        }

        // Supprimer la demande
        await fastify.prisma.friendRequest.delete({
          where: { id: id }
        });

        return reply.send({
          success: true,
          data: { message: 'Friend request cancelled successfully' }
        });
      } else {
        // Seul le destinataire peut accepter/refuser
        if (friendRequest.receiverId !== userId) {
          return reply.status(403).send({
            success: false,
            error: 'Only the receiver can accept or reject a friend request'
          });
        }

        // Mettre a jour le statut
        const updatedRequest = await fastify.prisma.friendRequest.update({
          where: { id: id },
          data: {
            status: action === 'accept' ? 'accepted' : 'rejected'
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                displayName: true,
                avatar: true
              }
            },
            receiver: {
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
          data: {
            request: updatedRequest,
            message: action === 'accept' ? 'Friend request accepted' : 'Friend request rejected'
          }
        });
      }
    } catch (error) {
      console.error('Error updating friend request:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Route pour recuperer le token d'affiliation actif d'un utilisateur
  // Utilise pour l'affiliation automatique via les liens /join
  fastify.get('/users/:userId/affiliate-token', {
    schema: {
      description: 'Get the active affiliate token for a user. Used for automatic affiliation via /join links. Returns the most recent active token that has not expired.',
      tags: ['users', 'affiliate'],
      summary: 'Get user affiliate token',
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'User ID' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              nullable: true,
              properties: {
                token: { type: 'string', description: 'Active affiliate token' }
              }
            }
          }
        },
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params as { userId: string };

      // Verifier que l'utilisateur existe
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      // Recuperer le token d'affiliation actif le plus recent de l'utilisateur
      const affiliateToken = await fastify.prisma.affiliateToken.findFirst({
        where: {
          createdBy: userId,
          isActive: true,
          OR: [
            { expiresAt: null }, // Tokens sans expiration
            { expiresAt: { gt: new Date() } } // Tokens non expires
          ]
        },
        orderBy: {
          createdAt: 'desc' // Le plus recent en premier
        },
        select: {
          token: true
        }
      });

      // Retourner le token ou null si aucun token actif
      return reply.send({
        success: true,
        data: affiliateToken ? { token: affiliateToken.token } : null
      });
    } catch (error) {
      console.error('[USERS] Error fetching affiliate token:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../utils/logger';
import bcrypt from 'bcryptjs';
import { normalizeEmail, normalizeUsername, capitalizeName, normalizeDisplayName, normalizePhoneNumber } from '../utils/normalize';

// Regex pour détecter les émojis
// Cette regex détecte la plupart des émojis Unicode
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

function containsEmoji(text: string): boolean {
  return EMOJI_REGEX.test(text);
}

// Schéma de validation pour la mise à jour utilisateur
const updateUserSchema = z.object({
  firstName: z.string().min(1).optional().refine((val) => !val || !containsEmoji(val), {
    message: 'Le prénom ne peut pas contenir d\'émojis'
  }),
  lastName: z.string().min(1).optional().refine((val) => !val || !containsEmoji(val), {
    message: 'Le nom ne peut pas contenir d\'émojis'
  }),
  displayName: z.string().optional(), // Autorise les émojis dans displayName
  email: z.string().email().optional(),
  phoneNumber: z.union([z.string(), z.null()]).optional(),
  bio: z.string().max(500).optional(),
  systemLanguage: z.string().min(2).max(5).optional(),
  regionalLanguage: z.string().min(2).max(5).optional(),
  customDestinationLanguage: z.union([z.string().min(2).max(5), z.literal(''), z.null()]).optional(), // Accept empty string for "None"
  autoTranslateEnabled: z.boolean().optional(),
  translateToSystemLanguage: z.boolean().optional(),
  translateToRegionalLanguage: z.boolean().optional(),
  useCustomDestination: z.boolean().optional(),
}).strict(); // Rejeter explicitement les champs inconnus pour éviter les erreurs silencieuses

// Schéma de validation pour l'upload d'avatar
const updateAvatarSchema = z.object({
  avatar: z.string().refine(
    (data) => {
      // Accepter soit les URLs (http/https) soit les data URLs (base64)
      return data.startsWith('http://') || 
             data.startsWith('https://') || 
             data.startsWith('data:image/');
    },
    'Invalid avatar format. Must be a valid URL or base64 image'
  )
}).strict(); // Accepter uniquement le champ avatar

// Schéma de validation pour le changement de mot de passe
const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(1, 'New password is required'),
  confirmPassword: z.string().min(1, 'Password confirmation is required')
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});

export async function userRoutes(fastify: FastifyInstance) {
  // Route pour vérifier la disponibilité d'un username
  fastify.get('/users/check-username/:username', async (request, reply) => {
    try {
      const { username } = request.params as { username: string };

      // Normaliser le username pour la vérification
      const normalizedUsername = normalizeUsername(username);

      // Vérifier si le username existe déjà dans la table User
      const existingUser = await fastify.prisma.user.findFirst({
        where: {
          username: {
            equals: normalizedUsername,
            mode: 'insensitive'
          }
        }
      });

      // Vérifier si le username existe dans la table AnonymousParticipant
      const existingAnonymous = await fastify.prisma.anonymousParticipant.findFirst({
        where: {
          username: {
            equals: normalizedUsername,
            mode: 'insensitive'
          }
        }
      });

      const isAvailable = !existingUser && !existingAnonymous;

      return reply.send({
        success: true,
        available: isAvailable,
        username: normalizedUsername
      });
    } catch (error) {
      console.error('[USERS] Error checking username availability:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to check username availability'
      });
    }
  });

  // Route de test simple
  fastify.get('/users/me/test', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Utiliser le nouveau système d'authentification unifié
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required',
          error: 'User must be authenticated'
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
        message: 'Test error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Route pour obtenir les statistiques du tableau de bord de l'utilisateur connecté
  fastify.get('/users/me/dashboard-stats', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Utiliser le nouveau système d'authentification unifié
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required',
          error: 'User must be authenticated to access dashboard stats'
        });
      }
      
      const userId = authContext.userId;
      fastify.log.info(`[DASHBOARD] Getting stats for user ${userId}`);

      // Récupérer les statistiques en parallèle
      const [
        // Conversations où l'utilisateur est membre actif
        totalConversations,
        activeConversations,
        recentConversations,
        
        // Communautés où l'utilisateur est membre actif  
        totalCommunities,
        recentCommunities,
        
        // Messages envoyés par l'utilisateur
        totalMessages,
        messagesThisWeek,
        
        // Liens de partage créés par l'utilisateur
        totalLinks,
        
        // Traductions effectuées (estimation basée sur les messages)
        translationsToday
      ] = await Promise.all([
        // Total conversations
        fastify.prisma.conversationMember.count({
          where: {
            userId,
            isActive: true
          }
        }),
        
        // Conversations actives (avec messages récents)
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
        
        // Conversations récentes (optimisé - limiter les données)
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
              take: 5, // Limiter à 5 membres max
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
        
        // Total communautés
        fastify.prisma.communityMember.count({
          where: {
            userId
          }
        }),
        
        // Communautés récentes (optimisé - limiter les membres)
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
              take: 5, // Limiter à 5 membres
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
        
        // Total liens créés
        fastify.prisma.conversationShareLink.count({
          where: {
            createdBy: userId
          }
        }),
        
        // Estimation des traductions aujourd'hui (basée sur les messages multilingues)
        fastify.prisma.message.count({
          where: {
            senderId: userId,
            isDeleted: false,
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24h
            }
            // Simplification: compter tous les messages récents comme traductions potentielles
          }
        })
      ]);

      // Transformer les données pour le frontend
      const stats = {
        totalConversations,
        totalCommunities,
        totalMessages: messagesThisWeek, // Messages cette semaine
        activeConversations,
        translationsToday,
        totalLinks,
        lastUpdated: new Date()
      };

      // Transformer les conversations récentes
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

      // Transformer les communautés récentes
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
        message: 'Erreur interne du serveur',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Route pour obtenir les statistiques d'un utilisateur spécifique (par ID ou username)
  fastify.get('/users/:userId/stats', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const { userId: userIdOrUsername } = request.params;
      fastify.log.info(`[USER_STATS] Getting stats for user ${userIdOrUsername}`);

      // Déterminer si c'est un ID MongoDB (24 caractères hexadécimaux) ou un username
      const isMongoId = /^[a-f\d]{24}$/i.test(userIdOrUsername);
      
      // Récupérer l'utilisateur pour obtenir son ID réel
      const user = await fastify.prisma.user.findFirst({
        where: isMongoId 
          ? { id: userIdOrUsername } 
          : { 
              username: { 
                equals: userIdOrUsername,
                mode: 'insensitive'  // Recherche insensible à la casse
              } 
            },
        select: {
          id: true,
          createdAt: true,
          isOnline: true,
          lastSeen: true
        }
      });

      if (!user) {
        fastify.log.warn(`[USER_STATS] User not found: ${userIdOrUsername}`);
        return reply.status(404).send({
          success: false,
          message: 'User not found'
        });
      }
      
      fastify.log.info(`[USER_STATS] User found: ${user.id}`);


      const userId = user.id;

      // Récupérer les statistiques de base de l'utilisateur
      const [
        totalConversations,
        messagesSent,
        messagesReceived,
        groupsCount
      ] = await Promise.all([
        // Nombre de conversations où l'utilisateur est membre
        fastify.prisma.conversationMember.count({
          where: {
            userId: userId,
            isActive: true
          }
        }),
        // Nombre de messages envoyés
        fastify.prisma.message.count({
          where: {
            senderId: userId,
            isDeleted: false
          }
        }),
        // Nombre de messages reçus (dans les conversations où l'utilisateur est membre)
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
        lastActivity: user.lastSeen || user.createdAt
      };

      return reply.send({
        success: true,
        data: stats
      });

    } catch (error) {
      fastify.log.error(`[USER_STATS] Error getting user stats: ${error instanceof Error ? error.message : String(error)}`);
      return reply.status(500).send({
        success: false,
        message: 'Error retrieving statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Route pour mettre à jour le profil utilisateur connecté
  fastify.patch('/users/me', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Utiliser le nouveau système d'authentification unifié
    const authContext = (request as any).authContext;
    
    try {
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required',
          error: 'User must be authenticated to update profile'
        });
      }
      
      const userId = authContext.userId;
      
      // Logger les données reçues pour debug
      fastify.log.info(`[PROFILE_UPDATE] User ${userId} updating profile. Body keys: ${Object.keys(request.body || {}).join(', ')}`);
      
      const body = updateUserSchema.parse(request.body);
      
      // Construire l'objet de mise à jour avec uniquement les champs fournis
      const updateData: any = {};
      
      // Champs de profil de base avec normalisation
      if (body.firstName !== undefined) updateData.firstName = capitalizeName(body.firstName);
      if (body.lastName !== undefined) updateData.lastName = capitalizeName(body.lastName);
      if (body.displayName !== undefined) updateData.displayName = normalizeDisplayName(body.displayName);
      if (body.email !== undefined) updateData.email = normalizeEmail(body.email);
      if (body.phoneNumber !== undefined) {
        // Convertir les chaînes vides et null en null, sinon normaliser au format E.164
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
      
      // Champs de configuration de traduction
      if (body.autoTranslateEnabled !== undefined) updateData.autoTranslateEnabled = body.autoTranslateEnabled;
      if (body.translateToSystemLanguage !== undefined) updateData.translateToSystemLanguage = body.translateToSystemLanguage;
      if (body.translateToRegionalLanguage !== undefined) updateData.translateToRegionalLanguage = body.translateToRegionalLanguage;
      if (body.useCustomDestination !== undefined) updateData.useCustomDestination = body.useCustomDestination;

      // Logique exclusive pour les options de traduction
      // Si une option de traduction est activée, désactiver les autres
      if (body.translateToSystemLanguage === true) {
        updateData.translateToRegionalLanguage = false;
        updateData.useCustomDestination = false;
      } else if (body.translateToRegionalLanguage === true) {
        updateData.translateToSystemLanguage = false;
        updateData.useCustomDestination = false;
      } else if (body.useCustomDestination === true) {
        updateData.translateToSystemLanguage = false;
        updateData.translateToRegionalLanguage = false;
      }

      // Vérifier si l'email est unique (si modifié) - comparaison case-insensitive
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

      // Vérifier si le numéro de téléphone est unique (si modifié et non vide)
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

      // Mettre à jour l'utilisateur
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
          autoTranslateEnabled: true,
          translateToSystemLanguage: true,
          translateToRegionalLanguage: true,
          useCustomDestination: true,
          role: true,
          isActive: true,
          lastActiveAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return reply.send({
        success: true,
        data: updatedUser,
        message: 'Profile updated successfully'
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

  // Route pour mettre à jour l'avatar de l'utilisateur connecté
  fastify.patch('/users/me/avatar', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Utiliser le nouveau système d'authentification unifié
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required',
          error: 'User must be authenticated to update avatar'
        });
      }
      
      const userId = authContext.userId;
      
      // Logger les données reçues pour debug
      fastify.log.info(`[AVATAR_UPDATE] User ${userId} updating avatar. Body: ${JSON.stringify(request.body)}`);
      
      const body = updateAvatarSchema.parse(request.body);
      
      fastify.log.info(`[AVATAR_UPDATE] Avatar URL validated: ${body.avatar}`);
      
      // Mettre à jour l'avatar de l'utilisateur
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
        data: { avatar: updatedUser.avatar },
        message: 'Avatar updated successfully'
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        fastify.log.error(`[AVATAR_UPDATE] Validation error: ${JSON.stringify(error.errors)}`);
        return reply.status(400).send({
          success: false,
          error: 'Invalid image format. URL must start with http://, https:// or data:image/',
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

  // Route pour changer le mot de passe de l'utilisateur connecté
  fastify.patch('/users/me/password', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Utiliser le nouveau système d'authentification unifié
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required',
          error: 'User must be authenticated to change password'
        });
      }
      
      const userId = authContext.userId;
      
      // Valider le body de la requête
      const body = updatePasswordSchema.parse(request.body);
      
      // Récupérer l'utilisateur avec son mot de passe
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

      // Vérifier que l'ancien mot de passe est correct
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

      // Mettre à jour le mot de passe
      await fastify.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
      });

      return reply.send({
        success: true,
        message: 'Password updated successfully'
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
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Utiliser le nouveau système d'authentification unifié
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required',
          error: 'User must be authenticated to search users'
        });
      }

      const { q, offset = '0', limit = '20' } = request.query as { q?: string; offset?: string; limit?: string };

      if (!q || q.trim().length < 2) {
        return reply.send({
          success: true,
          data: [],
          pagination: {
            total: 0,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
            hasMore: false
          }
        });
      }

      const searchTerm = q.trim();
      const offsetNum = parseInt(offset, 10);
      const limitNum = Math.min(parseInt(limit, 10), 100);

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

      // Rechercher les utilisateurs par nom, prénom, username ou email
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
            lastSeen: true,
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
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + users.length < totalCount
        }
      });
    } catch (error) {
      logError(fastify.log, 'Error searching users', error);
      reply.status(500).send({
        error: 'Internal server error',
        message: 'Unable to search users'
      });
    }
  });

  // Route pour obtenir tous les utilisateurs
  fastify.get('/users', async (request, reply) => {
    reply.send({ message: 'Get all users - to be implemented' });
  });

  // Route pour obtenir un utilisateur par username (profil public)
  // Format: /u/username (ex: meeshy.me/u/johndoe)
  fastify.get('/u/:username', async (request: FastifyRequest<{
    Params: { username: string }
  }>, reply: FastifyReply) => {
    try {
      const { username } = request.params;
      
      fastify.log.info(`[USER_PROFILE_U] Fetching user profile for: ${username}`);

      // Récupérer l'utilisateur par username avec sélection de champs publics uniquement
      // Recherche case-insensitive pour plus de flexibilité
      const user = await fastify.prisma.user.findFirst({
        where: { 
          username: { 
            equals: username,
            mode: 'insensitive'  // Recherche insensible à la casse
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
          lastSeen: true,
          createdAt: true,
          // Exclure les champs sensibles: email, phoneNumber, password
        }
      });

      if (!user) {
        fastify.log.warn(`[USER_PROFILE_U] User not found: ${username}`);
        return reply.status(404).send({
          success: false,
          message: 'User not found'
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
        message: 'Failed to get user profile'
      });
    }
  });

  // Route pour obtenir un utilisateur par ID ou username (profil public)
  fastify.get('/users/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      // Déterminer si c'est un ID MongoDB (24 caractères hexadécimaux) ou un username
      const isMongoId = /^[a-f\d]{24}$/i.test(id);
      
      fastify.log.info(`[USER_PROFILE] Fetching user profile for: ${id} (isMongoId: ${isMongoId})`);
      
      // Récupérer l'utilisateur avec sélection de champs publics uniquement
      // Chercher soit par ID MongoDB, soit par username (case-insensitive)
      const user = await fastify.prisma.user.findFirst({
        where: isMongoId 
          ? { id } 
          : { 
              username: { 
                equals: id,
                mode: 'insensitive'  // Recherche insensible à la casse
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
          lastSeen: true,
          lastActiveAt: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          autoTranslateEnabled: true,
          translateToSystemLanguage: true,
          translateToRegionalLanguage: true,
          useCustomDestination: true,
          isActive: true,
          deactivatedAt: true,
          createdAt: true,
          updatedAt: true,
          // Exclure les champs sensibles: email, phoneNumber, password
          // Exclure aussi: emailVerified, phoneVerified, lastLoginAt, etc.
        }
      });

      if (!user) {
        fastify.log.warn(`[USER_PROFILE] User not found: ${id}`);
        return reply.status(404).send({
          success: false,
          message: 'User not found'
        });
      }
      
      fastify.log.info(`[USER_PROFILE] User found: ${user.username} (${user.id})`);


      // Ajouter les champs manquants pour compléter le type SocketIOUser
      const publicUserProfile = {
        ...user,
        email: '', // Masqué pour la sécurité
        phoneNumber: undefined, // Masqué pour la sécurité
        permissions: undefined, // Non applicable pour les profils publics
        isAnonymous: false, // Toujours false pour les utilisateurs enregistrés
        isMeeshyer: true, // Toujours true pour les utilisateurs enregistrés
      };

      return reply.status(200).send({
        success: true,
        data: publicUserProfile
      });

    } catch (error) {
      logError(fastify.log, 'Get user profile error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get user profile'
      });
    }
  });

  // Route pour mettre à jour un utilisateur
  fastify.put('/users/:id', async (request, reply) => {
    reply.send({ message: 'Update user - to be implemented' });
  });

  // Route pour supprimer un utilisateur
  fastify.delete('/users/:id', async (request, reply) => {
    reply.send({ message: 'Delete user - to be implemented' });
  });

  // ============================================================================
  // FRIEND REQUESTS ROUTES
  // ============================================================================

  // Récupérer les friend requests de l'utilisateur
  fastify.get('/users/friend-requests', {
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
                lastActiveAt: true,
                lastSeen: true
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
                lastActiveAt: true,
                lastSeen: true
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
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + friendRequests.length < totalCount
        }
      });
    } catch (error) {
      console.error('Error retrieving friend requests:', error);
      return reply.status(500).send({
        success: false,
        error: 'Error retrieving friend requests'
      });
    }
  });

  // Envoyer une friend request
  fastify.post('/users/friend-requests', {
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

      const senderId = authContext.userId;
      const body = z.object({ receiverId: z.string() }).parse(request.body);
      const { receiverId } = body;

      // Vérifier que l'utilisateur n'essaie pas de s'ajouter lui-même
      if (senderId === receiverId) {
        return reply.status(400).send({
          success: false,
          error: 'You cannot add yourself as a friend'
        });
      }

      // Vérifier que l'utilisateur destinataire existe
      const receiver = await fastify.prisma.user.findUnique({
        where: { id: receiverId }
      });

      if (!receiver) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      // Vérifier qu'il n'y a pas déjà une demande en cours
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

      // Créer la friend request
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
        data: friendRequest
      });
    } catch (error) {
      console.error('Error sending friend request:', error);
      return reply.status(500).send({
        success: false,
        error: 'Error sending friend request'
      });
    }
  });

  // Répondre à une friend request (accepter/refuser/annuler)
  fastify.patch('/users/friend-requests/:id', {
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

      // Vérifier les permissions selon l'action
      if (action === 'cancel') {
        // Seul l'expéditeur peut annuler sa demande
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
          message: 'Friend request cancelled successfully'
        });
      } else {
        // Seul le destinataire peut accepter/refuser
        if (friendRequest.receiverId !== userId) {
          return reply.status(403).send({
            success: false,
            error: 'Only the receiver can accept or reject a friend request'
          });
        }

        // Mettre à jour le statut
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
          data: updatedRequest
        });
      }
    } catch (error) {
      console.error('Error updating friend request:', error);
      return reply.status(500).send({
        success: false,
        error: 'Error updating friend request'
      });
    }
  });

  // Route pour récupérer le token d'affiliation actif d'un utilisateur
  // Utilisé pour l'affiliation automatique via les liens /join
  fastify.get('/users/:userId/affiliate-token', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params as { userId: string };

      // Vérifier que l'utilisateur existe
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          message: 'User not found'
        });
      }

      // Récupérer le token d'affiliation actif le plus récent de l'utilisateur
      const affiliateToken = await fastify.prisma.affiliateToken.findFirst({
        where: {
          createdBy: userId,
          isActive: true,
          OR: [
            { expiresAt: null }, // Tokens sans expiration
            { expiresAt: { gt: new Date() } } // Tokens non expirés
          ]
        },
        orderBy: {
          createdAt: 'desc' // Le plus récent en premier
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
        message: 'Failed to fetch affiliate token'
      });
    }
  });
}

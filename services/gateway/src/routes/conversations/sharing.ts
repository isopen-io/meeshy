import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UserRoleEnum, ErrorCode, MemberRole } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationSchema,
  conversationParticipantSchema,
  conversationResponseSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import {
  generateInitialLinkId,
  generateFinalLinkId,
  ensureUniqueShareLinkIdentifier
} from './utils/identifier-generator';

/**
 * Résout l'ID de conversation réel à partir d'un identifiant
 */
async function resolveConversationId(prisma: PrismaClient, identifier: string): Promise<string | null> {
  if (isValidMongoId(identifier)) {
    return identifier;
  }
  const conversation = await prisma.conversation.findFirst({
    where: { identifier: identifier }
  });
  return conversation ? conversation.id : null;
}

/**
 * Enregistre les routes de partage et d'invitation
 */
export function registerSharingRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any,
  requiredAuth: any
) {
  fastify.post<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      maxUses?: number;
      maxConcurrentUsers?: number;
      maxUniqueSessions?: number;
      expiresAt?: string;
      allowAnonymousMessages?: boolean;
      allowAnonymousFiles?: boolean;
      allowAnonymousImages?: boolean;
      allowViewHistory?: boolean;
      requireNickname?: boolean;
      requireEmail?: boolean;
      allowedCountries?: string[];
      allowedLanguages?: string[];
      allowedIpRanges?: string[];
    };
  }>('/conversations/:id/new-link', {
    schema: {
      description: 'Create a new shareable invitation link for a conversation with configurable permissions',
      tags: ['conversations', 'links'],
      summary: 'Create share link',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Link name for identification' },
          description: { type: 'string', description: 'Link description' },
          maxUses: { type: 'number', description: 'Maximum number of times link can be used' },
          maxConcurrentUsers: { type: 'number', description: 'Maximum concurrent users via this link' },
          maxUniqueSessions: { type: 'number', description: 'Maximum unique sessions' },
          expiresAt: { type: 'string', format: 'date-time', description: 'Link expiration date' },
          allowAnonymousMessages: { type: 'boolean', description: 'Allow anonymous users to send messages' },
          allowAnonymousFiles: { type: 'boolean', description: 'Allow anonymous users to send files' },
          allowAnonymousImages: { type: 'boolean', description: 'Allow anonymous users to send images' },
          allowViewHistory: { type: 'boolean', description: 'Allow viewing message history' },
          requireNickname: { type: 'boolean', description: 'Require nickname for anonymous users' },
          requireEmail: { type: 'boolean', description: 'Require email for anonymous users' },
          allowedCountries: { type: 'array', items: { type: 'string' }, description: 'Allowed country codes' },
          allowedLanguages: { type: 'array', items: { type: 'string' }, description: 'Allowed language codes' },
          allowedIpRanges: { type: 'array', items: { type: 'string' }, description: 'Allowed IP ranges' }
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
                link: { type: 'object', description: 'Created share link object' }
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
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const body = request.body || {};
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Unauthorized access to this conversation'
        });
      }

      // Récupérer les informations de la conversation et du membre
      const [conversation, membership] = await Promise.all([
        prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { id: true, type: true, title: true }
        }),
        prisma.conversationMember.findFirst({
          where: {
            conversationId: conversationId,
            userId: currentUserId,
            isActive: true
          }
        })
      ]);

      if (!conversation) {
        return reply.status(404).send({
          success: false,
          error: 'Conversation not found'
        });
      }

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: 'Unauthorized access to this conversation'
        });
      }

      // Récupérer le rôle de l'utilisateur
      const user = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { role: true }
      });

      if (!user) {
        return reply.status(403).send({
          success: false,
          error: 'User not found'
        });
      }

      // Vérifier les permissions pour créer des liens de partage
      const conversationType = conversation.type;
      const userRole = user.role as UserRoleEnum;

      // Interdire la création de liens pour les conversations directes
      if (conversationType === 'direct') {
        return reply.status(403).send({
          success: false,
          error: 'Cannot create share links for direct conversations'
        });
      }

      // Pour les conversations globales, seuls les BIGBOSS peuvent créer des liens
      if (conversationType === 'global') {
        if (userRole !== UserRoleEnum.BIGBOSS) {
          return reply.status(403).send({
            success: false,
            error: 'You do not have the necessary rights to perform this operation'
          });
        }
      }

      // Pour tous les autres types de conversations (group, public, etc.),
      // n'importe qui ayant accès à la conversation peut créer des liens
      // L'utilisateur doit juste être membre de la conversation (déjà vérifié plus haut)

      // Générer le linkId initial
      const initialLinkId = generateInitialLinkId();

      // Générer un identifiant unique (basé sur le nom du lien, ou le titre, ou généré)
      let baseIdentifier: string;
      if (body.name) {
        baseIdentifier = `mshy_${body.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`;
      } else if (body.description) {
        // Utiliser la description comme base si pas de nom
        baseIdentifier = `mshy_${body.description.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 30)}`;
      } else {
        // Générer un identifiant unique si ni nom ni description
        const timestamp = Date.now().toString();
        const randomPart = Math.random().toString(36).substring(2, 8);
        baseIdentifier = `mshy_link-${timestamp}-${randomPart}`;
      }
      const uniqueIdentifier = await ensureUniqueShareLinkIdentifier(prisma, baseIdentifier);

      // Créer le lien avec toutes les options configurables
      const shareLink = await prisma.conversationShareLink.create({
        data: {
          linkId: initialLinkId, // Temporaire
          conversationId: conversationId,
          createdBy: currentUserId,
          name: body.name,
          description: body.description,
          maxUses: body.maxUses ?? undefined,
          maxConcurrentUsers: body.maxConcurrentUsers ?? undefined,
          maxUniqueSessions: body.maxUniqueSessions ?? undefined,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          allowAnonymousMessages: body.allowAnonymousMessages ?? true,
          allowAnonymousFiles: body.allowAnonymousFiles ?? false,
          allowAnonymousImages: body.allowAnonymousImages ?? true,
          allowViewHistory: body.allowViewHistory ?? true,
          requireNickname: body.requireNickname ?? true,
          requireEmail: body.requireEmail ?? false,
          allowedCountries: body.allowedCountries ?? [],
          allowedLanguages: body.allowedLanguages ?? [],
          allowedIpRanges: body.allowedIpRanges ?? [],
          identifier: uniqueIdentifier
        }
      });

      // Mettre à jour avec le linkId final
      const finalLinkId = generateFinalLinkId(shareLink.id, initialLinkId);
      await prisma.conversationShareLink.update({
        where: { id: shareLink.id },
        data: { linkId: finalLinkId }
      });

      // Retour compatible avec le frontend de service conversations (string du lien complet)
      const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3100'}/join/${finalLinkId}`;
      reply.send({
        success: true,
        data: {
          link: inviteLink,
          code: finalLinkId,
          shareLink: {
            id: shareLink.id,
            linkId: finalLinkId,
            name: shareLink.name,
            description: shareLink.description,
            maxUses: shareLink.maxUses,
            expiresAt: shareLink.expiresAt,
            allowAnonymousMessages: shareLink.allowAnonymousMessages,
            allowAnonymousFiles: shareLink.allowAnonymousFiles,
            allowAnonymousImages: shareLink.allowAnonymousImages,
            allowViewHistory: shareLink.allowViewHistory,
            requireNickname: shareLink.requireNickname,
            requireEmail: shareLink.requireEmail
          }
        }
      });

    } catch (error) {
      console.error('[GATEWAY] Error creating new conversation link:', error);
      reply.status(500).send({
        success: false,
        error: 'Error creating link'
      });
    }
  });

  // Route pour mettre à jour une conversation
  fastify.patch<{
    Params: { id: string };
    Body: {
      title?: string;
      description?: string;
      type?: 'direct' | 'group' | 'public' | 'global';
    };
  }>('/conversations/:id', {
    schema: {
      description: 'Partially update conversation properties (alternative to PUT) - requires admin/moderator role',
      tags: ['conversations'],
      summary: 'Partially update conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'New conversation title', minLength: 1, maxLength: 100 },
          description: { type: 'string', description: 'New conversation description', maxLength: 500 },
          type: { type: 'string', enum: ['direct', 'group', 'public', 'global'], description: 'Conversation type' }
        }
      },
      response: {
        200: conversationResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    const { id } = request.params;
    const { title, description, type } = request.body;
    const authRequest = request as UnifiedAuthRequest;
    
    try {
      // Vérifier que l'utilisateur est authentifié
      if (!authRequest.authContext.isAuthenticated) {
        return reply.status(401).send({
          success: false,
          error: 'Authentification requise'
        });
      }
      
      const currentUserId = authRequest.authContext.userId;


      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Unauthorized access to this conversation'
        });
      }

      // Vérifier que l'utilisateur a accès à cette conversation
      const membership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: conversationId,
          userId: currentUserId,
          isActive: true
        },
        include: {
          user: true
        }
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: 'Unauthorized access to this conversation'
        });
      }


      // Pour la modification du nom, permettre à tous les membres de la conversation
      // Seuls les admins ou créateurs peuvent modifier le type de conversation
      if (type !== undefined) {
        const isAdmin = membership.user.role === 'ADMIN' || membership.user.role === 'BIGBOSS';
        const isCreator = membership.role === 'CREATOR';
        
        if (!isAdmin && !isCreator) {
          return reply.status(403).send({
            success: false,
            error: 'Seuls les administrateurs peuvent modifier le type de conversation'
          });
        }
      }

      // Préparer les données de mise à jour
      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (type !== undefined) updateData.type = type;

      // Mettre à jour la conversation
      const updatedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: updateData,
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  systemLanguage: true,
                  isOnline: true,
                  lastActiveAt: true,
                  role: true
                }
              }
            }
          }
        }
      });

      reply.send({
        success: true,
        data: updatedConversation
      });

    } catch (error) {
      console.error('[GATEWAY] Error updating conversation:', error);
      
      // Gestion d'erreur améliorée avec détails spécifiques
      let errorMessage = 'Erreur lors de la mise à jour de la conversation';
      let statusCode = 500;
      
      if (error.code === 'P2002') {
        errorMessage = 'Une conversation avec ce nom existe déjà';
        statusCode = 409;
      } else if (error.code === 'P2025') {
        errorMessage = 'Conversation non trouvée';
        statusCode = 404;
      } else if (error.code === 'P2003') {
        errorMessage = 'Erreur de référence - conversation invalide';
        statusCode = 400;
      } else if (error.name === 'ValidationError') {
        errorMessage = 'Données de mise à jour invalides';
        statusCode = 400;
      }
      
      console.error('[GATEWAY] Detailed error info:', {
        code: error.code,
        message: error.message,
        meta: error.meta,
        conversationId: id,
        currentUserId: authRequest.authContext.userId,
        updateData: { title, description, type }
      });
      
      reply.status(statusCode).send({
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? {
          code: error.code,
          message: error.message,
          meta: error.meta
        } : undefined
      });
    }
  });

  // Récupérer les liens de partage d'une conversation (pour les admins)
  fastify.get('/conversations/:conversationId/links', {
    schema: {
      description: 'Get all shareable links for a conversation (moderators see all links, members see only their own)',
      tags: ['conversations', 'links'],
      summary: 'Get conversation share links',
      params: {
        type: 'object',
        required: ['conversationId'],
        properties: {
          conversationId: { type: 'string', description: 'Conversation ID' }
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
                  linkId: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  maxUses: { type: 'number' },
                  currentUses: { type: 'number' },
                  expiresAt: { type: 'string', format: 'date-time' },
                  isActive: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que l'utilisateur est membre de la conversation
      const membership = await prisma.conversationMember.findFirst({
        where: {
          conversationId,
          userId,
          isActive: true
        }
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: 'You must be a member of this conversation to see its sharing links'
        });
      }

      // Vérifier si l'utilisateur est modérateur/admin de la conversation
      const isModerator = ['CREATOR', 'ADMIN', 'MODERATOR'].includes(membership.role as string);

      // Filtrer les liens selon les droits:
      // - Modérateurs: voient TOUS les liens
      // - Membres normaux: voient uniquement leurs propres liens
      const links = await prisma.conversationShareLink.findMany({
        where: {
          conversationId,
          ...(isModerator ? {} : { creatorId: userId }) // Si pas modérateur, filtrer par créateur
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
          },
          conversation: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          _count: {
            select: {
              anonymousParticipants: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return reply.send({
        success: true,
        data: links,
        isModerator // Indiquer au frontend si l'utilisateur peut gérer les liens
      });
    } catch (error) {
      console.error('[GATEWAY] Error fetching conversation links:', error);
      return reply.status(500).send({ 
        success: false, 
        error: 'Error retrieving conversation links' 
      });
    }
  });

  // Route pour rejoindre une conversation via un lien partagé (utilisateurs authentifiés)
  fastify.post('/conversations/join/:linkId', {
    schema: {
      description: 'Join a conversation using an invitation link - validates link permissions and adds user as member',
      tags: ['conversations', 'links'],
      summary: 'Join conversation via link',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: { type: 'string', description: 'Share link ID to join conversation' }
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
                conversation: conversationSchema,
                membership: conversationParticipantSchema
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
    },
    preValidation: [requiredAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { linkId } = request.params as { linkId: string };
      const authRequest = request as UnifiedAuthRequest;
      const userToken = authRequest.authContext;

      if (!userToken) {
        return reply.status(401).send({
          success: false,
          error: 'Authentification requise'
        });
      }

      // Vérifier que le lien existe et est valide
      const shareLink = await prisma.conversationShareLink.findFirst({
        where: { linkId },
        include: {
          conversation: true
        }
      });

      if (!shareLink) {
        return reply.status(404).send({
          success: false,
          error: 'Lien de conversation introuvable'
        });
      }

      if (!shareLink.isActive) {
        return reply.status(410).send({
          success: false,
          error: 'Ce lien n\'est plus actif'
        });
      }

      if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
        return reply.status(410).send({
          success: false,
          error: 'This link has expired'
        });
      }

      // Vérifier si l'utilisateur est déjà membre de la conversation
      const existingMember = await prisma.conversationMember.findFirst({
        where: {
          conversationId: shareLink.conversationId,
          userId: userToken.userId
        }
      });

      if (existingMember) {
        return reply.send({
          success: true,
          data: { message: 'Vous êtes déjà membre de cette conversation', conversationId: shareLink.conversationId }
        });
      }

      // Ajouter l'utilisateur à la conversation
      await prisma.conversationMember.create({
        data: {
          conversationId: shareLink.conversationId,
          userId: userToken.userId,
          role: MemberRole.MEMBER,
          joinedAt: new Date()
        }
      });

      // Incrémenter le compteur d'utilisation du lien
      await prisma.conversationShareLink.update({
        where: { id: shareLink.id },
        data: { currentUses: { increment: 1 } }
      });

      // Envoyer des notifications
      const notificationService = (fastify as any).notificationService;
      if (notificationService) {
        try {
          // Récupérer les informations de l'utilisateur qui rejoint
          const joiningUser = await prisma.user.findUnique({
            where: { id: userToken.userId },
            select: {
              username: true,
              displayName: true,
              avatar: true
            }
          });

          if (joiningUser) {
            const userName = joiningUser.displayName || joiningUser.username;

            // 1. Notification de confirmation pour l'utilisateur qui rejoint
            await notificationService.createConversationJoinNotification({
              userId: userToken.userId,
              conversationId: shareLink.conversationId,
              conversationTitle: shareLink.conversation.title,
              conversationType: shareLink.conversation.type,
              isJoiner: true // C'est l'utilisateur qui rejoint
            });

            // 2. Notifier les admins et créateurs de la conversation
            const adminsAndCreators = await prisma.conversationMember.findMany({
              where: {
                conversationId: shareLink.conversationId,
                role: { in: ['ADMIN', 'CREATOR'] },
                isActive: true,
                userId: { not: userToken.userId } // Ne pas notifier l'utilisateur lui-même
              },
              select: { userId: true }
            });

            // Envoyer une notification à chaque admin/créateur
            for (const member of adminsAndCreators) {
              await notificationService.createConversationJoinNotification({
                userId: member.userId,
                conversationId: shareLink.conversationId,
                conversationTitle: shareLink.conversation.title,
                conversationType: shareLink.conversation.type,
                isJoiner: false, // C'est une notification pour un admin
                joinerUsername: userName,
                joinerAvatar: joiningUser.avatar || undefined
              });
              console.log(`[GATEWAY] 📩 Notification "membre a rejoint" envoyée à l'admin ${member.userId}`);
            }

            console.log(`[GATEWAY] 📩 Notification de confirmation envoyée à ${userToken.userId}`);
          }
        } catch (notifError) {
          console.error('[GATEWAY] Erreur lors de l\'envoi des notifications de jointure:', notifError);
          // Ne pas bloquer la jointure
        }
      }

      return reply.send({
        success: true,
        data: { message: 'Vous avez rejoint la conversation avec succès', conversationId: shareLink.conversationId }
      });

    } catch (error) {
      console.error('[GATEWAY] Error joining conversation via link:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la jointure de la conversation'
      });
    }
  });

  // Route pour inviter un utilisateur à une conversation
  fastify.post('/conversations/:id/invite', {
    schema: {
      description: 'Invite a user to join a conversation - creates membership and sends notification',
      tags: ['conversations', 'participants'],
      summary: 'Invite user to conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID' }
        }
      },
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'ID of user to invite' }
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
                message: { type: 'string', example: 'User invited successfully' },
                membership: conversationParticipantSchema
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
    },
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User not authenticated'
        });
      }

      const { id: conversationId } = request.params as { id: string };
      const { userId } = request.body as { userId: string };
      const inviterId = authContext.userId;

      // Vérifier que la conversation existe
      const conversation = await fastify.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          members: {
            where: { isActive: true },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  role: true
                }
              }
            }
          }
        }
      });

      if (!conversation) {
        return reply.status(404).send({
          success: false,
          error: 'Conversation not found'
        });
      }

      // Vérifier que l'inviteur est membre de la conversation
      const inviterMember = conversation.members.find(m => m.userId === inviterId);
      if (!inviterMember) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'êtes pas membre de cette conversation'
        });
      }

      // Vérifier que l'inviteur a les permissions pour inviter
      const canInvite = 
        inviterMember.role === 'ADMIN' ||
        inviterMember.role === 'CREATOR' ||
        authContext.registeredUser.role === 'ADMIN' ||
        authContext.registeredUser.role === 'BIGBOSS';

      if (!canInvite) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'avez pas les permissions pour inviter des utilisateurs'
        });
      }

      // Vérifier que l'utilisateur à inviter existe
      const userToInvite = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          firstName: true,
          lastName: true
        }
      });

      if (!userToInvite) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      // Vérifier que l'utilisateur n'est pas déjà membre
      const existingMember = conversation.members.find(m => m.userId === userId);
      if (existingMember) {
        return reply.status(400).send({
          success: false,
          error: 'This user is already a member of the conversation'
        });
      }

      // Ajouter l'utilisateur à la conversation
      const newMember = await fastify.prisma.conversationMember.create({
        data: {
          conversationId: conversationId,
          userId: userId,
          role: 'MEMBER',
          joinedAt: new Date(),
          isActive: true
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              firstName: true,
              lastName: true,
              avatar: true,
              isOnline: true
            }
          }
        }
      });

      // Envoyer une notification à l'utilisateur invité
      const notificationService = (fastify as any).notificationService;
      if (notificationService) {
        try {
          // Récupérer les informations de l'inviteur
          const inviter = await fastify.prisma.user.findUnique({
            where: { id: inviterId },
            select: {
              username: true,
              displayName: true,
              avatar: true
            }
          });

          if (inviter) {
            await notificationService.createConversationInviteNotification({
              invitedUserId: userId,
              inviterId: inviterId,
              inviterUsername: inviter.displayName || inviter.username,
              inviterAvatar: inviter.avatar || undefined,
              conversationId: conversationId,
              conversationTitle: conversation.title,
              conversationType: conversation.type
            });
            console.log(`[GATEWAY] 📩 Notification d'invitation envoyée à ${userId} pour la conversation ${conversationId}`);
          }
        } catch (notifError) {
          console.error('[GATEWAY] Erreur lors de l\'envoi de la notification d\'invitation:', notifError);
          // Ne pas bloquer l'invitation
        }
      }

      // PERFORMANCE: Invalider le cache d'autocomplete car la liste des membres a changé
      const mentionService = (fastify as any).mentionService;
      if (mentionService) {
        try {
          await mentionService.invalidateCacheForConversation(conversationId);
          console.log(`[GATEWAY] 🔄 Cache d'autocomplete invalidé pour la conversation ${conversationId}`);
        } catch (cacheError) {
          console.error('[GATEWAY] Erreur lors de l\'invalidation du cache:', cacheError);
          // Ne pas bloquer l'invitation
        }
      }

      return reply.send({
        success: true,
        data: {
          member: newMember,
          message: `${userToInvite.displayName || userToInvite.username} a été invité à la conversation`
        }
      });

    } catch (error) {
      console.error('Erreur lors de l\'invitation:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });
}

/**
 * Routes Communautés
 *
 * Ce module regroupe les endpoints liés à la gestion des communautés.
 * Une communauté est un conteneur logique permettant de rassembler des membres,
 * d'organiser des permissions et d'agréger des conversations associées.
 *
 * Points clés:
 * - Les routes sont préfixées par `/communities`.
 * - Les conversations d'une communauté sont exposées via `GET /communities/:id/conversations`.
 * - Le schéma Prisma définit une relation Community → Conversation.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

// Enum des rôles de communauté (aligné avec shared/types/community.ts)
enum CommunityRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  MEMBER = 'member'
}

// Schémas de validation
const CreateCommunitySchema = z.object({
  name: z.string().min(1).max(100),
  identifier: z.string().regex(/^[a-zA-Z0-9\-_@]*$/, 'Identifier can only contain letters, numbers, hyphens, underscores, and @').optional(),
  description: z.string().optional(),
  avatar: z.string().optional(),
  isPrivate: z.boolean().default(true)
});

const UpdateCommunitySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  identifier: z.string().regex(/^[a-zA-Z0-9\-_@]*$/, 'Identifier can only contain letters, numbers, hyphens, underscores, and @').optional(),
  description: z.string().optional(),
  avatar: z.string().optional(),
  isPrivate: z.boolean().optional()
});

// Fonction pour générer un identifier à partir du nom
function generateIdentifier(name: string, customIdentifier?: string): string {
  if (customIdentifier) {
    // Si l'identifiant personnalisé commence déjà par mshy_, ne pas le rajouter
    if (customIdentifier.startsWith('mshy_')) {
      return customIdentifier;
    }
    return `mshy_${customIdentifier}`;
  }
  
  // Convertir le nom en identifier valide
  const baseIdentifier = name
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\-_@]/g, '-') // Remplacer les caractères invalides par des tirets
    .replace(/--+/g, '-') // Remplacer les tirets multiples par un seul
    .replace(/^-|-$/g, ''); // Supprimer les tirets en début et fin
  
  return `mshy_${baseIdentifier}`;
}

const AddMemberSchema = z.object({
  userId: z.string(),
  role: z.enum([CommunityRole.ADMIN, CommunityRole.MODERATOR, CommunityRole.MEMBER]).optional().default(CommunityRole.MEMBER)
});

const UpdateMemberRoleSchema = z.object({
  role: z.enum([CommunityRole.ADMIN, CommunityRole.MODERATOR, CommunityRole.MEMBER])
});

/**
 * Enregistre les routes de gestion des communautés.
 * @param fastify Instance Fastify injectée par le serveur
 */
export async function communityRoutes(fastify: FastifyInstance) {
  
  // Route pour vérifier la disponibilité d'un identifiant de communauté
  fastify.get('/communities/check-identifier/:identifier', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { identifier } = request.params as { identifier: string };
      
      // Vérifier si l'identifiant existe déjà
      const existingCommunity = await fastify.prisma.community.findUnique({
        where: { identifier }
      });
      
      return reply.send({
        success: true,
        available: !existingCommunity,
        identifier
      });
    } catch (error) {
      console.error('[COMMUNITIES] Error checking identifier availability:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to check identifier availability'
      });
    }
  });

  // Route pour obtenir toutes les communautés de l'utilisateur connecté
  fastify.get('/communities', { onRequest: [fastify.authenticate] }, async (request, reply) => {
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
      const { search } = request.query as { search?: string };
      
      // Build where clause with optional search
      const whereClause: any = {
        OR: [
          { createdBy: userId },
          { members: { some: { userId: userId } } }
        ]
      };

      // Add search filter if provided (search by name or identifier)
      if (search && search.length >= 2) {
        whereClause.AND = [
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { identifier: { contains: search, mode: 'insensitive' } }
            ]
          }
        ];
      }
      
      const communities = await fastify.prisma.community.findMany({
        where: whereClause,
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true,
                  isOnline: true
                }
              }
            }
          },
          _count: {
            select: {
              members: true,
              Conversation: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      reply.send({
        success: true,
        data: communities
      });
    } catch (error) {
      console.error('Error fetching communities:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch communities'
      });
    }
  });

  // Route pour rechercher des communautés PUBLIQUES accessibles à tous
  fastify.get('/communities/search', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { q } = request.query as { q?: string };

      if (!q || q.trim().length === 0) {
        return reply.send({ success: true, data: [] });
      }

      // Rechercher UNIQUEMENT dans les communautés PUBLIQUES
      const communities = await fastify.prisma.community.findMany({
        where: {
          isPrivate: false, // Uniquement les communautés publiques
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { identifier: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            // Rechercher aussi dans les noms/usernames des membres
            {
              members: {
                some: {
                  user: {
                    OR: [
                      { username: { contains: q, mode: 'insensitive' } },
                      { displayName: { contains: q, mode: 'insensitive' } },
                      { firstName: { contains: q, mode: 'insensitive' } },
                      { lastName: { contains: q, mode: 'insensitive' } }
                    ],
                    isActive: true
                  }
                }
              }
            }
          ]
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          },
          members: {
            take: 5, // Limiter le nombre de membres retournés
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true,
                  isOnline: true
                }
              }
            }
          },
          _count: {
            select: {
              members: true,
              Conversation: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 50 // Limiter le nombre de résultats
      });

      // Transformer les données pour le frontend
      const communitiesWithCount = communities.map(community => ({
        id: community.id,
        name: community.name,
        identifier: community.identifier,
        description: community.description,
        avatar: community.avatar,
        isPrivate: community.isPrivate,
        memberCount: community._count.members,
        conversationCount: community._count.Conversation,
        createdAt: community.createdAt,
        creator: community.creator,
        members: community.members
      }));

      reply.send({
        success: true,
        data: communitiesWithCount
      });
    } catch (error) {
      console.error('[GATEWAY] Error searching communities:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to search communities'
      });
    }
  });

  // Route pour obtenir une communauté par ID ou identifier
  fastify.get('/communities/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      
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
      
      // Chercher d'abord par ID, puis par identifier si pas trouvé
      let community = await fastify.prisma.community.findFirst({
        where: { id },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true,
                  isOnline: true
                }
              }
            }
          },
          _count: {
            select: {
              members: true,
              Conversation: true
            }
          }
        }
      });
      
      // Si pas trouvé par ID, essayer par identifier
      if (!community) {
        community = await fastify.prisma.community.findFirst({
          where: { identifier: id },
          include: {
            creator: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            },
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true,
                    isOnline: true
                  }
                }
              }
            },
            _count: {
              select: {
                members: true,
                Conversation: true
              }
            }
          }
        });
      }

      if (!community) {
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      // Vérifier l'accès (créateur ou membre)
      const hasAccess = community.createdBy === userId || 
                       community.members.some(member => member.userId === userId);
      
      if (!hasAccess && community.isPrivate) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied to this community'
        });
      }

      reply.send({
        success: true,
        data: community
      });
    } catch (error) {
      console.error('Error fetching community:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch community'
      });
    }
  });

  // Route pour créer une nouvelle communauté
  fastify.post('/communities', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const validatedData = CreateCommunitySchema.parse(request.body);
      
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
      
      // Générer l'identifier
      const identifier = generateIdentifier(validatedData.name, validatedData.identifier);
      
      // Vérifier que l'identifier est unique
      const existingCommunity = await fastify.prisma.community.findUnique({
        where: { identifier }
      });
      
      if (existingCommunity) {
        return reply.status(409).send({
          success: false,
          error: 'Identifier already exists',
          message: `A community with identifier "${identifier}" already exists`
        });
      }
      
      // Créer la communauté ET automatiquement ajouter le créateur comme membre ADMIN
      const community = await fastify.prisma.community.create({
        data: {
          name: validatedData.name,
          identifier: identifier,
          description: validatedData.description,
          avatar: validatedData.avatar,
          isPrivate: validatedData.isPrivate ?? true,
          createdBy: userId,
          // Automatiquement ajouter le créateur comme membre avec le rôle ADMIN
          members: {
            create: {
              userId: userId,
              role: CommunityRole.ADMIN as string
            }
          }
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true
                }
              }
            }
          },
          _count: {
            select: {
              members: true,
              Conversation: true
            }
          }
        }
      });

      reply.status(201).send({
        success: true,
        data: community
      });
    } catch (error) {
      console.error('Error creating community:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to create community'
      });
    }
  });

  // Route pour obtenir les membres d'une communauté
  fastify.get('/communities/:id/members', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      
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
      
      // Vérifier l'accès à la communauté
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: {
          createdBy: true,
          isPrivate: true,
          members: { select: { userId: true } }
        }
      });

      if (!community) {
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      const hasAccess = community.createdBy === userId || 
                       community.members.some(member => member.userId === userId);
      
      if (!hasAccess && community.isPrivate) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied to this community'
        });
      }

      const members = await fastify.prisma.communityMember.findMany({
        where: { communityId: id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              isOnline: true,
              lastSeen: true
            }
          }
        },
        orderBy: {
          joinedAt: 'asc'
        }
      });

      reply.send({
        success: true,
        data: members
      });
    } catch (error) {
      console.error('Error fetching community members:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch community members'
      });
    }
  });

  // Route pour ajouter un membre à la communauté
  fastify.post('/communities/:id/members', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const validatedData = AddMemberSchema.parse(request.body);
      
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
      
      // Vérifier que la communauté existe et que l'utilisateur est admin
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: { 
          createdBy: true,
          members: {
            where: { userId },
            select: { role: true }
          }
        }
      });

      if (!community) {
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      // Vérifier que l'utilisateur est admin (ou créateur)
      const userMember = community.members[0];
      const isAdmin = userMember && userMember.role === CommunityRole.ADMIN;
      
      if (!isAdmin) {
        return reply.status(403).send({
          success: false,
          error: 'Only community admins can add members'
        });
      }

      // Vérifier que l'utilisateur à ajouter existe
      const userToAdd = await fastify.prisma.user.findFirst({
        where: { id: validatedData.userId },
        select: { id: true }
      });

      if (!userToAdd) {
        return reply.status(404).send({
          success: false,
          error: 'User to add not found'
        });
      }

      // Vérifier si le membre existe déjà
      const existingMember = await fastify.prisma.communityMember.findFirst({
        where: {
          communityId: id,
          userId: validatedData.userId
        }
      });

      let member;
      if (existingMember) {
        member = existingMember;
      } else {
        // Ajouter le membre avec le rôle spécifié (par défaut: MEMBER)
        member = await fastify.prisma.communityMember.create({
          data: {
            communityId: id,
            userId: validatedData.userId,
            role: (validatedData.role || CommunityRole.MEMBER) as string
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                isOnline: true
              }
            }
          }
        });
      }

      reply.send({
        success: true,
        data: member
      });
    } catch (error) {
      console.error('Error adding community member:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to add community member'
      });
    }
  });

  // Route pour mettre à jour le rôle d'un membre
  fastify.patch('/communities/:id/members/:memberId/role', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id, memberId } = request.params as { id: string; memberId: string };
      const validatedData = UpdateMemberRoleSchema.parse(request.body);
      
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
      
      // Vérifier que la communauté existe et que l'utilisateur est admin
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: { 
          createdBy: true,
          members: {
            where: { userId },
            select: { role: true }
          }
        }
      });

      if (!community) {
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      // Vérifier que l'utilisateur est admin
      const userMember = community.members[0];
      const isAdmin = userMember && userMember.role === CommunityRole.ADMIN;
      
      if (!isAdmin) {
        return reply.status(403).send({
          success: false,
          error: 'Only community admins can update member roles'
        });
      }

      // Mettre à jour le rôle du membre
      const updatedMember = await fastify.prisma.communityMember.update({
        where: { id: memberId },
        data: { role: validatedData.role as string },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          }
        }
      });

      reply.send({
        success: true,
        data: updatedMember
      });
    } catch (error) {
      console.error('[COMMUNITIES] Error updating member role:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to update member role'
      });
    }
  });

  // Route pour retirer un membre de la communauté
  fastify.delete('/communities/:id/members/:memberId', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id, memberId } = request.params as { id: string; memberId: string };
      
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
      
      // Vérifier que la communauté existe et que l'utilisateur est admin
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: { 
          createdBy: true,
          members: {
            where: { userId },
            select: { role: true }
          }
        }
      });

      if (!community) {
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      // Vérifier que l'utilisateur est admin
      const userMember = community.members[0];
      const isAdmin = userMember && userMember.role === CommunityRole.ADMIN;
      
      if (!isAdmin) {
        return reply.status(403).send({
          success: false,
          error: 'Only community admins can remove members'
        });
      }

      // Supprimer le membre
      await fastify.prisma.communityMember.deleteMany({
        where: {
          communityId: id,
          userId: memberId
        }
      });

      reply.send({
        success: true,
        message: 'Member removed successfully'
      });
    } catch (error) {
      console.error('Error removing community member:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to remove community member'
      });
    }
  });

  // Route pour mettre à jour une communauté
  fastify.put('/communities/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const validatedData = UpdateCommunitySchema.parse(request.body);
      
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
      
      // Vérifier que l'utilisateur est le créateur de la communauté
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: { createdBy: true, identifier: true }
      });

      if (!community) {
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      if (community.createdBy !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Only community creator can update community'
        });
      }

      // Préparer les données de mise à jour
      const updateData: any = {
        name: validatedData.name,
        description: validatedData.description,
        avatar: validatedData.avatar,
        isPrivate: validatedData.isPrivate
      };

      // Gérer l'identifier si fourni
      if (validatedData.identifier !== undefined) {
        const newIdentifier = generateIdentifier(validatedData.name || '', validatedData.identifier);
        
        // Vérifier que le nouvel identifier est unique (sauf si c'est le même)
        if (newIdentifier !== community.identifier) {
          const existingCommunity = await fastify.prisma.community.findUnique({
            where: { identifier: newIdentifier }
          });
          
          if (existingCommunity) {
            return reply.status(409).send({
              success: false,
              error: 'Community identifier already exists',
              message: `A community with identifier "${newIdentifier}" already exists`
            });
          }
        }
        
        updateData.identifier = newIdentifier;
      }

      const updatedCommunity = await fastify.prisma.community.update({
        where: { id },
        data: updateData,
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          },
          _count: {
            select: {
              members: true,
              Conversation: true
            }
          }
        }
      });

      reply.send({
        success: true,
        data: updatedCommunity
      });
    } catch (error) {
      console.error('Error updating community:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to update community'
      });
    }
  });

  // Route pour supprimer une communauté
  fastify.delete('/communities/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      
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
      
      // Vérifier que l'utilisateur est le créateur de la communauté
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: { createdBy: true }
      });

      if (!community) {
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      if (community.createdBy !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Only community creator can delete community'
        });
      }

      await fastify.prisma.community.delete({
        where: { id }
      });

      reply.send({
        success: true,
        message: 'Community deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting community:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to delete community'
      });
    }
  });

  // Conversations d'une communauté
  fastify.get('/communities/:id/conversations', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      
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
      
      // Vérifier l'accès à la communauté
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: {
          createdBy: true,
          isPrivate: true,
          members: { select: { userId: true } }
        }
      });

      if (!community) {
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      const hasAccess = community.createdBy === userId || 
                       community.members.some(member => member.userId === userId);
      
      if (!hasAccess && community.isPrivate) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied to this community'
        });
      }

      // Récupérer les conversations de la communauté
      const conversations = await fastify.prisma.conversation.findMany({
        where: { 
          communityId: id,
          // S'assurer que l'utilisateur est membre de la conversation
          members: {
            some: { userId: userId }
          }
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true,
                  isOnline: true
                }
              }
            }
          },
          _count: {
            select: {
              messages: true,
              members: true
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });

      reply.send({
        success: true,
        data: conversations
      });
    } catch (error) {
      console.error('Error fetching community conversations:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch community conversations'
      });
    }
  });
}

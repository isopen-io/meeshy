/**
 * Routes Communautes
 *
 * Ce module regroupe les endpoints lies a la gestion des communautes.
 * Une communaute est un conteneur logique permettant de rassembler des membres,
 * d'organiser des permissions et d'agreger des conversations associees.
 *
 * Points cles:
 * - Les routes sont prefixees par `/communities`.
 * - Les conversations d'une communaute sont exposees via `GET /communities/:id/conversations`.
 * - Le schema Prisma definit une relation Community -> Conversation.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

// Enum des roles de communaute (aligne avec shared/types/community.ts)
enum CommunityRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  MEMBER = 'member'
}

// Schemas de validation
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

// Fonction pour generer un identifier a partir du nom
function generateIdentifier(name: string, customIdentifier?: string): string {
  if (customIdentifier) {
    // Si l'identifiant personnalise commence deja par mshy_, ne pas le rajouter
    if (customIdentifier.startsWith('mshy_')) {
      return customIdentifier;
    }
    return `mshy_${customIdentifier}`;
  }

  // Convertir le nom en identifier valide
  const baseIdentifier = name
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\-_@]/g, '-') // Remplacer les caracteres invalides par des tirets
    .replace(/--+/g, '-') // Remplacer les tirets multiples par un seul
    .replace(/^-|-$/g, ''); // Supprimer les tirets en debut et fin

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
 * Validate and sanitize pagination parameters
 * @param offset - Raw offset string from query
 * @param limit - Raw limit string from query
 * @param defaultLimit - Default limit if not provided (default: 20)
 * @param maxLimit - Maximum allowed limit (default: 100)
 * @returns Validated offset and limit numbers
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

/**
 * Enregistre les routes de gestion des communautes.
 * @param fastify Instance Fastify injectee par le serveur
 */
export async function communityRoutes(fastify: FastifyInstance) {

  // Route pour verifier la disponibilite d'un identifiant de communaute
  fastify.get('/communities/check-identifier/:identifier', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { identifier } = request.params as { identifier: string };

      // Verifier si l'identifiant existe deja
      const existingCommunity = await fastify.prisma.community.findUnique({
        where: { identifier }
      });

      return reply.send({
        success: true,
        data: {
          available: !existingCommunity,
          identifier
        }
      });
    } catch (error) {
      console.error('[COMMUNITIES] Error checking identifier availability:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to check identifier availability'
      });
    }
  });

  // Route pour obtenir toutes les communautes de l'utilisateur connecte
  fastify.get('/communities', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;
      const { search, offset = '0', limit = '20' } = request.query as { search?: string; offset?: string; limit?: string };

      const { offsetNum, limitNum } = validatePagination(offset, limit);

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

      const [communities, totalCount] = await Promise.all([
        fastify.prisma.community.findMany({
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
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.community.count({ where: whereClause })
      ]);

      reply.send({
        success: true,
        data: communities,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + communities.length < totalCount
        }
      });
    } catch (error) {
      console.error('Error fetching communities:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch communities'
      });
    }
  });

  // Route pour rechercher des communautes PUBLIQUES accessibles a tous
  fastify.get('/communities/search', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { q, offset = '0', limit = '20' } = request.query as { q?: string; offset?: string; limit?: string };

      if (!q || q.trim().length === 0) {
        return reply.send({ success: true, data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } });
      }

      const { offsetNum, limitNum } = validatePagination(offset, limit);

      // Build where clause for public communities
      const whereClause = {
        isPrivate: false,
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { identifier: { contains: q, mode: 'insensitive' as const } },
          { description: { contains: q, mode: 'insensitive' as const } },
          {
            members: {
              some: {
                user: {
                  OR: [
                    { username: { contains: q, mode: 'insensitive' as const } },
                    { displayName: { contains: q, mode: 'insensitive' as const } },
                    { firstName: { contains: q, mode: 'insensitive' as const } },
                    { lastName: { contains: q, mode: 'insensitive' as const } }
                  ],
                  isActive: true
                }
              }
            }
          }
        ]
      };

      const [communities, totalCount] = await Promise.all([
        fastify.prisma.community.findMany({
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
              take: 5,
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
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.community.count({ where: whereClause })
      ]);

      // Transformer les donnees pour le frontend
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
        data: communitiesWithCount,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + communities.length < totalCount
        }
      });
    } catch (error) {
      console.error('[GATEWAY] Error searching communities:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to search communities'
      });
    }
  });

  // Route pour obtenir une communaute par ID ou identifier
  fastify.get('/communities/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Chercher d'abord par ID, puis par identifier si pas trouve
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

      // Si pas trouve par ID, essayer par identifier
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

      // Verifier l'acces (createur ou membre)
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

  // Route pour creer une nouvelle communaute
  fastify.post('/communities', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const validatedData = CreateCommunitySchema.parse(request.body);

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Generer l'identifier
      const identifier = generateIdentifier(validatedData.name, validatedData.identifier);

      // Verifier que l'identifier est unique
      const existingCommunity = await fastify.prisma.community.findUnique({
        where: { identifier }
      });

      if (existingCommunity) {
        return reply.status(409).send({
          success: false,
          error: `A community with identifier "${identifier}" already exists`
        });
      }

      // Creer la communaute ET automatiquement ajouter le createur comme membre ADMIN
      const community = await fastify.prisma.community.create({
        data: {
          name: validatedData.name,
          identifier: identifier,
          description: validatedData.description,
          avatar: validatedData.avatar,
          isPrivate: validatedData.isPrivate ?? true,
          createdBy: userId,
          // Automatiquement ajouter le createur comme membre avec le role ADMIN
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

  // Route pour obtenir les membres d'une communaute
  fastify.get('/communities/:id/members', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Verifier l'acces a la communaute
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

      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };
      const { offsetNum, limitNum } = validatePagination(offset, limit);

      const [members, totalCount] = await Promise.all([
        fastify.prisma.communityMember.findMany({
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
          orderBy: { joinedAt: 'asc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.communityMember.count({ where: { communityId: id } })
      ]);

      reply.send({
        success: true,
        data: members,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + members.length < totalCount
        }
      });
    } catch (error) {
      console.error('Error fetching community members:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch community members'
      });
    }
  });

  // Route pour ajouter un membre a la communaute
  fastify.post('/communities/:id/members', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const validatedData = AddMemberSchema.parse(request.body);

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Verifier que la communaute existe et que l'utilisateur est admin
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

      // Verifier que l'utilisateur est admin (ou createur)
      const userMember = community.members[0];
      const isAdmin = userMember && userMember.role === CommunityRole.ADMIN;

      if (!isAdmin) {
        return reply.status(403).send({
          success: false,
          error: 'Only community admins can add members'
        });
      }

      // Verifier que l'utilisateur a ajouter existe
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

      // Verifier si le membre existe deja
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
        // Ajouter le membre avec le role specifie (par defaut: MEMBER)
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

  // Route pour mettre a jour le role d'un membre
  fastify.patch('/communities/:id/members/:memberId/role', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id, memberId } = request.params as { id: string; memberId: string };
      const validatedData = UpdateMemberRoleSchema.parse(request.body);

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Verifier que la communaute existe et que l'utilisateur est admin
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

      // Verifier que l'utilisateur est admin
      const userMember = community.members[0];
      const isAdmin = userMember && userMember.role === CommunityRole.ADMIN;

      if (!isAdmin) {
        return reply.status(403).send({
          success: false,
          error: 'Only community admins can update member roles'
        });
      }

      // Mettre a jour le role du membre
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

  // Route pour retirer un membre de la communaute
  fastify.delete('/communities/:id/members/:memberId', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id, memberId } = request.params as { id: string; memberId: string };

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Verifier que la communaute existe et que l'utilisateur est admin
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

      // Verifier que l'utilisateur est admin
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
        data: { message: 'Member removed successfully' }
      });
    } catch (error) {
      console.error('Error removing community member:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to remove community member'
      });
    }
  });

  // Route pour mettre a jour une communaute
  fastify.put('/communities/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const validatedData = UpdateCommunitySchema.parse(request.body);

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Verifier que l'utilisateur est le createur de la communaute
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

      // Preparer les donnees de mise a jour
      const updateData: any = {
        name: validatedData.name,
        description: validatedData.description,
        avatar: validatedData.avatar,
        isPrivate: validatedData.isPrivate
      };

      // Gerer l'identifier si fourni
      if (validatedData.identifier !== undefined) {
        const newIdentifier = generateIdentifier(validatedData.name || '', validatedData.identifier);

        // Verifier que le nouvel identifier est unique (sauf si c'est le meme)
        if (newIdentifier !== community.identifier) {
          const existingCommunity = await fastify.prisma.community.findUnique({
            where: { identifier: newIdentifier }
          });

          if (existingCommunity) {
            return reply.status(409).send({
              success: false,
              error: `A community with identifier "${newIdentifier}" already exists`
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

  // Route pour supprimer une communaute
  fastify.delete('/communities/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Verifier que l'utilisateur est le createur de la communaute
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
        data: { message: 'Community deleted successfully' }
      });
    } catch (error) {
      console.error('Error deleting community:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to delete community'
      });
    }
  });

  // Conversations d'une communaute
  fastify.get('/communities/:id/conversations', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Verifier l'acces a la communaute
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

      // Recuperer les conversations de la communaute
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

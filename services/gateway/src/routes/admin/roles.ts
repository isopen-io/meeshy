import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import { permissionsService } from './services/PermissionsService';
import {
  updateUserRoleSchema,
  updateUserStatusSchema,
  type UserRole
} from './types';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { UserRole as PrismaUserRole } from '@meeshy/shared/prisma/client';

// Middleware d'autorisation admin
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as any).authContext;
  if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
    return reply.status(401).send({
      success: false,
      message: 'Authentification requise'
    });
  }

  const permissions = permissionsService.getUserPermissions(authContext.registeredUser.role);
  if (!permissions.canAccessAdmin) {
    return reply.status(403).send({
      success: false,
      message: 'Acces administrateur requis'
    });
  }
};

export async function registerRoleRoutes(fastify: FastifyInstance) {
  // Modifier le role d'un utilisateur
  fastify.patch('/users/:id/role', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Update user role. Admins can only modify roles of users with lower hierarchy level. Requires canManageUsers permission.',
      tags: ['admin'],
      summary: 'Update user role',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User unique identifier' }
        }
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: {
            type: 'string',
            enum: ['USER', 'ANALYST', 'AUDIT', 'MODERATOR', 'ADMIN', 'BIGBOSS'],
            description: 'New role to assign (aligned with Prisma enum UserRole)'
          }
        }
      },
      response: {
        200: {
          description: 'User role successfully updated',
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
                role: { type: 'string' },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            },
            message: { type: 'string', example: 'Role mis a jour vers ADMIN' }
          }
        },
        400: {
          description: 'Invalid input data',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Donnees invalides' },
            errors: { type: 'array', items: { type: 'object' } }
          }
        },
        401: errorResponseSchema,
        403: {
          description: 'Insufficient permissions or cannot modify this user',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Vous ne pouvez pas modifier le role de cet utilisateur' }
          }
        },
        404: {
          description: 'User not found',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Utilisateur non trouve' }
          }
        },
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const { id } = request.params as { id: string };
      const body = updateUserRoleSchema.parse(request.body);
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageUsers) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante'
        });
      }

      // Recuperer l'utilisateur cible
      const targetUser = await fastify.prisma.user.findUnique({
        where: { id }
      });

      if (!targetUser) {
        return reply.status(404).send({
          success: false,
          message: 'Utilisateur non trouve'
        });
      }

      // Verifier si l'admin peut modifier ce role
      if (!permissionsService.canManageUser(user.role, targetUser.role as UserRole)) {
        return reply.status(403).send({
          success: false,
          message: 'Vous ne pouvez pas modifier le role de cet utilisateur'
        });
      }

      if (!permissionsService.canManageUser(user.role, body.role)) {
        return reply.status(403).send({
          success: false,
          message: 'Vous ne pouvez pas attribuer ce role'
        });
      }

      // Mettre a jour le role
      const updatedUser = await fastify.prisma.user.update({
        where: { id },
        data: { role: body.role as PrismaUserRole },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          role: true,
          updatedAt: true
        }
      });

      return reply.send({
        success: true,
        data: updatedUser,
        message: `Role mis a jour vers ${body.role}`
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Donnees invalides',
          errors: error.errors
        });
      }

      logError(fastify.log, 'Update user role error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Activer/desactiver un utilisateur
  fastify.patch('/users/:id/status', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Activate or deactivate user account. Admins can only modify status of users with lower hierarchy level. Requires canManageUsers permission.',
      tags: ['admin'],
      summary: 'Update user status',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User unique identifier' }
        }
      },
      body: {
        type: 'object',
        required: ['isActive'],
        properties: {
          isActive: { type: 'boolean', description: 'Set to true to activate, false to deactivate' }
        }
      },
      response: {
        200: {
          description: 'User status successfully updated',
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
                isActive: { type: 'boolean' },
                deactivatedAt: { type: 'string', format: 'date-time', nullable: true },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            },
            message: { type: 'string', example: 'Utilisateur active' }
          }
        },
        400: {
          description: 'Invalid input data',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Donnees invalides' },
            errors: { type: 'array', items: { type: 'object' } }
          }
        },
        401: errorResponseSchema,
        403: {
          description: 'Insufficient permissions or cannot modify this user',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Vous ne pouvez pas modifier le statut de cet utilisateur' }
          }
        },
        404: {
          description: 'User not found',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Utilisateur non trouve' }
          }
        },
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const { id } = request.params as { id: string };
      const body = updateUserStatusSchema.parse(request.body);
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageUsers) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante'
        });
      }

      // Recuperer l'utilisateur cible
      const targetUser = await fastify.prisma.user.findUnique({
        where: { id }
      });

      if (!targetUser) {
        return reply.status(404).send({
          success: false,
          message: 'Utilisateur non trouve'
        });
      }

      // Verifier les permissions
      if (!permissionsService.canManageUser(user.role, targetUser.role as UserRole)) {
        return reply.status(403).send({
          success: false,
          message: 'Vous ne pouvez pas modifier le statut de cet utilisateur'
        });
      }

      // Mettre a jour le statut
      const updatedUser = await fastify.prisma.user.update({
        where: { id },
        data: {
          isActive: body.isActive,
          deactivatedAt: body.isActive ? null : new Date()
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          isActive: true,
          deactivatedAt: true,
          updatedAt: true
        }
      });

      return reply.send({
        success: true,
        data: updatedUser,
        message: body.isActive ? 'Utilisateur active' : 'Utilisateur desactive'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Donnees invalides',
          errors: error.errors
        });
      }

      logError(fastify.log, 'Update user status error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });
}

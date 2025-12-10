import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  UserRoleEnum,
  PaginatedUsersResponse,
  UserFilters,
  PaginationParams,
  CreateUserDTO,
  UpdateUserProfileDTO,
  UpdateEmailDTO,
  UpdateRoleDTO,
  UpdateStatusDTO,
  ResetPasswordDTO
} from '@meeshy/shared/types';
import {
  createUserValidationSchema,
  updateUserProfileValidationSchema,
  updateEmailValidationSchema,
  updateRoleValidationSchema,
  updateStatusValidationSchema,
  resetPasswordValidationSchema,
  formatZodErrors
} from '@meeshy/shared/types/validation';
import { UserManagementService } from '../../services/admin/user-management.service';
import { UserAuditService } from '../../services/admin/user-audit.service';
import { sanitizationService } from '../../services/admin/user-sanitization.service';
import { permissionsService } from '../../services/admin/permissions.service';
import { UnifiedAuthContext } from '../../middleware/auth';
import {
  requireUserViewAccess,
  requireUserModifyAccess,
  requireUserDeleteAccess
} from '../../middleware/admin-user-auth.middleware';

// Utilisation des schémas de validation renforcés
const createUserSchema = createUserValidationSchema;
const updateUserProfileSchema = updateUserProfileValidationSchema;
const updateEmailSchema = updateEmailValidationSchema;
const updateRoleSchema = updateRoleValidationSchema;
const updateStatusSchema = updateStatusValidationSchema;
const resetPasswordSchema = resetPasswordValidationSchema;

export async function userAdminRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialiser les services
  const userManagementService = new UserManagementService(fastify.prisma);
  const userAuditService = new UserAuditService(fastify.prisma);

  /**
   * GET /admin/user-management - Liste tous les utilisateurs (avec sanitization)
   */
  fastify.get<{
    Querystring: UserFilters & PaginationParams;
  }>('/admin/user-management', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const viewerRole = authContext.registeredUser!.role as UserRoleEnum;

      const filters: UserFilters = {
        search: request.query.search,
        role: request.query.role,
        isActive: request.query.isActive,
        emailVerified: request.query.emailVerified,
        phoneVerified: request.query.phoneVerified,
        twoFactorEnabled: request.query.twoFactorEnabled,
        createdAfter: request.query.createdAfter ? new Date(request.query.createdAfter) : undefined,
        createdBefore: request.query.createdBefore ? new Date(request.query.createdBefore) : undefined,
        lastSeenAfter: request.query.lastSeenAfter ? new Date(request.query.lastSeenAfter) : undefined,
        lastSeenBefore: request.query.lastSeenBefore ? new Date(request.query.lastSeenBefore) : undefined,
        sortBy: request.query.sortBy || 'createdAt',
        sortOrder: request.query.sortOrder || 'desc'
      };

      const pagination: PaginationParams = {
        page: Number(request.query.page) || 1,
        pageSize: Math.min(Number(request.query.pageSize) || 20, 100)
      };

      // Récupérer les utilisateurs (données complètes)
      const result = await userManagementService.getUsers(filters, pagination);

      // Sanitize selon le rôle du viewer
      const sanitizedUsers = sanitizationService.sanitizeUsers(
        result.users,
        viewerRole
      );

      const response: PaginatedUsersResponse = {
        users: sanitizedUsers,
        pagination: result.pagination
      };

      // Log d'audit
      await userAuditService.createAuditLog({
        userId: authContext.registeredUser.id,
        adminId: authContext.registeredUser.id,
        action: 'VIEW_USER_LIST' as any,
        entityId: 'users',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      reply.send({
        success: true,
        data: response
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching users');
      reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * GET /admin/users/:userId - Détails d'un utilisateur (avec sanitization)
   */
  fastify.get<{
    Params: { userId: string };
  }>('/admin/user-management/:userId', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const viewerRole = authContext.registeredUser!.role as UserRoleEnum;

      const user = await userManagementService.getUserById(request.params.userId);

      if (!user) {
        reply.status(404).send({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Sanitize selon le rôle
      const sanitizedUser = sanitizationService.sanitizeUser(user, viewerRole);

      // Log d'audit
      await userAuditService.logViewUser(
        authContext.registeredUser!.id,
        request.params.userId,
        request.ip,
        request.headers['user-agent']
      );

      reply.send({
        success: true,
        data: sanitizedUser
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user');
      reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * POST /admin/users - Créer un nouvel utilisateur
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.post<{
    Body: CreateUserDTO;
  }>('/admin/user-management', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les données
      const validatedData = createUserSchema.parse(request.body);

      // Vérifier si l'admin peut créer un utilisateur avec ce rôle
      if (validatedData.role) {
        if (!permissionsService.canManageUser(adminRole, validatedData.role as UserRoleEnum)) {
          reply.status(403).send({
            success: false,
            error: 'Insufficient permissions to create user with this role'
          });
          return;
        }
      }

      // Créer l'utilisateur
      const newUser = await userManagementService.createUser(
        validatedData as CreateUserDTO,
        authContext.registeredUser!.id
      );

      // Log d'audit
      await userAuditService.logCreateUser(
        authContext.registeredUser!.id,
        newUser.id,
        validatedData as unknown as Record<string, unknown>,
        request.ip,
        request.headers['user-agent']
      );

      // Sanitize la réponse
      const sanitizedUser = sanitizationService.sanitizeUser(newUser, adminRole);

      reply.status(201).send({
        success: true,
        data: sanitizedUser,
        message: 'User created successfully'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error creating user');
      reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * PATCH /admin/users/:userId - Modifier un utilisateur
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.patch<{
    Params: { userId: string };
    Body: UpdateUserProfileDTO;
  }>('/admin/user-management/:userId', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les données
      const validatedData = updateUserProfileSchema.parse(request.body);

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Vérifier si l'admin peut modifier cet utilisateur
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions to modify this user'
        });
        return;
      }

      // Calculer les changements pour l'audit
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      Object.keys(validatedData).forEach(key => {
        const typedKey = key as keyof UpdateUserProfileDTO;
        if (targetUser[typedKey as keyof typeof targetUser] !== validatedData[typedKey]) {
          changes[key] = {
            before: targetUser[typedKey as keyof typeof targetUser],
            after: validatedData[typedKey]
          };
        }
      });

      // Mise à jour
      const updatedUser = await userManagementService.updateUser(
        request.params.userId,
        validatedData,
        authContext.registeredUser.id
      );

      // Log d'audit
      await userAuditService.logUpdateUser(
        authContext.registeredUser!.id,
        request.params.userId,
        changes,
        undefined,
        request.ip,
        request.headers['user-agent']
      );

      // Sanitize la réponse
      const sanitizedUser = sanitizationService.sanitizeUser(updatedUser, adminRole);

      reply.send({
        success: true,
        data: sanitizedUser,
        message: 'User updated successfully'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error updating user');
      reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * PATCH /admin/users/:userId/role - Changer le rôle d'un utilisateur
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.patch<{
    Params: { userId: string };
    Body: UpdateRoleDTO;
  }>('/admin/user-management/:userId/role', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les données
      const validatedData = updateRoleSchema.parse(request.body);

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Vérifier si l'admin peut changer le rôle
      if (!permissionsService.canChangeRole(
        adminRole,
        targetUser.role as UserRoleEnum,
        validatedData.role as UserRoleEnum
      )) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions to change user role'
        });
        return;
      }

      const oldRole = targetUser.role;

      // Mettre à jour le rôle
      const updatedUser = await userManagementService.updateRole(
        request.params.userId,
        validatedData as UpdateRoleDTO,
        authContext.registeredUser!.id
      );

      // Log d'audit
      await userAuditService.logUpdateRole(
        authContext.registeredUser!.id,
        request.params.userId,
        oldRole,
        validatedData.role,
        validatedData.reason,
        request.ip,
        request.headers['user-agent']
      );

      // Sanitize la réponse
      const sanitizedUser = sanitizationService.sanitizeUser(updatedUser, adminRole);

      reply.send({
        success: true,
        data: sanitizedUser,
        message: `User role updated to ${validatedData.role}`
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error updating user role');
      reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * PATCH /admin/users/:userId/status - Activer/désactiver un utilisateur
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.patch<{
    Params: { userId: string };
    Body: UpdateStatusDTO;
  }>('/admin/user-management/:userId/status', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les données
      const validatedData = updateStatusSchema.parse(request.body);

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Vérifier si l'admin peut modifier le statut
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions to modify user status'
        });
        return;
      }

      const oldStatus = targetUser.isActive;

      // Mettre à jour le statut
      const updatedUser = await userManagementService.updateStatus(
        request.params.userId,
        validatedData as UpdateStatusDTO,
        authContext.registeredUser!.id
      );

      // Log d'audit
      await userAuditService.logUpdateStatus(
        authContext.registeredUser!.id,
        request.params.userId,
        oldStatus,
        validatedData.isActive,
        validatedData.reason,
        request.ip,
        request.headers['user-agent']
      );

      // Sanitize la réponse
      const sanitizedUser = sanitizationService.sanitizeUser(updatedUser, adminRole);

      reply.send({
        success: true,
        data: sanitizedUser,
        message: validatedData.isActive ? 'User activated' : 'User deactivated'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error updating user status');
      reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * POST /admin/users/:userId/reset-password - Réinitialiser le mot de passe
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.post<{
    Params: { userId: string };
    Body: ResetPasswordDTO;
  }>('/admin/user-management/:userId/reset-password', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les données
      const validatedData = resetPasswordSchema.parse(request.body);

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Vérifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions to reset password'
        });
        return;
      }

      // Réinitialiser le mot de passe
      const updatedUser = await userManagementService.resetPassword(
        request.params.userId,
        validatedData as ResetPasswordDTO,
        authContext.registeredUser!.id
      );

      // Log d'audit
      await userAuditService.logResetPassword(
        authContext.registeredUser!.id,
        request.params.userId,
        request.ip,
        request.headers['user-agent']
      );

      reply.send({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error resetting password');
      reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * DELETE /admin/users/:userId - Supprimer un utilisateur (soft delete)
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.delete<{
    Params: { userId: string };
  }>('/admin/user-management/:userId', {
    preHandler: [fastify.authenticate, requireUserDeleteAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Vérifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions to delete this user'
        });
        return;
      }

      // Supprimer l'utilisateur (soft delete)
      await userManagementService.deleteUser(
        request.params.userId,
        authContext.registeredUser.id
      );

      // Log d'audit
      await userAuditService.logDeleteUser(
        authContext.registeredUser!.id,
        request.params.userId,
        undefined,
        request.ip,
        request.headers['user-agent']
      );

      reply.send({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error deleting user');
      reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
}

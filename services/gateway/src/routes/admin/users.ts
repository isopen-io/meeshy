import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  UserRoleEnum,
  PaginatedUsersResponse,
  UserFilters,
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
  resetPasswordValidationSchema
} from '@meeshy/shared/types/validation/admin-user';

// Schémas de validation locaux pour les endpoints admin
const verifyEmailSchema = z.object({
  email: z.string().email().optional(),
  verified: z.boolean(),
  reason: z.string().optional()
});

const verifyPhoneSchema = z.object({
  phone: z.string().optional(),
  verified: z.boolean(),
  reason: z.string().optional()
});

const toggleVoiceConsentSchema = z.object({
  voiceConsent: z.boolean().optional(),
  consentType: z.enum(['voiceProfile', 'voiceData', 'dataProcessing', 'voiceCloning']).optional(),
  enabled: z.boolean().optional(),
  reason: z.string().optional()
});

const verifyAgeSchema = z.object({
  isAdult: z.boolean().optional(),
  verified: z.boolean().optional(),
  reason: z.string().optional()
});
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
import { validatePagination, buildPaginationMeta } from '../../utils/pagination';

// Utilisation des schemas de validation renforces
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
   * GET /admin/users - Liste tous les utilisateurs (avec sanitization)
   */
  fastify.get<{
    Querystring: UserFilters & { offset?: string; limit?: string };
  }>('/admin/users', {
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
        lastActiveAfter: request.query.lastActiveAfter ? new Date(request.query.lastActiveAfter) : undefined,
        lastActiveBefore: request.query.lastActiveBefore ? new Date(request.query.lastActiveBefore) : undefined,
        sortBy: request.query.sortBy || 'createdAt',
        sortOrder: request.query.sortOrder || 'desc'
      };

      const pagination = validatePagination(request.query.offset, request.query.limit, 100);

      // Recuperer les utilisateurs (donnees completes)
      const result = await userManagementService.getUsers(filters, pagination);

      // Sanitize selon le role du viewer
      const sanitizedUsers = sanitizationService.sanitizeUsers(
        result.users,
        viewerRole
      );

      const paginationMeta = buildPaginationMeta(
        result.total,
        pagination.offset,
        pagination.limit,
        result.users.length
      );

      const response: PaginatedUsersResponse = {
        users: sanitizedUsers,
        pagination: paginationMeta
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
        error: 'Internal server error',
        message: 'Failed to fetch users'
      });
    }
  });

  /**
   * GET /admin/users/:userId - Details d'un utilisateur (avec sanitization)
   */
  fastify.get<{
    Params: { userId: string };
  }>('/admin/users/:userId', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const viewerRole = authContext.registeredUser!.role as UserRoleEnum;

      const user = await userManagementService.getUserById(request.params.userId);

      if (!user) {
        reply.status(404).send({
          success: false,
          error: 'User not found',
          message: 'The requested user does not exist'
        });
        return;
      }

      // Sanitize selon le role
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
        error: 'Internal server error',
        message: 'Failed to fetch user details'
      });
    }
  });

  /**
   * POST /admin/users - Creer un nouvel utilisateur
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.post<{
    Body: CreateUserDTO;
  }>('/admin/users', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les donnees
      const validatedData = createUserSchema.parse(request.body);

      // Verifier si l'admin peut creer un utilisateur avec ce role
      if (validatedData.role) {
        if (!permissionsService.canManageUser(adminRole, validatedData.role as UserRoleEnum)) {
          reply.status(403).send({
            success: false,
            error: 'Insufficient permissions to create user with this role',
            message: 'Access denied'
          });
          return;
        }
      }

      // Creer l'utilisateur
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

      // Sanitize la reponse
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
          message: 'Invalid input data',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error creating user');
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Failed to create user'
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
  }>('/admin/users/:userId', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les donnees
      const validatedData = updateUserProfileSchema.parse(request.body);

      // Recuperer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found',
          message: 'The requested user does not exist'
        });
        return;
      }

      // Verifier si l'admin peut modifier cet utilisateur
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions to modify this user',
          message: 'Access denied'
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

      // Mise a jour
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

      // Sanitize la reponse
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
          message: 'Invalid input data',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error updating user');
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Failed to update user'
      });
    }
  });

  /**
   * PATCH /admin/users/:userId/role - Changer le role d'un utilisateur
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.patch<{
    Params: { userId: string };
    Body: UpdateRoleDTO;
  }>('/admin/users/:userId/role', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les donnees
      const validatedData = updateRoleSchema.parse(request.body);

      // Recuperer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found',
          message: 'The requested user does not exist'
        });
        return;
      }

      // Verifier si l'admin peut changer le role
      if (!permissionsService.canChangeRole(
        adminRole,
        targetUser.role as UserRoleEnum,
        validatedData.role as UserRoleEnum
      )) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions to change user role',
          message: 'Access denied'
        });
        return;
      }

      const oldRole = targetUser.role;

      // Mettre a jour le role
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

      // Sanitize la reponse
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
          message: 'Invalid input data',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error updating user role');
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Failed to update user role'
      });
    }
  });

  /**
   * PATCH /admin/users/:userId/status - Activer/desactiver un utilisateur
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.patch<{
    Params: { userId: string };
    Body: UpdateStatusDTO;
  }>('/admin/users/:userId/status', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les donnees
      const validatedData = updateStatusSchema.parse(request.body);

      // Recuperer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found',
          message: 'The requested user does not exist'
        });
        return;
      }

      // Verifier si l'admin peut modifier le statut
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions to modify user status',
          message: 'Access denied'
        });
        return;
      }

      const oldStatus = targetUser.isActive;

      // Mettre a jour le statut
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

      // Sanitize la reponse
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
          message: 'Invalid input data',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error updating user status');
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Failed to update user status'
      });
    }
  });

  /**
   * POST /admin/users/:userId/reset-password - Reinitialiser le mot de passe
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.post<{
    Params: { userId: string };
    Body: ResetPasswordDTO;
  }>('/admin/users/:userId/reset-password', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les donnees
      const validatedData = resetPasswordSchema.parse(request.body);

      // Recuperer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found',
          message: 'The requested user does not exist'
        });
        return;
      }

      // Verifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions to reset password',
          message: 'Access denied'
        });
        return;
      }

      // Reinitialiser le mot de passe
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
        data: { message: 'Password reset successfully' }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          success: false,
          error: 'Validation error',
          message: 'Invalid input data',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error resetting password');
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Failed to reset password'
      });
    }
  });

  /**
   * DELETE /admin/users/:userId - Supprimer un utilisateur (soft delete)
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.delete<{
    Params: { userId: string };
  }>('/admin/users/:userId', {
    preHandler: [fastify.authenticate, requireUserDeleteAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Recuperer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found',
          message: 'The requested user does not exist'
        });
        return;
      }

      // Verifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions to delete this user',
          message: 'Access denied'
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
        data: { message: 'User deleted successfully' }
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error deleting user');
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Failed to delete user'
      });
    }
  });

  /**
   * POST /admin/users/:userId/unlock - Déverrouiller un compte utilisateur
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.post<{
    Params: { userId: string };
  }>('/admin/users/:userId/unlock', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found',
          message: 'The requested user does not exist'
        });
        return;
      }

      // Déverrouiller le compte
      const updatedUser = await userManagementService.unlockAccount(
        request.params.userId,
        authContext.registeredUser.id
      );

      // Log d'audit
      await userAuditService.createAuditLog({
        userId: request.params.userId,
        adminId: authContext.registeredUser.id,
        action: 'UNLOCK_ACCOUNT' as any,
        entityId: request.params.userId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      reply.send({
        success: true,
        data: { message: 'Account unlocked successfully' }
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error unlocking account');
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Failed to unlock account'
      });
    }
  });

  /**
   * POST /admin/users/:userId/enable-2fa - Activer 2FA pour un utilisateur
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.post<{
    Params: { userId: string };
  }>('/admin/users/:userId/enable-2fa', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found',
          message: 'The requested user does not exist'
        });
        return;
      }

      // Note: L'activation réelle du 2FA nécessiterait la génération d'un secret TOTP
      // Pour l'instant, on se contente de définir la date
      const updatedUser = await userManagementService.enable2FA(
        request.params.userId,
        authContext.registeredUser.id
      );

      // Log d'audit
      await userAuditService.createAuditLog({
        userId: request.params.userId,
        adminId: authContext.registeredUser.id,
        action: 'ENABLE_2FA' as any,
        entityId: request.params.userId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      reply.send({
        success: true,
        data: { message: '2FA enabled successfully' }
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error enabling 2FA');
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Failed to enable 2FA'
      });
    }
  });

  /**
   * POST /admin/users/:userId/disable-2fa - Désactiver 2FA pour un utilisateur
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.post<{
    Params: { userId: string };
  }>('/admin/users/:userId/disable-2fa', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found',
          message: 'The requested user does not exist'
        });
        return;
      }

      // Désactiver 2FA
      const updatedUser = await userManagementService.disable2FA(
        request.params.userId,
        authContext.registeredUser.id
      );

      // Log d'audit
      await userAuditService.createAuditLog({
        userId: request.params.userId,
        adminId: authContext.registeredUser.id,
        action: 'DISABLE_2FA' as any,
        entityId: request.params.userId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      reply.send({
        success: true,
        data: { message: '2FA disabled successfully' }
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error disabling 2FA');
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Failed to disable 2FA'
      });
    }
  });

  /**
   * POST /admin/users/:userId/verify-email - Vérifier ou dévérifier l'email
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.post<{
    Params: { userId: string };
    Body: { verified: boolean; reason?: string };
  }>('/admin/users/:userId/verify-email', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les données
      const validatedData = verifyEmailSchema.parse(request.body);

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found',
          message: 'The requested user does not exist'
        });
        return;
      }

      // Vérifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions',
          message: 'Access denied'
        });
        return;
      }

      // Mettre à jour la vérification email
      const updatedUser = await userManagementService.verifyEmail(
        request.params.userId,
        validatedData.verified,
        authContext.registeredUser.id
      );

      // Log d'audit
      await userAuditService.createAuditLog({
        userId: request.params.userId,
        adminId: authContext.registeredUser.id,
        action: 'VERIFY_EMAIL' as any,
        entityId: request.params.userId,
        metadata: { verified: validatedData.verified, reason: validatedData.reason },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      // Sanitize la réponse
      const sanitizedUser = sanitizationService.sanitizeUser(updatedUser, adminRole);

      reply.send({
        success: true,
        data: sanitizedUser,
        message: validatedData.verified ? 'Email verified' : 'Email unverified'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          success: false,
          error: 'Validation error',
          message: 'Invalid input data',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error verifying email');
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Failed to verify email'
      });
    }
  });

  /**
   * POST /admin/users/:userId/verify-phone - Vérifier ou dévérifier le téléphone
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.post<{
    Params: { userId: string };
    Body: { verified: boolean; reason?: string };
  }>('/admin/users/:userId/verify-phone', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les données
      const validatedData = verifyPhoneSchema.parse(request.body);

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found',
          message: 'The requested user does not exist'
        });
        return;
      }

      // Vérifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions',
          message: 'Access denied'
        });
        return;
      }

      // Mettre à jour la vérification téléphone
      const updatedUser = await userManagementService.verifyPhone(
        request.params.userId,
        validatedData.verified,
        authContext.registeredUser.id
      );

      // Log d'audit
      await userAuditService.createAuditLog({
        userId: request.params.userId,
        adminId: authContext.registeredUser.id,
        action: 'VERIFY_PHONE' as any,
        entityId: request.params.userId,
        metadata: { verified: validatedData.verified, reason: validatedData.reason },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      // Sanitize la réponse
      const sanitizedUser = sanitizationService.sanitizeUser(updatedUser, adminRole);

      reply.send({
        success: true,
        data: sanitizedUser,
        message: validatedData.verified ? 'Phone verified' : 'Phone unverified'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          success: false,
          error: 'Validation error',
          message: 'Invalid input data',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error verifying phone');
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Failed to verify phone'
      });
    }
  });

  /**
   * POST /admin/users/:userId/voice-consent - Gérer les consentements voice/GDPR
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.post<{
    Params: { userId: string };
    Body: { consentType: 'voiceProfile' | 'voiceData' | 'dataProcessing' | 'voiceCloning'; enabled: boolean; reason?: string };
  }>('/admin/users/:userId/voice-consent', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les données
      const validatedData = toggleVoiceConsentSchema.parse(request.body);

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found',
          message: 'The requested user does not exist'
        });
        return;
      }

      // Vérifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions',
          message: 'Access denied'
        });
        return;
      }

      // Mettre à jour le consentement
      const updatedUser = await userManagementService.toggleVoiceConsent(
        request.params.userId,
        validatedData.consentType,
        validatedData.enabled,
        authContext.registeredUser.id
      );

      // Log d'audit
      await userAuditService.createAuditLog({
        userId: request.params.userId,
        adminId: authContext.registeredUser.id,
        action: 'UPDATE_PROFILE' as any,
        entityId: request.params.userId,
        metadata: {
          consentType: validatedData.consentType,
          enabled: validatedData.enabled,
          reason: validatedData.reason
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      // Sanitize la réponse
      const sanitizedUser = sanitizationService.sanitizeUser(updatedUser, adminRole);

      reply.send({
        success: true,
        data: sanitizedUser,
        message: `${validatedData.consentType} ${validatedData.enabled ? 'enabled' : 'disabled'}`
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          success: false,
          error: 'Validation error',
          message: 'Invalid input data',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error updating voice consent');
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Failed to update voice consent'
      });
    }
  });

  /**
   * POST /admin/users/:userId/verify-age - Vérifier ou dévérifier l'âge
   * (BIGBOSS & ADMIN uniquement)
   */
  fastify.post<{
    Params: { userId: string };
    Body: { verified: boolean; reason?: string };
  }>('/admin/users/:userId/verify-age', {
    preHandler: [fastify.authenticate, requireUserModifyAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as any).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les données
      const validatedData = verifyAgeSchema.parse(request.body);

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found',
          message: 'The requested user does not exist'
        });
        return;
      }

      // Vérifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        reply.status(403).send({
          success: false,
          error: 'Insufficient permissions',
          message: 'Access denied'
        });
        return;
      }

      // Mettre à jour la vérification d'âge
      const updatedUser = await userManagementService.verifyAge(
        request.params.userId,
        validatedData.verified,
        authContext.registeredUser.id
      );

      // Log d'audit
      await userAuditService.createAuditLog({
        userId: request.params.userId,
        adminId: authContext.registeredUser.id,
        action: 'UPDATE_PROFILE' as any,
        entityId: request.params.userId,
        metadata: { ageVerified: validatedData.verified, reason: validatedData.reason },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      // Sanitize la réponse
      const sanitizedUser = sanitizationService.sanitizeUser(updatedUser, adminRole);

      reply.send({
        success: true,
        data: sanitizedUser,
        message: validatedData.verified ? 'Age verified' : 'Age unverified'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          success: false,
          error: 'Validation error',
          message: 'Invalid input data',
          details: error.errors
        });
        return;
      }

      fastify.log.error({ err: error }, 'Error verifying age');
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Failed to verify age'
      });
    }
  });
}

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  UserRoleEnum,
  UserAuditAction,
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
  email: z.email().optional(),
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
import { UnifiedAuthContext, UnifiedAuthRequest, authUserCacheKey } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';
import {
  requireUserViewAccess,
  requireUserModifyAccess,
  requireUserDeleteAccess
} from '../../middleware/admin-user-auth.middleware';
import { validatePagination, buildPaginationMeta } from '../../utils/pagination';
import { sendSuccess, sendInternalError, sendNotFound, sendUnauthorized, sendForbidden, sendBadRequest, sendConflict, sendPaginatedSuccess } from '../../utils/response';

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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
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

      const pagination = validatePagination(request.query.offset, request.query.limit);

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
        action: UserAuditAction.VIEW_USER_LIST,
        entityId: 'users',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      sendSuccess(reply, response);
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching users');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch users' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const viewerRole = authContext.registeredUser!.role as UserRoleEnum;

      const user = await userManagementService.getUserById(request.params.userId);

      if (!user) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
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

      sendSuccess(reply, sanitizedUser);
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user details' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les donnees
      const validatedData = createUserSchema.parse(request.body);

      // Verifier si l'admin peut creer un utilisateur avec ce role
      if (validatedData.role) {
        if (!permissionsService.canManageUser(adminRole, validatedData.role as UserRoleEnum)) {
          sendForbidden(reply, 'Insufficient permissions to create user with this role', { message: 'Access denied' });
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

      sendSuccess(reply, sanitizedUser, { statusCode: 201, message: 'User created successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendBadRequest(reply, 'Invalid input data');
        return;
      }

      fastify.log.error({ err: error }, 'Error creating user');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to create user' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les donnees
      const validatedData = updateUserProfileSchema.parse(request.body);

      // Recuperer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
        return;
      }

      // Verifier si l'admin peut modifier cet utilisateur
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        sendForbidden(reply, 'Insufficient permissions to modify this user', { message: 'Access denied' });
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

      sendSuccess(reply, sanitizedUser, { message: 'User updated successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendBadRequest(reply, 'Invalid input data');
        return;
      }

      fastify.log.error({ err: error }, 'Error updating user');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to update user' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les donnees
      const validatedData = updateRoleSchema.parse(request.body);

      // Recuperer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
        return;
      }

      // Verifier si l'admin peut changer le role
      if (!permissionsService.canChangeRole(
        adminRole,
        targetUser.role as UserRoleEnum,
        validatedData.role as UserRoleEnum
      )) {
        sendForbidden(reply, 'Insufficient permissions to change user role', { message: 'Access denied' });
        return;
      }

      const oldRole = targetUser.role;

      // Mettre a jour le role
      const updatedUser = await userManagementService.updateRole(
        request.params.userId,
        validatedData as UpdateRoleDTO,
        authContext.registeredUser!.id
      );

      try { await getCacheStore().del(authUserCacheKey(request.params.userId)); } catch { /* best-effort */ }

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

      sendSuccess(reply, sanitizedUser, { message: `User role updated to ${validatedData.role}` });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendBadRequest(reply, 'Invalid input data');
        return;
      }

      fastify.log.error({ err: error }, 'Error updating user role');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to update user role' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les donnees
      const validatedData = updateStatusSchema.parse(request.body);

      // Recuperer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
        return;
      }

      // Verifier si l'admin peut modifier le statut
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        sendForbidden(reply, 'Insufficient permissions to modify user status', { message: 'Access denied' });
        return;
      }

      const oldStatus = targetUser.isActive;

      // Mettre a jour le statut
      const updatedUser = await userManagementService.updateStatus(
        request.params.userId,
        validatedData as UpdateStatusDTO,
        authContext.registeredUser!.id
      );

      try { await getCacheStore().del(authUserCacheKey(request.params.userId)); } catch { /* best-effort */ }

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

      sendSuccess(reply, sanitizedUser, { message: validatedData.isActive ? 'User activated' : 'User deactivated' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendBadRequest(reply, 'Invalid input data');
        return;
      }

      fastify.log.error({ err: error }, 'Error updating user status');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to update user status' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les donnees
      const validatedData = resetPasswordSchema.parse(request.body);

      // Recuperer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
        return;
      }

      // Verifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        sendForbidden(reply, 'Insufficient permissions to reset password', { message: 'Access denied' });
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

      sendSuccess(reply, { message: 'Password reset successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendBadRequest(reply, 'Invalid input data');
        return;
      }

      fastify.log.error({ err: error }, 'Error resetting password');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to reset password' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Recuperer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
        return;
      }

      // Verifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        sendForbidden(reply, 'Insufficient permissions to delete this user', { message: 'Access denied' });
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

      sendSuccess(reply, { message: 'User deleted successfully' });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error deleting user');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to delete user' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
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
        action: UserAuditAction.UNLOCK_ACCOUNT,
        entityId: request.params.userId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      sendSuccess(reply, { message: 'Account unlocked successfully' });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error unlocking account');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to unlock account' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
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
        action: UserAuditAction.ENABLE_2FA,
        entityId: request.params.userId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      sendSuccess(reply, { message: '2FA enabled successfully' });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error enabling 2FA');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to enable 2FA' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
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
        action: UserAuditAction.DISABLE_2FA,
        entityId: request.params.userId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      sendSuccess(reply, { message: '2FA disabled successfully' });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error disabling 2FA');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to disable 2FA' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les données
      const validatedData = verifyEmailSchema.parse(request.body);

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
        return;
      }

      // Vérifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        sendForbidden(reply, 'Insufficient permissions', { message: 'Access denied' });
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
        action: UserAuditAction.VERIFY_EMAIL,
        entityId: request.params.userId,
        metadata: { verified: validatedData.verified, reason: validatedData.reason },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      // Sanitize la réponse
      const sanitizedUser = sanitizationService.sanitizeUser(updatedUser, adminRole);

      sendSuccess(reply, sanitizedUser, { message: validatedData.verified ? 'Email verified' : 'Email unverified' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendBadRequest(reply, 'Invalid input data');
        return;
      }

      fastify.log.error({ err: error }, 'Error verifying email');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to verify email' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les données
      const validatedData = verifyPhoneSchema.parse(request.body);

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
        return;
      }

      // Vérifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        sendForbidden(reply, 'Insufficient permissions', { message: 'Access denied' });
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
        action: UserAuditAction.VERIFY_PHONE,
        entityId: request.params.userId,
        metadata: { verified: validatedData.verified, reason: validatedData.reason },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      // Sanitize la réponse
      const sanitizedUser = sanitizationService.sanitizeUser(updatedUser, adminRole);

      sendSuccess(reply, sanitizedUser, { message: validatedData.verified ? 'Phone verified' : 'Phone unverified' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendBadRequest(reply, 'Invalid input data');
        return;
      }

      fastify.log.error({ err: error }, 'Error verifying phone');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to verify phone' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les données
      const validatedData = toggleVoiceConsentSchema.parse(request.body);

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
        return;
      }

      // Vérifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        sendForbidden(reply, 'Insufficient permissions', { message: 'Access denied' });
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
        action: UserAuditAction.UPDATE_PROFILE,
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

      sendSuccess(reply, sanitizedUser, { message: `${validatedData.consentType} ${validatedData.enabled ? 'enabled' : 'disabled'}` });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendBadRequest(reply, 'Invalid input data');
        return;
      }

      fastify.log.error({ err: error }, 'Error updating voice consent');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to update voice consent' });
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
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      // Valider les données
      const validatedData = verifyAgeSchema.parse(request.body);

      // Récupérer l'utilisateur cible
      const targetUser = await userManagementService.getUserById(request.params.userId);

      if (!targetUser) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
        return;
      }

      // Vérifier les permissions
      if (!permissionsService.canModifyUser(adminRole, targetUser.role as UserRoleEnum)) {
        sendForbidden(reply, 'Insufficient permissions', { message: 'Access denied' });
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
        action: UserAuditAction.UPDATE_PROFILE,
        entityId: request.params.userId,
        metadata: { ageVerified: validatedData.verified, reason: validatedData.reason },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      // Sanitize la réponse
      const sanitizedUser = sanitizationService.sanitizeUser(updatedUser, adminRole);

      sendSuccess(reply, sanitizedUser, { message: validatedData.verified ? 'Age verified' : 'Age unverified' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendBadRequest(reply, 'Invalid input data');
        return;
      }

      fastify.log.error({ err: error }, 'Error verifying age');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to verify age' });
    }
  });

  /**
   * GET /admin/users/:userId/activity - Detailed links, affiliates, contacts for a user
   */
  fastify.get<{
    Params: { userId: string };
  }>('/admin/users/:userId/activity', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;

      const [shareLinks, trackingLinks, affiliateTokens, sentRequests, receivedRequests] = await Promise.all([
        fastify.prisma.conversationShareLink.findMany({
          where: { createdBy: userId },
          select: {
            id: true,
            linkId: true,
            identifier: true,
            name: true,
            description: true,
            maxUses: true,
            currentUses: true,
            maxConcurrentUsers: true,
            currentConcurrentUsers: true,
            isActive: true,
            expiresAt: true,
            createdAt: true,
            conversation: {
              select: { id: true, identifier: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),

        fastify.prisma.trackingLink.findMany({
          where: { createdBy: userId },
          select: {
            id: true,
            token: true,
            name: true,
            campaign: true,
            source: true,
            medium: true,
            originalUrl: true,
            shortUrl: true,
            totalClicks: true,
            uniqueClicks: true,
            isActive: true,
            expiresAt: true,
            createdAt: true,
            lastClickedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),

        fastify.prisma.affiliateToken.findMany({
          where: { createdBy: userId },
          select: {
            id: true,
            token: true,
            name: true,
            maxUses: true,
            currentUses: true,
            clickCount: true,
            isActive: true,
            expiresAt: true,
            createdAt: true,
            _count: {
              select: { affiliations: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),

        fastify.prisma.friendRequest.findMany({
          where: { senderId: userId },
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            receiver: {
              select: { id: true, username: true, displayName: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),

        fastify.prisma.friendRequest.findMany({
          where: { receiverId: userId },
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            sender: {
              select: { id: true, username: true, displayName: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      ]);

      sendSuccess(reply, {
        shareLinks,
        trackingLinks,
        affiliateTokens,
        contacts: {
          sent: sentRequests,
          received: receivedRequests,
        },
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user activity');
      sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user activity' });
    }
  });

  /**
   * GET /admin/users/:userId/conversations - List conversations a user participates in (admin view).
   * Metadata only (no message content); the target user's membership (role/joinedAt) is flattened
   * onto each conversation. Requires canViewUsers permission.
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string; type?: string };
  }>('/admin/users/:userId/conversations', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit, type } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const where: any = {
        participants: {
          some: { userId, isActive: true }
        }
      };
      if (type) {
        where.type = type;
      }

      const [conversations, total] = await Promise.all([
        fastify.prisma.conversation.findMany({
          where,
          select: {
            id: true,
            identifier: true,
            title: true,
            type: true,
            avatar: true,
            isActive: true,
            memberCount: true,
            communityId: true,
            createdAt: true,
            lastMessageAt: true,
            participants: {
              where: { isActive: true },
              take: 6,
              orderBy: { joinedAt: 'asc' },
              select: {
                id: true,
                userId: true,
                type: true,
                displayName: true,
                avatar: true,
                role: true,
                joinedAt: true,
                isActive: true,
                nickname: true,
                user: { select: { id: true, username: true, displayName: true, avatar: true } }
              }
            }
          },
          orderBy: { lastMessageAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.conversation.count({ where })
      ]);

      // Keep a small participant preview (direct → the other member, group → a
      // first slice; the full group list is paged via the dedicated endpoint),
      // and surface the target user's membership separately for convenience.
      const data = conversations.map((conv) => {
        const participants = (conv as { participants?: Array<{ userId?: string | null }> }).participants ?? [];
        const membership = participants.find((p) => p.userId === userId) ?? null;
        return { ...conv, participants, membership };
      });

      return sendPaginatedSuccess(reply, data, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + conversations.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user conversations');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user conversations' });
    }
  });

  /**
   * GET /admin/users/:userId/media - List media produced by a user (admin view).
   * Merges post media (post.authorId) and message attachments (uploadedBy),
   * sorted by recency. Requires canViewUsers permission.
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string };
  }>('/admin/users/:userId/media', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      // The first (offset + limit) of the merged stream are guaranteed to be
      // within the first (offset + limit) of each source, so taking that many
      // from each is sufficient for a correct slice after merge.
      const window = offsetNum + limitNum;
      const postWhere = { post: { authorId: userId } };
      const attWhere = { uploadedBy: userId };
      const mediaSelect = {
        id: true, originalName: true, mimeType: true, fileUrl: true, thumbnailUrl: true,
        fileSize: true, width: true, height: true, duration: true, createdAt: true
      } as const;

      const [postMedia, attachments, postCount, attCount] = await Promise.all([
        fastify.prisma.postMedia.findMany({
          where: postWhere,
          select: { ...mediaSelect, postId: true },
          orderBy: { createdAt: 'desc' },
          take: window
        }),
        fastify.prisma.messageAttachment.findMany({
          where: attWhere,
          select: { ...mediaSelect, messageId: true },
          orderBy: { createdAt: 'desc' },
          take: window
        }),
        fastify.prisma.postMedia.count({ where: postWhere }),
        fastify.prisma.messageAttachment.count({ where: attWhere })
      ]);

      const toMedia = (m: Record<string, unknown>, source: 'post' | 'message', contextId: unknown) => ({
        id: m.id,
        originalName: m.originalName,
        mimeType: m.mimeType,
        fileUrl: m.fileUrl,
        thumbnailUrl: m.thumbnailUrl,
        fileSize: m.fileSize,
        width: m.width,
        height: m.height,
        duration: m.duration,
        createdAt: m.createdAt as string | Date,
        source,
        contextId
      });

      const merged = [
        ...postMedia.map((m) => toMedia(m as Record<string, unknown>, 'post', (m as Record<string, unknown>).postId)),
        ...attachments.map((m) => toMedia(m as Record<string, unknown>, 'message', (m as Record<string, unknown>).messageId))
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const pageSlice = merged.slice(offsetNum, offsetNum + limitNum);
      const total = postCount + attCount;

      return sendPaginatedSuccess(reply, pageSlice, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + pageSlice.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user media');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user media' });
    }
  });

  /**
   * GET /admin/users/:userId/reports - Reports filed BY a user (reporterId).
   * Requires canViewUsers permission.
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string; status?: string };
  }>('/admin/users/:userId/reports', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit, status } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const where: Record<string, unknown> = { reporterId: userId };
      if (status) {
        where.status = status;
      }

      const [reports, total] = await Promise.all([
        fastify.prisma.report.findMany({
          where,
          select: {
            id: true,
            reportedType: true,
            reportedEntityId: true,
            reportType: true,
            reason: true,
            status: true,
            actionTaken: true,
            createdAt: true,
            resolvedAt: true
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.report.count({ where })
      ]);

      return sendPaginatedSuccess(reply, reports, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + reports.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user reports');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user reports' });
    }
  });

  /**
   * GET /admin/users/:userId/reported-messages - Messages authored by the user
   * that have been reported. Each item is a report joined with its message.
   * Requires canViewUsers permission.
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string };
  }>('/admin/users/:userId/reported-messages', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const emptyPage = () => sendPaginatedSuccess(reply, [], { total: 0, offset: offsetNum, limit: limitNum, hasMore: false });

      const participants = await fastify.prisma.participant.findMany({
        where: { userId, type: 'user' },
        select: { id: true }
      });
      const participantIds = participants.map((p) => p.id);
      if (participantIds.length === 0) return emptyPage();

      // Message ids authored by the user (bounded by the user's own messages).
      const userMessages = await fastify.prisma.message.findMany({
        where: { senderId: { in: participantIds } },
        select: { id: true }
      });
      const messageIds = userMessages.map((m) => m.id);
      if (messageIds.length === 0) return emptyPage();

      const reportWhere = { reportedType: 'message', reportedEntityId: { in: messageIds } };

      const [reports, total] = await Promise.all([
        fastify.prisma.report.findMany({
          where: reportWhere,
          select: {
            id: true,
            reportedEntityId: true,
            reportType: true,
            reason: true,
            status: true,
            reporterId: true,
            reporterName: true,
            createdAt: true,
            resolvedAt: true
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.report.count({ where: reportWhere })
      ]);

      const reportedMessageIds = [...new Set(reports.map((r) => r.reportedEntityId))];
      const messages = reportedMessageIds.length > 0
        ? await fastify.prisma.message.findMany({
            where: { id: { in: reportedMessageIds } },
            select: { id: true, content: true, conversationId: true, messageType: true, createdAt: true, deletedAt: true }
          })
        : [];
      const messageMap = new Map(messages.map((m) => [m.id, m]));

      const data = reports.map((r) => ({ ...r, message: messageMap.get(r.reportedEntityId) ?? null }));

      return sendPaginatedSuccess(reply, data, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + reports.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user reported messages');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user reported messages' });
    }
  });

  /**
   * GET /admin/conversations/:conversationId/participants - Paginated members of
   * a conversation (for the group members modal in the admin user fiche).
   * Requires canViewUsers permission.
   */
  fastify.get<{
    Params: { conversationId: string };
    Querystring: { offset?: string; limit?: string };
  }>('/admin/conversations/:conversationId/participants', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const { conversationId } = request.params;
      const { offset = '0', limit } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 30, maxLimit: 100 });

      const conversation = await fastify.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true }
      });
      if (!conversation) {
        return sendNotFound(reply, 'Conversation non trouvée');
      }

      const where = { conversationId };
      const [participants, total] = await Promise.all([
        fastify.prisma.participant.findMany({
          where,
          select: {
            id: true,
            userId: true,
            type: true,
            displayName: true,
            avatar: true,
            role: true,
            isActive: true,
            isOnline: true,
            joinedAt: true,
            nickname: true,
            user: { select: { id: true, username: true, displayName: true, avatar: true } }
          },
          orderBy: { joinedAt: 'asc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.participant.count({ where })
      ]);

      return sendPaginatedSuccess(reply, participants, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + participants.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching conversation participants');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch conversation participants' });
    }
  });
}

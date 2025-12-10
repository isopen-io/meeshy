import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRoleEnum } from '@meeshy/shared/types';
import { permissionsService } from '../services/admin/permissions.service';
import { UnifiedAuthContext } from './auth';

/**
 * Generic admin permission middleware factory
 * Creates middleware that checks for specific admin permissions
 */
export function createAdminPermissionMiddleware(
  permissionKey: keyof import('../services/admin/permissions.service').AdminPermissions,
  errorMessage?: string
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authContext = (request as any).authContext as UnifiedAuthContext;

    if (!authContext?.isAuthenticated || !authContext.registeredUser || authContext.isAnonymous) {
      reply.status(401).send({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const userRole = authContext.registeredUser.role as UserRoleEnum;

    if (!permissionsService.hasPermission(userRole, permissionKey)) {
      reply.status(403).send({
        success: false,
        error: errorMessage || `Insufficient permissions: ${permissionKey} required`
      });
      return;
    }
  };
}

/**
 * Middleware: Require admin panel access
 */
export const requireAdminAccess = createAdminPermissionMiddleware(
  'canAccessAdmin',
  'Insufficient permissions to access admin panel'
);

/**
 * Middleware: Require user view permission
 */
export const requireUserViewPermission = createAdminPermissionMiddleware(
  'canViewUsers',
  'Insufficient permissions to view users'
);

/**
 * Middleware: Require user management permission
 */
export const requireUserManagePermission = createAdminPermissionMiddleware(
  'canUpdateUsers',
  'Insufficient permissions to manage users'
);

/**
 * Middleware: Require community management permission
 */
export const requireCommunityManagePermission = createAdminPermissionMiddleware(
  'canManageCommunities',
  'Insufficient permissions to manage communities'
);

/**
 * Middleware: Require conversation management permission
 */
export const requireConversationManagePermission = createAdminPermissionMiddleware(
  'canManageConversations',
  'Insufficient permissions to manage conversations'
);

/**
 * Middleware: Require analytics view permission
 */
export const requireAnalyticsPermission = createAdminPermissionMiddleware(
  'canViewAnalytics',
  'Insufficient permissions to view analytics'
);

/**
 * Middleware: Require content moderation permission
 */
export const requireModerateContentPermission = createAdminPermissionMiddleware(
  'canModerateContent',
  'Insufficient permissions to moderate content'
);

/**
 * Middleware: Require audit log view permission
 */
export const requireAuditLogPermission = createAdminPermissionMiddleware(
  'canViewAuditLogs',
  'Insufficient permissions to view audit logs'
);

/**
 * Middleware: Require role-based access (checks if user has one of the allowed roles)
 */
export function requireRole(allowedRoles: UserRoleEnum | UserRoleEnum[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authContext = (request as any).authContext as UnifiedAuthContext;

    if (!authContext?.isAuthenticated || !authContext.registeredUser || authContext.isAnonymous) {
      reply.status(401).send({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const userRole = authContext.registeredUser.role as UserRoleEnum;

    if (!roles.includes(userRole)) {
      reply.status(403).send({
        success: false,
        error: `Access denied. Required roles: ${roles.join(', ')}`
      });
      return;
    }
  };
}

/**
 * Helper: Check if authenticated user can manage target user
 */
export async function canManageTargetUser(
  request: FastifyRequest,
  targetUserId: string
): Promise<{ canManage: boolean; error?: string }> {
  const authContext = (request as any).authContext as UnifiedAuthContext;

  if (!authContext?.isAuthenticated || !authContext.registeredUser) {
    return { canManage: false, error: 'Authentication required' };
  }

  const adminRole = authContext.registeredUser.role as UserRoleEnum;

  // Get target user to check their role
  try {
    const prisma = (request.server as any).prisma;
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { role: true }
    });

    if (!targetUser) {
      return { canManage: false, error: 'Target user not found' };
    }

    const targetRole = targetUser.role as UserRoleEnum;

    if (!permissionsService.canManageUser(adminRole, targetRole)) {
      return {
        canManage: false,
        error: 'Insufficient permissions to manage this user'
      };
    }

    return { canManage: true };
  } catch (error) {
    return { canManage: false, error: 'Failed to verify permissions' };
  }
}

/**
 * Audit log helper: Log admin action
 */
export async function logAdminAction(
  request: FastifyRequest,
  action: string,
  entityType: string,
  entityId: string,
  changes?: Record<string, any>,
  metadata?: Record<string, any>
): Promise<void> {
  const authContext = (request as any).authContext as UnifiedAuthContext;

  if (!authContext?.isAuthenticated || !authContext.registeredUser) {
    return;
  }

  try {
    const prisma = (request.server as any).prisma;
    await prisma.adminAuditLog.create({
      data: {
        adminId: authContext.registeredUser.id,
        userId: entityId,
        action,
        entity: entityType,
        entityId,
        changes: changes ? JSON.stringify(changes) : null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] || null
      }
    });
  } catch (error) {
    // Log error but don't fail the request
    console.error('[AdminAudit] Failed to log action:', error);
  }
}

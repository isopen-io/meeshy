import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRoleEnum } from '@meeshy/shared/types';
import { permissionsService } from '../services/admin/permissions.service';
import { UnifiedAuthContext } from './auth';

/**
 * Middleware: Requiert accès admin à l'espace utilisateurs
 */
export async function requireUserViewAccess(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authContext = (request as any).authContext as UnifiedAuthContext;

  if (!authContext?.isAuthenticated || !authContext.registeredUser || authContext.isAnonymous) {
    reply.status(401).send({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  const userRole = authContext.registeredUser.role as UserRoleEnum;

  if (!permissionsService.hasPermission(userRole, 'canViewUsers')) {
    reply.status(403).send({
      success: false,
      error: 'Insufficient permissions to view users'
    });
    return;
  }
}

/**
 * Middleware: Requiert permission de modification utilisateurs
 */
export async function requireUserModifyAccess(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authContext = (request as any).authContext as UnifiedAuthContext;

  if (!authContext?.isAuthenticated || !authContext.registeredUser || authContext.isAnonymous) {
    reply.status(401).send({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  const userRole = authContext.registeredUser.role as UserRoleEnum;

  if (!permissionsService.hasPermission(userRole, 'canUpdateUsers')) {
    reply.status(403).send({
      success: false,
      error: 'Insufficient permissions to modify users'
    });
    return;
  }
}

/**
 * Middleware: Requiert permission de suppression
 */
export async function requireUserDeleteAccess(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authContext = (request as any).authContext as UnifiedAuthContext;

  if (!authContext?.isAuthenticated || !authContext.registeredUser || authContext.isAnonymous) {
    reply.status(401).send({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  const userRole = authContext.registeredUser.role as UserRoleEnum;

  if (!permissionsService.hasPermission(userRole, 'canDeleteUsers')) {
    reply.status(403).send({
      success: false,
      error: 'Insufficient permissions to delete users'
    });
    return;
  }
}

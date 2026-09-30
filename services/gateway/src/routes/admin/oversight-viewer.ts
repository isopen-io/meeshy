/**
 * Qui regarde — lu une fois, APRÈS que la garde de la route a admis l'appelant
 * (#8876).
 *
 * La garde (`requirePermission`, `requireAdminRank`) décide de l'ADMISSION ; ce
 * module ne décide rien, il répond aux questions de GRANULARITÉ que le
 * gestionnaire se pose ensuite (« ce lecteur voit-il les coordonnées ? »). Les
 * réponses viennent de la matrice centrale, jamais d'une liste de rôles écrite
 * ici.
 */
import type { FastifyRequest } from 'fastify';
import type { UserRoleEnum } from '@meeshy/shared/types';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { permissionsService, type AdminPermissions } from '../../services/admin/permissions.service';

export type AdminViewer = {
  readonly id: string;
  readonly role: UserRoleEnum;
  readonly can: (permission: keyof AdminPermissions) => boolean;
};

export function adminViewer(request: FastifyRequest): AdminViewer {
  const user = (request as UnifiedAuthRequest).authContext.registeredUser;
  const role = user.role as UserRoleEnum;
  return {
    id: user.id,
    role,
    can: (permission) => permissionsService.hasPermission(role, permission),
  };
}

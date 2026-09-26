/**
 * `POST /admin/users/:userId/password-proposals` — les quatre niveaux de mot
 * de passe qu'un administrateur peut appliquer à un membre (#8051).
 *
 * La feuille web affiche le secret AVANT de l'appliquer, pour qu'il soit
 * transmis ; elle doit donc tenir un secret que `reset-password` ne refusera
 * pas. La composition et le jugement de robustesse vivent ici, du même côté
 * (`utils/password-proposal.ts` appelle `validatePasswordStrength` sur chaque
 * tirage) : ce qui part de cette route est déjà accepté.
 *
 * Mêmes gardes que `reset-password`, sans exception : `canResetPasswords`
 * (la permission du GESTE), `requireHierarchy` (le RANG sur cette cible) et
 * `canModifyUser` en second verrou. Lire le pseudo d'un membre pour lui
 * proposer un secret est un pas du même geste — il n'a pas de seuil plus bas.
 *
 * Rien n'est écrit : aucune ligne d'audit. Le geste audité reste
 * l'APPLICATION (`logResetPassword`), le seul qui change le compte.
 */
import type { FastifyInstance } from 'fastify';
import type { UserRoleEnum } from '@meeshy/shared/types';
import type { PasswordProposals } from '@meeshy/shared/types/admin-password-proposal';
import { permissionsService } from '../../services/admin/permissions.service';
import { UnifiedAuthContext, UnifiedAuthRequest } from '../../middleware/auth';
import { requirePermission, requireHierarchy } from '../../middleware/authorize';
import { proposePasswords } from '../../utils/password-proposal';
import { sendForbidden, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { logError } from '../../utils/logger.js';

// Le pseudo, le nom affiché et le prénom : ce dont la composition a besoin, et
// rien de plus — le rôle sert au second verrou.
const PROPOSAL_SOURCE_SELECT = { role: true, username: true, displayName: true, firstName: true } as const;

export function registerUserPasswordProposalRoutes(fastify: FastifyInstance): void {
  fastify.post<{ Params: { userId: string } }>('/admin/users/:userId/password-proposals', {
    preHandler: [fastify.authenticate, requirePermission('canResetPasswords'), requireHierarchy({ param: 'userId' })]
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const adminRole = authContext.registeredUser!.role as UserRoleEnum;

      const target = await fastify.prisma.user.findUnique({
        where: { id: request.params.userId },
        select: PROPOSAL_SOURCE_SELECT,
      });

      if (!target) {
        sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
        return;
      }

      if (!permissionsService.canModifyUser(adminRole, target.role as UserRoleEnum)) {
        sendForbidden(reply, 'Insufficient permissions to reset password', { message: 'Access denied' });
        return;
      }

      const proposals: PasswordProposals = proposePasswords({ source: target });
      sendSuccess(reply, proposals);
    } catch (error) {
      logError(fastify.log, 'Error proposing passwords', error);
      sendInternalError(reply, 'Internal server error', { message: 'Failed to propose passwords' });
    }
  });
}

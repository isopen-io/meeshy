import type { FastifyRequest } from 'fastify';
import { withAudit } from '../../middleware/authorize';
import type { UnifiedAuthRequest } from '../../middleware/auth';

/**
 * La ligne de journal d'un geste d'administration sur l'agent (spec 2026-10-04
 * § 4 : « chaque geste d'administration qui écrit laisse une ligne au
 * journal, y compris ceux qui n'en laissaient pas »).
 *
 * Une cible qui n'est pas un compte (conversation, sujet, file de livraison,
 * réglage global) prend l'ADMINISTRATEUR pour `userId` — `withAudit` prendrait
 * sinon l'identifiant de la cible, qui n'est pas un compte. Le journal tait
 * alors le « sujet » (`audit-logs.ts`).
 */
export async function auditAgentGesture(
  request: FastifyRequest,
  entree: {
    readonly action: string;
    readonly entity: 'Conversation' | 'User' | 'Agent';
    readonly entityId: string;
    readonly changes?: unknown;
  },
): Promise<void> {
  const actor = (request as UnifiedAuthRequest).authContext?.registeredUser?.id;
  await withAudit(request, {
    action: entree.action,
    entity: entree.entity,
    entityId: entree.entityId,
    userId: entree.entity === 'User' ? entree.entityId : actor,
    ...(entree.changes === undefined ? {} : { changes: entree.changes }),
  });
}

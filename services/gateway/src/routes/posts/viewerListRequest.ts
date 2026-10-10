import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ViewerListRequest } from '../../services/posts/viewerEngagement';
import { sendError, sendForbidden } from '../../utils/response';

/**
 * Ce que les deux listes des vues (`GET /posts/:postId/views` et
 * `GET /posts/:postId/interactions`) transmettent d'une requête à leur porte :
 * le rôle GLOBAL, qui ouvre la lecture administrateur, et ce que sa trace
 * d'audit retient — l'adresse et l'agent de la requête (#9733).
 */
export function viewerListRequest(request: FastifyRequest, role: string | null | undefined): ViewerListRequest {
  const userAgent = request.headers['user-agent'];
  return {
    role: role ?? null,
    ipAddress: request.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent : null,
  };
}

/**
 * Les deux refus de la porte, dits pareil par les deux routes :
 * - `FORBIDDEN` ⇒ 403 — l'auteur d'un post ou d'un réel n'en voit que les
 *   nombres (décision porteur 2026-10-09), et seuls l'auteur d'une story et
 *   ADMIN/BIGBOSS lisent une liste ;
 * - `AUDIT_UNAVAILABLE` ⇒ 503 — la trace d'une lecture administrateur ne s'est
 *   pas écrite, la lecture n'a pas eu lieu.
 *
 * Rend `true` quand la réponse est partie.
 */
export function viewerListRefused(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === 'FORBIDDEN') {
    sendForbidden(reply, 'Only the author of a story, or an administrator, can view this list', { code: 'FORBIDDEN' });
    return true;
  }
  if (error.message === 'AUDIT_UNAVAILABLE') {
    sendError(reply, 503, 'AUDIT_UNAVAILABLE', {
      code: 'AUDIT_UNAVAILABLE',
      message: 'The audit trail could not be written; the list was not read',
    });
    return true;
  }
  return false;
}

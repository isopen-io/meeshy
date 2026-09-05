/**
 * API Response Utilities
 *
 * Provides helper functions for creating consistent API responses
 * that follow the shared ApiResponse format.
 */

import type { FastifyReply } from 'fastify';
import type {
  ApiResponse,
  PaginationMeta,
  CursorPaginationMeta,
  ResponseMeta
} from '@meeshy/shared/types';

/**
 * Send a success response with data
 */
export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  options?: {
    message?: string;
    pagination?: PaginationMeta | CursorPaginationMeta;
    meta?: Partial<ResponseMeta>;
    statusCode?: number;
  }
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message: options?.message,
    pagination: options?.pagination as any,
    meta: options?.meta ? { ...options.meta } : undefined,
  };

  reply.status(options?.statusCode || 200).send(response);
}

/**
 * Send a paginated success response
 */
export function sendPaginatedSuccess<T>(
  reply: FastifyReply,
  data: T,
  pagination: PaginationMeta,
  options?: {
    message?: string;
    meta?: Partial<ResponseMeta>;
  }
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message: options?.message,
    pagination,
    meta: options?.meta ? { ...options.meta } : undefined,
  };

  reply.status(200).send(response);
}

/**
 * Send an error response
 */
export function sendError(
  reply: FastifyReply,
  statusCode: number,
  error: string,
  options?: {
    message?: string;
    code?: string;
    details?: Record<string, unknown>;
    violations?: unknown[];
  }
): void {
  // `details` est étalé à la RACINE — c'est là que les clients lisent les champs
  // d'appoint d'une erreur (`suggestedNickname` sur un 409 de pseudo pris). Il
  // était accepté par la signature et jeté en silence, ce qui est le pire des
  // deux mondes : l'appelant croit avoir transmis. L'enveloppe reste maîtresse
  // de ses quatre clés, et le schéma de réponse de chaque route reste l'arbitre
  // final de ce qui sort.
  const response: ApiResponse<never> & { violations?: unknown[] } = {
    ...(options?.details ?? {}),
    success: false,
    error,
    message: options?.message || error,
    code: options?.code,
    ...(options?.violations ? { violations: options.violations } : {})
  };

  reply.status(statusCode).send(response);
}

/**
 * Send a 400 Bad Request error
 */
/**
 * 400 Bad Request.
 *
 * `violations` porte les erreurs PAR CHAMP, et l'oubli de cette option dans la
 * signature avait une conséquence bien à elle (#4487) : `sendError` l'accepte,
 * `errorResponseSchema` la déclare, mais l'aide spécialisée que tout le monde
 * appelle ne l'offrait pas. Les routes se rabattaient donc sur
 * `details: { issues }` — étalé à la RACINE, non déclaré au schéma, et **retiré
 * en silence par `fast-json-stringify`**. Le détail était calculé, sérialisé,
 * puis jeté au dernier mètre.
 *
 * L'asymétrie qui l'avait rendu invisible mérite d'être dite : `sendForbidden`
 * portait `violations` et pas `sendBadRequest` — c'est-à-dire l'inverse de
 * l'usage, les violations par champ appartenant bien plus à un refus de
 * VALIDATION qu'à un refus de DROIT.
 *
 * > Une aide spécialisée qui offre MOINS que l'aide générale qu'elle enveloppe
 * > détourne ses appelants vers un contournement — et le contournement, lui,
 * > n'a pas de schéma.
 */
export function sendBadRequest(
  reply: FastifyReply,
  error: string,
  options?: { message?: string; code?: string; details?: Record<string, unknown>; violations?: unknown[] }
): void {
  sendError(reply, 400, error, options);
}

/**
 * Send a 401 Unauthorized error
 */
export function sendUnauthorized(
  reply: FastifyReply,
  error: string = 'Authentication required',
  options?: { message?: string; code?: string }
): void {
  sendError(reply, 401, error, options);
}

/**
 * Send a 403 Forbidden error
 */
export function sendForbidden(
  reply: FastifyReply,
  error: string = 'Access denied',
  options?: { message?: string; code?: string; violations?: unknown[] }
): void {
  sendError(reply, 403, error, options);
}

/**
 * Send a 404 Not Found error
 */
export function sendNotFound(
  reply: FastifyReply,
  error: string = 'Resource not found',
  options?: { message?: string; code?: string }
): void {
  sendError(reply, 404, error, options);
}

/**
 * Send a 409 Conflict error
 */
export function sendConflict(
  reply: FastifyReply,
  error: string,
  options?: { message?: string; code?: string }
): void {
  sendError(reply, 409, error, options);
}

/**
 * Send a 410 Gone error — la ressource a EXISTÉ et n'existe plus, et cette
 * disparition est définitive.
 *
 * Distinct d'un 404 : un 404 dit « je ne trouve pas », ce qui laisse un
 * client réessayer légitimement. Un 410 dit « ton geste a bien eu lieu, son
 * résultat n'est plus là » — c'est le verdict qu'attend une file durable dont
 * la ligne rejoue une mutation dont l'auteur a entre-temps supprimé le
 * résultat : réessayer ne le ferait pas revenir, il ne resterait qu'à le
 * recréer, ce qui n'est PAS ce que la ligne demandait.
 */
export function sendGone(
  reply: FastifyReply,
  error: string,
  options?: { message?: string; code?: string }
): void {
  sendError(reply, 410, error, options);
}

/**
 * Send a 426 Upgrade Required error — le client parle un format du passé.
 * Les détails (`minVersion`, `storeUrl`) sont étalés À LA RACINE par sendError.
 */
export function sendUpgradeRequired(
  reply: FastifyReply,
  error: string,
  options?: { message?: string; details?: Record<string, unknown> }
): void {
  sendError(reply, 426, error, { code: 'UPGRADE_REQUIRED', ...options });
}

/**
 * Send a 500 Internal Server Error
 */
export function sendInternalError(
  reply: FastifyReply,
  error: string = 'Internal server error',
  options?: { message?: string; code?: string }
): void {
  sendError(reply, 500, error, options);
}

/**
 * Build a standard success response object (without sending)
 */
export function buildSuccessResponse<T>(
  data: T,
  options?: {
    message?: string;
    pagination?: PaginationMeta;
    meta?: Partial<ResponseMeta>;
  }
): ApiResponse<T> {
  return {
    success: true,
    data,
    message: options?.message,
    pagination: options?.pagination,
    meta: options?.meta ? { ...options.meta } : undefined,
  };
}

/**
 * Build a standard error response object (without sending)
 */
export function buildErrorResponse(
  error: string,
  options?: {
    message?: string;
    code?: string;
  }
): ApiResponse<never> {
  return {
    success: false,
    error,
    message: options?.message || error,
    code: options?.code
  };
}

/**
 * Helper to create pagination metadata
 * Uses the shared PaginationMeta interface from @meeshy/shared/types
 */
export function createPaginationMeta(
  total: number,
  offset: number,
  limit: number,
  resultCount: number
): PaginationMeta {
  return {
    total,
    offset,
    limit,
    hasMore: offset + resultCount < total
  };
}

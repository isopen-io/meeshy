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
    pagination?: PaginationMeta;
    meta?: Partial<ResponseMeta>;
    statusCode?: number;
  }
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message: options?.message,
    meta: options?.pagination || options?.meta ? {
      pagination: options?.pagination,
      ...options?.meta
    } : undefined
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
    meta: {
      pagination,
      ...options?.meta
    }
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
  }
): void {
  const response: ApiResponse<never> = {
    success: false,
    error,
    message: options?.message || error,
    code: options?.code
  };

  reply.status(statusCode).send(response);
}

/**
 * Send a 400 Bad Request error
 */
export function sendBadRequest(
  reply: FastifyReply,
  error: string,
  options?: { message?: string; code?: string; details?: Record<string, unknown> }
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
  options?: { message?: string; code?: string }
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
    meta: options?.pagination || options?.meta ? {
      pagination: options?.pagination,
      ...options?.meta
    } : undefined
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

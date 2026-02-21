/**
 * Standard API Response Types - SINGLE SOURCE OF TRUTH
 * Used by Gateway (REST API) and consumed by Frontend
 *
 * This file contains the canonical definitions for:
 * - PaginationMeta: Standard pagination metadata
 * - ApiResponse: Standard API response wrapper
 * - PaginatedResponse: Helper type for paginated responses
 */

import type { ConversationStats } from './conversation.js';

/**
 * Standard pagination metadata - SINGLE SOURCE OF TRUTH
 * All pagination across the application should use this interface.
 *
 * @example Gateway response:
 * {
 *   success: true,
 *   data: [...],
 *   pagination: { total: 100, offset: 0, limit: 20, hasMore: true }
 * }
 */
export interface PaginationMeta {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface CursorPaginationMeta {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Extended metadata for responses (optional, for advanced use cases)
 */
export interface ResponseMeta {
  conversationStats?: ConversationStats;
  pagination?: PaginationMeta;
  timestamp?: string;
  requestId?: string;
  processingTime?: number;
}

/**
 * Standard API Response format - used by Gateway and consumed by Frontend
 * This is the ONLY ApiResponse type that should be used across the application.
 *
 * @example Success response:
 * { success: true, data: { id: '123', name: 'Test' } }
 *
 * @example Error response:
 * { success: false, error: 'Not found', message: 'User not found' }
 *
 * @example Paginated response:
 * { success: true, data: [...], pagination: { total: 100, offset: 0, limit: 20, hasMore: true } }
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  pagination?: PaginationMeta;
  cursorPagination?: CursorPaginationMeta;
  meta?: ResponseMeta;
}

/**
 * Paginated response helper type
 * Use this when you need a response that always includes pagination
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationMeta;
}

/**
 * WebSocket response (same format as ApiResponse for consistency)
 */
export interface SocketResponse<T = unknown> extends ApiResponse<T> {
  // Identical to ApiResponse for cross-protocol consistency
}

/**
 * Response data for sending a message
 */
export interface SendMessageResponseData {
  readonly messageId: string;
  readonly status?: string;
  readonly timestamp?: string;
}

/**
 * Response for sending a message
 */
export interface SendMessageResponse<TMessage = unknown> extends ApiResponse<SendMessageResponseData> {
  readonly messageData?: TMessage;
}

/**
 * Response data for message list
 * @deprecated Use PaginatedResponse<Message> directly with userLanguage in meta
 */
export interface GetMessagesResponseData<TMessage = unknown> {
  readonly messages: readonly TMessage[];
  /** @deprecated Use pagination.hasMore instead */
  readonly hasMore: boolean;
}

/**
 * Optimized message list response - aligns with standard PaginatedResponse
 * Format: { success, data: Message[], pagination, meta: { userLanguage } }
 */
export interface MessagesListMeta extends ResponseMeta {
  userLanguage?: string;
}

/**
 * Standard message list response
 * @example
 * {
 *   success: true,
 *   data: [{ id: '1', content: 'Hello' }, ...],
 *   pagination: { total: 100, offset: 0, limit: 20, hasMore: true },
 *   meta: { userLanguage: 'fr' }
 * }
 */
export interface MessagesListResponse<TMessage = unknown> extends ApiResponse<readonly TMessage[]> {
  pagination: PaginationMeta;
  cursorPagination?: CursorPaginationMeta;
  meta?: MessagesListMeta;
}

/**
 * Response for message list
 */
export interface GetMessagesResponse<TMessage = unknown> extends ApiResponse<GetMessagesResponseData<TMessage>> {}

/**
 * Response for conversation list
 */
export interface GetConversationsResponse<TConversation = unknown> extends ApiResponse<readonly TConversation[]> {}

/**
 * Response for a specific conversation
 */
export interface GetConversationResponse<TConversation = unknown> extends ApiResponse<TConversation> {}

/**
 * Response for creating a conversation
 */
export interface CreateConversationResponse<TConversation = unknown> extends ApiResponse<TConversation> {}

/**
 * Standardized API error
 */
export interface ApiError {
  readonly message: string;
  readonly status: number;
  readonly code?: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * API configuration
 */
export interface ApiConfig {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly retries?: number;
  readonly retryDelay?: number;
}

/**
 * Options for API requests
 */
export interface ApiRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeout?: number;
  readonly retries?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Authentication response data
 */
export interface AuthResponseData<TUser = unknown> {
  readonly user: TUser;
  readonly token?: string;
  readonly sessionToken?: string;
  readonly expiresAt?: string;
}

/**
 * Authentication response
 */
export interface AuthResponse<TUser = unknown> extends ApiResponse<AuthResponseData<TUser>> {}

/**
 * Individual translation
 */
export interface Translation {
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly translationModel: string;
  readonly confidenceScore?: number;
  readonly cached: boolean;
}

/**
 * Response data for translations
 */
export interface TranslationResponseData {
  readonly messageId: string;
  readonly translations: readonly Translation[];
}

/**
 * Response for translations
 */
export interface TranslationResponse extends ApiResponse<TranslationResponseData> {}

/**
 * Response data for statistics
 */
export interface StatsResponseData {
  readonly stats: ConversationStats;
}

/**
 * Response for statistics
 */
export interface StatsResponse extends ApiResponse<StatsResponseData> {}

/**
 * Type guard to check if a response is successful
 */
export function isSuccessResponse<T>(response: ApiResponse<T>): response is ApiResponse<T> & { success: true; data: T } {
  return response.success === true && response.data !== undefined;
}

/**
 * Type guard to check if a response is an error
 */
export function isErrorResponse<T>(response: ApiResponse<T>): response is ApiResponse<T> & { success: false; error: string } {
  return response.success === false && response.error !== undefined;
}

/**
 * Utility to create a success response
 */
export function createSuccessResponse<T>(data: T, meta?: ResponseMeta): ApiResponse<T> {
  return {
    success: true,
    data,
    meta
  };
}

/**
 * Utility to create an error response
 */
export function createErrorResponse(error: string, code?: string, meta?: ResponseMeta): ApiResponse<never> {
  return {
    success: false,
    error,
    code,
    meta
  };
}

/**
 * Utility to create a paginated success response
 */
export function createPaginatedResponse<T>(
  data: T[],
  pagination: PaginationMeta
): PaginatedResponse<T> {
  return {
    success: true,
    data,
    pagination
  };
}

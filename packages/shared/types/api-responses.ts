/**
 * Types unifiés pour les réponses API Meeshy
 * Harmonisation Gateway ↔ Frontend - WebSocket et REST
 */

import type { ConversationStats } from './conversation';

/**
 * Métadonnées de pagination
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  hasPrevious: boolean;
}

/**
 * Métadonnées enrichies pour les réponses
 */
export interface ResponseMeta {
  conversationStats?: ConversationStats;
  pagination?: PaginationMeta;
  timestamp?: string;
  requestId?: string;
  processingTime?: number;
}

/**
 * Format de réponse API unifié (REST et WebSocket)
 * Base commune pour toutes les réponses du système
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  meta?: ResponseMeta;
}

/**
 * Réponse WebSocket (même format que ApiResponse)
 * Assure la cohérence entre REST et WebSocket
 */
export interface SocketResponse<T = unknown> extends ApiResponse<T> {
  // Identique à ApiResponse pour garantir la cohérence
}

/**
 * Données de réponse pour l'envoi de message
 */
export interface SendMessageResponseData {
  readonly messageId: string;
  readonly status?: string;
  readonly timestamp?: string;
}

/**
 * Réponse pour l'envoi de message
 */
export interface SendMessageResponse<TMessage = unknown> extends ApiResponse<SendMessageResponseData> {
  readonly messageData?: TMessage;
}

/**
 * Données de réponse pour la liste des messages
 */
export interface GetMessagesResponseData<TMessage = unknown> {
  readonly messages: readonly TMessage[];
  readonly hasMore: boolean;
}

/**
 * Réponse pour la liste des messages
 */
export interface GetMessagesResponse<TMessage = unknown> extends ApiResponse<GetMessagesResponseData<TMessage>> {}

/**
 * Réponse pour la liste des conversations
 */
export interface GetConversationsResponse<TConversation = unknown> extends ApiResponse<readonly TConversation[]> {}

/**
 * Réponse pour une conversation spécifique
 */
export interface GetConversationResponse<TConversation = unknown> extends ApiResponse<TConversation> {}

/**
 * Réponse pour la création d'une conversation
 */
export interface CreateConversationResponse<TConversation = unknown> extends ApiResponse<TConversation> {}

/**
 * Erreur API standardisée
 */
export interface ApiError {
  readonly message: string;
  readonly status: number;
  readonly code?: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * Configuration API
 */
export interface ApiConfig {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly retries?: number;
  readonly retryDelay?: number;
}

/**
 * Options pour les requêtes API
 */
export interface ApiRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeout?: number;
  readonly retries?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Données de réponse d'authentification
 */
export interface AuthResponseData<TUser = unknown> {
  readonly user: TUser;
  readonly token?: string;
  readonly sessionToken?: string;
  readonly expiresAt?: string;
}

/**
 * Réponse d'authentification
 */
export interface AuthResponse<TUser = unknown> extends ApiResponse<AuthResponseData<TUser>> {}

/**
 * Traduction individuelle
 */
export interface Translation {
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly translationModel: string;
  readonly confidenceScore?: number;
  readonly cached: boolean;
}

/**
 * Données de réponse pour les traductions
 */
export interface TranslationResponseData {
  readonly messageId: string;
  readonly translations: readonly Translation[];
}

/**
 * Réponse pour les traductions
 */
export interface TranslationResponse extends ApiResponse<TranslationResponseData> {}

/**
 * Données de réponse pour les statistiques
 */
export interface StatsResponseData {
  readonly stats: ConversationStats;
}

/**
 * Réponse pour les statistiques
 */
export interface StatsResponse extends ApiResponse<StatsResponseData> {}

/**
 * Type guard pour vérifier si une réponse est un succès
 */
export function isSuccessResponse<T>(response: ApiResponse<T>): response is ApiResponse<T> & { success: true; data: T } {
  return response.success === true && response.data !== undefined;
}

/**
 * Type guard pour vérifier si une réponse est une erreur
 */
export function isErrorResponse<T>(response: ApiResponse<T>): response is ApiResponse<T> & { success: false; error: string } {
  return response.success === false && response.error !== undefined;
}

/**
 * Utilitaire pour créer une réponse de succès
 */
export function createSuccessResponse<T>(data: T, meta?: ResponseMeta): ApiResponse<T> {
  return {
    success: true,
    data,
    meta
  };
}

/**
 * Utilitaire pour créer une réponse d'erreur
 */
export function createErrorResponse(error: string, code?: string, meta?: ResponseMeta): ApiResponse<never> {
  return {
    success: false,
    error,
    code,
    meta
  };
}

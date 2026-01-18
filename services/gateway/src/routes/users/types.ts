import type { FastifyRequest } from 'fastify';

/**
 * Authenticated request with authContext
 */
export interface AuthenticatedRequest extends FastifyRequest {
  authContext?: {
    isAuthenticated: boolean;
    registeredUser: boolean;
    userId: string;
  };
}

/**
 * Pagination validation result
 */
export interface PaginationParams {
  offsetNum: number;
  limitNum: number;
}

/**
 * User minimal data for responses
 */
export interface UserMinimal {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

/**
 * Friend request action types
 */
export type FriendRequestAction = 'accept' | 'reject' | 'cancel';

/**
 * Request params for user ID or username
 */
export interface UserIdParams {
  userId: string;
}

/**
 * Request params for user ID
 */
export interface IdParams {
  id: string;
}

/**
 * Request params for username
 */
export interface UsernameParams {
  username: string;
}

/**
 * Search query parameters
 */
export interface SearchQuery {
  q?: string;
  offset?: string;
  limit?: string;
}

/**
 * Friend request body
 */
export interface FriendRequestBody {
  receiverId: string;
}

/**
 * Friend request action body
 */
export interface FriendRequestActionBody {
  action: FriendRequestAction;
}

/**
 * Affiliate token response
 */
export interface AffiliateTokenData {
  token: string;
}

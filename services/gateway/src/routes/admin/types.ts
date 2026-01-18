import { z } from 'zod';
import { UserRoleEnum } from '@meeshy/shared/types';

// Types pour les roles et permissions
export type UserRole = UserRoleEnum;

// Schemas de validation
export const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRoleEnum)
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean()
});

// Types pour les parametres de pagination
export interface PaginationParams {
  offset: string;
  limit: string;
}

export interface ValidatedPagination {
  offsetNum: number;
  limitNum: number;
}

// Types pour les queries
export interface UserListQuery extends PaginationParams {
  search?: string;
  role?: string;
  status?: 'active' | 'inactive';
}

export interface AnonymousUserListQuery extends PaginationParams {
  search?: string;
  status?: 'active' | 'inactive';
}

export interface MessageListQuery extends PaginationParams {
  search?: string;
  type?: string;
  period?: 'today' | 'week' | 'month';
}

export interface CommunityListQuery extends PaginationParams {
  search?: string;
  isPrivate?: string;
}

export interface TranslationListQuery extends PaginationParams {
  sourceLanguage?: string;
  targetLanguage?: string;
  period?: 'today' | 'week' | 'month';
}

export interface ShareLinkListQuery extends PaginationParams {
  search?: string;
  isActive?: string;
}

export interface AnalyticsQuery {
  period?: '24h' | '7d' | '30d' | '90d';
}

export interface RankingQuery {
  entityType?: 'users' | 'conversations' | 'messages' | 'links';
  criterion?: string;
  period?: '1d' | '7d' | '30d' | '60d' | '90d' | '180d' | '365d' | 'all';
  limit?: string;
}

// Helper pour valider la pagination
export function validatePagination(
  offset: string = '0',
  limit: string = '20',
  defaultLimit: number = 20,
  maxLimit: number = 100
): ValidatedPagination {
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || defaultLimit), maxLimit);
  return { offsetNum, limitNum };
}

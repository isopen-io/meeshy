/**
 * ADMIN TYPES - Shared between Gateway and Frontend
 * Centralized type definitions for all admin endpoints
 */

import type { PaginationMeta, ApiResponse } from './api-responses.js';

// ===== PAGINATION =====

/**
 * @deprecated Use PaginationMeta from api-responses.ts instead
 * Kept for backwards compatibility
 */
export interface AdminPagination extends PaginationMeta {}

export interface AdminFilters {
  offset?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ===== DASHBOARD ANALYTICS =====

export interface DashboardStats {
  users: {
    total: number;
    active: number;
    new: number;
    trend: number;
  };
  conversations: {
    total: number;
    active: number;
    messages: number;
    trend: number;
  };
  communities: {
    total: number;
    active: number;
    members: number;
    trend: number;
  };
  reports: {
    pending: number;
    resolved: number;
    total: number;
  };
  translations: {
    total: number;
    cached: number;
    today: number;
  };
}

export interface UserAnalytics {
  userGrowth: Array<{ date: string; count: number }>;
  activeUsers: Array<{ date: string; count: number }>;
  usersByRole: Record<string, number>;
  usersByLanguage: Record<string, number>;
}

export interface MessageAnalytics {
  messageVolume: Array<{ date: string; count: number }>;
  translationUsage: Array<{ language: string; count: number }>;
  conversationActivity: Array<{ date: string; count: number }>;
}

// ===== COMMUNITIES =====

export interface AdminCommunity {
  id: string;
  name: string;
  description: string;
  type: 'PUBLIC' | 'PRIVATE' | 'GLOBAL';
  isActive: boolean;
  memberCount: number;
  conversationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GetCommunitiesRequest extends AdminFilters {
  type?: 'PUBLIC' | 'PRIVATE' | 'GLOBAL';
  status?: 'active' | 'archived';
}

export interface GetCommunitiesResponse {
  communities: AdminCommunity[];
  pagination: PaginationMeta;
}

// ===== LINKS =====

export interface AdminLink {
  id: string;
  linkId: string;
  originalUrl: string;
  customAlias?: string;
  createdById: string;
  createdBy: {
    username: string;
    displayName: string;
  };
  clickCount: number;
  uniqueClickCount: number;
  lastClickedAt?: Date;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

export interface LinkClick {
  id: string;
  linkId: string;
  clickedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  country?: string;
  device?: string;
  browser?: string;
}

export interface GetLinksRequest extends AdminFilters {
  createdBy?: string;
}

export interface GetLinksResponse {
  links: AdminLink[];
  pagination: PaginationMeta;
}

// ===== MESSAGES =====

export interface AdminMessage {
  id: string;
  conversationId: string;
  userId?: string;
  anonymousId?: string;
  originalText: string;
  isFlagged: boolean;
  flaggedReason?: string;
  hasAttachment: boolean;
  createdAt: Date;
  user?: {
    username: string;
    displayName: string;
  };
  conversation: {
    id: string;
    type: string;
  };
}

export interface GetMessagesRequest extends AdminFilters {
  conversationId?: string;
  userId?: string;
  flagged?: boolean;
  dateFrom?: string;
  dateTo?: string;
  hasAttachment?: boolean;
}

export interface AdminGetMessagesResponse {
  messages: AdminMessage[];
  pagination: PaginationMeta;
}

// ===== API RESPONSE WRAPPER =====

/**
 * @deprecated Use ApiResponse from api-responses.ts instead
 * Kept for backwards compatibility
 */
export interface AdminApiResponse<T = any> extends ApiResponse<T> {}

// ===== ADMIN AUDIT LOG =====

/**
 * Types d'actions d'audit admin
 */
export type AdminAuditAction =
  // Actions de lecture
  | 'VIEW_USER'
  | 'VIEW_USER_LIST'
  | 'VIEW_AUDIT_LOG'
  | 'VIEW_CONVERSATION'
  | 'VIEW_MESSAGE'
  | 'VIEW_COMMUNITY'
  | 'VIEW_REPORT'
  | 'VIEW_STATS'
  // Actions de creation/modification
  | 'CREATE_USER'
  | 'UPDATE_PROFILE'
  | 'UPDATE_EMAIL'
  | 'UPDATE_PHONE'
  | 'UPDATE_ROLE'
  | 'UPDATE_STATUS'
  | 'UPDATE_COMMUNITY'
  | 'UPDATE_CONVERSATION'
  // Actions de securite
  | 'CHANGE_PASSWORD'
  | 'RESET_PASSWORD'
  | 'ENABLE_2FA'
  | 'DISABLE_2FA'
  | 'UNLOCK_ACCOUNT'
  | 'LOCK_ACCOUNT'
  | 'REVOKE_SESSION'
  // Actions sur les ressources
  | 'UPLOAD_AVATAR'
  | 'DELETE_AVATAR'
  | 'DELETE_MESSAGE'
  | 'DELETE_ATTACHMENT'
  // Actions de suppression
  | 'DEACTIVATE_USER'
  | 'ACTIVATE_USER'
  | 'DELETE_USER'
  | 'RESTORE_USER'
  | 'DELETE_COMMUNITY'
  | 'DELETE_CONVERSATION'
  // Actions de verification
  | 'VERIFY_EMAIL'
  | 'VERIFY_PHONE'
  // Actions de moderation
  | 'RESOLVE_REPORT'
  | 'REJECT_REPORT'
  | 'BAN_USER'
  | 'UNBAN_USER'
  | 'WARN_USER'
  | 'REMOVE_CONTENT'
  // Actions de broadcast
  | 'CREATE_BROADCAST'
  | 'SEND_BROADCAST'
  | 'DELETE_BROADCAST';

/**
 * Types d'entites auditees
 */
export type AdminAuditEntity =
  | 'User'
  | 'Community'
  | 'Conversation'
  | 'Message'
  | 'Report'
  | 'Attachment'
  | 'Session'
  | 'TrackingLink'
  | 'Broadcast';

/**
 * Detail d'un changement dans l'audit
 */
export interface AdminAuditChange {
  readonly before: unknown;
  readonly after: unknown;
}

/**
 * Metadonnees d'audit admin
 */
export interface AdminAuditMetadata {
  readonly reason?: string;
  readonly requestId?: string;
  readonly endpoint?: string;
  readonly method?: string;
  readonly [key: string]: unknown;
}

/**
 * Journal d'audit admin
 * Aligned with schema.prisma AdminAuditLog
 */
export interface AdminAuditLog {
  readonly id: string;

  /** ID de l'utilisateur affecte par l'action */
  readonly userId: string;

  /** ID de l'administrateur qui a effectue l'action */
  readonly adminId: string;

  /** Type d'action (VIEW_USER, CREATE_USER, UPDATE_PROFILE, etc.) */
  readonly action: AdminAuditAction | string;

  /** Type d'entite affectee (User, Community, etc.) */
  readonly entity: AdminAuditEntity | string;

  /** ID de l'entite affectee */
  readonly entityId: string;

  /** Changements effectues (JSON stringifie) */
  readonly changes?: string | Record<string, AdminAuditChange>;

  /** Metadonnees supplementaires (JSON stringifie) */
  readonly metadata?: string | AdminAuditMetadata;

  /** Adresse IP de l'admin */
  readonly ipAddress?: string;

  /** User agent du navigateur */
  readonly userAgent?: string;

  /** Date de creation du log */
  readonly createdAt: Date;
}

/**
 * Log d'audit parse avec les changements et metadonnees decodes
 */
export interface AdminAuditLogParsed extends Omit<AdminAuditLog, 'changes' | 'metadata'> {
  readonly changes?: Record<string, AdminAuditChange>;
  readonly metadata?: AdminAuditMetadata;
}

/**
 * DTO pour creer un log d'audit
 */
export interface CreateAdminAuditLogDTO {
  readonly userId: string;
  readonly adminId: string;
  readonly action: AdminAuditAction | string;
  readonly entity: AdminAuditEntity | string;
  readonly entityId: string;
  readonly changes?: Record<string, AdminAuditChange>;
  readonly metadata?: AdminAuditMetadata;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Filtres pour rechercher des logs d'audit
 */
export interface AdminAuditLogFilters {
  readonly userId?: string;
  readonly adminId?: string;
  readonly action?: AdminAuditAction | string;
  readonly entity?: AdminAuditEntity | string;
  readonly entityId?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly ipAddress?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly sortOrder?: 'asc' | 'desc';
}

/**
 * Reponse paginee pour les logs d'audit
 */
export interface AdminAuditLogResponse {
  readonly logs: readonly AdminAuditLogParsed[];
  readonly pagination: PaginationMeta;
}

/**
 * Parse un AdminAuditLog brut en version parsee
 */
export function parseAdminAuditLog(log: AdminAuditLog): AdminAuditLogParsed {
  let changes: Record<string, AdminAuditChange> | undefined;
  let metadata: AdminAuditMetadata | undefined;

  if (typeof log.changes === 'string') {
    try {
      changes = JSON.parse(log.changes);
    } catch {
      changes = undefined;
    }
  } else {
    changes = log.changes as Record<string, AdminAuditChange> | undefined;
  }

  if (typeof log.metadata === 'string') {
    try {
      metadata = JSON.parse(log.metadata);
    } catch {
      metadata = undefined;
    }
  } else {
    metadata = log.metadata as AdminAuditMetadata | undefined;
  }

  return {
    ...log,
    changes,
    metadata,
  };
}

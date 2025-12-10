/**
 * ADMIN TYPES - Shared between Gateway and Frontend
 * Centralized type definitions for all admin endpoints
 */

// ===== PAGINATION =====

export interface AdminPagination {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface AdminFilters {
  page?: number;
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
  pagination: AdminPagination;
}

export interface CommunityStats {
  totalCommunities: number;
  activeCommunities: number;
  totalMembers: number;
  avgMembersPerCommunity: number;
  publicCommunities: number;
  privateCommunities: number;
  globalCommunities: number;
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
  pagination: AdminPagination;
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

export interface GetMessagesResponse {
  messages: AdminMessage[];
  pagination: AdminPagination;
}

// ===== API RESPONSE WRAPPER =====

export interface AdminApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: AdminPagination;
}

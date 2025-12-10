/**
 * Types pour le système de signalement (Report)
 */

/**
 * Type de contenu signalé
 */
export enum ReportedType {
  MESSAGE = 'message',
  USER = 'user',
  CONVERSATION = 'conversation',
  COMMUNITY = 'community'
}

/**
 * Type de signalement
 */
export enum ReportType {
  SPAM = 'spam',
  INAPPROPRIATE = 'inappropriate',
  HARASSMENT = 'harassment',
  VIOLENCE = 'violence',
  HATE_SPEECH = 'hate_speech',
  FAKE_PROFILE = 'fake_profile',
  IMPERSONATION = 'impersonation',
  OTHER = 'other'
}

/**
 * Statut du signalement
 */
export enum ReportStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
  DISMISSED = 'dismissed'
}

/**
 * Action prise suite au signalement
 */
export enum ReportAction {
  NONE = 'none',
  WARNING_SENT = 'warning_sent',
  CONTENT_REMOVED = 'content_removed',
  USER_SUSPENDED = 'user_suspended',
  USER_BANNED = 'user_banned'
}

/**
 * Interface pour un signalement complet
 */
export interface Report {
  id: string;
  reportedType: ReportedType | string;
  reportedEntityId: string;
  reporterId: string | null;
  reporterName: string | null;
  reportType: ReportType | string;
  reason: string | null;
  status: ReportStatus | string;
  moderatorId: string | null;
  moderatorNotes: string | null;
  actionTaken: ReportAction | string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

/**
 * DTO pour créer un signalement
 */
export interface CreateReportDTO {
  reportedType: ReportedType | string;
  reportedEntityId: string;
  reporterId?: string;
  reporterName?: string;
  reportType: ReportType | string;
  reason?: string;
}

/**
 * DTO pour mettre à jour un signalement (modérateur uniquement)
 */
export interface UpdateReportDTO {
  status?: ReportStatus | string;
  moderatorNotes?: string;
  actionTaken?: ReportAction | string;
}

/**
 * Filtres pour rechercher des signalements
 */
export interface ReportFilters {
  reportedType?: ReportedType | string;
  reportType?: ReportType | string;
  status?: ReportStatus | string;
  reporterId?: string;
  moderatorId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  sortBy?: 'createdAt' | 'updatedAt' | 'resolvedAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Pagination pour les signalements
 */
export interface ReportPaginationParams {
  page: number;
  pageSize: number;
}

/**
 * Métadonnées de pagination
 */
export interface ReportPaginationMeta {
  page: number;
  pageSize: number;
  totalReports: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Réponse paginée avec signalements
 */
export interface PaginatedReportsResponse {
  reports: Report[];
  pagination: ReportPaginationMeta;
}

/**
 * Statistiques sur les signalements
 */
export interface ReportStats {
  totalReports: number;
  pendingReports: number;
  underReviewReports: number;
  resolvedReports: number;
  rejectedReports: number;
  dismissedReports: number;
  reportsByType: Record<string, number>;
  reportsByReportedType: Record<string, number>;
  averageResolutionTimeHours: number;
}

/**
 * Signalement avec détails de l'entité signalée
 */
export interface ReportWithDetails extends Report {
  reportedEntity?: {
    id: string;
    type: string;
    content?: string;
    title?: string;
    username?: string;
    [key: string]: any;
  };
  reporter?: {
    id: string;
    username: string;
    displayName?: string;
  };
  moderator?: {
    id: string;
    username: string;
    displayName?: string;
  };
}

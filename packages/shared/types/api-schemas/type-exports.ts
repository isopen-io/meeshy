/**
 * Schémas d’API — interfaces TypeScript miroirs des schémas.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/type-exports
 */

// =============================================================================
// TYPE EXPORTS (TypeScript interfaces matching schemas)
// =============================================================================

/**
 * TypeScript type for user permissions
 */
export interface UserPermissions {
  canAccessAdmin: boolean;
  canManageUsers: boolean;
  canManageGroups: boolean;
  canManageConversations: boolean;
  canViewAnalytics: boolean;
  canModerateContent: boolean;
  canViewAuditLogs: boolean;
  canManageNotifications: boolean;
  canManageTranslations: boolean;
}

/**
 * TypeScript type for session data
 */
export interface SessionInfo {
  id: string;
  userId: string;
  deviceType: string | null;
  deviceVendor: string | null;
  deviceModel: string | null;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  browserVersion: string | null;
  isMobile: boolean;
  ipAddress: string | null;
  country: string | null;
  city: string | null;
  location: string | null;
  createdAt: Date | string;
  lastActivityAt: Date | string;
  isCurrentSession: boolean;
  isTrusted: boolean;
}

/**
 * TypeScript type for minimal session
 */
export interface SessionMinimal {
  id: string;
  deviceType: string | null;
  browserName: string | null;
  osName: string | null;
  location: string | null;
  isMobile: boolean;
  createdAt: Date | string;
}

/**
 * TypeScript type for login response data
 */
export interface LoginResponseData {
  user: Record<string, unknown>;
  token: string;
  sessionToken: string;
  session: SessionMinimal;
  expiresIn: number;
}

/**
 * TypeScript type for register response data
 */
export interface RegisterResponseData {
  user: Record<string, unknown>;
  token: string;
  expiresIn: number;
}

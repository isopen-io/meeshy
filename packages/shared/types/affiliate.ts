// Types pour le système d'affiliation

/**
 * Statuts possibles pour une relation d'affiliation
 */
export type AffiliateRelationStatus = 'pending' | 'completed' | 'expired';

/**
 * Statuts possibles pour une demande d'ami
 */
export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';

/**
 * Informations de base d'un utilisateur
 */
export interface BaseUserInfo {
  readonly id: string;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName?: string;
  readonly avatar?: string;
}

/**
 * Informations d'un utilisateur avec statut en ligne
 */
export interface UserInfoWithOnlineStatus extends BaseUserInfo {
  readonly isOnline: boolean;
}

/**
 * Compteur d'affiliations pour un token
 */
export interface AffiliationCount {
  readonly affiliations: number;
}

/**
 * Token d'affiliation
 */
export interface AffiliateToken {
  readonly id: string;
  readonly token: string;
  readonly name: string;
  readonly createdBy: string;
  readonly maxUses?: number;
  readonly currentUses: number;
  readonly expiresAt?: Date;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly creator?: BaseUserInfo;
  readonly _count?: AffiliationCount;
}

/**
 * Informations minimales d'un token d'affiliation
 */
export interface AffiliateTokenInfo {
  readonly name: string;
  readonly token: string;
  readonly createdAt: Date;
}

/**
 * Informations complètes d'un utilisateur référé
 */
export interface ReferredUserInfo extends UserInfoWithOnlineStatus {
  readonly email: string;
  readonly createdAt: Date;
}

/**
 * Relation d'affiliation
 */
export interface AffiliateRelation {
  readonly id: string;
  readonly affiliateTokenId: string;
  readonly affiliateUserId: string;
  readonly referredUserId: string;
  readonly status: AffiliateRelationStatus;
  readonly createdAt: Date;
  readonly completedAt?: Date;
  readonly affiliateToken?: AffiliateTokenInfo;
  readonly referredUser?: ReferredUserInfo;
  readonly affiliateUser?: BaseUserInfo;
}

/**
 * Demande d'ami
 */
export interface FriendRequest {
  readonly id: string;
  readonly senderId: string;
  readonly receiverId: string;
  readonly status: FriendRequestStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly sender?: UserInfoWithOnlineStatus;
  readonly receiver?: UserInfoWithOnlineStatus;
}

/**
 * Statistiques d'affiliation
 */
export interface AffiliateStats {
  readonly totalReferrals: number;
  readonly completedReferrals: number;
  readonly pendingReferrals: number;
  readonly expiredReferrals: number;
  readonly referrals: readonly AffiliateRelation[];
  readonly tokens: readonly AffiliateToken[];
}

/**
 * Requête de création d'un token d'affiliation
 */
export interface CreateAffiliateTokenRequest {
  readonly name: string;
  readonly maxUses?: number;
  readonly expiresAt?: string; // ISO 8601 date string
}

/**
 * Réponse de création d'un token d'affiliation
 */
export interface AffiliateTokenResponse {
  readonly id: string;
  readonly token: string;
  readonly name: string;
  readonly affiliateLink: string;
  readonly maxUses?: number;
  readonly currentUses: number;
  readonly expiresAt?: string; // ISO 8601 date string
  readonly createdAt: string; // ISO 8601 date string
}

/**
 * Informations minimales d'un token pour validation
 */
export interface AffiliateTokenValidationInfo {
  readonly id: string;
  readonly name: string;
  readonly token: string;
  readonly maxUses?: number;
  readonly currentUses: number;
  readonly expiresAt?: string; // ISO 8601 date string
}

/**
 * Réponse de validation d'un token d'affiliation
 */
export interface AffiliateValidationResponse {
  readonly isValid: boolean;
  readonly token?: AffiliateTokenValidationInfo;
  readonly affiliateUser?: BaseUserInfo;
}

/**
 * Données de visite pour un lien d'affiliation
 */
export interface AffiliateVisitData {
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly referrer?: string;
  readonly country?: string;
  readonly language?: string;
}

/**
 * Requête d'enregistrement d'une affiliation
 */
export interface AffiliateRegisterRequest {
  readonly token: string;
  readonly referredUserId: string;
  readonly sessionKey?: string;
}

/**
 * Réponse d'enregistrement d'une affiliation
 */
export interface AffiliateRegisterResponse {
  readonly id: string;
  readonly status: AffiliateRelationStatus;
}

/**
 * Types pour le système de tracking de liens
 */

// ============================================================================
// Types de base TrackingLink
// ============================================================================

/**
 * Types de dispositifs supportés
 */
export type DeviceType = 'mobile' | 'desktop' | 'tablet';

/**
 * Lien de tracking
 */
export interface TrackingLink {
  readonly id: string;
  readonly token: string; // Token unique de 6 caractères
  readonly name?: string; // Nom du lien
  readonly campaign?: string; // UTM campaign name
  readonly source?: string; // UTM source
  readonly medium?: string; // UTM medium
  readonly originalUrl: string; // URL originale complète
  readonly shortUrl: string; // URL courte (meeshy.me/l/<token>)
  readonly createdBy?: string; // ID de l'utilisateur créateur (null si anonyme)
  readonly conversationId?: string; // ID de la conversation
  readonly messageId?: string; // ID du message contenant le lien
  readonly totalClicks: number; // Nombre total de clics
  readonly uniqueClicks: number; // Nombre de clics uniques
  readonly isActive: boolean; // Le lien est-il actif
  readonly expiresAt?: Date; // Date d'expiration
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastClickedAt?: Date; // Date du dernier clic
}

/**
 * Clic sur un lien de tracking
 */
export interface TrackingLinkClick {
  readonly id: string;
  readonly trackingLinkId: string;
  readonly userId?: string; // ID utilisateur connecté
  readonly anonymousId?: string; // ID participant anonyme
  readonly ipAddress?: string;
  readonly country?: string;
  readonly city?: string;
  readonly region?: string;
  readonly userAgent?: string;
  readonly browser?: string;
  readonly os?: string;
  readonly device?: DeviceType;
  readonly language?: string;
  readonly languages?: string;
  readonly referrer?: string;
  readonly deviceFingerprint?: string;
  readonly screenResolution?: string;
  readonly viewportSize?: string;
  readonly pixelRatio?: number;
  readonly colorDepth?: number;
  readonly timezone?: string;
  readonly connectionType?: string;
  readonly connectionSpeed?: number;
  readonly touchSupport?: boolean;
  readonly platform?: string;
  readonly cookiesEnabled?: boolean;
  readonly hardwareConcurrency?: number;
  readonly deviceMemory?: number;
  readonly socialSource?: string;
  readonly utmClickSource?: string;
  readonly utmClickMedium?: string;
  readonly utmClickCampaign?: string;
  readonly utmClickTerm?: string;
  readonly utmClickContent?: string;
  readonly clickedAt: Date;
}

// ============================================================================
// DTOs pour l'API
// ============================================================================

/**
 * Requête de création d'un lien de tracking
 */
export interface CreateTrackingLinkRequest {
  readonly originalUrl: string;
  readonly name?: string;
  readonly campaign?: string;
  readonly source?: string;
  readonly medium?: string;
  readonly conversationId?: string;
  readonly messageId?: string;
  readonly expiresAt?: Date;
}

/**
 * Données de réponse pour la création d'un lien de tracking
 */
export interface CreateTrackingLinkResponseData {
  readonly trackingLink: TrackingLink;
}

/**
 * Réponse de création d'un lien de tracking
 */
export interface CreateTrackingLinkResponse {
  readonly success: boolean;
  readonly data?: CreateTrackingLinkResponseData;
  readonly error?: string;
}

/**
 * Requête de récupération d'un lien de tracking
 */
export interface GetTrackingLinkRequest {
  readonly token: string;
}

/**
 * Données de réponse pour la récupération d'un lien de tracking
 */
export interface GetTrackingLinkResponseData {
  readonly trackingLink: TrackingLink;
  readonly clicks?: readonly TrackingLinkClick[];
}

/**
 * Réponse de récupération d'un lien de tracking
 */
export interface GetTrackingLinkResponse {
  readonly success: boolean;
  readonly data?: GetTrackingLinkResponseData;
  readonly error?: string;
}

/**
 * Requête d'enregistrement d'un clic
 */
export interface RecordClickRequest {
  readonly token: string;
  readonly userId?: string;
  readonly anonymousId?: string;
  readonly ipAddress?: string;
  readonly country?: string;
  readonly city?: string;
  readonly region?: string;
  readonly userAgent?: string;
  readonly browser?: string;
  readonly os?: string;
  readonly device?: DeviceType;
  readonly language?: string;
  readonly referrer?: string;
  readonly deviceFingerprint?: string;
}

/**
 * Données de réponse pour l'enregistrement d'un clic
 */
export interface RecordClickResponseData {
  readonly originalUrl: string;
  readonly trackingLink: TrackingLink;
}

/**
 * Réponse d'enregistrement d'un clic
 */
export interface RecordClickResponse {
  readonly success: boolean;
  readonly data?: RecordClickResponseData;
  readonly error?: string;
}

/**
 * Requête de statistiques d'un lien de tracking
 */
export interface TrackingLinkStatsRequest {
  readonly token: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
}

/**
 * Référant principal
 */
export interface TopReferrer {
  readonly referrer: string;
  readonly count: number;
}

/**
 * Données de réponse pour les statistiques d'un lien de tracking
 */
export interface TrackingLinkStatsResponseData {
  readonly trackingLink: TrackingLink;
  readonly totalClicks: number;
  readonly uniqueClicks: number;
  readonly clicksByCountry: Readonly<Record<string, number>>;
  readonly clicksByDevice: Readonly<Record<string, number>>;
  readonly clicksByBrowser: Readonly<Record<string, number>>;
  readonly clicksByOS: Readonly<Record<string, number>>;
  readonly clicksByLanguage: Readonly<Record<string, number>>;
  readonly clicksByHour: Readonly<Record<string, number>>;
  readonly clicksBySocialSource: Readonly<Record<string, number>>;
  readonly clicksByDate: Readonly<Record<string, number>>;
  readonly topReferrers: readonly TopReferrer[];
}

/**
 * Réponse de statistiques d'un lien de tracking
 */
export interface TrackingLinkStatsResponse {
  readonly success: boolean;
  readonly data?: TrackingLinkStatsResponseData;
  readonly error?: string;
}

// ============================================================================
// Utilitaires
// ============================================================================

/**
 * Types de contenu dans un message parsé
 */
export type ParsedMessageType = 'text' | 'link' | 'tracking-link';

/**
 * Message parsé avec détection de liens
 */
export interface ParsedMessage {
  readonly text: string;
  readonly type: ParsedMessageType;
  readonly originalUrl?: string;
  readonly trackingUrl?: string;
  readonly token?: string;
}

/**
 * Options pour le parsing de liens
 */
export interface LinkParserOptions {
  readonly createTrackingLinks?: boolean; // Créer automatiquement des liens de tracking
  readonly domain?: string; // Domaine pour les liens courts (par défaut: meeshy.me)
}

// ============================================================================
// Constantes
// ============================================================================

/**
 * Longueur du token de lien de tracking
 */
export const TRACKING_LINK_TOKEN_LENGTH = 6 as const;

/**
 * URL de base pour les liens courts
 */
export const TRACKING_LINK_BASE_URL = 'meeshy.me/l/' as const;

/**
 * Expression régulière pour détecter les liens de tracking Meeshy
 */
export const TRACKING_LINK_REGEX = /https?:\/\/(?:www\.)?meeshy\.me\/l\/([a-zA-Z0-9]{6})/g;

/**
 * Expression régulière pour détecter les URLs
 */
export const URL_REGEX = /(https?:\/\/[^\s]+)/g;


/**
 * Types unifiés pour les participants anonymes Meeshy
 * Harmonisation Gateway ↔ Frontend
 */

import type { ConversationShareLink } from './conversation';

/**
 * Branded type pour les identifiants de participants anonymes
 */
export type AnonymousParticipantId = string & { readonly __brand: 'AnonymousParticipantId' };

/**
 * Branded type pour les tokens de session anonymes
 */
export type AnonymousSessionToken = string & { readonly __brand: 'AnonymousSessionToken' };

/**
 * Branded type pour les identifiants de lien de partage
 */
export type ShareLinkId = string & { readonly __brand: 'ShareLinkId' };

/**
 * Code de langue ISO 639-1
 */
export type LanguageCode = string;

/**
 * Code de pays ISO 3166-1 alpha-2
 */
export type CountryCode = string;

/**
 * Permissions pour un participant anonyme
 */
export interface AnonymousParticipantPermissions {
  readonly canSendMessages: boolean;
  readonly canSendFiles: boolean;
  readonly canSendImages: boolean;
}

/**
 * Participant anonyme via lien de partage
 */
export interface AnonymousParticipant {
  readonly id: string;
  readonly conversationId: string;
  readonly shareLinkId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly username: string;
  readonly email?: string;
  readonly birthday?: Date;
  readonly sessionToken: string;
  readonly ipAddress?: string;
  readonly country?: CountryCode;
  readonly language: LanguageCode;
  readonly deviceFingerprint?: string;
  readonly isActive: boolean;
  readonly isOnline: boolean;
  readonly lastActiveAt: Date;
  readonly canSendMessages: boolean;
  readonly canSendFiles: boolean;
  readonly canSendImages: boolean;
  readonly joinedAt: Date;
  readonly lastSeenAt: Date;
  readonly leftAt?: Date;
  readonly shareLink?: ConversationShareLink;
}

/**
 * Type guard pour vérifier si un ID est un AnonymousParticipantId
 */
export function isAnonymousParticipantId(id: string): id is AnonymousParticipantId {
  return typeof id === 'string' && id.length > 0;
}

/**
 * Type guard pour vérifier si un token est un AnonymousSessionToken
 */
export function isAnonymousSessionToken(token: string): token is AnonymousSessionToken {
  return typeof token === 'string' && token.length > 0;
}

/**
 * Crée un AnonymousParticipantId à partir d'une chaîne
 */
export function createAnonymousParticipantId(id: string): AnonymousParticipantId {
  return id as AnonymousParticipantId;
}

/**
 * Crée un AnonymousSessionToken à partir d'une chaîne
 */
export function createAnonymousSessionToken(token: string): AnonymousSessionToken {
  return token as AnonymousSessionToken;
}

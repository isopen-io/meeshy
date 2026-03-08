/**
 * Legacy anonymous types - DEPRECATED
 *
 * All anonymous participant data is now embedded in the unified Participant model
 * via the anonymousSession composite type.
 *
 * @see participant.ts for AnonymousSession, AnonymousProfile, Participant
 * @deprecated This entire file is deprecated. Import from participant.ts instead.
 */

import type { ConversationShareLink } from './conversation.js';

/**
 * @deprecated Use string IDs directly. Participant.id is the unified identifier.
 */
export type AnonymousParticipantId = string & { readonly __brand: 'AnonymousParticipantId' };

/**
 * Branded type for anonymous session tokens (still used in join flow)
 */
export type AnonymousSessionToken = string & { readonly __brand: 'AnonymousSessionToken' };

/**
 * @deprecated Use string IDs directly.
 */
export type ShareLinkId = string & { readonly __brand: 'ShareLinkId' };

export type LanguageCode = string;
export type CountryCode = string;

/**
 * @deprecated Use ParticipantPermissions from participant.ts instead
 */
export interface AnonymousParticipantPermissions {
  readonly canSendMessages: boolean;
  readonly canSendFiles: boolean;
  readonly canSendImages: boolean;
}

/**
 * @deprecated Use Participant with type='anonymous' from participant.ts instead
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
  readonly leftAt?: Date;
  readonly shareLink?: ConversationShareLink;
}

/**
 * @deprecated Use Participant type checks instead
 */
export function isAnonymousParticipantId(id: string): id is AnonymousParticipantId {
  return typeof id === 'string' && id.length > 0;
}

/**
 * Type guard for anonymous session tokens (still used in join flow)
 */
export function isAnonymousSessionToken(token: string): token is AnonymousSessionToken {
  return typeof token === 'string' && token.length > 0;
}

/**
 * @deprecated Use Participant type checks instead
 */
export function createAnonymousParticipantId(id: string): AnonymousParticipantId {
  return id as AnonymousParticipantId;
}

/**
 * Creates an AnonymousSessionToken from a string
 */
export function createAnonymousSessionToken(token: string): AnonymousSessionToken {
  return token as AnonymousSessionToken;
}

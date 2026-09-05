/**
 * Schémas d’API — affiliation et liens de suivi.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/affiliate
 */

import { userMinimalSchema } from './user.js';

// =============================================================================
// AFFILIATE SCHEMAS
// =============================================================================

/**
 * Affiliate token schema
 */
export const affiliateTokenSchema = {
  type: 'object',
  description: 'Affiliate/referral token',
  properties: {
    id: { type: 'string', description: 'Token ID' },
    userId: { type: 'string', description: 'Owner user ID' },
    token: { type: 'string', description: 'Unique affiliate token/code' },
    type: {
      type: 'string',
      enum: ['referral', 'promo', 'partner', 'influencer'],
      description: 'Token type'
    },
    description: { type: 'string', nullable: true, description: 'Token description' },
    commission: { type: 'number', nullable: true, description: 'Commission percentage' },
    maxUses: { type: 'number', nullable: true, description: 'Maximum uses allowed' },
    currentUses: { type: 'number', description: 'Current use count' },
    isActive: { type: 'boolean', description: 'Whether token is active' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration date' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update' }
  }
} as const;

/**
 * Affiliate relation schema
 */
export const affiliateRelationSchema = {
  type: 'object',
  description: 'Affiliate relationship between users',
  properties: {
    id: { type: 'string', description: 'Relation ID' },
    affiliateId: { type: 'string', description: 'Affiliate user ID' },
    referredUserId: { type: 'string', description: 'Referred user ID' },
    tokenId: { type: 'string', description: 'Token used for referral' },
    status: {
      type: 'string',
      enum: ['pending', 'active', 'expired', 'revoked'],
      description: 'Relation status'
    },
    earnings: { type: 'number', description: 'Total earnings from this referral' },
    createdAt: { type: 'string', format: 'date-time', description: 'Relation creation' },
    affiliate: { ...userMinimalSchema, description: 'Affiliate user info' },
    referredUser: { ...userMinimalSchema, description: 'Referred user info' }
  }
} as const;

// =============================================================================
// TRACKING LINK SCHEMAS
// =============================================================================

/**
 * Tracking link schema
 */
export const trackingLinkSchema = {
  type: 'object',
  description: 'Marketing/analytics tracking link',
  properties: {
    id: { type: 'string', description: 'Link ID' },
    token: { type: 'string', description: 'Unique 6-character tracking token' },
    name: { type: 'string', nullable: true, description: 'Link display name' },
    campaign: { type: 'string', nullable: true, description: 'UTM campaign name' },
    source: { type: 'string', nullable: true, description: 'UTM source' },
    medium: { type: 'string', nullable: true, description: 'UTM medium' },
    originalUrl: { type: 'string', description: 'Original destination URL' },
    shortUrl: { type: 'string', description: 'Short redirect URL (meeshy.me/l/<token>)' },
    createdBy: { type: 'string', nullable: true, description: 'Creator user ID' },
    conversationId: { type: 'string', nullable: true, description: 'Associated conversation ID' },
    messageId: { type: 'string', nullable: true, description: 'Associated message ID' },
    totalClicks: { type: 'number', description: 'Total click count' },
    uniqueClicks: { type: 'number', description: 'Unique visitor clicks' },
    isActive: { type: 'boolean', description: 'Whether link is active' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration date' },
    lastClickedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last click timestamp' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update' }
  }
} as const;

/**
 * Tracking link click schema
 */
export const trackingLinkClickSchema = {
  type: 'object',
  description: 'Click event on tracking link',
  properties: {
    id: { type: 'string', description: 'Click ID' },
    trackingLinkId: { type: 'string', description: 'Tracking link ID' },
    userId: { type: 'string', nullable: true, description: 'Authenticated user who clicked' },
    participantId: { type: 'string', nullable: true, description: 'Participant who clicked' },
    ipAddress: { type: 'string', nullable: true, description: 'Visitor IP' },
    userAgent: { type: 'string', nullable: true, description: 'User agent' },
    referrer: { type: 'string', nullable: true, description: 'Referrer URL' },
    country: { type: 'string', nullable: true, description: 'Visitor country' },
    city: { type: 'string', nullable: true, description: 'Visitor city' },
    region: { type: 'string', nullable: true, description: 'Visitor region' },
    device: { type: 'string', nullable: true, description: 'Device type (mobile/desktop/tablet)' },
    browser: { type: 'string', nullable: true, description: 'Browser name' },
    os: { type: 'string', nullable: true, description: 'Operating system' },
    language: { type: 'string', nullable: true, description: 'Preferred language' },
    deviceFingerprint: { type: 'string', nullable: true, description: 'Device fingerprint' },
    clickedAt: { type: 'string', format: 'date-time', description: 'Click timestamp' }
  }
} as const;

/**
 * Create tracking link request schema
 */
export const createTrackingLinkRequestSchema = {
  type: 'object',
  required: ['destinationUrl'],
  properties: {
    destinationUrl: { type: 'string', format: 'uri', description: 'Target URL' },
    shortCode: { type: 'string', minLength: 3, maxLength: 20, pattern: '^[a-zA-Z0-9-_]+$', description: 'Custom short code' },
    title: { type: 'string', maxLength: 100, description: 'Link title' },
    campaign: { type: 'string', maxLength: 50, description: 'Campaign name' },
    source: { type: 'string', maxLength: 50, description: 'Traffic source' },
    medium: { type: 'string', maxLength: 50, description: 'Traffic medium' },
    expiresAt: { type: 'string', format: 'date-time', description: 'Expiration date' }
  }
} as const;

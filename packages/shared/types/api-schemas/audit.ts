/**
 * Schémas d’API — journal d’audit administrateur et événements de sécurité.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/audit
 */

import { userMinimalSchema } from './user.js';

// =============================================================================
// ADMIN AUDIT LOG SCHEMAS
// =============================================================================

/**
 * Admin audit log schema
 */
export const adminAuditLogSchema = {
  type: 'object',
  description: 'Admin action audit log entry',
  properties: {
    id: { type: 'string', description: 'Audit log ID' },
    adminId: { type: 'string', description: 'Admin user ID who performed action' },
    action: {
      type: 'string',
      enum: [
        'user_ban', 'user_unban', 'user_delete', 'user_role_change',
        'content_delete', 'content_flag', 'content_approve',
        'report_resolve', 'report_dismiss',
        'community_delete', 'community_suspend',
        'settings_change', 'system_config'
      ],
      description: 'Action type'
    },
    targetType: {
      type: 'string',
      enum: ['user', 'message', 'conversation', 'community', 'report', 'system'],
      description: 'Target entity type'
    },
    targetId: { type: 'string', nullable: true, description: 'Target entity ID' },
    details: { type: 'string', nullable: true, description: 'Action details (JSON)' },
    previousState: { type: 'string', nullable: true, description: 'State before action (JSON)' },
    newState: { type: 'string', nullable: true, description: 'State after action (JSON)' },
    ipAddress: { type: 'string', nullable: true, description: 'Admin IP address' },
    userAgent: { type: 'string', nullable: true, description: 'Admin user agent' },
    createdAt: { type: 'string', format: 'date-time', description: 'Action timestamp' },
    admin: { ...userMinimalSchema, description: 'Admin user info' }
  }
} as const;

// =============================================================================
// SECURITY EVENT SCHEMAS
// =============================================================================

/**
 * Security event schema
 */
export const securityEventSchema = {
  type: 'object',
  description: 'Security-related event',
  properties: {
    id: { type: 'string', description: 'Event ID' },
    userId: { type: 'string', nullable: true, description: 'Related user ID' },
    eventType: {
      type: 'string',
      enum: [
        'login_success', 'login_failed', 'logout',
        'password_change', 'password_reset', 'password_reset_request',
        '2fa_enabled', '2fa_disabled', '2fa_failed',
        'session_created', 'session_terminated', 'session_suspicious',
        'account_locked', 'account_unlocked',
        'api_key_created', 'api_key_revoked',
        'brute_force_detected', 'suspicious_activity'
      ],
      description: 'Event type'
    },
    severity: {
      type: 'string',
      enum: ['info', 'warning', 'critical'],
      description: 'Event severity'
    },
    details: { type: 'string', nullable: true, description: 'Event details (JSON)' },
    ipAddress: { type: 'string', nullable: true, description: 'Source IP address' },
    userAgent: { type: 'string', nullable: true, description: 'User agent' },
    location: { type: 'string', nullable: true, description: 'Geo location' },
    isResolved: { type: 'boolean', description: 'Whether event is resolved' },
    resolvedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Resolution timestamp' },
    resolvedBy: { type: 'string', nullable: true, description: 'Resolver user ID' },
    createdAt: { type: 'string', format: 'date-time', description: 'Event timestamp' }
  }
} as const;

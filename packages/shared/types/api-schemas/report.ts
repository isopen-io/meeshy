/**
 * Schémas d’API — signalements de modération.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/report
 */

import { userMinimalSchema } from './user.js';

// =============================================================================
// REPORT SCHEMAS
// =============================================================================

/**
 * Report schema for API responses
 */
export const reportSchema = {
  type: 'object',
  description: 'User or content report',
  properties: {
    id: { type: 'string', description: 'Report unique identifier' },
    reporterId: { type: 'string', description: 'Reporting user ID' },
    reportType: {
      type: 'string',
      enum: ['spam', 'harassment', 'inappropriate_content', 'impersonation', 'other'],
      description: 'Report type'
    },
    targetType: {
      type: 'string',
      enum: ['user', 'message', 'conversation', 'community'],
      description: 'Type of reported content'
    },
    targetId: { type: 'string', description: 'ID of reported content' },
    reason: { type: 'string', description: 'Detailed reason for report' },
    evidence: { type: 'string', nullable: true, description: 'Additional evidence (JSON)' },
    status: {
      type: 'string',
      enum: ['pending', 'investigating', 'resolved', 'dismissed'],
      description: 'Report status'
    },
    resolution: { type: 'string', nullable: true, description: 'Resolution notes' },
    resolvedBy: { type: 'string', nullable: true, description: 'Moderator who resolved' },
    resolvedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Resolution timestamp' },
    createdAt: { type: 'string', format: 'date-time', description: 'Report creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' },
    reporter: { ...userMinimalSchema, description: 'Reporter user info' }
  }
} as const;

/**
 * Create report request schema
 */
export const createReportRequestSchema = {
  type: 'object',
  required: ['reportType', 'targetType', 'targetId', 'reason'],
  properties: {
    reportType: {
      type: 'string',
      enum: ['spam', 'harassment', 'inappropriate_content', 'impersonation', 'other'],
      description: 'Type of report'
    },
    targetType: {
      type: 'string',
      enum: ['user', 'message', 'conversation', 'community'],
      description: 'Type of content being reported'
    },
    targetId: { type: 'string', description: 'ID of content being reported' },
    reason: { type: 'string', minLength: 10, maxLength: 1000, description: 'Detailed reason' },
    evidence: { type: 'string', maxLength: 5000, description: 'Additional evidence' }
  }
} as const;

import { z } from 'zod';

/**
 * Schémas de notification et de préférences de notification.
 * Extrait de `validation.ts` (#19037), qui le ré-exporte.
 */

// =============================================================================
// NOTIFICATION SCHEMAS
// =============================================================================

export { notificationTypeEnum } from './notification-type-enum.js';

/**
 * Priorité de notification
 */
export const notificationPriorityEnum = z.enum(['low', 'normal', 'high', 'urgent']);

/**
 * Schémas pour les préférences de notification
 */
export const NotificationPreferenceSchemas = {
  // Préférences complètes
  full: z.object({
    id: z.string(),
    userId: z.string(),

    // Global toggles
    pushEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    soundEnabled: z.boolean(),

    // Per-type
    newMessageEnabled: z.boolean(),
    missedCallEnabled: z.boolean(),
    systemEnabled: z.boolean(),
    conversationEnabled: z.boolean(),
    replyEnabled: z.boolean(),
    mentionEnabled: z.boolean(),
    reactionEnabled: z.boolean(),
    contactRequestEnabled: z.boolean(),
    memberJoinedEnabled: z.boolean(),

    // DND
    dndEnabled: z.boolean(),
    dndStartTime: z.string().nullable().optional(),
    dndEndTime: z.string().nullable().optional(),

    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),

  // Mise à jour des préférences
  update: z.object({
    pushEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    soundEnabled: z.boolean().optional(),
    newMessageEnabled: z.boolean().optional(),
    missedCallEnabled: z.boolean().optional(),
    systemEnabled: z.boolean().optional(),
    conversationEnabled: z.boolean().optional(),
    replyEnabled: z.boolean().optional(),
    mentionEnabled: z.boolean().optional(),
    reactionEnabled: z.boolean().optional(),
    contactRequestEnabled: z.boolean().optional(),
    memberJoinedEnabled: z.boolean().optional(),
    dndEnabled: z.boolean().optional(),
    // Canonical zero-padded HH:MM — same form enforced by the gateway
    // (notification-schemas, isValidDndTime) and the NotificationPreferenceSchema
    // default schema. A single-digit hour ("9:00") would break the lexicographic
    // window comparison in isWithinDnd, so it must be rejected at this boundary.
    dndStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
    dndEndTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  }),
};

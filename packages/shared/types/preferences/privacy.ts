/**
 * Privacy Preferences Schema
 * Paramètres de confidentialité et visibilité utilisateur
 */

import { z } from 'zod';

export const PrivacyPreferenceSchema = z.object({
  // Visibilité de l'utilisateur
  showOnlineStatus: z.boolean().default(true),
  showLastSeen: z.boolean().default(true),
  showReadReceipts: z.boolean().default(true),
  showTypingIndicator: z.boolean().default(true),

  // Contrôle des communications
  allowContactRequests: z.boolean().default(true),
  allowGroupInvites: z.boolean().default(true),
  allowCallsFromNonContacts: z.boolean().default(false),

  // Données et analytics
  saveMediaToGallery: z.boolean().default(false),
  allowAnalytics: z.boolean().default(true),
  shareUsageData: z.boolean().default(false),

  // Blocage et filtrage
  blockScreenshots: z.boolean().default(false),
  hideProfileFromSearch: z.boolean().default(false)
});

export type PrivacyPreference = z.infer<typeof PrivacyPreferenceSchema>;

export const PRIVACY_PREFERENCE_DEFAULTS: PrivacyPreference = {
  showOnlineStatus: true,
  showLastSeen: true,
  showReadReceipts: true,
  showTypingIndicator: true,
  allowContactRequests: true,
  allowGroupInvites: true,
  allowCallsFromNonContacts: false,
  saveMediaToGallery: false,
  allowAnalytics: true,
  shareUsageData: false,
  blockScreenshots: false,
  hideProfileFromSearch: false
};

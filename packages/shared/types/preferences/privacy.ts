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

  // Réciprocité de la source des transferts — OPT-OUT (défaut `true`).
  // Bilatérale : la source d'un transfert n'est servie que si son AUTEUR et
  // son LECTEUR l'autorisent tous deux. Un seul refus masque, dans les deux
  // sens : qui se cache ne voit pas. Porte le nom de l'auteur d'origine ET
  // celui du groupe public source.
  // Règle : `packages/shared/utils/forward-source-visibility.ts`.
  showForwardSource: z.boolean().default(true),

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
  hideProfileFromSearch: z.boolean().default(false),

  // Encryption et sécurité
  encryptionPreference: z.enum(['disabled', 'optional', 'always']).default('optional'),
  autoEncryptNewConversations: z.boolean().default(false),
  showEncryptionStatus: z.boolean().default(true),
  warnOnUnencrypted: z.boolean().default(false)
});

export type PrivacyPreference = z.infer<typeof PrivacyPreferenceSchema>;

export const PRIVACY_PREFERENCE_DEFAULTS: PrivacyPreference = {
  showOnlineStatus: true,
  showLastSeen: true,
  showReadReceipts: true,
  showTypingIndicator: true,
  showForwardSource: true,
  allowContactRequests: true,
  allowGroupInvites: true,
  allowCallsFromNonContacts: false,
  saveMediaToGallery: false,
  allowAnalytics: true,
  shareUsageData: false,
  blockScreenshots: false,
  hideProfileFromSearch: false,
  encryptionPreference: 'optional',
  autoEncryptNewConversations: false,
  showEncryptionStatus: true,
  warnOnUnencrypted: false
};

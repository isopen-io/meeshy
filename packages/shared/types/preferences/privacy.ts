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
  /**
   * `false` par défaut depuis #4578, et ce n'est pas un durcissement gratuit.
   *
   * Cette préférence est GARDÉE par `dataProcessingConsentAt`
   * (`ConsentValidationService.validatePrivacyPreferences`) et n'a AUCUN
   * lecteur d'usage dans le dépôt — mesuré : hors schémas, tests et interface,
   * les seules occurrences sont la garde elle-même. Sa valeur stockée est donc
   * la seule chose qui existe, et un défaut `true` faisait affirmer par le
   * système, pour un compte qui n'a rien consenti, exactement ce que la garde
   * refuse. L'état PAR DÉFAUT violait le modèle de consentement.
   *
   * Conséquence directe, mesurée sur staging : la catégorie `privacy`
   * était INACCESSIBLE à un compte neuf — un `PATCH {"profileVisibility":"private"}` était
   * refusé en nommant ce champ-ci.
   *
   * Un consentement s'accorde, il ne se présume pas : c'est aussi ce que le
   * RGPD attend d'un traitement analytique.
   */
  allowAnalytics: z.boolean().default(false),
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
  allowAnalytics: false,
  shareUsageData: false,
  blockScreenshots: false,
  hideProfileFromSearch: false,
  encryptionPreference: 'optional',
  autoEncryptNewConversations: false,
  showEncryptionStatus: true,
  warnOnUnencrypted: false
};

/**
 * Default values for user preferences
 * These values are returned when a user has no preferences stored yet
 * They are also used as the base for creating new preferences
 */

// ========== USER PREFERENCES DEFAULTS (Key-Value) ==========

export const USER_PREFERENCES_DEFAULTS: Record<string, { value: string; valueType: string; description: string }> = {
  // Theme & Appearance
  'theme': { value: 'system', valueType: 'string', description: 'Application theme (light, dark, system)' },
  'font-family': { value: 'inter', valueType: 'string', description: 'Font family for the application' },
  'font-size': { value: 'medium', valueType: 'string', description: 'Font size (small, medium, large)' },
  'compact-mode': { value: 'false', valueType: 'boolean', description: 'Enable compact UI mode' },

  // Privacy
  'show-online-status': { value: 'true', valueType: 'boolean', description: 'Show online status to others' },
  'show-last-seen': { value: 'true', valueType: 'boolean', description: 'Show last seen time to others' },
  'show-read-receipts': { value: 'true', valueType: 'boolean', description: 'Send read receipts' },
  'show-typing-indicator': { value: 'true', valueType: 'boolean', description: 'Show typing indicator' },
  'allow-contact-requests': { value: 'true', valueType: 'boolean', description: 'Allow contact requests from strangers' },
  'allow-group-invites': { value: 'true', valueType: 'boolean', description: 'Allow group invites from non-contacts' },
  'save-media-to-gallery': { value: 'false', valueType: 'boolean', description: 'Auto-save media to gallery' },
  'allow-analytics': { value: 'true', valueType: 'boolean', description: 'Allow anonymous usage analytics' },

  // Media
  'autoplay-videos': { value: 'true', valueType: 'boolean', description: 'Autoplay videos in chat' },
  'autoplay-gifs': { value: 'true', valueType: 'boolean', description: 'Autoplay GIFs in chat' },
  'auto-download-media': { value: 'wifi', valueType: 'string', description: 'Auto download media (wifi, always, never)' },
  'media-quality': { value: 'high', valueType: 'string', description: 'Media quality preference (low, medium, high)' },

  // Notifications
  'notifications-enabled': { value: 'true', valueType: 'boolean', description: 'Enable notifications' },
  'notification-sound': { value: 'true', valueType: 'boolean', description: 'Play notification sounds' },
  'notification-vibration': { value: 'true', valueType: 'boolean', description: 'Vibrate on notifications' },

  // Keyboard
  'enter-to-send': { value: 'true', valueType: 'boolean', description: 'Press Enter to send messages' },

  // Language
  'language': { value: 'fr', valueType: 'string', description: 'Application language' },
  'auto-translate': { value: 'false', valueType: 'boolean', description: 'Auto-translate messages' },
};

export const VALID_FONTS = [
  'inter', 'nunito', 'poppins', 'open-sans', 'lato',
  'comic-neue', 'lexend', 'roboto', 'geist-sans'
] as const;

export const VALID_THEMES = ['light', 'dark', 'system'] as const;
export const VALID_FONT_SIZES = ['small', 'medium', 'large'] as const;
export const VALID_MEDIA_QUALITY = ['low', 'medium', 'high'] as const;
export const VALID_AUTO_DOWNLOAD = ['wifi', 'always', 'never'] as const;

// ========== CONVERSATION PREFERENCES DEFAULTS ==========

/**
 * Every user-settable column of `UserConversationPreferences`, so that
 * spreading this constant produces a COMPLETE default snapshot — both for the
 * "no stored row" GET response and for the reset performed by
 * `DELETE /user-preferences/conversations/:id`. `version` is excluded on
 * purpose: it is protocol state (monotonic broadcast sequence), not a user
 * preference, and a reset must never roll it back.
 */
export interface ConversationPreferencesDefaults {
  isPinned: boolean;
  isMuted: boolean;
  mentionsOnly: boolean;
  isArchived: boolean;
  clearHistoryBefore: Date | null;
  tags: string[];
  categoryId: string | null;
  orderInCategory: number | null;
  customName: string | null;
  reaction: string | null;
  /** `ReadingModePreference` (`@meeshy/shared/types/reading-modes`) : `auto` rend la main à l'orchestrateur. */
  readingMode: string;
}

export const CONVERSATION_PREFERENCES_DEFAULTS: ConversationPreferencesDefaults = {
  isPinned: false,
  isMuted: false,
  mentionsOnly: false,
  isArchived: false,
  clearHistoryBefore: null,
  tags: [],
  categoryId: null,
  orderInCategory: null,
  customName: null,
  reaction: null,
  readingMode: 'auto',
};

// ========== COMMUNITY PREFERENCES DEFAULTS ==========

export interface CommunityPreferencesDefaults {
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  isHidden: boolean;
  notificationLevel: 'all' | 'mentions' | 'none';
  customName: string | null;
  categoryId: string | null;
  orderInCategory: number | null;
}

export const COMMUNITY_PREFERENCES_DEFAULTS: CommunityPreferencesDefaults = {
  isPinned: false,
  isMuted: false,
  isArchived: false,
  isHidden: false,
  notificationLevel: 'all',
  customName: null,
  categoryId: null,
  orderInCategory: null,
};

// ========== NOTIFICATION PREFERENCES DEFAULTS ==========

export interface NotificationPreferencesDefaults {
  // Global toggles
  pushEnabled: boolean;
  emailEnabled: boolean;
  soundEnabled: boolean;

  // Per-type preferences
  newMessageEnabled: boolean;
  missedCallEnabled: boolean;
  systemEnabled: boolean;
  conversationEnabled: boolean;
  replyEnabled: boolean;
  mentionEnabled: boolean;
  reactionEnabled: boolean;
  contactRequestEnabled: boolean;
  memberJoinedEnabled: boolean;

  // Do Not Disturb
  dndEnabled: boolean;
  dndStartTime: string | null;
  dndEndTime: string | null;
}

export const NOTIFICATION_PREFERENCES_DEFAULTS: NotificationPreferencesDefaults = {
  // Global toggles - all enabled by default
  pushEnabled: true,
  emailEnabled: true,
  soundEnabled: true,

  // Per-type preferences - all enabled by default
  newMessageEnabled: true,
  missedCallEnabled: true,
  systemEnabled: true,
  conversationEnabled: true,
  replyEnabled: true,
  mentionEnabled: true,
  reactionEnabled: true,
  contactRequestEnabled: true,
  memberJoinedEnabled: true,

  // Do Not Disturb - disabled by default
  dndEnabled: false,
  dndStartTime: null,
  dndEndTime: null,
};

/**
 * Create default notification preferences for a user
 */
export function createDefaultNotificationPreferences(
  userId: string
): NotificationPreferencesDefaults & { userId: string } {
  return {
    userId,
    ...NOTIFICATION_PREFERENCES_DEFAULTS
  };
}

/**
 * Validate DND time format (HH:MM)
 */
export function isValidDndTime(time: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

// ========== PRIVACY PREFERENCES DEFAULTS ==========

export interface PrivacyPreferencesDefaults {
  // Profile visibility
  showOnlineStatus: boolean;
  showLastSeen: boolean;
  showReadReceipts: boolean;
  showTypingIndicator: boolean;

  // Réciprocité de la source des transferts (opt-out, défaut `true`).
  // N'a JAMAIS eu de ligne kebab-case : elle est postérieure à la fenêtre de
  // janvier 2026, d'où son absence de `PRIVACY_KEY_MAPPING` ci-dessous.
  showForwardSource: boolean;

  // Contact settings
  allowContactRequests: boolean;
  allowGroupInvites: boolean;

  // Data settings
  saveMediaToGallery: boolean;
  allowAnalytics: boolean;
}

export const PRIVACY_PREFERENCES_DEFAULTS: PrivacyPreferencesDefaults = {
  // Profile visibility - all enabled by default
  showOnlineStatus: true,
  showLastSeen: true,
  showReadReceipts: true,
  showTypingIndicator: true,

  // Réciprocité de la source des transferts : on AUTORISE par défaut — c'est
  // un opt-out. Un défaut `false` masquerait d'un coup la provenance de tous
  // les transferts du parc, la production ne jouant aucune migration.
  showForwardSource: true,

  // Contact settings - all enabled by default
  allowContactRequests: true,
  allowGroupInvites: true,

  // Data settings
  saveMediaToGallery: false, // disabled by default for privacy
  allowAnalytics: true,
};

/**
 * Les huit clés que l'endpoint `/user-preferences/privacy` a écrites en
 * kebab-case du 12 au 18 janvier 2026, avant son retrait sans reprise de
 * données. Cet ensemble est FIGÉ par l'histoire : aucune préférence créée
 * après cette fenêtre n'a de ligne héritée à retrouver.
 *
 * Il ne dit donc PAS quelles clés le serveur obéit — c'est
 * `PRIVACY_PREFERENCES_DEFAULTS` qui le dit. Les avoir confondus a coûté :
 * `privacy-storage` dérivait d'ici les clés qu'il retenait du document JSON,
 * si bien qu'une préférence neuve était écrite, ré-affichée par son écran, et
 * jetée par toutes les portes de diffusion. Voir
 * `__tests__/unit/services/preferences/forward-source-preference-storage.test.ts`.
 */
export type LegacyPrivacyKey = Extract<
  keyof PrivacyPreferencesDefaults,
  | 'showOnlineStatus'
  | 'showLastSeen'
  | 'showReadReceipts'
  | 'showTypingIndicator'
  | 'allowContactRequests'
  | 'allowGroupInvites'
  | 'saveMediaToGallery'
  | 'allowAnalytics'
>;

/**
 * Mapping between camelCase frontend keys and kebab-case database keys
 */
export const PRIVACY_KEY_MAPPING: Record<LegacyPrivacyKey, string> = {
  showOnlineStatus: 'show-online-status',
  showLastSeen: 'show-last-seen',
  showReadReceipts: 'show-read-receipts',
  showTypingIndicator: 'show-typing-indicator',
  allowContactRequests: 'allow-contact-requests',
  allowGroupInvites: 'allow-group-invites',
  saveMediaToGallery: 'save-media-to-gallery',
  allowAnalytics: 'allow-analytics',
};

/**
 * Reverse mapping for database to frontend
 */
export const PRIVACY_KEY_REVERSE_MAPPING: Record<string, LegacyPrivacyKey> = Object.fromEntries(
  Object.entries(PRIVACY_KEY_MAPPING).map(([k, v]) => [v, k as LegacyPrivacyKey])
) as Record<string, LegacyPrivacyKey>;

// ========== HELPER FUNCTIONS ==========

/**
 * Get default value for a specific user preference key
 */
export function getDefaultUserPreference(key: string): { value: string; valueType: string } | null {
  const pref = USER_PREFERENCES_DEFAULTS[key];
  if (!pref) return null;
  return { value: pref.value, valueType: pref.valueType };
}

/**
 * Get all default user preferences as an array
 */
export function getAllDefaultUserPreferences(): Array<{ key: string; value: string; valueType: string; description: string }> {
  return Object.entries(USER_PREFERENCES_DEFAULTS).map(([key, pref]) => ({
    key,
    ...pref
  }));
}

/**
 * Create a default conversation preferences object with IDs
 */
export function createDefaultConversationPreferences(
  userId: string,
  conversationId: string
): ConversationPreferencesDefaults & { userId: string; conversationId: string } {
  return {
    userId,
    conversationId,
    ...CONVERSATION_PREFERENCES_DEFAULTS
  };
}

/**
 * Create a default community preferences object with IDs
 */
export function createDefaultCommunityPreferences(
  userId: string,
  communityId: string
): CommunityPreferencesDefaults & { userId: string; communityId: string } {
  return {
    userId,
    communityId,
    ...COMMUNITY_PREFERENCES_DEFAULTS
  };
}

/**
 * Validate font family
 */
export function isValidFont(font: string): boolean {
  return VALID_FONTS.includes(font as any);
}

/**
 * Validate preference value based on key
 */
export function validatePreferenceValue(key: string, value: string): { valid: boolean; error?: string } {
  switch (key) {
    case 'font-family':
      if (!isValidFont(value)) {
        return { valid: false, error: `Police non valide. Options: ${VALID_FONTS.join(', ')}` };
      }
      break;
    case 'theme':
      if (!VALID_THEMES.includes(value as any)) {
        return { valid: false, error: `Thème non valide. Options: ${VALID_THEMES.join(', ')}` };
      }
      break;
    case 'font-size':
      if (!VALID_FONT_SIZES.includes(value as any)) {
        return { valid: false, error: `Taille de police non valide. Options: ${VALID_FONT_SIZES.join(', ')}` };
      }
      break;
    case 'media-quality':
      if (!VALID_MEDIA_QUALITY.includes(value as any)) {
        return { valid: false, error: `Qualité média non valide. Options: ${VALID_MEDIA_QUALITY.join(', ')}` };
      }
      break;
    case 'auto-download-media':
      if (!VALID_AUTO_DOWNLOAD.includes(value as any)) {
        return { valid: false, error: `Option de téléchargement non valide. Options: ${VALID_AUTO_DOWNLOAD.join(', ')}` };
      }
      break;
  }
  return { valid: true };
}

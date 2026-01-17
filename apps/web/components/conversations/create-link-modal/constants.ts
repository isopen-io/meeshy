/**
 * Constants for the Create Link Modal
 * Extracted from create-link-modal.tsx for better organization
 */

// Duration options with translation keys
export const DURATION_OPTIONS = [
  { value: 1, labelKey: 'createLinkModal.durationOptions.1.label', descriptionKey: 'createLinkModal.durationOptions.1.description' },
  { value: 3, labelKey: 'createLinkModal.durationOptions.3.label', descriptionKey: 'createLinkModal.durationOptions.3.description' },
  { value: 7, labelKey: 'createLinkModal.durationOptions.7.label', descriptionKey: 'createLinkModal.durationOptions.7.description' },
  { value: 14, labelKey: 'createLinkModal.durationOptions.14.label', descriptionKey: 'createLinkModal.durationOptions.14.description' },
  { value: 30, labelKey: 'createLinkModal.durationOptions.30.label', descriptionKey: 'createLinkModal.durationOptions.30.description' },
  { value: 60, labelKey: 'createLinkModal.durationOptions.60.label', descriptionKey: 'createLinkModal.durationOptions.60.description' },
  { value: 90, labelKey: 'createLinkModal.durationOptions.90.label', descriptionKey: 'createLinkModal.durationOptions.90.description' },
  { value: 180, labelKey: 'createLinkModal.durationOptions.180.label', descriptionKey: 'createLinkModal.durationOptions.180.description' },
  { value: 365, labelKey: 'createLinkModal.durationOptions.365.label', descriptionKey: 'createLinkModal.durationOptions.365.description' },
  { value: 730, labelKey: 'createLinkModal.durationOptions.730.label', descriptionKey: 'createLinkModal.durationOptions.730.description' }
] as const;

// Limit options with translation keys
export const LIMIT_OPTIONS = [
  { value: undefined, labelKey: 'createLinkModal.limitOptions.unlimited.label', descriptionKey: 'createLinkModal.limitOptions.unlimited.description' },
  { value: 5, labelKey: 'createLinkModal.limitOptions.5.label', descriptionKey: 'createLinkModal.limitOptions.5.description' },
  { value: 10, labelKey: 'createLinkModal.limitOptions.10.label', descriptionKey: 'createLinkModal.limitOptions.10.description' },
  { value: 25, labelKey: 'createLinkModal.limitOptions.25.label', descriptionKey: 'createLinkModal.limitOptions.25.description' },
  { value: 50, labelKey: 'createLinkModal.limitOptions.50.label', descriptionKey: 'createLinkModal.limitOptions.50.description' },
  { value: 100, labelKey: 'createLinkModal.limitOptions.100.label', descriptionKey: 'createLinkModal.limitOptions.100.description' },
  { value: 250, labelKey: 'createLinkModal.limitOptions.250.label', descriptionKey: 'createLinkModal.limitOptions.250.description' },
  { value: 500, labelKey: 'createLinkModal.limitOptions.500.label', descriptionKey: 'createLinkModal.limitOptions.500.description' },
  { value: 1000, labelKey: 'createLinkModal.limitOptions.1000.label', descriptionKey: 'createLinkModal.limitOptions.1000.description' },
  { value: 5000, labelKey: 'createLinkModal.limitOptions.5000.label', descriptionKey: 'createLinkModal.limitOptions.5000.description' }
] as const;

// Default values for link settings
export const DEFAULT_LINK_SETTINGS = {
  expirationDays: 7,
  maxUses: undefined,
  maxConcurrentUsers: undefined,
  maxUniqueSessions: undefined,
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: true,
  allowViewHistory: true,
  requireAccount: false,
  requireNickname: true,
  requireEmail: false,
  requireBirthday: false,
  allowedLanguages: [] as string[],
} as const;

export const TOTAL_WIZARD_STEPS = 3;

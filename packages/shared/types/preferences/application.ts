/**
 * Application Preferences Schema
 * Thème, langue interface, UI générale
 */

import { z } from 'zod';

export const ApplicationPreferenceSchema = z.object({
  // Thème
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  accentColor: z.string().default('blue'),

  // Langue de l'interface uniquement (les langues de traduction sont dans User)
  interfaceLanguage: z.string().default('en'),

  // UI Settings
  fontSize: z.enum(['small', 'medium', 'large']).default('medium'),
  fontFamily: z.string().default('inter'),
  lineHeight: z.enum(['tight', 'normal', 'relaxed', 'loose']).default('normal'),

  // Layout
  compactMode: z.boolean().default(false),
  sidebarPosition: z.enum(['left', 'right']).default('left'),
  showAvatars: z.boolean().default(true),

  // Animations
  animationsEnabled: z.boolean().default(true),
  reducedMotion: z.boolean().default(false),

  // Accessibilité
  highContrastMode: z.boolean().default(false),
  screenReaderOptimized: z.boolean().default(false),
  keyboardShortcutsEnabled: z.boolean().default(true),

  // Expérience
  tutorialsCompleted: z.array(z.string()).default([]),
  betaFeaturesEnabled: z.boolean().default(false),
  telemetryEnabled: z.boolean().default(true)
});

export type ApplicationPreference = z.infer<typeof ApplicationPreferenceSchema>;

export const APPLICATION_PREFERENCE_DEFAULTS: ApplicationPreference = {
  theme: 'auto',
  accentColor: 'blue',
  interfaceLanguage: 'en',
  fontSize: 'medium',
  fontFamily: 'inter',
  lineHeight: 'normal',
  compactMode: false,
  sidebarPosition: 'left',
  showAvatars: true,
  animationsEnabled: true,
  reducedMotion: false,
  highContrastMode: false,
  screenReaderOptimized: false,
  keyboardShortcutsEnabled: true,
  tutorialsCompleted: [],
  betaFeaturesEnabled: false,
  telemetryEnabled: true
};

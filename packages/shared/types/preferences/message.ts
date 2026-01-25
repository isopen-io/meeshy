/**
 * Message Preferences Schema
 * Paramètres d'envoi/réception de messages texte
 */

import { z } from 'zod';

export const MessagePreferenceSchema = z.object({
  // Composition
  sendOnEnter: z.boolean().default(true),
  showFormattingToolbar: z.boolean().default(true),
  enableMarkdown: z.boolean().default(true),
  enableEmoji: z.boolean().default(true),
  emojiSkinTone: z
    .enum(['default', 'light', 'medium-light', 'medium', 'medium-dark', 'dark'])
    .default('default'),

  // Auto-corrections
  autoCorrectEnabled: z.boolean().default(false),
  spellCheckEnabled: z.boolean().default(true),

  // Prévisualisation
  linkPreviewEnabled: z.boolean().default(true),
  imagePreviewEnabled: z.boolean().default(true),

  // Historique
  saveDrafts: z.boolean().default(true),
  draftExpirationDays: z.number().min(1).max(90).default(30),

  // Formatage par défaut
  defaultFontSize: z.enum(['small', 'medium', 'large']).default('medium'),
  defaultTextAlign: z.enum(['left', 'center', 'right']).default('left'),

  // Traduction automatique
  autoTranslateIncoming: z.boolean().default(false),
  autoTranslateLanguages: z.array(z.string()).default([]),

  // Limites
  maxCharacterLimit: z.number().min(100).max(10000).default(5000)
});

export type MessagePreference = z.infer<typeof MessagePreferenceSchema>;

export const MESSAGE_PREFERENCE_DEFAULTS: MessagePreference = {
  sendOnEnter: true,
  showFormattingToolbar: true,
  enableMarkdown: true,
  enableEmoji: true,
  emojiSkinTone: 'default',
  autoCorrectEnabled: false,
  spellCheckEnabled: true,
  linkPreviewEnabled: true,
  imagePreviewEnabled: true,
  saveDrafts: true,
  draftExpirationDays: 30,
  defaultFontSize: 'medium',
  defaultTextAlign: 'left',
  autoTranslateIncoming: false,
  autoTranslateLanguages: [],
  maxCharacterLimit: 5000
};

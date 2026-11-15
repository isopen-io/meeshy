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
  maxCharacterLimit: z.number().min(100).max(10000).default(5000),

  /**
   * Le canal de COMPATIBILITÉ ASCENDANTE, déclaré (#4589).
   *
   * Les sept blocs de préférences du SDK iOS le portent
   * (`PreferenceModels.swift`), et iOS encode le bloc ENTIER comme corps de
   * requête (`UserPreferencesManager`, `try encoder.encode(privacy)`). Il
   * arrivait donc sur chaque écriture, et le mode *strip* de Zod le retirait :
   * mesuré sur staging le 2026-08-31, un `PATCH {"extras":{"sonde":"4589"}}`
   * rendait `success: true` et la relecture ne rendait RIEN. Le canal de
   * compatibilité ascendante d'iOS n'a jamais fonctionné.
   *
   * Le déclarer a deux effets, et le second est celui qui compte : il rend au
   * client son aller-retour, et il permet à la frontière de REFUSER tout le
   * reste (`.strict()` dans `submittedFrom`) sans casser les trois clients.
   * Une porte de sortie nommée est ce qui autorise à fermer les autres.
   *
   * Facultatif et SANS défaut : il ne doit apparaître dans un document servi
   * que si quelque chose y a été stocké — sinon les sept catégories gagneraient
   * un `extras: {}` que ni le web ni Android n'attendent.
   */
  extras: z.record(z.string(), z.unknown()).optional(),
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

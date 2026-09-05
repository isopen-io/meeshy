/**
 * Notification Preferences Schema
 * Notifications push, email, sons, DND
 */

import { z } from 'zod';

export const NotificationPreferenceSchema = z.object({
  // Canaux de notification
  pushEnabled: z.boolean().default(true),
  emailEnabled: z.boolean().default(true),
  soundEnabled: z.boolean().default(true),
  vibrationEnabled: z.boolean().default(true),

  // Types de notifications
  newMessageEnabled: z.boolean().default(true),
  missedCallEnabled: z.boolean().default(true),
  // Appels entrants (VoIP/CallKit + pushes de gestion call_*) — catégorie
  // produit distincte : `pushEnabled:false` ne coupe JAMAIS les appels
  // (parité FaceTime/WhatsApp/Signal). Seul ce toggle les gouverne.
  callsEnabled: z.boolean().default(true),
  voicemailEnabled: z.boolean().default(true),
  systemEnabled: z.boolean().default(true),
  conversationEnabled: z.boolean().default(true),
  replyEnabled: z.boolean().default(true),
  mentionEnabled: z.boolean().default(true),
  reactionEnabled: z.boolean().default(true),
  contactRequestEnabled: z.boolean().default(true),
  groupInviteEnabled: z.boolean().default(true),
  memberJoinedEnabled: z.boolean().default(true),
  memberLeftEnabled: z.boolean().default(true),

  // Social / Post notifications
  postLikeEnabled: z.boolean().default(true),
  postCommentEnabled: z.boolean().default(true),
  postRepostEnabled: z.boolean().default(true),
  storyReactionEnabled: z.boolean().default(true),
  commentReplyEnabled: z.boolean().default(true),
  commentLikeEnabled: z.boolean().default(true),
  friendContentEnabled: z.boolean().default(true),

  // Do Not Disturb
  dndEnabled: z.boolean().default(false),
  dndStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).default('22:00'),
  dndEndTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).default('08:00'),
  dndDays: z
    .array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']))
    .default([]),
  // GW7 — minutes à AJOUTER à l'UTC pour obtenir l'heure locale de
  // l'utilisateur (Tokyo = 540, New York été = -240). 0 = fenêtre évaluée en
  // UTC (comportement historique des documents existants).
  dndUtcOffsetMinutes: z.number().int().min(-720).max(840).default(0),

  // Prévisualisation
  showPreview: z.boolean().default(true),
  showSenderName: z.boolean().default(true),

  // Groupement
  groupNotifications: z.boolean().default(true),
  notificationBadgeEnabled: z.boolean().default(true),

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

export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>;

export const NOTIFICATION_PREFERENCE_DEFAULTS: NotificationPreference = {
  pushEnabled: true,
  emailEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  newMessageEnabled: true,
  missedCallEnabled: true,
  callsEnabled: true,
  voicemailEnabled: true,
  systemEnabled: true,
  conversationEnabled: true,
  replyEnabled: true,
  mentionEnabled: true,
  reactionEnabled: true,
  contactRequestEnabled: true,
  groupInviteEnabled: true,
  memberJoinedEnabled: true,
  memberLeftEnabled: true,
  postLikeEnabled: true,
  postCommentEnabled: true,
  postRepostEnabled: true,
  storyReactionEnabled: true,
  commentReplyEnabled: true,
  commentLikeEnabled: true,
  friendContentEnabled: true,
  dndEnabled: false,
  dndStartTime: '22:00',
  dndEndTime: '08:00',
  dndDays: [],
  dndUtcOffsetMinutes: 0,
  showPreview: true,
  showSenderName: true,
  groupNotifications: true,
  notificationBadgeEnabled: true
};

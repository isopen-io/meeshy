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
  voicemailEnabled: z.boolean().default(true),
  systemEnabled: z.boolean().default(true),
  conversationEnabled: z.boolean().default(true),
  replyEnabled: z.boolean().default(true),
  mentionEnabled: z.boolean().default(true),
  reactionEnabled: z.boolean().default(true),
  contactRequestEnabled: z.boolean().default(true),
  groupInviteEnabled: z.boolean().default(true),
  memberJoinedEnabled: z.boolean().default(true),
  memberLeftEnabled: z.boolean().default(false),

  // Social / Post notifications
  postLikeEnabled: z.boolean().default(true),
  postCommentEnabled: z.boolean().default(true),
  postRepostEnabled: z.boolean().default(true),
  storyReactionEnabled: z.boolean().default(true),
  commentReplyEnabled: z.boolean().default(true),
  commentLikeEnabled: z.boolean().default(false),

  // Do Not Disturb
  dndEnabled: z.boolean().default(false),
  dndStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).default('22:00'),
  dndEndTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).default('08:00'),
  dndDays: z
    .array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']))
    .default([]),

  // Prévisualisation
  showPreview: z.boolean().default(true),
  showSenderName: z.boolean().default(true),

  // Groupement
  groupNotifications: z.boolean().default(true),
  notificationBadgeEnabled: z.boolean().default(true)
});

export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>;

export const NOTIFICATION_PREFERENCE_DEFAULTS: NotificationPreference = {
  pushEnabled: true,
  emailEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  newMessageEnabled: true,
  missedCallEnabled: true,
  voicemailEnabled: true,
  systemEnabled: true,
  conversationEnabled: true,
  replyEnabled: true,
  mentionEnabled: true,
  reactionEnabled: true,
  contactRequestEnabled: true,
  groupInviteEnabled: true,
  memberJoinedEnabled: true,
  memberLeftEnabled: false,
  postLikeEnabled: true,
  postCommentEnabled: true,
  postRepostEnabled: true,
  storyReactionEnabled: true,
  commentReplyEnabled: true,
  commentLikeEnabled: false,
  dndEnabled: false,
  dndStartTime: '22:00',
  dndEndTime: '08:00',
  dndDays: [],
  showPreview: true,
  showSenderName: true,
  groupNotifications: true,
  notificationBadgeEnabled: true
};

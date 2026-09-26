/**
 * Préférences de notifications — les types et les règles d'envoi.
 *
 * Extrait de `notification.ts` (budget de taille, #4532), qui le réexporte :
 * les imports existants ne changent pas.
 */

import type { NotificationType } from './notification.js';

/**
 * Préférences de notifications utilisateur
 */
export interface NotificationPreference {
  readonly id: string;
  readonly userId: string;

  // === GLOBAL SETTINGS ===
  readonly pushEnabled: boolean;
  readonly emailEnabled: boolean;
  readonly soundEnabled: boolean;

  // === PER-TYPE SETTINGS ===
  readonly newMessageEnabled: boolean;
  readonly missedCallEnabled: boolean;
  readonly systemEnabled: boolean;
  readonly conversationEnabled: boolean;
  readonly replyEnabled: boolean;
  readonly mentionEnabled: boolean;
  readonly reactionEnabled: boolean;
  readonly contactRequestEnabled: boolean;
  readonly memberJoinedEnabled: boolean;

  // === DO NOT DISTURB ===
  readonly dndEnabled: boolean;
  readonly dndStartTime?: string;
  readonly dndEndTime?: string;

  // === MUTED CONVERSATIONS ===
  readonly mutedConversations?: readonly string[];

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * DTO pour créer des préférences
 */
export interface CreateNotificationPreferenceDTO {
  readonly userId: string;
  readonly pushEnabled?: boolean;
  readonly emailEnabled?: boolean;
  readonly soundEnabled?: boolean;
  readonly newMessageEnabled?: boolean;
  readonly missedCallEnabled?: boolean;
  readonly systemEnabled?: boolean;
  readonly conversationEnabled?: boolean;
  readonly replyEnabled?: boolean;
  readonly mentionEnabled?: boolean;
  readonly reactionEnabled?: boolean;
  readonly contactRequestEnabled?: boolean;
  readonly memberJoinedEnabled?: boolean;
  readonly dndEnabled?: boolean;
  readonly dndStartTime?: string;
  readonly dndEndTime?: string;
}

/**
 * DTO pour mettre à jour des préférences
 */
export interface UpdateNotificationPreferenceDTO {
  readonly pushEnabled?: boolean;
  readonly emailEnabled?: boolean;
  readonly soundEnabled?: boolean;
  readonly newMessageEnabled?: boolean;
  readonly missedCallEnabled?: boolean;
  readonly systemEnabled?: boolean;
  readonly conversationEnabled?: boolean;
  readonly replyEnabled?: boolean;
  readonly mentionEnabled?: boolean;
  readonly reactionEnabled?: boolean;
  readonly contactRequestEnabled?: boolean;
  readonly memberJoinedEnabled?: boolean;
  readonly dndEnabled?: boolean;
  readonly dndStartTime?: string;
  readonly dndEndTime?: string;
}


/**
 * Vérifie si le mode DND est actif
 */
export function isDNDActive(prefs: NotificationPreference): boolean {
  if (!prefs.dndEnabled) {
    return false;
  }

  if (!prefs.dndStartTime || !prefs.dndEndTime) {
    return prefs.dndEnabled;
  }

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const start = prefs.dndStartTime;
  const end = prefs.dndEndTime;

  // Handle overnight DND (e.g., 22:00 - 08:00)
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }

  // Normal DND (e.g., 14:00 - 16:00)
  return currentTime >= start && currentTime < end;
}

/**
 * Vérifie si un type de notification est activé
 */
export function isNotificationTypeEnabled(
  prefs: NotificationPreference,
  type: NotificationType | string
): boolean {
  switch (type) {
    case 'new_message':
      return prefs.newMessageEnabled;
    case 'missed_call':
      return prefs.missedCallEnabled;
    case 'system':
    case 'security_alert':
      return prefs.systemEnabled;
    case 'new_conversation':
      return prefs.conversationEnabled;
    case 'reply':
      return prefs.replyEnabled;
    case 'mention':
    case 'user_mentioned':
      return prefs.mentionEnabled;
    case 'reaction':
    case 'message_reaction':
      return prefs.reactionEnabled;
    case 'contact_request':
    case 'friend_request':
    case 'contact_accepted':
    case 'contact_joined':
      return prefs.contactRequestEnabled;
    case 'member_joined':
    case 'member_left':
      return prefs.memberJoinedEnabled;
    default:
      return true;
  }
}

/**
 * Détermine si une notification doit être envoyée
 */
export function shouldSendNotification(
  prefs: NotificationPreference,
  type: NotificationType | string,
  channel: 'push' | 'email'
): boolean {
  if (channel === 'push' && !prefs.pushEnabled) {
    return false;
  }
  if (channel === 'email' && !prefs.emailEnabled) {
    return false;
  }

  if (!isNotificationTypeEnabled(prefs, type)) {
    return false;
  }

  if (type !== 'security_alert' && isDNDActive(prefs)) {
    return false;
  }

  return true;
}

/**
 * Crée les préférences par défaut
 */
export function getDefaultNotificationPreferences(userId: string): CreateNotificationPreferenceDTO {
  return {
    userId,
    pushEnabled: true,
    emailEnabled: true,
    soundEnabled: true,
    newMessageEnabled: true,
    missedCallEnabled: true,
    systemEnabled: true,
    conversationEnabled: true,
    replyEnabled: true,
    mentionEnabled: true,
    reactionEnabled: true,
    contactRequestEnabled: true,
    memberJoinedEnabled: true,
    dndEnabled: false,
  };
}

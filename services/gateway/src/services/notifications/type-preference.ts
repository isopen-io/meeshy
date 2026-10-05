/**
 * Quel réglage de RÉCEPTION gouverne un type de notification — extrait de
 * `NotificationService.ts` (hors budget de taille) pour qu'un type neuf
 * s'y ajoute sans grossir le service (#8285).
 *
 * Les réglages postérieurs au document historique (`postLikeEnabled`,
 * `contactActivityEnabled`…) se lisent avec `?? true` : un document écrit
 * avant leur naissance ne les porte pas, et l'absence vaut « reçu ».
 */

import type { NotificationType } from '@meeshy/shared/types/notification';
import type { NotificationPreference } from '@meeshy/shared/types/preferences';

export function isNotificationTypeEnabledByPreference(
  prefs: NotificationPreference,
  type: NotificationType
): boolean {
  switch (type) {
    case 'new_message':       return prefs.newMessageEnabled;
    case 'missed_call':       return prefs.missedCallEnabled;
    case 'system':            return prefs.systemEnabled;
    case 'user_mentioned':
    case 'mention':           return prefs.mentionEnabled;
    case 'message_reaction':
    case 'reaction':          return prefs.reactionEnabled;
    case 'contact_request':
    case 'contact_accepted':
    case 'friend_request':
    case 'friend_accepted':
    case 'contact_joined':    return prefs.contactRequestEnabled;
    case 'contact_recently_active': return prefs.contactActivityEnabled ?? true;
    case 'member_joined':     return prefs.memberJoinedEnabled;
    case 'message_reply':
    case 'reply':             return prefs.replyEnabled;
    case 'translation_ready': return true; // toujours activé
    case 'post_like':         return prefs.postLikeEnabled ?? true;
    case 'post_comment':      return prefs.postCommentEnabled ?? true;
    case 'post_repost':       return prefs.postRepostEnabled ?? true;
    case 'story_reaction':    return prefs.storyReactionEnabled ?? true;
    case 'status_reaction':   return prefs.storyReactionEnabled ?? true;
    case 'comment_like':
    case 'comment_reaction':  return prefs.commentLikeEnabled ?? true;
    case 'comment_reply':     return prefs.commentReplyEnabled ?? true;
    case 'story_new_comment':
    case 'friend_story_comment':
    case 'story_thread_reply': return prefs.postCommentEnabled ?? true;
    case 'friend_new_post':
    case 'friend_new_story':
    case 'friend_new_mood':   return prefs.friendContentEnabled ?? true;
    case 'new_conversation_direct':
    case 'new_conversation_group':
    case 'new_conversation':
    case 'added_to_conversation':
    case 'removed_from_conversation': return prefs.conversationEnabled;
    case 'community_invite':      return prefs.groupInviteEnabled;
    case 'member_removed':
    case 'member_left':
    case 'member_promoted':
    case 'member_demoted':
    case 'member_role_changed':   return prefs.memberLeftEnabled;
    case 'password_changed':
    case 'two_factor_enabled':
    case 'two_factor_disabled':
    case 'login_new_device':      return true; // sécurité = toujours actif
    default:                  return true;
  }
}

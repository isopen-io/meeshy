/**
 * Utilitaires pour les notifications
 * Utilise directement les données du backend sans reformatage
 * Intègre les traductions i18n pour les titres et contenus
 */

import {
  NotificationTypeEnum,
  type NotificationType,
  type Notification,
  type NotificationIcon
} from '@/types/notification';
import { getUserDisplayName } from './user-display-name';

// Type pour la fonction de traduction
type TranslateFunction = (key: string, params?: Record<string, string>) => string;

/**
 * Accent « non-lu » des notifications — source UNIQUE.
 * Le thème est monochrome (token `accent` = gris) ; on porte ici le sens
 * « nouveau » via un bleu sobre, réutilisé par le rail, le badge cloche et
 * l'action « marquer lu ». Centralisé pour éviter toute divergence.
 */
export const NOTIFICATION_ACCENT = {
  rail: 'border-blue-600 dark:border-blue-400',
  badge: 'bg-blue-600 text-white dark:bg-blue-500',
  ring: 'ring-blue-500',
  text: 'text-blue-600 dark:text-blue-400',
} as const;

/**
 * Configuration des icônes et couleurs par type de notification
 */
export const NOTIFICATION_ICONS: Record<NotificationType, NotificationIcon> = {
  [NotificationTypeEnum.NEW_MESSAGE]: {
    emoji: '💬',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50'
  },
  [NotificationTypeEnum.MESSAGE_REPLY]: {
    emoji: '↩️',
    color: 'text-blue-400',
    bgColor: 'bg-blue-50'
  },
  [NotificationTypeEnum.USER_MENTIONED]: {
    emoji: '@',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50'
  },
  [NotificationTypeEnum.MESSAGE_REACTION]: {
    emoji: '❤️',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50'
  },
  [NotificationTypeEnum.CONTACT_REQUEST]: {
    emoji: '🤝',
    color: 'text-green-600',
    bgColor: 'bg-green-50'
  },
  [NotificationTypeEnum.CONTACT_ACCEPTED]: {
    emoji: '✅',
    color: 'text-green-400',
    bgColor: 'bg-green-50'
  },
  [NotificationTypeEnum.NEW_CONVERSATION_DIRECT]: {
    emoji: '👤',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50'
  },
  [NotificationTypeEnum.NEW_CONVERSATION_GROUP]: {
    emoji: '👥',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50'
  },
  [NotificationTypeEnum.MEMBER_JOINED]: {
    emoji: '👋',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50'
  },
  [NotificationTypeEnum.MISSED_CALL]: {
    emoji: '📞',
    color: 'text-red-600',
    bgColor: 'bg-red-50'
  },
  [NotificationTypeEnum.SYSTEM]: {
    emoji: '🔔',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50'
  }
};

/**
 * Retourne l'icône pour une notification
 */
export function getNotificationIcon(notification: Notification): NotificationIcon {
  return NOTIFICATION_ICONS[notification.type] || NOTIFICATION_ICONS[NotificationTypeEnum.SYSTEM];
}

/**
 * Retourne la couleur de bordure pour le toast selon le type de notification
 */
export function getNotificationBorderColor(notification: Notification): string {
  const borderColors: Record<NotificationType, string> = {
    [NotificationTypeEnum.NEW_MESSAGE]: 'border-l-blue-500',
    [NotificationTypeEnum.MESSAGE_REPLY]: 'border-l-blue-400',
    [NotificationTypeEnum.USER_MENTIONED]: 'border-l-orange-500',
    [NotificationTypeEnum.MESSAGE_REACTION]: 'border-l-pink-500',
    [NotificationTypeEnum.CONTACT_REQUEST]: 'border-l-green-500',
    [NotificationTypeEnum.CONTACT_ACCEPTED]: 'border-l-green-400',
    [NotificationTypeEnum.NEW_CONVERSATION_DIRECT]: 'border-l-blue-500',
    [NotificationTypeEnum.NEW_CONVERSATION_GROUP]: 'border-l-purple-500',
    [NotificationTypeEnum.MEMBER_JOINED]: 'border-l-indigo-500',
    [NotificationTypeEnum.MISSED_CALL]: 'border-l-red-500',
    [NotificationTypeEnum.SYSTEM]: 'border-l-gray-500'
  };

  return borderColors[notification.type] || 'border-l-blue-500';
}

/**
 * Formate l'aperçu du message avec attachments
 */
export function formatMessagePreview(content: string, attachments?: any[]): string {
  if (attachments && attachments.length > 0) {
    const count = attachments.length;
    const type = attachments[0].mimeType?.startsWith('image/') ? '📷 Photo' : '📎 Fichier';
    return count > 1 ? `${type} (${count})` : type;
  }
  return content;
}

/**
 * Types ami/contact qui pointent vers la page contacts
 */
const FRIEND_CONTACT_TYPES = new Set<string>([
  NotificationTypeEnum.FRIEND_REQUEST,
  NotificationTypeEnum.FRIEND_ACCEPTED,
  NotificationTypeEnum.CONTACT_REQUEST,
  NotificationTypeEnum.CONTACT_ACCEPTED,
  NotificationTypeEnum.CONTACT_REJECTED,
  NotificationTypeEnum.CONTACT_BLOCKED,
  NotificationTypeEnum.CONTACT_UNBLOCKED,
]);

/**
 * Résout la route de base d'un contenu social (post/story/mood).
 * Priorité au discriminant `metadata.contentType` (friend_new_*), sinon
 * dérivé du type de notification, défaut `/post`.
 */
function resolveContentRoute(notification: Notification): '/post' | '/story' | '/mood' | '/reel' {
  // Le discriminant de cible vit dans metadata : `postType` (post_like/post_comment…)
  // ou `contentType` (friend_new_*). On lit les deux.
  const meta = notification.metadata as any;
  const kind = (meta?.contentType ?? meta?.postType) as string | undefined;
  if (kind === 'STORY') return '/story';
  if (kind === 'MOOD' || kind === 'STATUS') return '/mood';
  if (kind === 'REEL') return '/reel';
  if (kind === 'POST') return '/post';

  const type = notification.type;
  if (typeof type === 'string') {
    if (type === NotificationTypeEnum.STATUS_REACTION || type === NotificationTypeEnum.FRIEND_NEW_MOOD) return '/mood';
    if (type === NotificationTypeEnum.FRIEND_NEW_STORY || type.startsWith('story')) return '/story';
  }
  return '/post';
}

/**
 * Retourne le lien de navigation pour une notification.
 * Couvre conversations, contenu social (post/story/mood + ancre commentaire)
 * et amis/contacts. Source unique réutilisée par les toasts, le dropdown et la page.
 */
export function getNotificationLink(notification: Notification): string | null {
  const context = notification.context;
  const metadata = notification.metadata as any;

  // 1. Conversation (messages, mentions, réactions message, appels, membres)
  const conversationId = context?.conversationId;
  if (conversationId) {
    const messageId = context?.messageId;
    return messageId
      ? `/conversations/${conversationId}?messageId=${messageId}`
      : `/conversations/${conversationId}`;
  }

  // 2. Contenu social (posts, stories, moods, commentaires)
  const postId = context?.postId ?? metadata?.postId ?? metadata?.originalPostId;
  if (postId) {
    const commentId = context?.commentId ?? metadata?.commentId;
    const anchor = commentId ? `#comment-${commentId}` : '';
    return `${resolveContentRoute(notification)}/${postId}${anchor}`;
  }

  // 3. Amis / contacts
  if (typeof notification.type === 'string' && FRIEND_CONTACT_TYPES.has(notification.type)) {
    return '/contacts';
  }

  return null;
}

/**
 * Formate un timestamp de notification en libellé relatif court
 * (« à l'instant », « 5 min », « 2h », « 3j », puis date absolue au-delà d'une semaine).
 * Source unique réutilisée par le dropdown et la page.
 */
export function formatNotificationTimeAgo(
  timestamp: Date | string | null,
  t: TranslateFunction,
  locale?: string
): string {
  if (!timestamp) return '';

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (isNaN(date.getTime())) return '';

  const diffMinutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60));

  if (diffMinutes < 1) return t('timeAgo.now');
  if (diffMinutes < 60) return t('timeAgo.minute').replace('{count}', String(diffMinutes));

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return t('timeAgo.hour').replace('{count}', String(diffHours));

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return t('timeAgo.day').replace('{count}', String(diffDays));

  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/**
 * Formate la date de publication d'un contenu social en libellé « intelligent » :
 * relatif quand récent (« à l'instant » / « il y a 6 min » / « il y a 2h »),
 * « hier 14:30 » la veille, puis date + heure absolues locales au-delà
 * (« 23/06/2026 14:30 »). Locale et fuseau gérés par le navigateur — aucun
 * format en dur. Utilisé pour décorer le sous-titre serveur côté appareil.
 */
export function formatContentPublishedAt(
  iso: string | null | undefined,
  t: TranslateFunction,
  locale?: string
): string {
  if (!iso) return '';

  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 0) {
    return date.toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }) + ' ' + date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }

  if (diffMinutes < 1) return t('timeAgo.now');
  if (diffMinutes < 60) return t('timeAgo.minute').replace('{count}', String(diffMinutes));

  const diffHours = Math.floor(diffMinutes / 60);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  if (date.getTime() >= startOfToday.getTime()) {
    return t('timeAgo.hour').replace('{count}', String(diffHours));
  }

  if (date.getTime() >= startOfYesterday.getTime()) {
    return t('timeAgo.yesterdayAt').replace('{time}', time);
  }

  const absoluteDate = date.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return `${absoluteDate} ${time}`;
}

/**
 * Groups notifications by date period.
 * Returns entries in order: today, yesterday, this week, this month, older.
 */
export function groupNotificationsByDate(
  notifications: Notification[],
  labels: { today: string; yesterday: string; thisWeek: string; thisMonth: string; older: string }
): Array<{ label: string; notifications: Notification[] }> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - startOfToday.getDay() * 86400000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups = new Map<string, Notification[]>([
    [labels.today, []],
    [labels.yesterday, []],
    [labels.thisWeek, []],
    [labels.thisMonth, []],
    [labels.older, []],
  ]);

  for (const notification of notifications) {
    const createdAt = notification.state.createdAt instanceof Date
      ? notification.state.createdAt
      : new Date(notification.state.createdAt);

    const time = createdAt.getTime();

    if (time >= startOfToday.getTime()) {
      groups.get(labels.today)!.push(notification);
    } else if (time >= startOfYesterday.getTime()) {
      groups.get(labels.yesterday)!.push(notification);
    } else if (time >= startOfWeek.getTime()) {
      groups.get(labels.thisWeek)!.push(notification);
    } else if (time >= startOfMonth.getTime()) {
      groups.get(labels.thisMonth)!.push(notification);
    } else {
      groups.get(labels.older)!.push(notification);
    }
  }

  return Array.from(groups.entries())
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, notifications: items }));
}

/**
 * Détermine si la notification requiert une action utilisateur
 */
export function requiresUserAction(notification: Notification): boolean {
  return notification.type === NotificationTypeEnum.CONTACT_REQUEST;
}

/**
 * Obtient le nom d'affichage d'un utilisateur pour les notifications
 * Utilise la fonction centralisée getUserDisplayName
 */
export function getActorDisplayName(actor?: Notification['actor']): string {
  return getUserDisplayName(actor, 'Un utilisateur');
}

/**
 * @deprecated Use getActorDisplayName instead - kept for backward compatibility
 */
export function getSenderDisplayName(sender?: Notification['actor']): string {
  return getActorDisplayName(sender);
}

/**
 * Construit le titre de la notification à partir des données brutes
 * Cette fonction remplace les titres pré-formatés du backend
 * Utilise getActorDisplayName pour afficher le bon nom (displayName > firstName+lastName > username)
 * Supporte les traductions i18n avec la fonction t fournie
 */
export function buildNotificationTitle(
  notification: Notification,
  t?: TranslateFunction
): string {
  // Le serveur est la source unique : `title` est déjà localisé et conscient de
  // l'entité. On le retourne tel quel, ne tombant sur le repli client que
  // lorsqu'il est null/vide (types non gérés par le builder serveur).
  const serverTitle = notification.title;
  if (typeof serverTitle === 'string' && serverTitle.trim().length > 0) {
    return serverTitle;
  }

  const actorName = getActorDisplayName(notification.actor);
  const conversationTitle = notification.context?.conversationTitle || (t ? t('content.defaultConversation') : 'la conversation');

  // Si pas de fonction de traduction, utiliser les textes en dur (fallback)
  if (!t) {
    switch (notification.type) {
      case NotificationTypeEnum.NEW_MESSAGE:
        return `Message de ${actorName}`;
      case NotificationTypeEnum.MESSAGE_REPLY:
        return `Réponse de ${actorName}`;
      case NotificationTypeEnum.USER_MENTIONED:
        return `${actorName} vous a cité`;
      case NotificationTypeEnum.MESSAGE_REACTION:
        return `${actorName} a réagi à votre message`;
      case NotificationTypeEnum.CONTACT_REQUEST:
        return `${actorName} veut se connecter`;
      case NotificationTypeEnum.CONTACT_ACCEPTED:
        return `${actorName} a accepté votre invitation`;
      case NotificationTypeEnum.NEW_CONVERSATION_DIRECT:
        return `Conversation de ${actorName}`;
      case NotificationTypeEnum.NEW_CONVERSATION_GROUP:
        return `Invitation de ${actorName}`;
      case NotificationTypeEnum.MEMBER_JOINED:
        return `Nouveau membre dans ${conversationTitle}`;
      case NotificationTypeEnum.MISSED_CALL:
        return `Appel manqué de ${actorName}`;
      case NotificationTypeEnum.SYSTEM:
        return 'Notification système';
      default:
        return 'Nouvelle notification';
    }
  }

  // Avec traductions i18n
  switch (notification.type) {
    case NotificationTypeEnum.NEW_MESSAGE:
      return t('titles.newMessage', { sender: actorName });

    case NotificationTypeEnum.MESSAGE_REPLY:
      return t('titles.reply', { sender: actorName });

    case NotificationTypeEnum.USER_MENTIONED:
      return t('titles.mentioned', { sender: actorName });

    case NotificationTypeEnum.MESSAGE_REACTION:
      const emoji = (notification.metadata as any)?.reactionEmoji || '❤️';
      return t('titles.reaction', { sender: actorName, emoji });

    case NotificationTypeEnum.CONTACT_REQUEST:
      return t('titles.contactRequest', { sender: actorName });

    case NotificationTypeEnum.CONTACT_ACCEPTED:
      return t('titles.contactAccepted', { sender: actorName });

    case NotificationTypeEnum.NEW_CONVERSATION_DIRECT:
      return t('titles.newConversationDirect', { sender: actorName });

    case NotificationTypeEnum.NEW_CONVERSATION_GROUP:
      return t('titles.newConversationGroup', { title: conversationTitle });

    case NotificationTypeEnum.MEMBER_JOINED:
      return t('titles.memberJoined', { title: conversationTitle });

    case NotificationTypeEnum.MISSED_CALL:
      const callType = (notification.metadata as any)?.callType || 'video';
      return t('titles.missedCall', { type: callType });

    case NotificationTypeEnum.SYSTEM:
      return t('titles.system');

    case NotificationTypeEnum.POST_LIKE:
      return t('titles.postLike', { sender: actorName });
    case NotificationTypeEnum.POST_COMMENT:
      return t('titles.postComment', { sender: actorName });
    case NotificationTypeEnum.POST_REPOST:
      return t('titles.postRepost', { sender: actorName });
    case NotificationTypeEnum.COMMENT_REPLY:
      return t('titles.commentReply', { sender: actorName });
    case NotificationTypeEnum.COMMENT_LIKE:
      return t('titles.commentLike', { sender: actorName });
    case NotificationTypeEnum.COMMENT_REACTION:
      return t('titles.commentReaction', { sender: actorName });
    case NotificationTypeEnum.STORY_REACTION:
      return t('titles.storyReaction', { sender: actorName });
    case NotificationTypeEnum.STATUS_REACTION:
      return t('titles.statusReaction', { sender: actorName });
    case NotificationTypeEnum.FRIEND_REQUEST:
      return t('titles.contactRequest', { sender: actorName });
    case NotificationTypeEnum.FRIEND_ACCEPTED:
      return t('titles.contactAccepted', { sender: actorName });
    case NotificationTypeEnum.FRIEND_NEW_POST:
      return t('titles.friendNewPost', { sender: actorName });
    case NotificationTypeEnum.FRIEND_NEW_STORY:
      return t('titles.friendNewStory', { sender: actorName });
    case NotificationTypeEnum.FRIEND_NEW_MOOD:
      return t('titles.friendNewMood', { sender: actorName });
    case NotificationTypeEnum.LOGIN_NEW_DEVICE:
      return t('titles.loginNewDevice');

    default:
      return t('titles.default');
  }
}

/**
 * Types de notifications « sociales » (post/story/réel/mood/commentaire) pour
 * lesquels on affiche le sous-titre serveur enrichi de la date de publication.
 */
const SOCIAL_NOTIFICATION_TYPES = new Set<string>([
  NotificationTypeEnum.POST_LIKE,
  NotificationTypeEnum.POST_COMMENT,
  NotificationTypeEnum.POST_REPOST,
  NotificationTypeEnum.COMMENT_LIKE,
  NotificationTypeEnum.COMMENT_REPLY,
  NotificationTypeEnum.COMMENT_REACTION,
  NotificationTypeEnum.STORY_REACTION,
  NotificationTypeEnum.STATUS_REACTION,
  NotificationTypeEnum.STORY_NEW_COMMENT,
  NotificationTypeEnum.FRIEND_STORY_COMMENT,
  NotificationTypeEnum.STORY_THREAD_REPLY,
  NotificationTypeEnum.FRIEND_NEW_STORY,
  NotificationTypeEnum.FRIEND_NEW_POST,
  NotificationTypeEnum.FRIEND_NEW_MOOD,
]);

/**
 * Construit la ligne « contexte » secondaire pour une notification sociale :
 * le sous-titre serveur (entité/contexte localisé, sans date) décoré de la date
 * de publication locale (`context.postCreatedAt`). Retourne `null` quand il n'y
 * a pas de sous-titre serveur ou que le type n'est pas social — le client
 * conserve alors son rendu existant.
 */
export function buildNotificationContextLine(
  notification: Notification,
  t: TranslateFunction,
  locale?: string
): string | null {
  if (typeof notification.type !== 'string' || !SOCIAL_NOTIFICATION_TYPES.has(notification.type)) {
    return null;
  }

  const subtitle = notification.subtitle;
  if (typeof subtitle !== 'string' || subtitle.trim().length === 0) {
    return null;
  }

  const publishedAt = formatContentPublishedAt(notification.context?.postCreatedAt, t, locale);

  // Marqueur d'expiration (parité iOS) : une story/statut éphémère dont la date
  // d'expiration est dépassée affiche « · expirée » → l'utilisateur comprend la
  // perte d'accès au contenu lié.
  const expiresAt = notification.context?.postExpiresAt;
  const expired = typeof expiresAt === 'string' && !Number.isNaN(Date.parse(expiresAt))
    && Date.parse(expiresAt) <= Date.now();

  return [subtitle, publishedAt || null, expired ? t('context.expired') : null]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' · ');
}

/**
 * Construit le contenu de la notification à partir des données brutes
 * Utilise getActorDisplayName pour afficher le bon nom
 * Supporte les traductions i18n avec la fonction t fournie
 */
/**
 * Types dont le titre explicite (like/réaction) se suffit à lui-même :
 * le `content` backend duplique le titre → corps vide pour éviter la redondance.
 */
const TITLE_SELF_SUFFICIENT_CONTENT = new Set<string>([
  NotificationTypeEnum.POST_LIKE,
  NotificationTypeEnum.POST_REPOST,
  NotificationTypeEnum.COMMENT_LIKE,
  NotificationTypeEnum.COMMENT_REACTION,
  NotificationTypeEnum.STORY_REACTION,
  NotificationTypeEnum.STATUS_REACTION,
]);

export function buildNotificationContent(
  notification: Notification,
  t?: TranslateFunction
): string {
  // Titre déjà explicite (ex. « @X a aimé votre publication ») → pas de corps redondant.
  if (typeof notification.type === 'string' && TITLE_SELF_SUFFICIENT_CONTENT.has(notification.type)) {
    return '';
  }

  // Pour les réactions : afficher le contenu du message original (stocké dans metadata)
  if (
    notification.type === NotificationTypeEnum.MESSAGE_REACTION ||
    notification.type === 'reaction' as NotificationType
  ) {
    return ((notification.metadata as any)?.messageContent as string) || '';
  }

  // Le content est stocké dans le champ content (aperçu du message)
  if (notification.content) {
    return formatMessagePreview(notification.content, (notification.metadata as any)?.attachments);
  }

  // Messages par défaut basés sur le type (si pas de content)
  const actorName = getActorDisplayName(notification.actor);
  const conversationTitle = notification.context?.conversationTitle || (t ? t('content.defaultConversation') : 'la conversation');

  // Si pas de fonction de traduction, utiliser les textes en dur (fallback)
  if (!t) {
    switch (notification.type) {
      case NotificationTypeEnum.CONTACT_ACCEPTED:
        return `${actorName} a accepté votre invitation. Vous pouvez maintenant discuter ensemble.`;
      case NotificationTypeEnum.CONTACT_REQUEST:
        return `${actorName} vous a envoyé une invitation`;
      case NotificationTypeEnum.NEW_CONVERSATION_DIRECT:
        return `${actorName} a commencé une conversation avec vous`;
      case NotificationTypeEnum.NEW_CONVERSATION_GROUP:
        return `${actorName} vous a invité à rejoindre ${conversationTitle}`;
      case NotificationTypeEnum.MEMBER_JOINED:
        return `${actorName} a rejoint le groupe`;
      default:
        return '';
    }
  }

  // Avec traductions i18n
  switch (notification.type) {
    case NotificationTypeEnum.CONTACT_ACCEPTED:
      return t('content.contactAcceptedMessage', { sender: actorName });

    case NotificationTypeEnum.CONTACT_REQUEST:
      return t('content.contactRequestMessage', { sender: actorName });

    case NotificationTypeEnum.NEW_CONVERSATION_GROUP:
      const isMember = (notification.metadata as any)?.isMember;
      if (!isMember) {
        return t('content.notMemberHint');
      }
      return '';

    case NotificationTypeEnum.MEMBER_JOINED:
      return t('content.memberJoinedMessage', { sender: actorName });

    default:
      return '';
  }
}

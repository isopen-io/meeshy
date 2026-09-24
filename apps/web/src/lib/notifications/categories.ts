/**
 * **LES CATÉGORIES DE LA CLOCHE** (#6288) — miroir de `NotificationCategory`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListView.swift:8-131`)
 * et de `MeeshyNotificationType.accentHex`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationModels.swift:236-272`).
 *
 * **Une catégorie est un FILTRE SERVEUR, jamais un tri local d'une page.** iOS
 * charge trente lignes « toutes catégories » puis les filtre en mémoire, et ne
 * pagine que sous « Toutes » : une catégorie dont les lignes sont plus
 * anciennes que ces trente-là s'affiche VIDE alors que la passerelle en a. La
 * passerelle sait filtrer (`?types=`, `?unreadOnly=`,
 * `services/gateway/src/routes/notifications.ts:55-62`) : chaque catégorie a
 * donc sa propre liste, paginée, en cache.
 *
 * **Le web range NEUF types qu'iOS oublie** — `comment_reaction`, les trois
 * commentaires de story, les trois publications d'ami et les deux créations de
 * conversation n'apparaissaient que sous « Toutes ». Défaut iOS suivi à part ;
 * ici, chaque type émis par la passerelle trouve la catégorie où le lecteur le
 * cherche.
 *
 * **Les teintes sont la PALETTE CATÉGORIELLE d'iOS**, reprise à l'hexadécimal
 * près — même statut que les teintes des destinations flottantes
 * (`lib/view/floating-menu.ts`) : un code couleur par famille, jamais une
 * couleur de marque ni d'état. Les textes, eux, restent aux jetons d'encre.
 */

export const NOTIFICATION_CATEGORIES = [
  'all',
  'unread',
  'messages',
  'reactions',
  'mentions',
  'social',
  'contacts',
  'groups',
  'calls',
  'translations',
  'system',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

type FamilyCategory = Exclude<NotificationCategory, 'all' | 'unread'>;

const FAMILY_TYPES: Readonly<Record<FamilyCategory, readonly string[]>> = {
  messages: [
    'new_message',
    'NEW_MESSAGE',
    'message_reply',
    'reply',
    'message_edited',
    'message_deleted',
    'message_pinned',
    'message_forwarded',
  ],
  reactions: [
    'message_reaction',
    'reaction',
    'MESSAGE_REACTION',
    'post_like',
    'POST_LIKE',
    'story_reaction',
    'status_reaction',
    'comment_like',
    'comment_reaction',
  ],
  mentions: ['user_mentioned', 'mention', 'MENTION'],
  social: [
    'post_comment',
    'POST_COMMENT',
    'post_repost',
    'comment_reply',
    'STORY_REPLY',
    'story_new_comment',
    'friend_story_comment',
    'story_thread_reply',
    'friend_new_story',
    'friend_new_post',
    'friend_new_mood',
  ],
  contacts: [
    'friend_request',
    'contact_request',
    'FRIEND_REQUEST',
    'friend_accepted',
    'contact_accepted',
    'FRIEND_ACCEPTED',
    'STATUS_UPDATE',
  ],
  groups: [
    'community_invite',
    'community_joined',
    'community_left',
    'GROUP_INVITE',
    'GROUP_JOINED',
    'GROUP_LEFT',
    'member_joined',
    'member_left',
    'member_removed',
    'member_promoted',
    'member_demoted',
    'member_role_changed',
    'added_to_conversation',
    'new_conversation',
    'new_conversation_direct',
    'new_conversation_group',
    'removed_from_conversation',
  ],
  calls: ['missed_call', 'call_declined', 'CALL_MISSED', 'incoming_call', 'call', 'call_ended', 'CALL_INCOMING'],
  translations: [
    'translation_completed',
    'translation_ready',
    'TRANSLATION_READY',
    'transcription_completed',
    'voice_clone_ready',
  ],
  system: [
    'security_alert',
    'login_new_device',
    'SYSTEM_ALERT',
    'password_changed',
    'two_factor_enabled',
    'two_factor_disabled',
    'system',
    'maintenance',
    'update_available',
    'achievement_unlocked',
    'ACHIEVEMENT_UNLOCKED',
    'streak_milestone',
    'level_up',
    'badge_earned',
    'AFFILIATE_SIGNUP',
  ],
};

const CATEGORY_HUES: Readonly<Record<NotificationCategory, string>> = {
  all: '#6366F1',
  unread: '#FF6B6B',
  messages: '#3498DB',
  reactions: '#FF6B6B',
  mentions: '#9B59B6',
  social: '#F8B500',
  contacts: '#4ECDC4',
  groups: '#F8B500',
  calls: '#E91E63',
  translations: '#08D9D6',
  system: '#6366F1',
};

export const categoryHue = (category: NotificationCategory): string => CATEGORY_HUES[category];

const isFamily = (category: NotificationCategory): category is FamilyCategory => category !== 'all' && category !== 'unread';

/** Les paramètres de `GET /notifications` qui rendent CETTE catégorie. */
export function categoryQuery(category: NotificationCategory): { readonly types?: string; readonly unreadOnly?: true } {
  if (category === 'unread') return { unreadOnly: true };
  if (!isFamily(category)) return {};
  return { types: FAMILY_TYPES[category].join(',') };
}

/**
 * Une ligne appartient-elle à la liste de cette catégorie ? — la loi que le
 * serveur applique, rejouée sur une ligne reçue par le socket ou modifiée par
 * un geste optimiste. Elle doit dire EXACTEMENT ce que `categoryQuery` demande.
 */
export function categoryAccepts(
  category: NotificationCategory,
  notification: { readonly type: string; readonly state: { readonly isRead: boolean } },
): boolean {
  if (category === 'all') return true;
  if (category === 'unread') return !notification.state.isRead;
  return FAMILY_TYPES[category].includes(notification.type);
}

const ACCENTS: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    '#3498DB',
    [
      'new_message',
      'NEW_MESSAGE',
      'message_reply',
      'reply',
      'post_comment',
      'comment_reply',
      'POST_COMMENT',
      'STORY_REPLY',
      'story_new_comment',
      'friend_story_comment',
      'story_thread_reply',
      'message_edited',
      'message_deleted',
      'message_pinned',
      'message_forwarded',
    ],
  ],
  ['#FF6B6B', FAMILY_TYPES.reactions],
  ['#9B59B6', ['user_mentioned', 'mention', 'MENTION', 'post_repost']],
  [
    '#4ECDC4',
    [
      ...FAMILY_TYPES.contacts,
      'added_to_conversation',
      'new_conversation',
      'new_conversation_direct',
      'new_conversation_group',
      'removed_from_conversation',
    ],
  ],
  [
    '#F8B500',
    [
      'community_invite',
      'community_joined',
      'community_left',
      'GROUP_INVITE',
      'GROUP_JOINED',
      'GROUP_LEFT',
      'member_joined',
      'member_left',
      'member_removed',
      'member_promoted',
      'member_demoted',
      'member_role_changed',
    ],
  ],
  ['#FBBF24', ['achievement_unlocked', 'ACHIEVEMENT_UNLOCKED', 'streak_milestone', 'level_up', 'badge_earned']],
  ['#E91E63', FAMILY_TYPES.calls],
  ['#2ECC71', ['AFFILIATE_SIGNUP']],
  ['#EF4444', ['security_alert', 'login_new_device', 'SYSTEM_ALERT', 'password_changed', 'two_factor_enabled', 'two_factor_disabled']],
  ['#08D9D6', FAMILY_TYPES.translations],
];

const ACCENT_BY_TYPE: ReadonlyMap<string, string> = new Map(ACCENTS.flatMap(([hex, types]) => types.map((type) => [type, hex] as const)));

/** L'accent d'une LIGNE — celui de son type, l'indigo du système pour un type inconnu. */
export const notificationAccent = (type: string): string => ACCENT_BY_TYPE.get(type) ?? '#6366F1';

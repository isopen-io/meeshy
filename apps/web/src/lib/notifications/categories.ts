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
 * **Une notification CONSOMMÉE quitte la cloche** (#8960, miroir de #8958) :
 * un message, une réaction, une mention ou un commentaire déjà lus n'ont plus
 * rien à dire. `categoryQuery` demande à la passerelle de retirer leurs lignes
 * lues (`hideReadTypes`), et `categoryAccepts` rejoue la règle sur une ligne
 * lue pendant que l'écran est ouvert. Une demande d'ami, un appel manqué, une
 * alerte ou un palier lus restent : ils se relisent.
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
  'engagement',
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
  engagement: ['achievement_unlocked', 'ACHIEVEMENT_UNLOCKED', 'streak_milestone', 'level_up', 'badge_earned'],
  contacts: [
    'friend_request',
    'contact_request',
    'FRIEND_REQUEST',
    'friend_accepted',
    'contact_accepted',
    'FRIEND_ACCEPTED',
    'contact_joined',
    'contact_recently_active',
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
    'AFFILIATE_SIGNUP',
  ],
};

const CATEGORY_HUES: Readonly<Record<NotificationCategory, string>> = {
  all: 'var(--ios-indigo-500)',
  unread: '#FF6B6B', // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
  messages: '#3498DB', // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
  reactions: '#FF6B6B', // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
  mentions: '#9B59B6', // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
  social: '#F8B500', // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
  engagement: 'var(--ios-warning)',
  contacts: '#4ECDC4', // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
  groups: '#F8B500', // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
  calls: '#E91E63', // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
  translations: '#08D9D6', // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
  system: 'var(--ios-indigo-500)',
};

export const categoryHue = (category: NotificationCategory): string => CATEGORY_HUES[category];

const FAMILIES = Object.keys(FAMILY_TYPES) as readonly FamilyCategory[];

/** La famille d'un TYPE — celle dont la bannière in-app porte l'icône (#8727) ; `system` pour un type inconnu. */
export function notificationFamily(type: string): FamilyCategory {
  return FAMILIES.find((family) => FAMILY_TYPES[family].includes(type)) ?? 'system';
}

const isFamily = (category: NotificationCategory): category is FamilyCategory => category !== 'all' && category !== 'unread';

/** Les familles dont une ligne LUE quitte la cloche — le contenu a été ouvert. */
const CONSUMED_ON_READ: readonly FamilyCategory[] = ['messages', 'reactions', 'mentions', 'social'];
const CONSUMED_TYPES: ReadonlySet<string> = new Set(CONSUMED_ON_READ.flatMap((family) => FAMILY_TYPES[family]));

/** Une ligne lue d'une famille consommable — elle ne s'affiche plus. */
const isConsumed = (notification: { readonly type: string; readonly state: { readonly isRead: boolean } }): boolean =>
  notification.state.isRead && CONSUMED_TYPES.has(notification.type);

/** Les paramètres de `GET /notifications` qui rendent CETTE catégorie. */
export function categoryQuery(category: NotificationCategory): {
  readonly types?: string;
  readonly unreadOnly?: true;
  readonly hideReadTypes?: string;
} {
  if (category === 'unread') return { unreadOnly: true };
  if (!isFamily(category)) return { hideReadTypes: [...CONSUMED_TYPES].join(',') };
  const types = FAMILY_TYPES[category];
  const hidden = types.filter((type) => CONSUMED_TYPES.has(type));
  return { types: types.join(','), ...(hidden.length === 0 ? {} : { hideReadTypes: hidden.join(',') }) };
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
  if (isConsumed(notification)) return false;
  if (category === 'all') return true;
  if (category === 'unread') return !notification.state.isRead;
  return FAMILY_TYPES[category].includes(notification.type);
}

const ACCENTS: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    '#3498DB', // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
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
  ['#FF6B6B', FAMILY_TYPES.reactions], // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
  ['#9B59B6', ['user_mentioned', 'mention', 'MENTION', 'post_repost']], // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
  [
    '#4ECDC4', // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
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
    '#F8B500', // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
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
  ['var(--ios-warning)', ['achievement_unlocked', 'ACHIEVEMENT_UNLOCKED', 'streak_milestone', 'level_up', 'badge_earned']],
  ['#E91E63', FAMILY_TYPES.calls], // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
  ['#2ECC71', ['AFFILIATE_SIGNUP']], // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
  ['var(--ios-error-strong)', ['security_alert', 'login_new_device', 'SYSTEM_ALERT', 'password_changed', 'two_factor_enabled', 'two_factor_disabled']],
  ['#08D9D6', FAMILY_TYPES.translations], // harmony-exempt: palette catégorielle miroir de NotificationCategory.swift, à remonter dans le SDK (#8879)
];

const ACCENT_BY_TYPE: ReadonlyMap<string, string> = new Map(ACCENTS.flatMap(([hex, types]) => types.map((type) => [type, hex] as const)));

/** L'accent d'une LIGNE — celui de son type, l'indigo du système pour un type inconnu. */
export const notificationAccent = (type: string): string => ACCENT_BY_TYPE.get(type) ?? 'var(--ios-indigo-500)';

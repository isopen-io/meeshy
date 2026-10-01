/**
 * LE CATALOGUE DES OPÉRATIONS RÉCOMPENSABLES (#8959) — chaque geste qui
 * rapporte des points, sa fréquence, la portée de son plafond et ses défauts.
 *
 * Les vingt AXES (`ENGAGEMENT_AXES`) sont les compteurs que l'écran
 * « Progression » montre, avec leurs badges ; ils restent des opérations.
 * Les opérations ajoutées ici créditent le score, la série et l'état « N (M) »
 * d'une conversation sans ouvrir de badge : elles gardent leur propre
 * compteur, que les clients ignorent tant qu'ils ne le connaissent pas.
 *
 * Les défauts sont ceux que le porteur a fixés le 2026-09-30. Ce qui est
 * STRUCTUREL (fréquence, portée du plafond, variantes possibles) vit ici et ne
 * se règle pas ; ce qui est une VALEUR (points, élan, plafond, points d'une
 * variante) vit dans le barème (`engagement-scale.ts`) et se règle depuis
 * l'administration.
 */

import { ENGAGEMENT_AXES, type EngagementAxisFamily, type EngagementAxisKey } from './engagement.js';

export const ENGAGEMENT_OPERATION_DOMAINS = [
  'messaging',
  'calls',
  'conversations',
  'communities',
  'publishing',
  'feed',
  'links',
  'friends',
  'profile',
  'tools',
] as const;

export type EngagementOperationDomain = (typeof ENGAGEMENT_OPERATION_DOMAINS)[number];

/**
 * - `repeatable` : chaque geste paie, sous son plafond s'il en a un ;
 * - `per-target` : une fois par cible (personne, conversation, post, communauté) ;
 * - `per-account` : une fois dans la vie du compte, jamais multiplié ;
 * - `progressive` : la valeur du geste monte avec le volume (visites de lien).
 */
export type EngagementOperationFrequency = 'repeatable' | 'per-target' | 'per-account' | 'progressive';

/**
 * Où se compte le plafond d'une opération répétable :
 * par conversation et par jour civil, par jour civil tous lieux confondus, ou
 * par cible (les tranches de cinq minutes d'UN appel). `none` ⇒ sans plafond.
 */
export type EngagementCapScope = 'conversation-day' | 'day' | 'target' | 'none';

export const EXTRA_ENGAGEMENT_OPERATIONS = [
  'tool.quote_reply',
  'tool.forward',
  'tool.pin',
  'tool.voice_listened',
  'tool.translation_request',
  'tool.location',
  'conversation.call_started',
  'conversation.call_joined',
  'conversation.call_minutes',
  'conversation.call_participant_added',
  'social.conversation_invite',
  'social.conversation_link_joined',
  'social.community_created',
  'social.community_joined',
  'content.status',
  'tool.post_reaction',
  'tool.comment_like',
  'social.repost',
  'tool.post_bookmark',
  'tool.story_viewed',
  'tool.poll_answered',
  'social.affiliate_link_created',
  'social.conversation_link_created',
  'social.link_visit',
  'social.email_invite',
  'social.contacts_synced',
  'profile.avatar',
  'profile.bio',
  'profile.second_language',
  'profile.email_verified',
  'profile.phone_verified',
  'profile.two_factor',
  'profile.voice_profile',
  'tool.sticker_created',
  'streak.bonus',
] as const;

export type ExtraEngagementOperationKey = (typeof EXTRA_ENGAGEMENT_OPERATIONS)[number];

export type EngagementOperationKey = EngagementAxisKey | ExtraEngagementOperationKey;

export const ENGAGEMENT_OPERATIONS: readonly EngagementOperationKey[] = [
  ...ENGAGEMENT_AXES,
  ...EXTRA_ENGAGEMENT_OPERATIONS,
];

export const isEngagementOperationKey = (value: string): value is EngagementOperationKey =>
  (ENGAGEMENT_OPERATIONS as readonly string[]).includes(value);

/** Les variantes de points d'une publication, selon QUI peut la voir. */
export const VISIBILITY_VARIANTS = ['public', 'community', 'friends', 'other'] as const;
export type VisibilityVariant = (typeof VISIBILITY_VARIANTS)[number];

export const LOCATION_VARIANTS = ['live', 'static'] as const;

export type EngagementOperationDefinition = {
  readonly domain: EngagementOperationDomain;
  readonly frequency: EngagementOperationFrequency;
  readonly capScope: EngagementCapScope;
  /** La famille qui compte pour l'élan ; `null` ⇒ l'opération n'en ouvre aucune. */
  readonly family: EngagementAxisFamily | null;
  /** Les variantes possibles (visibilité, position) ; vide ⇒ une seule valeur. */
  readonly variants: readonly string[];
  readonly defaults: {
    readonly points: number;
    readonly multiplied: boolean;
    readonly cap: number | null;
    readonly variantPoints?: Readonly<Record<string, number>>;
  };
};

type Def = EngagementOperationDefinition;

const repeat = (
  domain: EngagementOperationDomain,
  family: EngagementAxisFamily,
  points: number,
  capScope: EngagementCapScope,
  cap: number | null,
): Def => ({ domain, frequency: 'repeatable', capScope, family, variants: [], defaults: { points, multiplied: true, cap } });

const perTarget = (domain: EngagementOperationDomain, family: EngagementAxisFamily, points: number): Def => ({
  domain,
  frequency: 'per-target',
  capScope: 'none',
  family,
  variants: [],
  defaults: { points, multiplied: true, cap: null },
});

const perAccount = (domain: EngagementOperationDomain, points: number): Def => ({
  domain,
  frequency: 'per-account',
  capScope: 'none',
  family: null,
  variants: [],
  defaults: { points, multiplied: false, cap: null },
});

const byVisibility = (
  family: EngagementAxisFamily,
  cap: number,
  variantPoints: Readonly<Record<VisibilityVariant, number>>,
): Def => ({
  domain: 'publishing',
  frequency: 'repeatable',
  capScope: 'day',
  family,
  variants: VISIBILITY_VARIANTS,
  defaults: { points: variantPoints.other, multiplied: true, cap, variantPoints },
});

export const ENGAGEMENT_OPERATION_CATALOG: Readonly<Record<EngagementOperationKey, EngagementOperationDefinition>> = {
  'content.text_message': repeat('messaging', 'content', 3, 'conversation-day', 300),
  'content.audio_message': repeat('messaging', 'content', 5, 'conversation-day', 500),
  'tool.attachment': repeat('messaging', 'tool', 4, 'conversation-day', 100),
  'tool.sticker': repeat('messaging', 'tool', 1, 'conversation-day', 100),
  'tool.reaction': repeat('messaging', 'tool', 2, 'conversation-day', 30),
  'tool.quote_reply': repeat('messaging', 'tool', 1, 'conversation-day', 100),
  'tool.forward': repeat('messaging', 'tool', 1, 'conversation-day', 10),
  'tool.pin': repeat('messaging', 'tool', 1, 'conversation-day', 5),
  'tool.voice_listened': repeat('messaging', 'tool', 2, 'conversation-day', 200),
  'tool.translation_request': repeat('messaging', 'tool', 1, 'day', 20),
  'tool.location': {
    domain: 'messaging',
    frequency: 'repeatable',
    capScope: 'day',
    family: 'tool',
    variants: LOCATION_VARIANTS,
    defaults: { points: 1, multiplied: true, cap: 3, variantPoints: { live: 2, static: 1 } },
  },

  'conversation.call_started': repeat('calls', 'conversation', 5, 'day', 10),
  'conversation.call_joined': repeat('calls', 'conversation', 3, 'day', 10),
  'conversation.call_minutes': repeat('calls', 'conversation', 1, 'target', 12),
  'conversation.call_participant_added': repeat('calls', 'conversation', 2, 'day', 5),

  'conversation.private': perTarget('conversations', 'conversation', 5),
  'conversation.public': perTarget('conversations', 'conversation', 5),
  'conversation.community': perTarget('conversations', 'conversation', 5),
  'conversation.group_created': perTarget('conversations', 'conversation', 1),
  'social.conversation_invite': perTarget('conversations', 'social', 2),
  'social.conversation_link_joined': perTarget('conversations', 'social', 5),

  'social.community_created': repeat('communities', 'social', 5, 'day', 1),
  'social.community_joined': perTarget('communities', 'social', 2),

  'content.post': byVisibility('content', 50, { public: 99, community: 69, friends: 49, other: 0 }),
  'content.story': byVisibility('content', 20, { public: 79, community: 39, friends: 19, other: 0 }),
  'content.reel': repeat('publishing', 'content', 199, 'day', 10),
  'content.status': repeat('publishing', 'content', 2, 'day', 3),
  'tool.in_app_edit': repeat('publishing', 'tool', 1, 'none', null),
  'tool.direct_publish': repeat('publishing', 'tool', 1, 'none', null),
  'comment.text': repeat('publishing', 'comment', 3, 'none', null),
  'comment.audio': repeat('publishing', 'comment', 3, 'none', null),

  'tool.post_reaction': repeat('feed', 'tool', 1, 'day', 30),
  'tool.comment_like': repeat('feed', 'tool', 1, 'day', 30),
  'social.repost': repeat('feed', 'social', 3, 'day', 10),
  'social.share': perTarget('feed', 'social', 7),
  'tool.post_bookmark': repeat('feed', 'tool', 1, 'day', 10),
  'tool.story_viewed': repeat('feed', 'tool', 1, 'day', 20),
  'tool.poll_answered': perTarget('feed', 'tool', 2),

  'social.tracked_link': repeat('links', 'social', 1, 'day', 10),
  'social.affiliate_link_created': repeat('links', 'social', 1, 'day', 5),
  'social.conversation_link_created': repeat('links', 'social', 1, 'day', 10),
  'social.link_visit': {
    domain: 'links',
    frequency: 'progressive',
    capScope: 'none',
    family: 'social',
    variants: [],
    defaults: { points: 2, multiplied: false, cap: null },
  },
  'social.invite_joined': perTarget('links', 'social', 7),

  'social.friendship': perTarget('friends', 'social', 7),
  'social.email_invite': repeat('friends', 'social', 1, 'day', 10),
  'social.contacts_synced': perAccount('friends', 5),

  'profile.avatar': perAccount('profile', 10),
  'profile.bio': perAccount('profile', 5),
  'profile.second_language': perAccount('profile', 5),
  'profile.email_verified': perAccount('profile', 10),
  'profile.phone_verified': perAccount('profile', 10),
  'profile.two_factor': perAccount('profile', 15),
  'profile.voice_profile': perAccount('profile', 20),

  'tool.sticker_created': repeat('tools', 'tool', 2, 'day', 5),

  'streak.bonus': {
    domain: 'profile',
    frequency: 'progressive',
    capScope: 'none',
    family: null,
    variants: [],
    defaults: { points: 0, multiplied: false, cap: null },
  },
};

export function engagementOperation(key: EngagementOperationKey): EngagementOperationDefinition {
  return ENGAGEMENT_OPERATION_CATALOG[key];
}

/** Une opération dont le plafond se règle — répétable, avec une portée. */
export const hasConfigurableCap = (key: EngagementOperationKey): boolean => {
  const operation = ENGAGEMENT_OPERATION_CATALOG[key];
  return operation.frequency === 'repeatable' && operation.capScope !== 'none';
};

/** Visibilité d'une publication, telle que la base l'écrit, en variante de points. */
export function visibilityVariant(visibility: string | null | undefined): VisibilityVariant {
  switch ((visibility ?? '').toUpperCase()) {
    case 'PUBLIC':
      return 'public';
    case 'COMMUNITY':
      return 'community';
    case 'FRIENDS':
      return 'friends';
    default:
      return 'other';
  }
}

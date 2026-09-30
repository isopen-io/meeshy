import { ENGAGEMENT_ACHIEVEMENT_KEYS, isEngagementAxisKey, type EngagementAchievementKey, type EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { engagementAchievementCondition, engagementAchievementTitle, engagementAxisLabel } from '@meeshy/shared/utils/engagement-labels';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { AXIS_GLYPHS, type ProgressionGlyph } from '@/lib/view/progression';

import { notificationTitle, type NotificationRecord } from './record';

/**
 * **CE QU'UNE LIGNE DE LA CLOCHE AFFICHE** (#8727) — miroir de
 * `NotificationRowPresentation` (`packages/MeeshySDK/Sources/MeeshySDK/Models/
 * NotificationRowPresentation.swift`, #8724). Les pièces d'une ligne sont
 * composées UNE fois par cette règle pure ; la ligne les place, elle ne
 * décide de rien. Trois défauts relevés par le porteur (2026-09-29) tiennent ici :
 *
 * - **la répétition** : chaque texte ne paraît qu'une fois (`distinctTexts`) —
 *   titre, corps, citation et pied ;
 * - **le contexte** : une réaction ou une réponse sur un commentaire ou un post
 *   porte en pied l'ICÔNE du contenu et l'extrait du POST, comme un message
 *   porte son groupe — jamais le commentaire une seconde fois ;
 * - **le palier** : « Badge débloqué » dit QUEL badge (son nom, son icône) et
 *   pourquoi, lu dans les champs STRUCTURÉS (`axisKey`, `achievementKey`,
 *   `threshold`, `level`), jamais dans la prose du corps.
 *
 * Les extraits sont ceux que la passerelle a servis au destinataire
 * (`metadata.postPreview` / `commentPreview`) : aucune descente de langue ici.
 */

export type ContentKind = 'story' | 'reel' | 'mood' | 'status' | 'post';

export type MilestoneGlyph = ProgressionGlyph | 'trophy' | 'star' | 'fire';

export type RowLeading = { readonly kind: 'avatar' } | { readonly kind: 'milestone'; readonly glyph: MilestoneGlyph };

export type RowFooter =
  | { readonly kind: 'conversation'; readonly text: string }
  | { readonly kind: 'content'; readonly content: ContentKind; readonly text: string; readonly expired: boolean }
  | { readonly kind: 'plain'; readonly text: string };

export type NotificationRowPresentation = {
  readonly leading: RowLeading;
  readonly title: string;
  readonly body: string | null;
  readonly quote: string | null;
  readonly footer: RowFooter | null;
};

export type NotificationQuickAction = { readonly kind: 'write' | 'connect'; readonly userId: string };

type Options = { readonly language: InterfaceLanguage; readonly now: Date };

// --- La règle anti-répétition ------------------------------------------------

const QUOTES = /[«»“”„"'’]/g;

const normalized = (text: string): string =>
  text.replace(/…|\.\.\./g, ' ').replace(QUOTES, '').split(/\s+/).filter(Boolean).join(' ').toLowerCase();

/**
 * Deux textes « se répètent » quand, dépouillés de leurs guillemets, de leur
 * casse, de leurs espaces et d'une troncature « … », l'un est l'autre ou son
 * début : la passerelle tronque ses citations, l'égalité stricte ne les
 * reconnaîtrait jamais.
 */
export function repeatsText(candidate: string, other: string): boolean {
  const a = normalized(candidate);
  const b = normalized(other);
  if (a === '' || b === '') return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/** Garde, dans l'ordre, chaque texte qui ne répète aucun des précédents — les autres deviennent `null`. */
export function distinctTexts(texts: readonly (string | null)[]): readonly (string | null)[] {
  return texts.reduce<{ readonly kept: readonly string[]; readonly out: readonly (string | null)[] }>(
    (acc, text) => {
      const fresh = text !== null && normalized(text) !== '' && !acc.kept.some((kept) => repeatsText(text, kept));
      return fresh ? { kept: [...acc.kept, text], out: [...acc.out, text] } : { kept: acc.kept, out: [...acc.out, null] };
    },
    { kept: [], out: [] },
  ).out;
}

const firstFilled = (...values: readonly (string | undefined)[]): string | null =>
  values.find((value): value is string => value !== undefined && value.trim() !== '') ?? null;

// --- Les familles de types ----------------------------------------------------

const COMMENT_TYPES = new Set(['post_comment', 'POST_COMMENT', 'story_new_comment', 'friend_story_comment', 'story_thread_reply']);
const COMMENT_ENGAGEMENT_TYPES = new Set(['comment_like', 'comment_reaction']);
const CONTENT_REACTION_TYPES = new Set(['post_like', 'POST_LIKE', 'story_reaction', 'status_reaction', 'post_repost']);
const FRIEND_CONTENT_TYPES = new Set(['friend_new_story', 'friend_new_post', 'friend_new_mood']);
const STORY_TYPES = new Set(['story_reaction', 'story_new_comment', 'friend_story_comment', 'story_thread_reply', 'friend_new_story']);
const MOOD_TYPES = new Set(['status_reaction', 'friend_new_mood']);

const KIND_BY_POST_TYPE: Readonly<Record<string, ContentKind>> = { STORY: 'story', REEL: 'reel', MOOD: 'mood', STATUS: 'status', POST: 'post' };

function contentKindOf(notification: NotificationRecord): ContentKind {
  const declared = (notification.metadata.postType ?? notification.metadata.contentType)?.toUpperCase();
  const kind = declared === undefined ? undefined : KIND_BY_POST_TYPE[declared];
  if (kind !== undefined) return kind;
  if (STORY_TYPES.has(notification.type)) return 'story';
  if (MOOD_TYPES.has(notification.type)) return notification.type === 'status_reaction' ? 'status' : 'mood';
  return 'post';
}

const MEDIA_KEYS = { image: 'notifications.row.media.photo', video: 'notifications.row.media.video', audio: 'notifications.row.media.audio' } as const;

function mediaSummary(notification: NotificationRecord, language: InterfaceLanguage): string | null {
  const media = notification.metadata.mediaType?.toLowerCase();
  return media === 'image' || media === 'video' || media === 'audio' ? translate(language, MEDIA_KEYS[media]) : null;
}

const isPast = (iso: string | undefined, now: Date): boolean => iso !== undefined && new Date(iso).getTime() <= now.getTime();

function publishedLabel(iso: string | undefined, { language, now }: Options): string | null {
  if (iso === undefined) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit', ...(sameYear ? {} : { year: 'numeric' }) }).format(date);
}

/** Le pied d'un contenu social : son icône, l'extrait du POST (ou son média, ou son libellé), sa date, et « expirée ». */
function contentFooter(notification: NotificationRecord, shown: readonly string[], options: Options): RowFooter {
  const content = contentKindOf(notification);
  const excerpt = firstFilled(notification.metadata.postPreview) ?? mediaSummary(notification, options.language);
  const freshExcerpt = excerpt !== null && shown.some((text) => repeatsText(excerpt, text)) ? null : excerpt;
  const expired = isPast(notification.context.postExpiresAt, options.now);
  const text = [
    freshExcerpt ?? translate(options.language, `notifications.row.kind.${content}`),
    publishedLabel(notification.context.postCreatedAt, options),
    expired ? translate(options.language, 'notifications.row.expired') : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
  return { kind: 'content', content, text, expired };
}

function conversationOrPlainFooter(notification: NotificationRecord, shown: readonly string[]): RowFooter | null {
  const { conversationTitle, conversationType } = notification.context;
  const group = conversationType !== undefined && conversationType !== 'direct' ? firstFilled(conversationTitle) : null;
  const footer: RowFooter | null =
    group !== null ? { kind: 'conversation', text: group } : notification.subtitle === undefined ? null : { kind: 'plain', text: notification.subtitle };
  return footer !== null && shown.some((text) => repeatsText(footer.text, text)) ? null : footer;
}

type Parts = { readonly body: string | null; readonly quote: string | null; readonly social: boolean };

function partsOf(notification: NotificationRecord, language: InterfaceLanguage): Parts {
  const { metadata, content, type } = notification;
  if (COMMENT_TYPES.has(type)) return { body: firstFilled(metadata.commentPreview, content), quote: null, social: true };
  if (type === 'comment_reply') {
    const parent = firstFilled(metadata.parentCommentPreview);
    return {
      body: firstFilled(metadata.commentPreview, content),
      quote: parent === null ? null : translate(language, 'notifications.row.replyTo', { text: parent }),
      social: true,
    };
  }
  if (COMMENT_ENGAGEMENT_TYPES.has(type)) {
    const comment = firstFilled(metadata.commentPreview);
    return { body: comment === null ? null : `« ${comment} »`, quote: null, social: true };
  }
  if (CONTENT_REACTION_TYPES.has(type)) return { body: null, quote: null, social: true };
  if (FRIEND_CONTENT_TYPES.has(type)) return { body: firstFilled(metadata.excerpt, content), quote: null, social: true };
  return { body: firstFilled(content), quote: null, social: false };
}

// --- Les paliers --------------------------------------------------------------

type Milestone =
  | { readonly kind: 'badge'; readonly axis: EngagementAxisKey; readonly threshold: number | null }
  | { readonly kind: 'achievement'; readonly key: EngagementAchievementKey }
  | { readonly kind: 'level'; readonly level: number | null }
  | { readonly kind: 'streak'; readonly days: number | null };

function milestoneOf(notification: NotificationRecord): Milestone | null {
  const { axisKey, achievementKey, threshold, level } = notification.metadata;
  switch (notification.type) {
    case 'badge_earned':
      return axisKey !== undefined && isEngagementAxisKey(axisKey) ? { kind: 'badge', axis: axisKey, threshold: threshold ?? null } : null;
    case 'achievement_unlocked':
    case 'ACHIEVEMENT_UNLOCKED': {
      const key = ENGAGEMENT_ACHIEVEMENT_KEYS.find((candidate) => candidate === achievementKey);
      return key === undefined ? null : { kind: 'achievement', key };
    }
    case 'level_up':
      return { kind: 'level', level: level ?? null };
    case 'streak_milestone':
      return { kind: 'streak', days: threshold ?? null };
    default:
      return null;
  }
}

const MILESTONE_GLYPHS: Readonly<Record<Exclude<Milestone['kind'], 'badge'>, MilestoneGlyph>> = { achievement: 'trophy', level: 'star', streak: 'fire' };

function milestonePresentation(notification: NotificationRecord, milestone: Milestone, language: InterfaceLanguage): NotificationRowPresentation {
  const glyph = milestone.kind === 'badge' ? AXIS_GLYPHS[milestone.axis] : MILESTONE_GLYPHS[milestone.kind];
  const name = milestoneName(milestone, language) ?? notificationTitle(notification);
  const reason = milestoneReason(notification, milestone, language) ?? firstFilled(notification.content);
  const [, body] = distinctTexts([name, reason]);
  return { leading: { kind: 'milestone', glyph }, title: name, body: body ?? null, quote: null, footer: null };
}

function milestoneName(milestone: Milestone, language: InterfaceLanguage): string | null {
  switch (milestone.kind) {
    case 'badge':
      return engagementAxisLabel(language, milestone.axis);
    case 'achievement':
      return engagementAchievementTitle(language, milestone.key);
    case 'level':
      return milestone.level === null ? null : translate(language, 'notifications.row.milestone.level', { level: String(milestone.level) });
    case 'streak':
      return milestone.days === null ? null : translate(language, 'notifications.row.milestone.streak', { days: String(milestone.days) });
  }
}

function milestoneReason(notification: NotificationRecord, milestone: Milestone, language: InterfaceLanguage): string | null {
  if (milestone.kind === 'achievement') return engagementAchievementCondition(language, milestone.key);
  if (milestone.kind !== 'badge') return null;
  const invitee = notification.actor?.displayName ?? notification.actor?.username;
  if (milestone.axis === 'social.invite_joined' && invitee !== undefined) {
    return translate(language, 'notifications.row.milestone.inviteJoined', { name: invitee });
  }
  return milestone.threshold === null ? null : translate(language, 'notifications.row.milestone.badgeReason', { threshold: String(milestone.threshold) });
}

// --- La ligne -----------------------------------------------------------------

export function notificationRowPresentation(notification: NotificationRecord, options: Options): NotificationRowPresentation {
  const milestone = milestoneOf(notification);
  if (milestone !== null) return milestonePresentation(notification, milestone, options.language);
  const title = notificationTitle(notification);
  const parts = partsOf(notification, options.language);
  const [, body = null, quote = null] = distinctTexts([title, parts.body, parts.quote]);
  const shown = [title, body, quote].filter((text): text is string => text !== null);
  const footer = parts.social ? contentFooter(notification, shown, options) : conversationOrPlainFooter(notification, shown);
  return { leading: { kind: 'avatar' }, title, body, quote, footer };
}

/**
 * Les gestes d'une ligne (#8105, #8724) : un contact qui rejoint Meeshy se
 * CONNECTE puis s'écrit ; la personne venue par votre lien (badge « Invités
 * venus ») s'ÉCRIT, et se connecte tant que l'amitié n'existe pas.
 */
export function notificationQuickActions(notification: NotificationRecord, { isFriend }: { readonly isFriend: boolean }): readonly NotificationQuickAction[] {
  const userId = notification.actor?.id;
  if (userId === undefined) return [];
  if (notification.type === 'contact_joined') return [{ kind: 'connect', userId }, { kind: 'write', userId }];
  if (notification.type === 'badge_earned' && notification.metadata.axisKey === 'social.invite_joined') {
    return isFriend ? [{ kind: 'write', userId }] : [{ kind: 'write', userId }, { kind: 'connect', userId }];
  }
  return [];
}

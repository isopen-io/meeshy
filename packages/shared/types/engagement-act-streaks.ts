/**
 * LES SÉRIES PAR ACTE ET LA FIDÉLITÉ (#10388, #10389, #10390).
 *
 * La série GLOBALE compte les jours civils où le compte a été crédité, quel
 * que soit le geste. Une série PAR ACTE compte les jours civils consécutifs où
 * CE geste précis a été crédité : écrire dans une conversation, publier un
 * post, un réel, une story, une humeur, commenter, réagir à un post, à un réel
 * ou à une story. Chaque série a ses propres paliers, réglés par
 * l'administration dans le barème (`EngagementScale.streaks`).
 *
 * Un palier de FIDÉLITÉ récompense l'ancienneté du compte (jours civils depuis
 * `User.createdAt`), une fois par palier (`EngagementScale.loyalty`).
 *
 * Fonctions PURES : la passerelle crédite avec, l'administration valide avec.
 * Garde écrite à la main, sans Zod, comme `parseEngagementScale` : ce module
 * entre dans les chunks web.
 */

import type { EngagementOperationKey } from './engagement-operations.js';

/** Les actes qui portent chacun leur série. L'ordre est celui de l'écran d'administration. */
export const ENGAGEMENT_STREAK_ACTS = [
  'conversation',
  'post',
  'reel',
  'story',
  'comment',
  'mood',
  'reaction_post',
  'reaction_reel',
  'reaction_story',
] as const;

export type EngagementStreakAct = (typeof ENGAGEMENT_STREAK_ACTS)[number];

export const isEngagementStreakAct = (value: unknown): value is EngagementStreakAct =>
  typeof value === 'string' && (ENGAGEMENT_STREAK_ACTS as readonly string[]).includes(value);

/** Plafond des points d'un palier tel qu'une passerelle d'avant #10388 sait encore le relire. */
export const LEGACY_STREAK_BONUS_POINTS_CEILING = 1000;

/** Plafond dur des jours d'un palier (série ou fidélité) : un peu plus de 27 ans. */
export const ENGAGEMENT_STREAK_TIER_DAYS_CEILING = 10_000;

/** Longueur maximale du libellé d'un palier (« Un an de fidélité »). */
export const ENGAGEMENT_STREAK_TIER_LABEL_MAX = 40;

/** Un palier : `points` crédités, une fois, quand la série (ou l'ancienneté) atteint `days`. */
export type EngagementStreakTier = {
  readonly days: number;
  readonly points: number;
  readonly label?: string;
};

/** Les paliers de constance : ceux de la série globale, et ceux de chaque acte. */
export type EngagementStreaks = {
  readonly global: readonly EngagementStreakTier[];
  readonly acts: Readonly<Record<EngagementStreakAct, readonly EngagementStreakTier[]>>;
};

/** Le type d'une publication, tel que `Post.type` le porte. */
export type EngagementStreakPostType = 'POST' | 'REEL' | 'STORY' | 'STATUS';

export const isEngagementStreakPostType = (value: unknown): value is EngagementStreakPostType =>
  value === 'POST' || value === 'REEL' || value === 'STORY' || value === 'STATUS';

/** Des actes sans aucun palier. */
export const emptyActTiers = (): Readonly<Record<EngagementStreakAct, readonly EngagementStreakTier[]>> =>
  Object.fromEntries(ENGAGEMENT_STREAK_ACTS.map((act) => [act, []])) as unknown as Record<
    EngagementStreakAct,
    readonly EngagementStreakTier[]
  >;

const ACT_OF_OPERATION: Readonly<Partial<Record<EngagementOperationKey, EngagementStreakAct>>> = {
  'content.post': 'post',
  'content.reel': 'reel',
  'content.story': 'story',
  'content.status': 'mood',
  'comment.text': 'comment',
  'comment.audio': 'comment',
};

const REACTION_ACT_OF_POST_TYPE: Readonly<Partial<Record<EngagementStreakPostType, EngagementStreakAct>>> = {
  POST: 'reaction_post',
  REEL: 'reaction_reel',
  STORY: 'reaction_story',
};

/**
 * L'acte dont un crédit fait avancer la série, ou `null` quand il n'en fait
 * avancer aucune. Un message (texte ou vocal) ne compte que dans une
 * conversation ; une réaction de post se range selon le type de ce qu'elle
 * vise, et une réaction à une humeur n'a pas de série.
 */
export function streakActOf(input: {
  readonly operationKey: EngagementOperationKey;
  readonly postType?: EngagementStreakPostType;
  readonly conversationId?: string;
}): EngagementStreakAct | null {
  const { operationKey, postType, conversationId } = input;
  if (operationKey === 'content.text_message' || operationKey === 'content.audio_message') {
    return conversationId ? 'conversation' : null;
  }
  if (operationKey === 'tool.post_reaction') {
    return postType === undefined ? null : REACTION_ACT_OF_POST_TYPE[postType] ?? null;
  }
  return ACT_OF_OPERATION[operationKey] ?? null;
}

/** L'état d'une série d'acte, au jour civil `lastDay` (`YYYY-MM-DD`). */
export type ActStreakState = {
  readonly currentDays: number;
  readonly longestDays: number;
  readonly lastDay: string;
};

/** Ce que `GET /me/engagement` sert pour chaque série d'acte. */
export type ActStreakView = ActStreakState & { readonly act: EngagementStreakAct };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dayNumber = (day: string): number =>
  DAY_PATTERN.test(day) ? Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000) : Number.NaN;

const safeCount = (value: number): number => (Number.isInteger(value) && value > 0 ? value : 0);

/**
 * La série d'un acte après un crédit au jour civil `today`.
 *
 * Le même jour ne compte qu'une fois ; le lendemain prolonge la série ; un jour
 * sauté la remet à 1. Un `today` antérieur au dernier jour compté (fuseau
 * changé, horloge) ne touche à rien. `advanced` dit si la série vient de
 * gagner un jour — c'est seulement alors qu'un palier peut être franchi.
 */
export function nextActStreak(
  prev: ActStreakState | null,
  today: string,
): ActStreakState & { readonly advanced: boolean } {
  if (prev === null) return { currentDays: 1, longestDays: 1, lastDay: today, advanced: true };
  const current = safeCount(prev.currentDays);
  const longest = Math.max(safeCount(prev.longestDays), current);
  const unchanged = { currentDays: current, longestDays: longest, lastDay: prev.lastDay, advanced: false };
  if (!DAY_PATTERN.test(today)) return unchanged;
  const gap = dayNumber(today) - dayNumber(prev.lastDay);
  if (gap <= 0) return unchanged;
  const currentDays = gap === 1 ? current + 1 : 1;
  return { currentDays, longestDays: Math.max(longest, currentDays), lastDay: today, advanced: true };
}

/** Les paliers qu'un passage de `previous` à `next` jours franchit, du plus court au plus long. */
export function crossedStreakTiers(
  tiers: readonly EngagementStreakTier[],
  previous: number,
  next: number,
): readonly EngagementStreakTier[] {
  return tiers.filter((tier) => tier.days > previous && tier.days <= next);
}

/** Les paliers de fidélité qu'une ancienneté de `ageDays` jours atteint. */
export function reachedLoyaltyTiers(
  tiers: readonly EngagementStreakTier[],
  ageDays: number,
): readonly EngagementStreakTier[] {
  return tiers.filter((tier) => tier.days <= ageDays);
}

/** Jours civils entre deux étiquettes `YYYY-MM-DD` (b − a) ; `NaN` si l'une est illisible. */
export function civilDaysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

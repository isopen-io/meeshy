/**
 * Catalogue des axes d'engagement — source de vérité unique, importée par le
 * gateway (producteur, `EngagementService.recordActivity`) et les clients
 * (affichage de l'écran « Progression »).
 *
 * Source : docs/product/streaks-badges-modele.md § 6
 * Issue : #5530
 */

export const ENGAGEMENT_AXES = [
  'content.audio_message',
  'content.text_message',
  'content.post',
  'content.story',
  'content.reel',
  'comment.audio',
  'comment.text',
  'conversation.private',
  'conversation.public',
  'conversation.community',
  'tool.sticker',
  'tool.in_app_edit',
  'tool.direct_publish',
] as const;

export type EngagementAxisKey = (typeof ENGAGEMENT_AXES)[number];

export const isEngagementAxisKey = (value: string): value is EngagementAxisKey =>
  (ENGAGEMENT_AXES as readonly string[]).includes(value);

/** Paliers par échelle — socle initial, tunable (§ 7). */
export const BADGE_THRESHOLDS = [1, 10, 50, 100, 500] as const;
export const STREAK_THRESHOLDS = [3, 7, 14, 30, 60, 100] as const;
export const LEVEL_THRESHOLDS = [10, 50, 150, 400, 1000, 2500] as const;

export type EngagementMilestoneType = 'badge' | 'streak' | 'level' | 'achievement';

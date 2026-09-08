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

/**
 * Poids par FAMILLE d'axe, appliqués au score agrégé de niveau (§ 5, § 7) —
 * constantes nommées, jamais des nombres dispersés dans le code.
 */
export const CONTENT_AXIS_WEIGHT = 3;
export const COMMENT_AXIS_WEIGHT = 2;
export const CONVERSATION_AXIS_WEIGHT = 5;
export const TOOL_AXIS_WEIGHT = 1;

/** Poids par axe — exhaustif sur `EngagementAxisKey`, vérifié par le compilateur. */
export const ENGAGEMENT_AXIS_WEIGHTS: Record<EngagementAxisKey, number> = {
  'content.audio_message': CONTENT_AXIS_WEIGHT,
  'content.text_message': CONTENT_AXIS_WEIGHT,
  'content.post': CONTENT_AXIS_WEIGHT,
  'content.story': CONTENT_AXIS_WEIGHT,
  'content.reel': CONTENT_AXIS_WEIGHT,
  'comment.audio': COMMENT_AXIS_WEIGHT,
  'comment.text': COMMENT_AXIS_WEIGHT,
  'conversation.private': CONVERSATION_AXIS_WEIGHT,
  'conversation.public': CONVERSATION_AXIS_WEIGHT,
  'conversation.community': CONVERSATION_AXIS_WEIGHT,
  'tool.sticker': TOOL_AXIS_WEIGHT,
  'tool.in_app_edit': TOOL_AXIS_WEIGHT,
  'tool.direct_publish': TOOL_AXIS_WEIGHT,
};

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

/** Les 5 axes de « contenu produit » (§ 8 — `achievement.first_content` / `achievement.all_content_types`). */
export const CONTENT_ENGAGEMENT_AXES: readonly EngagementAxisKey[] = [
  'content.audio_message',
  'content.text_message',
  'content.post',
  'content.story',
  'content.reel',
];

/** Les 3 axes de « conversation distincte » (§ 8 — `achievement.three_conversation_kinds`). */
export const CONVERSATION_ENGAGEMENT_AXES: readonly EngagementAxisKey[] = [
  'conversation.private',
  'conversation.public',
  'conversation.community',
];

/**
 * Succès composés, socle § 8 — condition ponctuelle et non répétable,
 * évaluée par `EngagementService.recordActivity` après incrément. La clé
 * porte déjà son préfixe `achievement.` (contrairement à `badge`/`streak`/
 * `level`, dont le préfixe vit dans `milestoneType`) : c'est la forme que
 * `docs/product/streaks-badges-modele.md` § 4 et § 8 déclarent pour
 * `EngagementMilestone.milestoneKey`.
 */
export const ENGAGEMENT_ACHIEVEMENT_KEYS = [
  'achievement.first_content',
  'achievement.all_content_types',
  'achievement.first_voice',
  'achievement.editor',
  'achievement.three_conversation_kinds',
] as const;

export type EngagementAchievementKey = (typeof ENGAGEMENT_ACHIEVEMENT_KEYS)[number];

/** Paliers par échelle — socle initial, tunable (§ 7). */
export const BADGE_THRESHOLDS = [1, 10, 50, 100, 500] as const;
export const STREAK_THRESHOLDS = [3, 7, 14, 30, 60, 100] as const;
export const LEVEL_THRESHOLDS = [10, 50, 150, 400, 1000, 2500] as const;

export const ENGAGEMENT_MILESTONE_TYPES = ['badge', 'streak', 'level', 'achievement'] as const;

export type EngagementMilestoneType = (typeof ENGAGEMENT_MILESTONE_TYPES)[number];

export const isEngagementMilestoneType = (value: string): value is EngagementMilestoneType =>
  (ENGAGEMENT_MILESTONE_TYPES as readonly string[]).includes(value);

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

/**
 * Famille d'un axe — la SECTION du tableau de bord « Progression » (#5547,
 * docs/product/streaks-badges-modele.md § 2 : contenu produit, commentaires,
 * conversations, usage d'outils). Elle EST le préfixe de la clé stable
 * (`content.` / `comment.` / `conversation.` / `tool.`) : aucune table à
 * tenir en miroir sur trois clients — chacun la DÉRIVE de la clé qu'il
 * affiche (Swift : `EngagementAxisKey.family`, `EngagementCatalog.swift`).
 */
export const ENGAGEMENT_AXIS_FAMILIES = ['content', 'comment', 'conversation', 'tool'] as const;

export type EngagementAxisFamily = (typeof ENGAGEMENT_AXIS_FAMILIES)[number];

export function engagementAxisFamily(axisKey: EngagementAxisKey): EngagementAxisFamily {
  const family = ENGAGEMENT_AXIS_FAMILIES.find((candidate) => axisKey.startsWith(`${candidate}.`));
  if (family === undefined) {
    throw new Error(`Axe d'engagement sans famille connue : ${axisKey}`);
  }
  return family;
}

/**
 * Les CLÉS de palier telles que `EngagementService` les grave dans
 * `EngagementMilestone.milestoneKey` (§ 4 du modèle) — un client qui veut
 * dater un badge, une série ou un niveau les recompose à l'identique, jamais
 * en devinant la forme depuis un exemple. `achievement.*` n'a pas de
 * fonction : la clé de succès EST la `milestoneKey`, sans transformation.
 */
export const badgeMilestoneKey = (axisKey: EngagementAxisKey, threshold: number): string =>
  `${axisKey}:${threshold}`;
export const streakMilestoneKey = (threshold: number): string => `streak:${threshold}`;
export const levelMilestoneKey = (threshold: number): string => `level:${threshold}`;

/**
 * LA CHARGE DE `GET /me/engagement` (#5670,
 * `services/gateway/src/routes/me/engagement.ts`) — la forme EXACTE que la
 * passerelle rend, consommée telle quelle par les clients.
 *
 * `axisKey` et `milestoneKey` restent des chaînes libres : un axe ajouté au
 * serveur avant la mise à jour d'un client ne doit jamais casser l'écran —
 * `resolveEngagementProgress` (`utils/engagement-progress.ts`) ignore ce qu'il
 * ne connaît pas. Fail-safe à l'AFFICHAGE, fail-closed à la FORME :
 * `isEngagementProgressPayload` est la garde de frontière, un narrowing ÉCRIT
 * À LA MAIN plutôt qu'un schéma Zod, délibérément — ce module est importé par
 * les chunks d'écran de la v3.1, où chaque kilo-octet se paie sur Fast 3G
 * (D-14), et Zod n'y entre nulle part. Toute forme qui ne correspond pas
 * exactement (compteur non entier ou négatif, type de palier inconnu, date
 * absente) rend `false` — jamais une charge à moitié lue.
 */
export type EngagementCounterEntry = {
  readonly axisKey: string;
  readonly count: number;
};

export type EngagementMilestoneEntry = {
  readonly milestoneType: EngagementMilestoneType;
  readonly milestoneKey: string;
  /** ISO 8601 — `EngagementMilestone.reachedAt`, sérialisé par la route. */
  readonly reachedAt: string;
};

export type EngagementProgressPayload = {
  readonly counters: readonly EngagementCounterEntry[];
  readonly milestones: readonly EngagementMilestoneEntry[];
  readonly streak: {
    readonly currentStreakDays: number;
    readonly longestStreakDays: number;
  };
  readonly level: {
    readonly engagementScore: number;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isCounterEntry = (value: unknown): value is EngagementCounterEntry =>
  isRecord(value) && typeof value.axisKey === 'string' && isNonNegativeInteger(value.count);

const isMilestoneEntry = (value: unknown): value is EngagementMilestoneEntry =>
  isRecord(value) &&
  typeof value.milestoneType === 'string' &&
  isEngagementMilestoneType(value.milestoneType) &&
  typeof value.milestoneKey === 'string' &&
  typeof value.reachedAt === 'string';

export function isEngagementProgressPayload(value: unknown): value is EngagementProgressPayload {
  if (!isRecord(value)) return false;
  const { counters, milestones, streak, level } = value;
  return (
    Array.isArray(counters) &&
    counters.every(isCounterEntry) &&
    Array.isArray(milestones) &&
    milestones.every(isMilestoneEntry) &&
    isRecord(streak) &&
    isNonNegativeInteger(streak.currentStreakDays) &&
    isNonNegativeInteger(streak.longestStreakDays) &&
    isRecord(level) &&
    isNonNegativeInteger(level.engagementScore)
  );
}

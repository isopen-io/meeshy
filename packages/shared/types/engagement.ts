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
  'social.tracked_link',
  'social.share',
  'social.invite_joined',
  'social.friendship',
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

/**
 * Les 4 axes du LIEN SOCIAL (#5766).
 *
 * Les treize axes d'origine mesurent ce que l'auteur PRODUIT — contenu,
 * commentaires, conversations, outils. Aucun ne mesurait ce qu'il TISSE. Or
 * Meeshy est une messagerie : ce qui fait revenir quelqu'un n'est pas seulement
 * ce qu'il publie, c'est le lien qu'il noue.
 *
 * Les quatre se distinguent par QUI agit, et c'est ce qui les rend
 * non redondants : `tracked_link` et `share` sont des gestes de l'auteur ;
 * `invite_joined` et `friendship` sont des gestes d'un AUTRE que l'auteur
 * provoque. Les seconds valent plus cher à obtenir — c'est voulu.
 */
export const SOCIAL_ENGAGEMENT_AXES: readonly EngagementAxisKey[] = [
  'social.tracked_link',
  'social.share',
  'social.invite_joined',
  'social.friendship',
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
/**
 * **9 — le poids le plus fort du catalogue** (arbitrage porteur, 2026-09-09,
 * relevé depuis 3).
 *
 * Ce que l'auteur PRODUIT passe devant tout : un message, une story, un réel,
 * un post sont la matière même du produit — le lien et la conversation
 * existent pour les porter.
 *
 * **Le relèvement n'est pas rétroactif, et c'est voulu.**
 * `EngagementService.addToScore` fait `engagementScore: { increment: weight }`
 * sur `User` : le score est BANQUÉ, jamais recalculé depuis les compteurs. Le
 * contenu déjà produit garde donc les 3 points qu'il valait, et aucun niveau
 * n'est distribué rétroactivement. L'échelle est mixte le temps que les
 * comptes tournent — c'est le prix, connu, d'un score persisté plutôt que
 * dérivé.
 */
export const CONTENT_AXIS_WEIGHT = 9;
/**
 * **3** (arbitrage porteur, 2026-09-09, relevé depuis 2).
 *
 * Commenter n'est pas seulement réagir : c'est produire du contenu chez
 * quelqu'un d'autre. Non rétroactif, comme les autres relèvements du jour —
 * le score est banqué à l'incrément, jamais recalculé.
 */
export const COMMENT_AXIS_WEIGHT = 3;
export const CONVERSATION_AXIS_WEIGHT = 5;
export const TOOL_AXIS_WEIGHT = 1;
/**
 * **7 — deuxième poids du catalogue** (arbitrage porteur, 2026-09-09, qui a
 * renversé la proposition initiale de 4).
 *
 * Le lien passe devant la conversation (5) : **sans lien noué, il n'y a
 * aucune conversation à tenir.** Inviter, partager, être rejoint, se lier sont
 * les gestes qui CRÉENT la condition des autres axes — mais ils restent au
 * service de ce qui se produit (9).
 */
export const SOCIAL_AXIS_WEIGHT = 7;

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
  'social.tracked_link': SOCIAL_AXIS_WEIGHT,
  'social.share': SOCIAL_AXIS_WEIGHT,
  'social.invite_joined': SOCIAL_AXIS_WEIGHT,
  'social.friendship': SOCIAL_AXIS_WEIGHT,
};

/**
 * Famille d'un axe — la SECTION du tableau de bord « Progression » (#5547,
 * docs/product/streaks-badges-modele.md § 2 : contenu produit, commentaires,
 * conversations, usage d'outils). Elle EST le préfixe de la clé stable
 * (`content.` / `comment.` / `conversation.` / `tool.`) : aucune table à
 * tenir en miroir sur trois clients — chacun la DÉRIVE de la clé qu'il
 * affiche (Swift : `EngagementAxisKey.family`, `EngagementCatalog.swift`).
 */
export const ENGAGEMENT_AXIS_FAMILIES = ['content', 'comment', 'conversation', 'tool', 'social'] as const;

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
  /** Points crédités par cet axe, élan compris (#5749) — optionnel : un serveur antérieur ne le sert pas. */
  readonly points?: number;
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
  /**
   * LA CARTE D'ATTEIGNABILITÉ des succès (#5759) — OPTIONNELLE.
   *
   * `familyId -> plus grande valeur que le produit peut rendre vraie`. Une
   * famille ABSENTE de la carte n'est pas « zéro » : c'est « non mesuré », et
   * la loi d'affichage (`isAttainable`) masque alors ses paliers d'AMPLEUR tout
   * en laissant ses paliers de VOLUME visibles. Servir zéro dirait « rien n'est
   * atteignable », ce qui est faux et pire.
   */
  readonly achievementReach?: Readonly<Record<string, number>>;
  /**
   * L'ÉLAN COURANT (#5749) — OPTIONNEL, comme `meesh`.
   *
   * Ce que le PROCHAIN geste créditera, pas ce que le dernier a crédité : un
   * multiplicateur sert à décider quoi faire ensuite. Servi pour être MONTRÉ —
   * un accélérateur qu'on ne voit pas n'accélère rien, il surprend.
   */
  readonly elan?: {
    /** Le multiplicateur effectif, toujours dans [1, 5]. */
    readonly factor: number;
    /** Familles distinctes actives sur la fenêtre — ce qui porte les trois premiers crans. */
    readonly activeFamilyCount: number;
    /** L'assise permanente est-elle acquise — le quatrième cran. */
    readonly hasStanding: boolean;
    /** La fenêtre glissante, en jours — servie pour qu'aucun client ne la code en dur. */
    readonly windowDays: number;
  };
  /**
   * Les Meeshes (#5743) — OPTIONNEL, délibérément.
   *
   * Un client déployé avant ce lot ne connaît pas ce champ et doit continuer
   * de fonctionner ; un serveur antérieur ne le sert pas et l'écran doit
   * simplement ne rien montrer. C'est la règle « un contrat NEUF s'AJOUTE à
   * l'ancien pour les clients déployés » — la garde de frontière ci-dessous
   * accepte donc son absence, et REFUSE une forme partielle.
   */
  readonly meesh?: {
    readonly balance: number;
    /** Frappées à vie — monotone, c'est elle que le rang interroge (#5744). */
    readonly mintedLifetime: number;
    /** Points repris à des axes débitables — jamais les conversations. */
    readonly debitablePoints: number;
    /** Points du plancher inaliénable, montrés mais jamais dépensables. */
    readonly floorPoints: number;
    /** Points manquants pour frapper — `0` quand la frappe est possible. */
    readonly missingPoints: number;
    /** Le prix d'une frappe, servi par le serveur pour qu'aucun client ne le code en dur. */
    readonly mintCost: number;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isCounterEntry = (value: unknown): value is EngagementCounterEntry =>
  isRecord(value) &&
  typeof value.axisKey === 'string' &&
  isNonNegativeInteger(value.count) &&
  (value.points === undefined || isNonNegativeInteger(value.points));

const isMilestoneEntry = (value: unknown): value is EngagementMilestoneEntry =>
  isRecord(value) &&
  typeof value.milestoneType === 'string' &&
  isEngagementMilestoneType(value.milestoneType) &&
  typeof value.milestoneKey === 'string' &&
  typeof value.reachedAt === 'string';

/**
 * Le bloc `meesh` : ABSENT (serveur antérieur) ou COMPLET, jamais à moitié.
 * Une charge partielle ferait afficher un solde sans savoir si la frappe est
 * possible — pire qu'une absence, qui n'affiche rien.
 */
/** Le bloc `elan` : ABSENT (serveur antérieur) ou COMPLET, jamais à moitié. */
const isElanBlock = (value: unknown): boolean =>
  isRecord(value) &&
  isNonNegativeInteger(value.activeFamilyCount) &&
  typeof value.hasStanding === 'boolean' &&
  isNonNegativeInteger(value.windowDays) &&
  typeof value.factor === 'number' &&
  Number.isFinite(value.factor) &&
  value.factor >= 1;

const isMeeshBlock = (value: unknown): boolean =>
  isRecord(value) &&
  isNonNegativeInteger(value.balance) &&
  isNonNegativeInteger(value.mintedLifetime) &&
  isNonNegativeInteger(value.debitablePoints) &&
  isNonNegativeInteger(value.floorPoints) &&
  isNonNegativeInteger(value.missingPoints) &&
  isNonNegativeInteger(value.mintCost);

export function isEngagementProgressPayload(value: unknown): value is EngagementProgressPayload {
  if (!isRecord(value)) return false;
  const { counters, milestones, streak, level, meesh, elan, achievementReach } = value;
  if (
    achievementReach !== undefined &&
    (!isRecord(achievementReach) || !Object.values(achievementReach).every(isNonNegativeInteger))
  ) {
    return false;
  }
  if (meesh !== undefined && !isMeeshBlock(meesh)) return false;
  if (elan !== undefined && !isElanBlock(elan)) return false;
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

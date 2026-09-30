/**
 * LE BARÈME — ce que chaque geste rapporte, réglé depuis l'administration (#8906).
 *
 * Les poids d'axe (`ENGAGEMENT_AXIS_WEIGHTS`) et les règles de l'élan
 * (`utils/engagement-elan.ts`) étaient des constantes : les changer demandait un
 * déploiement. Le barème en fait une DONNÉE, stockée en base (`EngagementScale`,
 * une ligne singleton) et écrite par ADMIN/BIGBOSS. Les constantes restent les
 * DÉFAUTS : un barème jamais réglé crédite exactement ce que le code créditait.
 *
 * Trois choses se règlent :
 * - par OPÉRATION (un axe d'engagement) : ses points, s'ils sont multipliés par
 *   l'élan, et un plafond d'actions créditées par conversation et par jour
 *   (anti-farm : réagir / retirer / réagir ne doit pas pomper des points) ;
 * - les RÈGLES qui font monter le multiplicateur (fenêtre, assise) ;
 * - son PLAFOND PAR NIVEAU : un compte de niveau 0 ne monte pas aussi haut
 *   qu'un vétéran si l'administration le décide.
 *
 * Fonctions PURES : la passerelle crédite avec, les clients affichent avec, et
 * l'écran d'administration valide avec — une seule loi.
 *
 * Garde de frontière écrite à la main, sans Zod, pour la même raison que
 * `isEngagementProgressPayload` : ce module entre dans les chunks web.
 */

import {
  ENGAGEMENT_AXES,
  ENGAGEMENT_AXIS_FAMILIES,
  type EngagementAxisFamily,
  ENGAGEMENT_AXIS_WEIGHTS,
  LEVEL_THRESHOLDS,
  isEngagementAxisKey,
  type EngagementAxisKey,
} from './engagement.js';

/** Plafond DUR du multiplicateur, quel que soit le barème — l'administration règle en dessous. */
export const ENGAGEMENT_SCALE_FACTOR_CEILING = 10;
/** Plafond DUR des points d'une opération — une faute de frappe ne distribue pas un million. */
export const ENGAGEMENT_SCALE_POINTS_CEILING = 1000;
/** Plafond DUR de la fenêtre glissante de l'élan. */
export const ENGAGEMENT_SCALE_WINDOW_CEILING_DAYS = 90;

export type EngagementOperationRule = {
  /** Points de base d'une action, avant multiplicateur. `0` = l'opération ne rapporte rien. */
  readonly points: number;
  /** `true` ⇒ les points sont multipliés par l'élan ; `false` ⇒ toujours crédités tels quels. */
  readonly multiplied: boolean;
  /**
   * Nombre maximal d'actions créditées par (utilisateur, conversation, jour civil).
   * `null` = sans plafond. Sans effet sur une opération hors conversation (post, story…).
   */
  readonly dailyCapPerConversation: number | null;
};

/** Plafond du multiplicateur à partir d'un niveau (le RANG, `levelOfScore`). */
export type EngagementLevelFactorCap = {
  readonly minLevel: number;
  readonly maxFactor: number;
};

export type EngagementMultiplierRules = {
  /** Fenêtre glissante, en jours, sur laquelle une famille d'axes compte comme active. */
  readonly windowDays: number;
  /** Crans gagnés par famille active au-delà de la première. */
  readonly stepPerExtraFamily: number;
  /** Cran supplémentaire accordé par l'assise. */
  readonly standingBonus: number;
  /** Succès débloqués à partir desquels l'assise est acquise. */
  readonly achievementsForStanding: number;
  /** Palier de badge considéré comme « élevé ». */
  readonly highBadgeThreshold: number;
  /** Badges élevés à partir desquels l'assise est acquise. */
  readonly highBadgesForStanding: number;
  /** Plafond global, sous `ENGAGEMENT_SCALE_FACTOR_CEILING`. */
  readonly maxFactor: number;
  /**
   * Plafond par niveau, trié par `minLevel` croissant. Le plafond d'un compte est
   * celui de la dernière entrée dont `minLevel <= niveau`, borné par `maxFactor`.
   * Vide ⇒ `maxFactor` pour tous.
   */
  readonly levelCaps: readonly EngagementLevelFactorCap[];
};

export type EngagementScale = {
  readonly operations: Readonly<Record<EngagementAxisKey, EngagementOperationRule>>;
  readonly multiplier: EngagementMultiplierRules;
};

/**
 * Ce que `GET /admin/engagement-scale` rend : le barème effectif, plus qui l'a
 * réglé et quand (`null` tant qu'il n'a jamais été réglé — ce sont les défauts).
 */
export type EngagementScaleDocument = {
  readonly scale: EngagementScale;
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
};

/** Plafond journalier par défaut des opérations qu'un geste répété peut pomper. */
export const DEFAULT_REACTION_DAILY_CAP = 30;
export const DEFAULT_ATTACHMENT_DAILY_CAP = 50;

const DEFAULT_DAILY_CAPS: Partial<Record<EngagementAxisKey, number>> = {
  'tool.reaction': DEFAULT_REACTION_DAILY_CAP,
  'tool.attachment': DEFAULT_ATTACHMENT_DAILY_CAP,
};

/** Les défauts : les constantes que le code créditait avant le barème — rien ne change tant que personne ne règle. */
export const DEFAULT_ENGAGEMENT_SCALE: EngagementScale = {
  operations: Object.fromEntries(
    ENGAGEMENT_AXES.map((axisKey) => [
      axisKey,
      {
        points: ENGAGEMENT_AXIS_WEIGHTS[axisKey],
        multiplied: true,
        dailyCapPerConversation: DEFAULT_DAILY_CAPS[axisKey] ?? null,
      },
    ]),
  ) as Record<EngagementAxisKey, EngagementOperationRule>,
  multiplier: {
    windowDays: 7,
    stepPerExtraFamily: 1,
    standingBonus: 1,
    achievementsForStanding: 10,
    highBadgeThreshold: 100,
    highBadgesForStanding: 5,
    maxFactor: 5,
    levelCaps: [],
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIntIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

const isNumberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const isDailyCap = (value: unknown): value is number | null =>
  value === null || isIntIn(value, 0, 100_000);

function parseOperationRule(value: unknown): EngagementOperationRule | null {
  if (!isRecord(value)) return null;
  const { points, multiplied, dailyCapPerConversation } = value;
  if (!isIntIn(points, 0, ENGAGEMENT_SCALE_POINTS_CEILING)) return null;
  if (typeof multiplied !== 'boolean') return null;
  if (!isDailyCap(dailyCapPerConversation)) return null;
  return { points, multiplied, dailyCapPerConversation };
}

function parseLevelCaps(value: unknown, maxFactor: number): readonly EngagementLevelFactorCap[] | null {
  if (!Array.isArray(value)) return null;
  const caps: EngagementLevelFactorCap[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (!isIntIn(entry.minLevel, 0, LEVEL_THRESHOLDS.length)) return null;
    if (!isNumberIn(entry.maxFactor, 1, maxFactor)) return null;
    caps.push({ minLevel: entry.minLevel, maxFactor: entry.maxFactor });
  }
  const levels = caps.map((cap) => cap.minLevel);
  if (new Set(levels).size !== levels.length) return null;
  return [...caps].sort((a, b) => a.minLevel - b.minLevel);
}

function parseMultiplier(value: unknown): EngagementMultiplierRules | null {
  if (!isRecord(value)) return null;
  const maxFactor = value.maxFactor;
  if (!isNumberIn(maxFactor, 1, ENGAGEMENT_SCALE_FACTOR_CEILING)) return null;
  const levelCaps = parseLevelCaps(value.levelCaps, maxFactor);
  if (levelCaps === null) return null;
  const rules = {
    windowDays: value.windowDays,
    stepPerExtraFamily: value.stepPerExtraFamily,
    standingBonus: value.standingBonus,
    achievementsForStanding: value.achievementsForStanding,
    highBadgeThreshold: value.highBadgeThreshold,
    highBadgesForStanding: value.highBadgesForStanding,
  };
  if (!isIntIn(rules.windowDays, 1, ENGAGEMENT_SCALE_WINDOW_CEILING_DAYS)) return null;
  if (!isNumberIn(rules.stepPerExtraFamily, 0, ENGAGEMENT_SCALE_FACTOR_CEILING)) return null;
  if (!isNumberIn(rules.standingBonus, 0, ENGAGEMENT_SCALE_FACTOR_CEILING)) return null;
  if (!isIntIn(rules.achievementsForStanding, 0, 100_000)) return null;
  if (!isIntIn(rules.highBadgeThreshold, 1, 100_000)) return null;
  if (!isIntIn(rules.highBadgesForStanding, 0, 100_000)) return null;
  return {
    windowDays: rules.windowDays,
    stepPerExtraFamily: rules.stepPerExtraFamily,
    standingBonus: rules.standingBonus,
    achievementsForStanding: rules.achievementsForStanding,
    highBadgeThreshold: rules.highBadgeThreshold,
    highBadgesForStanding: rules.highBadgesForStanding,
    maxFactor,
    levelCaps,
  };
}

/**
 * Lit un barème — celui qu'envoie l'administration, ou celui stocké en base.
 *
 * FAIL-CLOSED à la forme : une règle hors bornes, un axe inconnu, un plafond de
 * niveau au-dessus du plafond global ⇒ `null`, jamais un barème à moitié lu.
 * TOLÉRANT au catalogue : un axe du catalogue ABSENT (ajouté au code après le
 * réglage) prend sa règle par défaut — sinon ajouter un axe ferait tomber le
 * barème entier au premier déploiement.
 */
export function parseEngagementScale(value: unknown): EngagementScale | null {
  if (!isRecord(value) || !isRecord(value.operations)) return null;
  const multiplier = parseMultiplier(value.multiplier);
  if (multiplier === null) return null;

  const operations: Partial<Record<EngagementAxisKey, EngagementOperationRule>> = {};
  for (const [axisKey, raw] of Object.entries(value.operations)) {
    if (!isEngagementAxisKey(axisKey)) return null;
    const rule = parseOperationRule(raw);
    if (rule === null) return null;
    operations[axisKey] = rule;
  }
  for (const axisKey of ENGAGEMENT_AXES) {
    operations[axisKey] ??= DEFAULT_ENGAGEMENT_SCALE.operations[axisKey];
  }
  return { operations: operations as Record<EngagementAxisKey, EngagementOperationRule>, multiplier };
}

/** Le NIVEAU d'un score — le rang du dernier palier `LEVEL_THRESHOLDS` atteint (0 sous le premier). */
export function levelOfScore(score: number): number {
  return LEVEL_THRESHOLDS.filter((threshold) => score >= threshold).length;
}

/** Le plafond du multiplicateur pour un compte de ce niveau. */
export function factorCapForLevel(rules: EngagementMultiplierRules, level: number): number {
  const cap = rules.levelCaps.reduce<number | null>(
    (current, entry) => (entry.minLevel <= level ? entry.maxFactor : current),
    null,
  );
  return Math.min(rules.maxFactor, cap ?? rules.maxFactor);
}

export type EngagementScaleElanInput = {
  /** Familles distinctes actives sur la fenêtre (y compris celle du geste courant). */
  readonly activeFamilyCount: number;
  readonly achievementCount: number;
  readonly highBadgeCount: number;
  /** Le score agrégé courant — il fixe le niveau, donc le plafond. */
  readonly engagementScore: number;
};

export type EngagementScaleElan = {
  readonly factor: number;
  readonly hasStanding: boolean;
  readonly level: number;
  readonly cap: number;
};

/** Le multiplicateur sous CE barème — la généralisation de `computeEngagementElan`, même loi aux défauts. */
export function elanUnderScale(rules: EngagementMultiplierRules, input: EngagementScaleElanInput): EngagementScaleElan {
  const hasStanding =
    input.achievementCount >= rules.achievementsForStanding ||
    input.highBadgeCount >= rules.highBadgesForStanding;
  const level = levelOfScore(Math.max(0, input.engagementScore));
  const cap = factorCapForLevel(rules, level);
  const raw =
    1 +
    Math.max(0, input.activeFamilyCount - 1) * rules.stepPerExtraFamily +
    (hasStanding ? rules.standingBonus : 0);
  return { factor: Math.min(cap, Math.max(1, raw)), hasStanding, level, cap };
}

export type EngagementScaleElanFromRows = EngagementScaleElan & {
  readonly activeFamilies: readonly EngagementAxisFamily[];
  readonly activeFamilyCount: number;
};

/**
 * Le multiplicateur sous CE barème, DÉRIVÉ de lignes déjà lues — la jumelle
 * barème-consciente d'`elanInputsFromRows` : l'écran « Progression » et les
 * récompenses de l'onboarding AFFICHENT ce que `EngagementService` CRÉDITERA,
 * fenêtre et seuil de haut badge compris. `extraFamily` ajoute la famille du
 * geste à venir, comme le crédit le fait.
 */
export function elanUnderScaleFromRows(params: {
  readonly rules: EngagementMultiplierRules;
  readonly counters: readonly { readonly axisKey: string; readonly updatedAt: Date | string }[];
  readonly milestones: readonly { readonly milestoneType: string; readonly milestoneKey: string }[];
  readonly familyOf: (axisKey: string) => EngagementAxisFamily | null;
  readonly engagementScore: number;
  readonly extraFamily?: EngagementAxisFamily;
  readonly now?: Date;
}): EngagementScaleElanFromRows {
  const since = (params.now ?? new Date()).getTime() - params.rules.windowDays * 86_400_000;
  const recent = params.counters
    .filter((counter) => {
      const at = new Date(counter.updatedAt).getTime();
      return Number.isFinite(at) && at >= since;
    })
    .map((counter) => params.familyOf(counter.axisKey))
    .filter((family): family is EngagementAxisFamily => family !== null);
  const families = new Set<EngagementAxisFamily>(
    [...recent, ...(params.extraFamily ? [params.extraFamily] : [])].filter((family) =>
      (ENGAGEMENT_AXIS_FAMILIES as readonly string[]).includes(family),
    ),
  );
  const achievementCount = params.milestones.filter((m) => m.milestoneType === 'achievement').length;
  const highBadgeCount = params.milestones.filter((m) => {
    if (m.milestoneType !== 'badge') return false;
    const threshold = Number.parseInt(m.milestoneKey.split(':').at(-1) ?? '', 10);
    return Number.isFinite(threshold) && threshold >= params.rules.highBadgeThreshold;
  }).length;
  const elan = elanUnderScale(params.rules, {
    activeFamilyCount: families.size,
    achievementCount,
    highBadgeCount,
    engagementScore: params.engagementScore,
  });
  return { ...elan, activeFamilies: [...families], activeFamilyCount: families.size };
}

/** Les points qu'UNE action de cet axe crédite sous ce barème et à ce multiplicateur — entier, jamais négatif. */
export function pointsForOperation(scale: EngagementScale, axisKey: EngagementAxisKey, factor: number): number {
  const rule = scale.operations[axisKey];
  const multiplied = rule.multiplied ? rule.points * factor : rule.points;
  return Math.max(0, Math.round(multiplied));
}

/**
 * L'ÉTAT D'ENGAGEMENT D'UNE CONVERSATION pour son LECTEUR — « N (M) 🔥 ».
 *
 * Toujours PAR LECTEUR : ce sont les points que CETTE conversation a rapportés à
 * celui qui la regarde, jamais ceux d'un autre participant.
 *
 * `todayPoints` et `streakDays` sont déjà RÉSOLUS par le serveur au jour civil
 * du lecteur (`day`) : un client qui passe minuit sans nouvel événement remet
 * `todayPoints` à zéro dès que `day` n'est plus aujourd'hui
 * (`conversationEngagementForDay`).
 */
export type ConversationEngagementSnapshot = {
  readonly conversationId: string;
  /** N — points rapportés par cette conversation, depuis toujours. */
  readonly totalPoints: number;
  /** M — points rapportés aujourd'hui. */
  readonly todayPoints: number;
  /** Jours civils consécutifs avec au moins un geste crédité dans cette conversation. */
  readonly streakDays: number;
  /** Jour civil (`YYYY-MM-DD`, fuseau du lecteur) du dernier geste crédité ; `null` si jamais. */
  readonly day: string | null;
};

const isDayString = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function isConversationEngagementSnapshot(value: unknown): value is ConversationEngagementSnapshot {
  return (
    isRecord(value) &&
    typeof value.conversationId === 'string' &&
    isIntIn(value.totalPoints, 0, Number.MAX_SAFE_INTEGER) &&
    isIntIn(value.todayPoints, 0, Number.MAX_SAFE_INTEGER) &&
    isIntIn(value.streakDays, 0, Number.MAX_SAFE_INTEGER) &&
    (value.day === null || isDayString(value.day))
  );
}

/** Jours entre deux `YYYY-MM-DD` (b − a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Ce qu'un client AFFICHE aujourd'hui depuis un instantané possiblement ancien :
 * `todayPoints` retombe à 0 dès que `day` n'est plus `today` ; la série tombe à 0
 * quand le dernier geste date d'avant-hier ou plus (hier, elle tient encore :
 * un geste aujourd'hui la prolongera).
 */
export function conversationEngagementForDay(
  snapshot: ConversationEngagementSnapshot,
  today: string,
): ConversationEngagementSnapshot {
  if (snapshot.day === null) return { ...snapshot, todayPoints: 0, streakDays: 0 };
  const gap = daysBetween(snapshot.day, today);
  return {
    ...snapshot,
    todayPoints: gap === 0 ? snapshot.todayPoints : 0,
    streakDays: gap <= 1 ? snapshot.streakDays : 0,
  };
}

/** Le texte de la pastille, tel que demandé par le porteur — « N (M) » ; la flamme et la série se rendent à côté. */
export function formatConversationPoints(snapshot: Pick<ConversationEngagementSnapshot, 'totalPoints' | 'todayPoints'>): string {
  return `${snapshot.totalPoints} (${snapshot.todayPoints})`;
}

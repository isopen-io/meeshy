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
  ENGAGEMENT_AXIS_FAMILIES,
  type EngagementAxisFamily,
  LEVEL_THRESHOLDS,
} from './engagement.js';
import {
  ENGAGEMENT_OPERATIONS,
  ENGAGEMENT_OPERATION_CATALOG,
  isEngagementOperationKey,
  type EngagementOperationKey,
} from './engagement-operations.js';

/** Plafond DUR du multiplicateur, quel que soit le barème — l'administration règle en dessous. */
export const ENGAGEMENT_SCALE_FACTOR_CEILING = 10;
/** Plafond DUR des points d'une opération — une faute de frappe ne distribue pas un million. */
export const ENGAGEMENT_SCALE_POINTS_CEILING = 1000;
/** Plafond DUR de la fenêtre glissante de l'élan. */
export const ENGAGEMENT_SCALE_WINDOW_CEILING_DAYS = 90;
/** Plafond DUR d'un plafond d'actions. */
export const ENGAGEMENT_SCALE_CAP_CEILING = 100_000;

export type EngagementOperationRule = {
  /** Points de base d'une action, avant multiplicateur. `0` = l'opération ne rapporte rien. */
  readonly points: number;
  /** `true` ⇒ les points sont multipliés par l'élan ; `false` ⇒ toujours crédités tels quels. */
  readonly multiplied: boolean;
  /**
   * Nombre maximal d'actions créditées dans la PORTÉE de l'opération
   * (`ENGAGEMENT_OPERATION_CATALOG[key].capScope` : par conversation et par
   * jour, par jour, par cible). `null` = sans plafond. Sans effet sur une
   * opération sans portée ou unique (par cible, par compte).
   */
  readonly cap: number | null;
  /**
   * Les points de chaque VARIANTE déclarée par le catalogue (visibilité d'un
   * post ou d'une story, position en direct ou statique). Une variante absente
   * crédite `points`.
   */
  readonly variantPoints: Readonly<Record<string, number>>;
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

/**
 * LA RÈGLE PROGRESSIVE DES VISITES DE LIEN (arbitrage porteur, 2026-09-30) :
 * une visite vaut `basePoints` ; chaque fois que le nombre de visites double
 * au-delà de `firstTier`, chaque visite suivante vaut `stepPerDoubling` de
 * plus, jusqu'à `maxPoints`. Une visite ne compte qu'une fois par visiteur,
 * par lien et par `dedupHours`, jamais celle du créateur.
 */
export type EngagementLinkVisitRules = {
  readonly basePoints: number;
  readonly firstTier: number;
  readonly stepPerDoubling: number;
  readonly maxPoints: number;
  readonly dedupHours: number;
  /** Visites créditées au plus par créateur et par jour — un robot ne pompe pas un lien. `null` = aucun. */
  readonly dailyCapPerCreator: number | null;
};

/** Un bonus de constance : `points` quand la série de jours actifs atteint `days`. */
export type EngagementStreakBonus = {
  readonly days: number;
  readonly points: number;
};

/**
 * LES GARDE-FOUS DES GROS POIDS. Une opération dont les points de base
 * atteignent `heavyPoints` (post, story, reel aux défauts) :
 * - ne crédite qu'une fois par contenu ;
 * - rend ses points si le contenu est supprimé dans les `clawbackHours` ;
 * - est bornée à `unverifiedMaxPoints` pour un compte sans e-mail ni
 *   téléphone vérifié — une ferme de comptes jetables ne publie pas à 199.
 */
export type EngagementAbuseRules = {
  readonly heavyPoints: number;
  readonly clawbackHours: number;
  readonly unverifiedMaxPoints: number;
};

export type EngagementScale = {
  readonly operations: Readonly<Record<EngagementOperationKey, EngagementOperationRule>>;
  readonly multiplier: EngagementMultiplierRules;
  readonly linkVisits: EngagementLinkVisitRules;
  readonly streakBonuses: readonly EngagementStreakBonus[];
  readonly abuse: EngagementAbuseRules;
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

export const DEFAULT_LINK_VISIT_RULES: EngagementLinkVisitRules = {
  basePoints: 2,
  firstTier: 10,
  stepPerDoubling: 2,
  maxPoints: 20,
  dedupHours: 24,
  dailyCapPerCreator: 200,
};

export const DEFAULT_STREAK_BONUSES: readonly EngagementStreakBonus[] = [
  { days: 7, points: 10 },
  { days: 30, points: 30 },
  { days: 100, points: 100 },
];

export const DEFAULT_ABUSE_RULES: EngagementAbuseRules = {
  heavyPoints: 50,
  clawbackHours: 24,
  unverifiedMaxPoints: 10,
};

function defaultRule(key: EngagementOperationKey): EngagementOperationRule {
  const { defaults } = ENGAGEMENT_OPERATION_CATALOG[key];
  return {
    points: defaults.points,
    multiplied: defaults.multiplied,
    cap: defaults.cap,
    variantPoints: defaults.variantPoints ?? {},
  };
}

/** Les défauts fixés par le porteur (2026-09-30) — ce que crédite un barème jamais réglé. */
export const DEFAULT_ENGAGEMENT_SCALE: EngagementScale = {
  operations: Object.fromEntries(ENGAGEMENT_OPERATIONS.map((key) => [key, defaultRule(key)])) as Record<
    EngagementOperationKey,
    EngagementOperationRule
  >,
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
  linkVisits: DEFAULT_LINK_VISIT_RULES,
  streakBonuses: DEFAULT_STREAK_BONUSES,
  abuse: DEFAULT_ABUSE_RULES,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIntIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

const isNumberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const isCap = (value: unknown): value is number | null =>
  value === null || isIntIn(value, 0, ENGAGEMENT_SCALE_CAP_CEILING);

function parseVariantPoints(key: EngagementOperationKey, value: unknown): Readonly<Record<string, number>> | null {
  const declared = ENGAGEMENT_OPERATION_CATALOG[key].variants;
  if (value === undefined) return defaultRule(key).variantPoints;
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([variant, points]) => declared.includes(variant) && isIntIn(points, 0, ENGAGEMENT_SCALE_POINTS_CEILING))) {
    return null;
  }
  return { ...defaultRule(key).variantPoints, ...Object.fromEntries(entries) } as Record<string, number>;
}

/**
 * Une règle d'opération. `dailyCapPerConversation` est le nom qu'avait le
 * plafond avant le catalogue des opérations : un barème réglé sous l'ancien
 * contrat se relit tel quel.
 */
function parseOperationRule(key: EngagementOperationKey, value: unknown): EngagementOperationRule | null {
  if (!isRecord(value)) return null;
  const { points, multiplied } = value;
  const cap = value.cap !== undefined ? value.cap : value.dailyCapPerConversation ?? null;
  if (!isIntIn(points, 0, ENGAGEMENT_SCALE_POINTS_CEILING)) return null;
  if (typeof multiplied !== 'boolean') return null;
  if (!isCap(cap)) return null;
  const variantPoints = parseVariantPoints(key, value.variantPoints);
  if (variantPoints === null) return null;
  return { points, multiplied, cap, variantPoints };
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

function parseLinkVisits(value: unknown): EngagementLinkVisitRules | null {
  if (value === undefined) return DEFAULT_LINK_VISIT_RULES;
  if (!isRecord(value)) return null;
  const { basePoints, firstTier, stepPerDoubling, maxPoints, dedupHours, dailyCapPerCreator } = value;
  if (!isIntIn(basePoints, 0, ENGAGEMENT_SCALE_POINTS_CEILING)) return null;
  if (!isIntIn(firstTier, 1, ENGAGEMENT_SCALE_CAP_CEILING)) return null;
  if (!isIntIn(stepPerDoubling, 0, ENGAGEMENT_SCALE_POINTS_CEILING)) return null;
  if (!isIntIn(maxPoints, basePoints, ENGAGEMENT_SCALE_POINTS_CEILING)) return null;
  if (!isIntIn(dedupHours, 1, 24 * 30)) return null;
  if (!isCap(dailyCapPerCreator)) return null;
  return { basePoints, firstTier, stepPerDoubling, maxPoints, dedupHours, dailyCapPerCreator };
}

function parseStreakBonuses(value: unknown): readonly EngagementStreakBonus[] | null {
  if (value === undefined) return DEFAULT_STREAK_BONUSES;
  if (!Array.isArray(value)) return null;
  const bonuses: EngagementStreakBonus[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (!isIntIn(entry.days, 1, 10_000)) return null;
    if (!isIntIn(entry.points, 0, ENGAGEMENT_SCALE_POINTS_CEILING)) return null;
    bonuses.push({ days: entry.days, points: entry.points });
  }
  if (new Set(bonuses.map((bonus) => bonus.days)).size !== bonuses.length) return null;
  return [...bonuses].sort((a, b) => a.days - b.days);
}

function parseAbuse(value: unknown): EngagementAbuseRules | null {
  if (value === undefined) return DEFAULT_ABUSE_RULES;
  if (!isRecord(value)) return null;
  const { heavyPoints, clawbackHours, unverifiedMaxPoints } = value;
  if (!isIntIn(heavyPoints, 1, ENGAGEMENT_SCALE_POINTS_CEILING)) return null;
  if (!isIntIn(clawbackHours, 0, 24 * 30)) return null;
  if (!isIntIn(unverifiedMaxPoints, 0, ENGAGEMENT_SCALE_POINTS_CEILING)) return null;
  return { heavyPoints, clawbackHours, unverifiedMaxPoints };
}

/**
 * Lit un barème — celui qu'envoie l'administration, ou celui stocké en base.
 *
 * FAIL-CLOSED à la forme : une règle hors bornes, une opération inconnue, une
 * variante non déclarée, un plafond de niveau au-dessus du plafond global ⇒
 * `null`, jamais un barème à moitié lu.
 * TOLÉRANT au catalogue : une opération ou une section ABSENTE (ajoutée au
 * code après le réglage) prend sa valeur par défaut — sinon ajouter une
 * opération ferait tomber le barème entier au premier déploiement.
 */
export function parseEngagementScale(value: unknown): EngagementScale | null {
  if (!isRecord(value) || !isRecord(value.operations)) return null;
  const multiplier = parseMultiplier(value.multiplier);
  const linkVisits = parseLinkVisits(value.linkVisits);
  const streakBonuses = parseStreakBonuses(value.streakBonuses);
  const abuse = parseAbuse(value.abuse);
  if (multiplier === null || linkVisits === null || streakBonuses === null || abuse === null) return null;

  const operations: Partial<Record<EngagementOperationKey, EngagementOperationRule>> = {};
  for (const [key, raw] of Object.entries(value.operations)) {
    if (!isEngagementOperationKey(key)) return null;
    const rule = parseOperationRule(key, raw);
    if (rule === null) return null;
    operations[key] = rule;
  }
  for (const key of ENGAGEMENT_OPERATIONS) {
    operations[key] ??= DEFAULT_ENGAGEMENT_SCALE.operations[key];
  }
  return {
    operations: operations as Record<EngagementOperationKey, EngagementOperationRule>,
    multiplier,
    linkVisits,
    streakBonuses,
    abuse,
  };
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

/** Les points de BASE d'une action, avant élan : ceux de sa variante quand elle en déclare une. */
export function basePointsForOperation(scale: EngagementScale, key: EngagementOperationKey, variant?: string): number {
  const rule = scale.operations[key];
  return variant !== undefined && variant in rule.variantPoints ? rule.variantPoints[variant] ?? rule.points : rule.points;
}

/** Les points qu'UNE action de cette opération crédite sous ce barème et à ce multiplicateur — entier, jamais négatif. */
export function pointsForOperation(
  scale: EngagementScale,
  key: EngagementOperationKey,
  factor: number,
  variant?: string,
): number {
  const base = basePointsForOperation(scale, key, variant);
  const multiplied = scale.operations[key].multiplied ? base * factor : base;
  return Math.max(0, Math.round(multiplied));
}

/**
 * Ce que vaut la `visitNumber`-ième visite unique d'un lien :
 * `base` jusqu'au premier palier, puis `step` de plus à chaque doublement,
 * jamais au-delà de `maxPoints`.
 */
export function linkVisitPoints(rules: EngagementLinkVisitRules, visitNumber: number): number {
  if (visitNumber <= rules.firstTier) return rules.basePoints;
  const doublings = Math.ceil(Math.log2(visitNumber / rules.firstTier));
  return Math.min(rules.maxPoints, rules.basePoints + rules.stepPerDoubling * doublings);
}

/** Le bonus de constance dû quand la série passe de `previous` à `next` jours — la somme des paliers franchis. */
export function streakBonusPoints(bonuses: readonly EngagementStreakBonus[], previous: number, next: number): number {
  return bonuses.filter((bonus) => bonus.days > previous && bonus.days <= next).reduce((sum, bonus) => sum + bonus.points, 0);
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

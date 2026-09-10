/**
 * LA LOI DE PROGRESSION — ce que l'écran « Progression » (#5547, #5698)
 * RESTITUE depuis la charge de `GET /me/engagement`, écrit UNE fois.
 *
 * `docs/product/streaks-badges-modele.md` § 9 décrit l'écran comme « une
 * lecture directe de `EngagementCounter` + `EngagementMilestone` +
 * `User.{currentStreakDays, longestStreakDays, engagementScore}` ». Lecture
 * directe ne veut pas dire lecture BRUTE : entre la charge et le pixel il y a
 * une dérivation — quels paliers sont atteints, lequel vient ensuite, à quelle
 * fraction on en est, quel niveau porte le score, quelle série court encore.
 * Cette dérivation est la même sur les trois clients, et le dépôt a déjà payé
 * trois fois ce qu'il en coûte de la RÉÉCRIRE par client (Prisme, cycles 118 à
 * 120). Elle vit donc ici, consommée telle quelle par le web ; iOS la rejoue
 * dans `EngagementProgressResolver.swift` sur le MÊME fichier de vecteurs
 * (`fixtures/reading-modes/engagement-progress.vectors.json`), et le témoin de
 * parité `engagement-catalog-mirror-parity.test.ts` interdit au catalogue
 * Swift de diverger du catalogue TS.
 *
 * DEUX SOURCES, DEUX QUESTIONS — jamais confondues :
 *  - le COMPTEUR (`EngagementCounter.count`, `engagementScore`,
 *    `longestStreakDays`) dit CE QUI A ÉTÉ FAIT : un palier est atteint dès
 *    que la valeur le dépasse, qu'une notification soit partie ou non ;
 *  - le PALIER GRAVÉ (`EngagementMilestone`) dit QUAND il a été SERVI : il
 *    fournit la date, et il suffit à lui seul à tenir un palier pour atteint
 *    (anti-rejeu § 4 : « un palier déjà servi ne se re-notifie jamais », même
 *    si le compteur est recalculé plus bas).
 * Un palier atteint par le compteur SANS trace gravée est atteint, sans date
 * (`reachedAt: null`) — le cas d'un backfill ou d'une reprise de bug, que le
 * document § 10 laisse ouvert, ne doit jamais rendre un badge invisible.
 *
 * FAIL-SAFE À L'AFFICHAGE. Un `axisKey` inconnu (axe ajouté au serveur avant
 * la mise à jour du client), une clé de palier hors catalogue : ignorés, jamais
 * une exception — la forme de la charge est déjà tenue par
 * `engagementProgressPayloadSchema` à la frontière. Une valeur négative ou non
 * finie vaut 0.
 */

import {
  BADGE_THRESHOLDS,
  ENGAGEMENT_ACHIEVEMENT_KEYS,
  ENGAGEMENT_AXES,
  ENGAGEMENT_AXIS_FAMILIES,
  LEVEL_THRESHOLDS,
  STREAK_THRESHOLDS,
  badgeMilestoneKey,
  engagementAxisFamily,
  isEngagementAxisKey,
  levelMilestoneKey,
  streakMilestoneKey,
  type EngagementAchievementKey,
  type EngagementAxisFamily,
  type EngagementAxisKey,
  type EngagementMilestoneType,
  type EngagementProgressPayload,
} from '../types/engagement.js';
import { ACHIEVEMENT_FAMILIES } from '../types/achievement-families.js';
import {
  expandCatalog,
  sectionViews,
  type AchievementSectionView,
} from './achievement-view.js';

/** Un palier d'une échelle (badge, série ou niveau), atteint ou à venir. */
export type EngagementTier = {
  readonly threshold: number;
  readonly reached: boolean;
  /** ISO 8601 du palier GRAVÉ (`EngagementMilestone.reachedAt`) ; `null` tant
   * qu'aucune trace n'existe — y compris pour un palier atteint par le seul
   * compteur. */
  readonly reachedAt: string | null;
};

/**
 * Une ÉCHELLE : la valeur courante posée sur ses paliers. `progress` est la
 * fraction parcourue ENTRE le dernier palier franchi et le suivant — c'est ce
 * qu'une barre affiche (« 12 sur 50 » se lit « 2 pas sur 40 depuis le
 * palier 10 »), jamais la fraction depuis zéro. `1` quand l'échelle est
 * complète, et `nextThreshold` vaut alors `null`.
 */
export type EngagementScaleProgress = {
  readonly value: number;
  readonly tiers: readonly EngagementTier[];
  readonly reachedCount: number;
  readonly previousThreshold: number;
  readonly nextThreshold: number | null;
  readonly progress: number;
};

export type EngagementAxisProgress = EngagementScaleProgress & {
  readonly axisKey: EngagementAxisKey;
  readonly family: EngagementAxisFamily;
};

export type EngagementLevelProgress = EngagementScaleProgress & {
  /** Le niveau COURANT — 0 avant le premier palier, `LEVEL_THRESHOLDS.length` au sommet. */
  readonly level: number;
};

export type EngagementStreakProgress = EngagementScaleProgress & {
  /** La série QUI COURT (`value` en est l'alias : c'est elle qui avance vers le prochain jalon). */
  readonly currentDays: number;
  /** Le record — c'est LUI qui tient un jalon pour atteint, une série rompue ne le reprend pas. */
  readonly longestDays: number;
};

export type EngagementAchievementProgress = {
  readonly key: EngagementAchievementKey;
  readonly unlocked: boolean;
  readonly reachedAt: string | null;
};

/**
 * L'ÉLAN, tel que l'écran le rend (#5749) — ce que le PROCHAIN geste créditera.
 *
 * `isAccelerated` est dérivé plutôt que servi : au neutre (×1) l'écran ne doit
 * rien montrer. Un badge « ×1 » n'apprend rien et occupe la place de ce qui
 * compte ; l'élan ne se montre qu'à partir du moment où il change quelque chose.
 */
export type EngagementElanProgress = {
  readonly factor: number;
  readonly activeFamilyCount: number;
  readonly hasStanding: boolean;
  readonly windowDays: number;
  /** `true` dès ×2 — la seule condition d'affichage. */
  readonly isAccelerated: boolean;
  /**
   * La LISTE derrière `activeFamilyCount` (#5897), filtrée au catalogue connu
   * — jamais le score CUMULÉ (`axes.filter(value > 0)`), qui reste positif
   * pour une famille abandonnée depuis longtemps. `[]` quand le serveur ne
   * sert pas encore ce champ : un consommateur affiche alors AUCUNE chip
   * plutôt que d'approximer avec le cumul.
   */
  readonly activeFamilies: readonly EngagementAxisFamily[];
};

/**
 * Les Meeshes, tels que l'écran les rend (#5743).
 *
 * `canMint` est DÉRIVÉ ici, jamais servi par le fil : le serveur envoie des
 * faits (points débitables, prix), le client en tire la décision d'AFFICHER le
 * bouton. Deux règles qui en découlent :
 *  - un serveur antérieur ne sert pas le bloc ⇒ `meesh` est absent ⇒ l'écran
 *    ne montre RIEN, ni solde ni bouton ;
 *  - le bouton n'apparaît QUE si `canMint` — pas de bouton grisé (directive
 *    porteur : « le bouton pour convertir quand les points le permettent,
 *    sinon pas de bouton »).
 */
export type EngagementMeeshProgress = {
  readonly balance: number;
  readonly mintedLifetime: number;
  /** Ce qui peut servir à frapper — les conversations en sont exclues. */
  readonly debitablePoints: number;
  /** Le plancher inaliénable : compté dans le niveau, jamais dépensable. */
  readonly floorPoints: number;
  readonly missingPoints: number;
  readonly mintCost: number;
  /** Vrai quand les points débitables couvrent le prix. */
  readonly canMint: boolean;
  /** Fraction parcourue vers la prochaine Meesh — `1` quand la frappe est possible. */
  readonly progress: number;
  /**
   * ISO 8601 de la première et de la dernière frappe, `null` quand il n'y en a
   * eu aucune — ce que le sous-menu de l'entrée Meesh raconte (#5839).
   *
   * Une valeur illisible devient `null` plutôt que d'atteindre l'écran : une
   * date fausse est pire qu'une date absente, parce que la vue l'affiche avec
   * la même assurance que les vraies.
   */
  readonly firstMintedAt: string | null;
  readonly lastMintedAt: string | null;
};

/** Une date ISO utilisable, ou `null` — le repli n'invente jamais l'instant présent. */
const isoOrNull = (value: unknown): string | null =>
  typeof value === 'string' && Number.isFinite(new Date(value).getTime()) ? value : null;

export type EngagementProgress = {
  readonly level: EngagementLevelProgress;
  readonly streak: EngagementStreakProgress;
  /** Dans l'ordre du catalogue `ENGAGEMENT_AXES` — `axesByFamily` les range par section. */
  readonly axes: readonly EngagementAxisProgress[];
  readonly achievements: readonly EngagementAchievementProgress[];
  /** Badges obtenus, tous axes confondus (un badge = un couple axe × palier). */
  readonly badgesEarned: number;
  readonly badgesTotal: number;
  /** Aucune activité comptée, aucun palier gravé — l'ÉTAT VIDE de l'écran (dimension 8). */
  readonly isEmpty: boolean;
  /** Absent quand la passerelle ne sert pas encore le bloc — l'écran n'affiche alors rien. */
  readonly meesh?: EngagementMeeshProgress;
  /** Idem pour l'élan (#5749). */
  readonly elan?: EngagementElanProgress;
  /**
   * Les succès du catalogue GÉNÉRATIF (#5758/#5759), rangés par section et
   * déjà tronqués à leur fenêtre `max(7, acquis + 2)`.
   *
   * Distinct de `achievements` ci-dessus, qui porte les cinq succès composés
   * historiques (#5530) : ceux-là sont nommés un par un, ceux-ci sont produits
   * par la grammaire. La fusion des deux listes est un lot à part — les mêler
   * ici mélangerait deux vocabulaires sans que rien ne le signale.
   */
  readonly achievementSections?: readonly AchievementSectionView[];
};

export type EngagementFamilyGroup = {
  readonly family: EngagementAxisFamily;
  readonly axes: readonly EngagementAxisProgress[];
};

const safeCount = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const servedKey = (type: EngagementMilestoneType, key: string): string => `${type}|${key}`;

type ServedIndex = ReadonlyMap<string, string>;

/** `reachedAt` du premier palier gravé par (type, clé) — la contrainte unique du modèle en garantit un seul. */
function indexServed(payload: EngagementProgressPayload): ServedIndex {
  return payload.milestones.reduce<Map<string, string>>((index, milestone) => {
    const key = servedKey(milestone.milestoneType, milestone.milestoneKey);
    return index.has(key) ? index : index.set(key, milestone.reachedAt);
  }, new Map());
}

/** La valeur RETENUE par axe — la plus haute si la charge en portait deux (elle n'en porte qu'une). */
function indexCounts(payload: EngagementProgressPayload): ReadonlyMap<EngagementAxisKey, number> {
  return payload.counters.reduce<Map<EngagementAxisKey, number>>((index, counter) => {
    if (!isEngagementAxisKey(counter.axisKey)) return index;
    return index.set(counter.axisKey, Math.max(index.get(counter.axisKey) ?? 0, safeCount(counter.count)));
  }, new Map());
}

function resolveScale(params: {
  readonly value: number;
  readonly reachedValue: number;
  readonly thresholds: readonly number[];
  readonly reachedAtOf: (threshold: number) => string | null;
}): EngagementScaleProgress {
  const { value, reachedValue, thresholds, reachedAtOf } = params;
  const tiers = thresholds.map<EngagementTier>((threshold) => {
    const reachedAt = reachedAtOf(threshold);
    return { threshold, reached: reachedValue >= threshold || reachedAt !== null, reachedAt };
  });
  const previousThreshold = thresholds.filter((threshold) => threshold <= value).at(-1) ?? 0;
  const nextThreshold = thresholds.find((threshold) => threshold > value) ?? null;
  const progress =
    nextThreshold === null ? 1 : clamp01((value - previousThreshold) / (nextThreshold - previousThreshold));
  return {
    value,
    tiers,
    reachedCount: tiers.filter((tier) => tier.reached).length,
    previousThreshold,
    nextThreshold,
    progress,
  };
}

export function resolveEngagementProgress(payload: EngagementProgressPayload): EngagementProgress {
  const served = indexServed(payload);
  const counts = indexCounts(payload);
  const servedAt = (type: EngagementMilestoneType, key: string): string | null =>
    served.get(servedKey(type, key)) ?? null;

  const axes = ENGAGEMENT_AXES.map<EngagementAxisProgress>((axisKey) => {
    const count = counts.get(axisKey) ?? 0;
    return {
      axisKey,
      family: engagementAxisFamily(axisKey),
      ...resolveScale({
        value: count,
        reachedValue: count,
        thresholds: BADGE_THRESHOLDS,
        reachedAtOf: (threshold) => servedAt('badge', badgeMilestoneKey(axisKey, threshold)),
      }),
    };
  });

  const score = safeCount(payload.level.engagementScore);
  const levelScale = resolveScale({
    value: score,
    reachedValue: score,
    thresholds: LEVEL_THRESHOLDS,
    reachedAtOf: (threshold) => servedAt('level', levelMilestoneKey(threshold)),
  });

  const currentDays = safeCount(payload.streak.currentStreakDays);
  const longestDays = Math.max(safeCount(payload.streak.longestStreakDays), currentDays);
  const streakScale = resolveScale({
    value: currentDays,
    reachedValue: longestDays,
    thresholds: STREAK_THRESHOLDS,
    reachedAtOf: (threshold) => servedAt('streak', streakMilestoneKey(threshold)),
  });

  const achievements = ENGAGEMENT_ACHIEVEMENT_KEYS.map<EngagementAchievementProgress>((key) => {
    const reachedAt = servedAt('achievement', key);
    return { key, unlocked: reachedAt !== null, reachedAt };
  });

  const badgesEarned = axes.reduce((total, axis) => total + axis.reachedCount, 0);
  const hasActivity =
    axes.some((axis) => axis.value > 0) ||
    score > 0 ||
    longestDays > 0 ||
    badgesEarned > 0 ||
    levelScale.reachedCount > 0 ||
    streakScale.reachedCount > 0 ||
    achievements.some((achievement) => achievement.unlocked);

  return {
    level: { ...levelScale, level: levelScale.reachedCount },
    streak: { ...streakScale, currentDays, longestDays },
    axes,
    achievements,
    badgesEarned,
    badgesTotal: ENGAGEMENT_AXES.length * BADGE_THRESHOLDS.length,
    isEmpty: !hasActivity,
    ...(payload.meesh !== undefined ? { meesh: resolveMeesh(payload.meesh) } : {}),
    ...(payload.elan !== undefined ? { elan: resolveElan(payload.elan) } : {}),
    ...(payload.achievementReach !== undefined
      ? { achievementSections: resolveAchievementSections(payload) }
      : {}),
  };
}

/**
 * Les sections de succès générés, prêtes à rendre.
 *
 * La carte d'atteignabilité vient du SERVEUR (elle mesure la réalité du
 * produit) ; le développement, l'ordre et la fenêtre sont calculés ICI, par la
 * loi partagée — c'est ce qui garantit que le web et iOS montrent exactement
 * les mêmes entrées dans le même ordre.
 */
function resolveAchievementSections(payload: EngagementProgressPayload): readonly AchievementSectionView[] {
  const reach = new Map(Object.entries(payload.achievementReach ?? {}));
  const unlocked = new Map<string, string | null>();
  for (const milestone of payload.milestones) {
    if (milestone.milestoneType !== 'achievement') continue;
    unlocked.set(milestone.milestoneKey, milestone.reachedAt);
  }
  return sectionViews(expandCatalog({ families: ACHIEVEMENT_FAMILIES, reach, unlocked }));
}

function resolveElan(elan: NonNullable<EngagementProgressPayload['elan']>): EngagementElanProgress {
  // Borné à [1, 5] ici AUSSI : le plafond est une règle de produit, pas une
  // convention de sérialisation — un serveur qui servirait 9 ne doit pas faire
  // afficher 9.
  const factor = Number.isFinite(elan.factor) ? Math.min(5, Math.max(1, elan.factor)) : 1;
  // Fail-safe au CATALOGUE, comme `computeEngagementElan` côté serveur — une
  // famille inconnue (axe ajouté avant la mise à jour de ce client) est
  // ignorée plutôt que de faire échouer l'affichage. `elan.activeFamilies`
  // ABSENT (serveur antérieur à #5897) rend `[]` : aucune chip plutôt qu'un
  // repli sur le score cumulé.
  const activeFamilies = [
    ...new Set(
      (elan.activeFamilies ?? []).filter((famille): famille is EngagementAxisFamily =>
        (ENGAGEMENT_AXIS_FAMILIES as readonly string[]).includes(famille),
      ),
    ),
  ];
  return {
    factor,
    activeFamilyCount: safeCount(elan.activeFamilyCount),
    hasStanding: elan.hasStanding === true,
    windowDays: safeCount(elan.windowDays),
    isAccelerated: factor > 1,
    activeFamilies,
  };
}

/**
 * `canMint` et `progress` sont DÉRIVÉS ici, jamais servis par le fil : le
 * serveur envoie des faits, le client en tire la décision d'afficher — c'est ce
 * qui garantit que les trois plateformes prennent la MÊME décision sur les
 * MÊMES chiffres.
 *
 * `progress` se mesure sur les points DÉBITABLES, pas sur le score total : une
 * barre qui monterait grâce à des points de conversation — que la frappe ne
 * peut pas reprendre (#5743) — promettrait une Meesh qui n'arriverait jamais.
 */
function resolveMeesh(meesh: NonNullable<EngagementProgressPayload['meesh']>): EngagementMeeshProgress {
  const mintCost = safeCount(meesh.mintCost);
  const debitablePoints = safeCount(meesh.debitablePoints);
  const canMint = mintCost > 0 && debitablePoints >= mintCost;
  return {
    balance: safeCount(meesh.balance),
    mintedLifetime: safeCount(meesh.mintedLifetime),
    debitablePoints,
    floorPoints: safeCount(meesh.floorPoints),
    missingPoints: safeCount(meesh.missingPoints),
    mintCost,
    canMint,
    progress: mintCost === 0 ? 0 : clamp01(debitablePoints / mintCost),
    firstMintedAt: isoOrNull(meesh.firstMintedAt),
    lastMintedAt: isoOrNull(meesh.lastMintedAt),
  };
}

/** Les axes rangés par SECTION, dans l'ordre du modèle § 2 ; l'ordre du catalogue est conservé dans chaque section. */
export function axesByFamily(axes: readonly EngagementAxisProgress[]): readonly EngagementFamilyGroup[] {
  return ENGAGEMENT_AXIS_FAMILIES.map((family) => ({
    family,
    axes: axes.filter((axis) => axis.family === family),
  })).filter((group) => group.axes.length > 0);
}

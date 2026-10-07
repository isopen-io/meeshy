/**
 * LES DÉFIS DU JOUR (#9373, #9635) — trois par jour (facile, moyenne, difficile), la difficile devenant mission
 * d'Or à partir du niveau 50 ou de 50 Meeshes gardées, plus la mission personnelle (#9539).
 * `docs/product/jeu-meeshy-conception.html` § II.5.
 *
 * ## Le catalogue
 *
 * `mission-catalog.ts`, rangé par les quatre buts du porteur. Un gabarit n'attend qu'un signal que la
 * PASSERELLE établit (un geste crédité, ou un fait posé au point unique du geste) : jamais la seule
 * déclaration d'un client.
 *
 * ## À la mesure de chacun
 *
 * Avec un `MissionProfile`, l'objectif dérive de la moyenne quotidienne du geste (`missionTarget`) : un compte
 * peu actif commence au plancher du gabarit, un compte actif est poussé au-delà de sa moyenne selon la
 * difficulté, la bande de niveau s'applique, le plafond borne. Un gabarit dont le profil n'a pas les
 * `requires` n'est pas tiré pour lui. Sans profil (les clients, les vecteurs), l'objectif est
 * `⌈ baseTarget × (1 + 0,3 × bande) ⌉`, borné de même.
 *
 * ## Ce qui est payé
 *
 * `(base de la difficulté + unitPoints × objectif) × bande × Flamme` points, la Gloire du gabarit (l'Or en
 * porte au moins 40), les étoiles de saison de la difficulté, et le tiers du coffre pour une mission du jour
 * (`missionArtifacts`).
 *
 * ## Le tirage
 *
 * Déterministe : mulberry32 sur un hachage de `userId|jour|missions` (`day-prng.ts`). Un tirage pondéré
 * consomme une valeur par emplacement, plus une pour l'emplacement Prisme, quel que soit le catalogue. La
 * mission d'Or tire parmi ses gabarits ET les difficiles portés à l'Or.
 *
 * Objectif et récompense sont calculés en ENTIERS exacts : le flottant `1 + 0,3 × bande` se trompe d'un ulp
 * là où `⌈⌉` ne pardonne pas.
 */

import { ENGAGEMENT_AXES } from '../../types/engagement.js';
import { EXTRA_ENGAGEMENT_OPERATIONS, type EngagementOperationKey } from '../../types/engagement-operations.js';
import { dayNumber, fnv1a, pickIndex, seededRng } from './day-prng.js';
import { flameBonusPercent } from './flame.js';
import { GLORY_POINTS } from './glory.js';
import { GAME_LEVEL_MAX, GAME_LEVEL_MIN } from './levels.js';
import {
  MISSION_FACT_SIGNALS,
  MISSION_TEMPLATES,
  type AxisMissionSignal,
  type MissionCapability,
  type MissionSignal,
  type MissionTemplate,
} from './mission-catalog.js';
import { seasonStarsForMission } from './season.js';

export {
  MISSION_CAPABILITIES,
  MISSION_FACT_SIGNALS,
  MISSION_GOALS,
  MISSION_TEMPLATES,
  type AxisMissionSignal,
  type MissionCapability,
  type MissionFactSignal,
  type MissionGoal,
  type MissionSignal,
  type MissionTemplate,
} from './mission-catalog.js';

export const MISSION_DIFFICULTIES = ['easy', 'medium', 'hard', 'gold'] as const;
export type MissionDifficulty = (typeof MISSION_DIFFICULTIES)[number];

export const axisSignal = (operation: EngagementOperationKey): AxisMissionSignal => `axis:${operation}`;

/** Tout ce que la passerelle observe : chaque opération créditée, puis les faits posés au geste. */
export const MISSION_SIGNALS: readonly MissionSignal[] = /* @__PURE__ */ (() => [
  ...[...ENGAGEMENT_AXES, ...EXTRA_ENGAGEMENT_OPERATIONS].map(axisSignal),
  ...MISSION_FACT_SIGNALS,
])();

/** La base de points de chaque difficulté, avant l'objectif, la bande et la Flamme. */
export const MISSION_BASE_POINTS: Readonly<Record<MissionDifficulty, number>> = { easy: 40, medium: 80, hard: 160, gold: 320 };

/** Ce qu'un compte apporte au tirage : ce qu'il peut faire, et ce qu'il fait d'ordinaire (par jour, par opération). */
export type MissionProfile = {
  readonly capabilities: readonly MissionCapability[];
  readonly habits: Readonly<Partial<Record<EngagementOperationKey, number>>>;
};

/** Le facteur appliqué à l'habitude du compte, par difficulté : une difficile pousse au-delà de la moyenne. */
export const MISSION_HABIT_FACTOR: Readonly<Record<MissionDifficulty, number>> = { easy: 0.5, medium: 1, hard: 1.25, gold: 1.5 };

/** Les gabarits d'une difficulté ; l'Or tire parmi les siens ET les difficiles portés à l'Or. */
export const missionTemplatesFor = (difficulty: MissionDifficulty): readonly MissionTemplate[] =>
  difficulty === 'gold'
    ? [
        ...MISSION_TEMPLATES.filter((t) => t.difficulty === 'gold'),
        ...MISSION_TEMPLATES.filter((t) => t.difficulty === 'hard').map((t) => ({ ...t, difficulty })),
      ]
    : MISSION_TEMPLATES.filter((t) => t.difficulty === difficulty);

/** Un gabarit que ce profil peut faire. Sans profil, tous. */
export const missionAvailableFor = (template: MissionTemplate, profile: MissionProfile | undefined): boolean =>
  profile === undefined || (template.requires ?? []).every((capability) => profile.capabilities.includes(capability));

/** Les missions du jour s'ouvrent au niveau 5. */
export const MISSIONS_MIN_LEVEL = 5;
/** Changer une mission : une Meesh, une fois par jour, même difficulté. */
/**
 * Une journée de jeu (missions et coffre) ne s'ouvre pas moins de 20 h après
 * l'ouverture de la précédente : changer de fuseau ne fait pas gagner un jour.
 */
export const GAME_DAY_MIN_GAP_MS = 20 * 60 * 60 * 1000;

/**
 * La clé de la journée de jeu, MONOTONE : la clé du fuseau (`candidate`) ne
 * s'impose que si elle est postérieure à la dernière journée ouverte ET que
 * celle-ci a été ouverte il y a au moins `GAME_DAY_MIN_GAP_MS`. Sinon la journée
 * ouverte continue — elle ne revient jamais en arrière.
 */
export function resolveGameDayKey(params: {
  readonly candidate: string;
  readonly latest: { readonly dayKey: string; readonly openedAt: Date } | null;
  readonly now: Date;
}): string {
  const { candidate, latest, now } = params;
  if (latest === null) return candidate;
  if (candidate <= latest.dayKey) return latest.dayKey;
  return now.getTime() - latest.openedAt.getTime() < GAME_DAY_MIN_GAP_MS ? latest.dayKey : candidate;
}

export const MISSION_REROLL_PRICE = 1;
export const MISSION_REROLL_PER_DAY = 1;

/** Niveau ou nombre de Meeshes gardées qui ouvre la mission d'Or. */
export const GOLD_MISSION_MIN_LEVEL = 50;
export const GOLD_MISSION_MIN_TREASURY = 50;

const clampLevel = (level: number): number =>
  Number.isFinite(level) ? Math.min(GAME_LEVEL_MAX, Math.max(GAME_LEVEL_MIN, Math.trunc(level))) : GAME_LEVEL_MIN;

/** bande = ⌊niveau ÷ 10⌋. */
export const missionBand = (level: number): number => Math.floor(clampLevel(level) / 10);

/** objectif = ⌈ base × (1 + 0,3 × bande) ⌉, en entiers : ⌈ base × (10 + 3 × bande) ÷ 10 ⌉. */
export const missionObjective = (params: { readonly baseTarget: number; readonly level: number }): number =>
  Math.floor((params.baseTarget * (10 + 3 * missionBand(params.level)) + 9) / 10);

/**
 * récompense = base × (1 + 0,15 × bande) × (1 + bonus de Flamme), arrondie
 * au plus proche (demi vers le haut), en entiers : le bonus est un pour cent
 * entier (`flameBonusPercent`).
 */
export const missionReward = (params: {
  readonly basePoints: number;
  readonly level: number;
  readonly flameDays: number;
}): number => {
  const numerator = params.basePoints * (100 + 15 * missionBand(params.level)) * (100 + flameBonusPercent(params.flameDays));
  return Math.floor((numerator + 5000) / 10_000);
};

const clampTarget = (template: MissionTemplate, target: number): number =>
  Math.min(template.maxTarget, Math.max(template.minTarget, target));

/**
 * L'objectif d'un gabarit pour un compte. Sans habitude connue : `⌈ baseTarget × (1 + 0,3 × bande) ⌉`. Avec :
 * `⌈ habitude × facteur de la difficulté × (1 + 0,3 × bande) ⌉` — 0 pour un compte qui ne fait pas ce geste,
 * donc le plancher. Toujours borné par le plancher et le plafond du gabarit.
 */
export function missionTarget(params: {
  readonly template: MissionTemplate;
  readonly difficulty: MissionDifficulty;
  readonly level: number;
  readonly profile?: MissionProfile;
}): number {
  const { template, difficulty, level, profile } = params;
  if (profile === undefined) return clampTarget(template, missionObjective({ baseTarget: template.baseTarget, level }));
  if (template.habit === undefined) return template.minTarget;
  const perDay = profile.habits[template.habit.operation] ?? 0;
  const habit = Number.isFinite(perDay) && perDay > 0 ? perDay * (template.habit.ratio ?? 1) : 0;
  const scaled = habit * MISSION_HABIT_FACTOR[difficulty] * (10 + 3 * missionBand(level));
  return clampTarget(template, Math.ceil(scaled / 10 - 1e-9));
}

/** La Gloire d'un gabarit tiré à cette difficulté : la sienne, et au moins celle de l'Or pour une mission d'Or. */
export const missionGlory = (template: MissionTemplate, difficulty: MissionDifficulty): number =>
  Math.max(template.glory ?? 0, difficulty === 'gold' ? GLORY_POINTS.goldMission : 0);

export type MissionSlot = 'easy' | 'medium' | 'hard' | 'gold';

export type DrawnMission = {
  readonly difficulty: MissionDifficulty;
  readonly templateKey: string;
  readonly signal: MissionSignal;
  readonly prism: boolean;
  readonly target: number;
  /** Points crédités à la validation, bonus de Flamme compris. */
  readonly reward: number;
  /** Gloire de la mission : celle du gabarit, au moins 40 pour l'Or. */
  readonly glory: number;
};

/** Ce que l'achèvement d'une mission paie, tout compris. */
export type MissionArtifacts = {
  readonly points: number;
  readonly glory: number;
  readonly seasonStars: number;
  /** Une mission du jour compte pour le coffre ; la mission personnelle, non. */
  readonly chest: boolean;
};

export const missionArtifacts = (mission: Pick<DrawnMission, 'difficulty' | 'reward' | 'glory'>, slot: number): MissionArtifacts => ({
  points: mission.reward,
  glory: mission.glory,
  seasonStars: seasonStarsForMission(mission.difficulty),
  chest: slot < 3,
});

export type DailyMissionDraw = {
  readonly dayKey: string;
  /** Jour où un gabarit Prisme est garanti. */
  readonly prismDay: boolean;
  /** Dans l'ordre facile, moyenne, difficile (ou Or). */
  readonly missions: readonly DrawnMission[];
};

export type MissionDrawInput = {
  readonly userId: string;
  readonly dayKey: string;
  readonly level: number;
  readonly flameDays: number;
  /** Meeshes gardées (le trésor) : à 50 ou plus, la mission d'Or remplace la difficile. */
  readonly treasury: number;
  /** Signaux impossibles pour CE compte — jamais tirés. */
  readonly unavailableSignals?: readonly MissionSignal[];
  /** Ce que le compte peut faire et fait d'ordinaire ; absent : tous les gabarits, objectifs de base. */
  readonly profile?: MissionProfile;
};

/** Une mission tirée sur ce gabarit, à cette difficulté, pour ce compte. */
export function drawnMissionOf(params: {
  readonly template: MissionTemplate;
  readonly difficulty: MissionDifficulty;
  readonly level: number;
  readonly flameDays: number;
  readonly profile?: MissionProfile;
}): DrawnMission {
  const { template, difficulty, flameDays, profile } = params;
  const level = clampLevel(params.level);
  const target = missionTarget({ template, difficulty, level, ...(profile ? { profile } : {}) });
  return {
    difficulty,
    templateKey: template.key,
    signal: template.signal,
    prism: template.prism ?? false,
    target,
    reward: missionReward({ basePoints: MISSION_BASE_POINTS[difficulty] + template.unitPoints * target, level, flameDays }),
    glory: missionGlory(template, difficulty),
  };
}

const DEFAULT_WEIGHT = 4;

/** Une valeur du générateur par tirage ; à poids égaux, le même indice que `pickIndex`. */
const pickWeighted = <T extends { readonly weight?: number }>(rng: () => number, pool: readonly T[]): T | undefined => {
  const weights = pool.map((t) => Math.max(0, t.weight ?? DEFAULT_WEIGHT));
  const ticket = rng() * weights.reduce((sum, w) => sum + w, 0);
  const index = weights.findIndex((_, i) => weights.slice(0, i + 1).reduce((sum, w) => sum + w, 0) > ticket);
  return pool[index >= 0 ? index : pool.length - 1];
};

const poolOf = (
  difficulty: MissionDifficulty,
  excluded: ReadonlySet<MissionSignal>,
  prismOnly: boolean,
  profile: MissionProfile | undefined,
): readonly MissionTemplate[] => {
  const pool = missionTemplatesFor(difficulty).filter((t) => !excluded.has(t.signal) && missionAvailableFor(t, profile));
  const prism = pool.filter((t) => t.prism === true);
  return prismOnly && prism.length > 0 ? prism : pool;
};

/** Jour Prisme garanti : un jour sur trois, décalé par utilisateur. */
export const isPrismDay = (params: { readonly userId: string; readonly dayKey: string }): boolean =>
  (dayNumber(params.dayKey) + (fnv1a(params.userId) % 3)) % 3 === 0;

export function drawDailyMissions(input: MissionDrawInput): DailyMissionDraw {
  const level = clampLevel(input.level);
  const rng = seededRng({ userId: input.userId, dayKey: input.dayKey, salt: 'missions' });
  const topDifficulty: MissionDifficulty =
    level >= GOLD_MISSION_MIN_LEVEL || input.treasury >= GOLD_MISSION_MIN_TREASURY ? 'gold' : 'hard';
  const prismDay = isPrismDay(input);

  const prismCandidates: readonly MissionDifficulty[] = topDifficulty === 'gold' ? ['medium'] : ['medium', 'hard'];
  const prismDifficulty = prismCandidates[pickIndex(rng, prismCandidates.length)]!;

  const used = new Set<MissionSignal>(input.unavailableSignals ?? []);
  const order: readonly MissionDifficulty[] = [topDifficulty, 'medium', 'easy'];
  const drawn = order.flatMap((difficulty) => {
    const pool = poolOf(difficulty, used, prismDay && difficulty === prismDifficulty, input.profile);
    const picked = pickWeighted(rng, pool);
    if (picked === undefined) return [];
    used.add(picked.signal);
    return [drawnMissionOf({ template: picked, difficulty, level, flameDays: input.flameDays, ...(input.profile ? { profile: input.profile } : {}) })];
  });

  const byDifficulty = new Map(drawn.map((m) => [m.difficulty, m]));
  return {
    dayKey: input.dayKey,
    prismDay,
    missions: (['easy', 'medium', topDifficulty] as const).flatMap((d) => byDifficulty.get(d) ?? []),
  };
}

/**
 * Changer UNE mission du jour : même difficulté, un autre gabarit, jamais un
 * signal déjà tiré ce jour-là. `rerollCount` varie la graine à chaque
 * changement. `null` quand aucun gabarit ne convient (indice inconnu, catalogue
 * épuisé par les exclusions).
 */
export function rerollDailyMission(params: {
  readonly userId: string;
  readonly dayKey: string;
  readonly level: number;
  readonly flameDays: number;
  readonly missions: readonly DrawnMission[];
  readonly index: number;
  readonly rerollCount: number;
  readonly unavailableSignals?: readonly MissionSignal[];
  readonly profile?: MissionProfile;
}): DrawnMission | null {
  const current = params.missions[params.index];
  if (current === undefined) return null;
  const level = clampLevel(params.level);
  const excluded = new Set<MissionSignal>([
    ...(params.unavailableSignals ?? []),
    ...params.missions.map((m) => m.signal),
  ]);
  const pool = poolOf(current.difficulty, excluded, false, params.profile).filter((t) => t.key !== current.templateKey);
  const rng = seededRng({
    userId: params.userId,
    dayKey: params.dayKey,
    salt: `reroll:${params.index}:${Math.max(0, Math.trunc(params.rerollCount))}`,
  });
  const picked = pickWeighted(rng, pool);
  return picked === undefined
    ? null
    : drawnMissionOf({ template: picked, difficulty: current.difficulty, level, flameDays: params.flameDays, ...(params.profile ? { profile: params.profile } : {}) });
}

/** Une mission du jour telle qu'elle est posée en base : tirée, et peut-être déjà achevée. */
export type DayMission = DrawnMission & { readonly completed: boolean };

export type MissionReplacement = { readonly index: number; readonly mission: DrawnMission };

/** Le gabarit est-il encore tirable à cette difficulté — connu du catalogue, et à portée de ce profil ? */
export const isMissionStillPossible = (params: {
  readonly templateKey: string;
  readonly difficulty: MissionDifficulty;
  readonly signal: MissionSignal | string;
  readonly unavailableSignals?: readonly (MissionSignal | string)[];
}): boolean =>
  missionTemplatesFor(params.difficulty).some((t) => t.key === params.templateKey) &&
  !(params.unavailableSignals ?? []).includes(params.signal);

/**
 * Les missions du jour devenues IMPOSSIBLES (gabarit inconnu du catalogue, ou signal que le compte ne peut plus
 * produire), et pas encore achevées : chacune reçoit un gabarit de MÊME difficulté, au signal libre ce jour-là
 * — à défaut, n'importe quel gabarit de sa difficulté, plutôt qu'une mission que plus rien ne fait avancer. Dans
 * l'ordre des positions, chaque remplacement écarte le signal du précédent. Déterministe (`replaced:<position>`).
 */
export function replaceImpossibleMissions(params: {
  readonly userId: string;
  readonly dayKey: string;
  readonly level: number;
  readonly flameDays: number;
  readonly missions: readonly DayMission[];
  readonly unavailableSignals?: readonly MissionSignal[];
  readonly profile?: MissionProfile;
}): readonly MissionReplacement[] {
  const level = clampLevel(params.level);
  const unavailable = params.unavailableSignals ?? [];
  const initial: { readonly signals: readonly MissionSignal[]; readonly replaced: readonly MissionReplacement[] } = {
    signals: params.missions.map((m) => m.signal),
    replaced: [],
  };
  return params.missions.reduce((acc, current, index) => {
    if (current.completed || isMissionStillPossible({ ...current, unavailableSignals: unavailable })) return acc;
    const taken = new Set<MissionSignal>([...unavailable, ...acc.signals.filter((_, i) => i !== index)]);
    const open = poolOf(current.difficulty, taken, false, params.profile);
    const pool = open.length > 0 ? open : poolOf(current.difficulty, new Set(unavailable), false, params.profile);
    const picked = pickWeighted(seededRng({ userId: params.userId, dayKey: params.dayKey, salt: `replaced:${index}` }), pool);
    if (picked === undefined) return acc;
    const mission = drawnMissionOf({ template: picked, difficulty: current.difficulty, level, flameDays: params.flameDays, ...(params.profile ? { profile: params.profile } : {}) });
    return {
      signals: acc.signals.map((signal, i) => (i === index ? mission.signal : signal)),
      replaced: [...acc.replaced, { index, mission }],
    };
  }, initial).replaced;
}

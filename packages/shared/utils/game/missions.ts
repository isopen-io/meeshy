/**
 * LES MISSIONS DU JOUR (#9373) — trois par jour (facile, moyenne, difficile),
 * la difficile devenant mission d'Or à partir du niveau 50 ou de 50 Meeshes
 * gardées. `docs/product/jeu-meeshy-conception.html` § II.5.
 *
 * ## Ce qu'un SIGNAL peut être
 *
 * Seulement un fait que la passerelle OBSERVE À L'ÉCRITURE : un axe
 * d'engagement incrémenté (`ENGAGEMENT_AXES`), une réponse dans une
 * conversation distincte, un message dans une autre langue que la langue
 * système de l'expéditeur, une réponse reçue d'un auteur distinct. « Lire N
 * messages traduits » ou « une story qui reçoit N réactions » sont des faits
 * de LECTURE ou de tiers : aucune écriture de l'utilisateur ne les porte, ils
 * restent hors du catalogue.
 *
 * ## Le tirage
 *
 * Déterministe : mulberry32 sur un hachage de `userId|jour|missions`
 * (`day-prng.ts`). Le jour, le fuseau et la graine sont des PARAMÈTRES. Le
 * nombre de tirages consommés est fixe (un par emplacement, plus un pour
 * l'emplacement Prisme), de sorte que les entrées identiques rendent des
 * sorties identiques sur tous les clients.
 *
 * Objectif et récompense sont calculés en ENTIERS exacts : le flottant
 * `1 + 0,3 × bande` se trompe d'un ulp là où `⌈⌉` ne pardonne pas.
 */

import { ENGAGEMENT_AXES, type EngagementAxisKey } from '../../types/engagement.js';
import { dayNumber, fnv1a, pickIndex, seededRng } from './day-prng.js';
import { flameBonusPercent } from './flame.js';
import { GLORY_POINTS } from './glory.js';
import { GAME_LEVEL_MAX, GAME_LEVEL_MIN } from './levels.js';

export const MISSION_DIFFICULTIES = ['easy', 'medium', 'hard', 'gold'] as const;
export type MissionDifficulty = (typeof MISSION_DIFFICULTIES)[number];

export type AxisMissionSignal = `axis:${EngagementAxisKey}`;

export type MissionSignal =
  | AxisMissionSignal
  | 'reply-distinct-conversations'
  | 'foreign-language-message'
  | 'replies-received-distinct-authors';

export const axisSignal = (axis: EngagementAxisKey): AxisMissionSignal => `axis:${axis}`;

export const MISSION_SIGNALS: readonly MissionSignal[] = [
  ...ENGAGEMENT_AXES.map(axisSignal),
  'reply-distinct-conversations',
  'foreign-language-message',
  'replies-received-distinct-authors',
];

export type MissionTemplate = {
  readonly key: string;
  readonly difficulty: MissionDifficulty;
  readonly signal: MissionSignal;
  readonly baseTarget: number;
  readonly basePoints: number;
  /** Mission du Prisme (langues, traduction) : au moins un jour sur trois. */
  readonly prism: boolean;
};

const template = (
  key: string,
  difficulty: MissionDifficulty,
  signal: MissionSignal,
  baseTarget: number,
  prism = false,
): MissionTemplate => ({
  key,
  difficulty,
  signal,
  baseTarget,
  basePoints: { easy: 30, medium: 60, hard: 120, gold: 250 }[difficulty],
  prism,
});

export const MISSION_TEMPLATES: readonly MissionTemplate[] = [
  template('react-messages', 'easy', axisSignal('tool.reaction'), 5),
  template('send-voice', 'easy', axisSignal('content.audio_message'), 1),
  template('send-texts', 'easy', axisSignal('content.text_message'), 5),
  template('use-stickers', 'easy', axisSignal('tool.sticker'), 2),
  template('send-attachments', 'easy', axisSignal('tool.attachment'), 2),

  template('reply-conversations', 'medium', 'reply-distinct-conversations', 3),
  template('comment-text', 'medium', axisSignal('comment.text'), 3),
  template('publish-story', 'medium', axisSignal('content.story'), 1),
  template('publish-post', 'medium', axisSignal('content.post'), 1),
  template('share-link', 'medium', axisSignal('social.share'), 1),
  template('prism-foreign-messages', 'medium', 'foreign-language-message', 2, true),

  template('prism-foreign-exchange', 'hard', 'foreign-language-message', 5, true),
  template('reply-conversations-wide', 'hard', 'reply-distinct-conversations', 6),
  template('publish-posts', 'hard', axisSignal('content.post'), 2),
  template('voice-comments', 'hard', axisSignal('comment.audio'), 2),
  template('publish-reel', 'hard', axisSignal('content.reel'), 1),
  template('long-chat', 'hard', axisSignal('content.text_message'), 20),

  template('gold-replies-received', 'gold', 'replies-received-distinct-authors', 4),
  template('gold-reply-conversations', 'gold', 'reply-distinct-conversations', 8),
];

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

export type MissionSlot = 'easy' | 'medium' | 'hard' | 'gold';

export type DrawnMission = {
  readonly difficulty: MissionDifficulty;
  readonly templateKey: string;
  readonly signal: MissionSignal;
  readonly prism: boolean;
  readonly target: number;
  /** Points crédités à la validation, bonus de Flamme compris. */
  readonly reward: number;
  /** Gloire de la mission : 40 pour l'Or, `0` sinon. */
  readonly glory: number;
};

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
};

const toDrawn = (t: MissionTemplate, level: number, flameDays: number): DrawnMission => ({
  difficulty: t.difficulty,
  templateKey: t.key,
  signal: t.signal,
  prism: t.prism,
  target: missionObjective({ baseTarget: t.baseTarget, level }),
  reward: missionReward({ basePoints: t.basePoints, level, flameDays }),
  glory: t.difficulty === 'gold' ? GLORY_POINTS.goldMission : 0,
});

const poolOf = (
  difficulty: MissionDifficulty,
  excluded: ReadonlySet<MissionSignal>,
  prismOnly: boolean,
): readonly MissionTemplate[] => {
  const pool = MISSION_TEMPLATES.filter((t) => t.difficulty === difficulty && !excluded.has(t.signal));
  const prism = pool.filter((t) => t.prism);
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
    const pool = poolOf(difficulty, used, prismDay && difficulty === prismDifficulty);
    const index = pickIndex(rng, pool.length);
    const picked = pool[index];
    if (picked === undefined) return [];
    used.add(picked.signal);
    return [toDrawn(picked, level, input.flameDays)];
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
}): DrawnMission | null {
  const current = params.missions[params.index];
  if (current === undefined) return null;
  const level = clampLevel(params.level);
  const excluded = new Set<MissionSignal>([
    ...(params.unavailableSignals ?? []),
    ...params.missions.map((m) => m.signal),
  ]);
  const pool = poolOf(current.difficulty, excluded, false).filter((t) => t.key !== current.templateKey);
  const rng = seededRng({
    userId: params.userId,
    dayKey: params.dayKey,
    salt: `reroll:${params.index}:${Math.max(0, Math.trunc(params.rerollCount))}`,
  });
  const picked = pool[pickIndex(rng, pool.length)];
  return picked === undefined ? null : toDrawn(picked, level, params.flameDays);
}

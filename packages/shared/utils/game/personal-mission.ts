/**
 * LA MISSION PERSONNELLE DU JOUR (#9539) — UNE mission par compte et par jour, À CÔTÉ des trois missions du
 * jour, avec sa PLAGE HORAIRE (deux heures pleines, dans le fuseau du compte) annoncée par une notification
 * au début de la plage. Conception : `docs/product/jeu-meeshy-conception.html` § II.5 et IX.
 *
 * ## Ce qui la rend « à lui »
 *
 * - **ses usages réels** : un gabarit se tire d'autant plus volontiers que le compte fait déjà ce geste
 *   (les compteurs d'engagement, fournis par l'appelant) ;
 * - **ses langues** : une mission de langue (le Prisme) n'est proposée qu'à un compte qui en parle
 *   plusieurs ;
 * - **son niveau** : facile sous le 10, moyenne sous le 30, difficile ensuite — jamais d'Or ;
 * - **ses heures habituelles** : la plage se tire PARMI les heures où il écrit d'ordinaire.
 *
 * ## Ce qui ne sort JAMAIS
 *
 * L'histogramme des heures est une ENTRÉE de la loi, jamais une sortie : seule la plage tirée est servie, et
 * elle est tirée au hasard pondéré — deux jours de suite ne rendent pas la même heure. Conformité : « jamais
 * une heure d'activité » (partie IX).
 *
 * ## Déterminisme
 *
 * Mulberry32 sur `userId|jour|sel` (`day-prng.ts`) : les entrées identiques rendent la même mission et la même
 * plage, sur tous les sites. `nowMinute` est un PARAMÈTRE : tirée tard dans la journée, la mission ne retient
 * que des plages où il reste au moins une heure — sinon aucune mission aujourd'hui (`null`), jamais une
 * mission déjà manquée.
 */

import { pickIndex, seededRng } from './day-prng.js';
import { MISSION_TEMPLATES, missionObjective, missionReward, type DrawnMission, type MissionDifficulty, type MissionSignal } from './missions.js';

/** L'emplacement de la mission personnelle dans `DailyMission` : les trois premiers sont ceux du jour. */
export const PERSONAL_MISSION_SLOT = 3;

export const PERSONAL_WINDOW_MINUTES = 120;
const WINDOW_EARLIEST_START_HOUR = 8;
const WINDOW_LATEST_START_HOUR = 21;
/** Une plage déjà entamée ne se retient que s'il en reste au moins une heure. */
const MIN_REMAINING_MINUTES = 60;
/** Sous ce nombre d'activités observées, l'histogramme ne dit rien : la courbe par défaut s'applique. */
const MIN_HABIT_SAMPLES = 8;

export const PERSONAL_ACTIVITIES = ['react', 'voice', 'chat', 'stickers', 'attachments', 'reply', 'comment', 'story', 'post', 'prism'] as const;
export type PersonalActivity = (typeof PERSONAL_ACTIVITIES)[number];

/** Les gabarits qu'une mission personnelle peut prendre, et l'activité que la notification nomme. */
const PERSONAL_POOL: readonly { readonly key: string; readonly tier: 'easy' | 'medium' | 'hard'; readonly activity: PersonalActivity }[] = [
  { key: 'react-messages', tier: 'easy', activity: 'react' },
  { key: 'send-voice', tier: 'easy', activity: 'voice' },
  { key: 'send-texts', tier: 'easy', activity: 'chat' },
  { key: 'use-stickers', tier: 'easy', activity: 'stickers' },
  { key: 'send-attachments', tier: 'easy', activity: 'attachments' },
  { key: 'reply-conversations', tier: 'medium', activity: 'reply' },
  { key: 'comment-text', tier: 'medium', activity: 'comment' },
  { key: 'publish-story', tier: 'medium', activity: 'story' },
  { key: 'publish-post', tier: 'medium', activity: 'post' },
  { key: 'prism-foreign-messages', tier: 'medium', activity: 'prism' },
  { key: 'prism-foreign-exchange', tier: 'hard', activity: 'prism' },
  { key: 'reply-conversations-wide', tier: 'hard', activity: 'reply' },
  { key: 'publish-posts', tier: 'hard', activity: 'post' },
  { key: 'voice-comments', tier: 'hard', activity: 'comment' },
  { key: 'long-chat', tier: 'hard', activity: 'chat' },
];

/** L'activité que la notification nomme pour ce gabarit (`chat` pour un gabarit hors du pool personnel). */
export const personalMissionActivity = (templateKey: string): PersonalActivity =>
  PERSONAL_POOL.find((entry) => entry.key === templateKey)?.activity ?? 'chat';

const tierOf = (level: number): MissionDifficulty => (level < 10 ? 'easy' : level < 30 ? 'medium' : 'hard');

export type PersonalMissionInput = {
  readonly userId: string;
  readonly dayKey: string;
  readonly level: number;
  readonly flameDays: number;
  /** La minute du jour LOCAL au moment du tirage, 0..1439. */
  readonly nowMinute: number;
  /** Vingt-quatre compteurs d'activité par heure locale ; `null` quand le compte n'a pas d'historique lisible. */
  readonly activeHours: readonly number[] | null;
  /** Ce que le compte fait déjà : un compte par signal (`axis:…`, `reply-distinct-conversations`). */
  readonly usage: Readonly<Partial<Record<string, number>>>;
  /** Le compte parle au moins deux langues dans le jeu : les missions du Prisme lui sont ouvertes. */
  readonly multilingual: boolean;
  /** Les signaux des trois missions du jour : la personnelle ne les double pas. */
  readonly excludedSignals?: readonly MissionSignal[];
};

export type PersonalMissionDraw = {
  readonly mission: DrawnMission;
  /** Minute locale de début et de fin, [début, fin[. */
  readonly startMinute: number;
  readonly endMinute: number;
};

const finite = (value: number | undefined): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

const weightedIndex = (rng: () => number, weights: readonly number[]): number => {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return pickIndex(rng, weights.length);
  let ticket = rng() * total;
  const index = weights.findIndex((w) => (ticket -= w) < 0);
  return index === -1 ? weights.length - 1 : index;
};

/** Une activité par heure locale, sur 24 cases : les minutes hors de la journée sont ignorées. */
export function activeHoursHistogram(minutesOfDay: readonly number[]): number[] {
  const histogram = Array.from({ length: 24 }, () => 0);
  for (const minute of minutesOfDay) {
    if (Number.isFinite(minute) && minute >= 0 && minute < 1440) histogram[Math.floor(minute / 60)] = (histogram[Math.floor(minute / 60)] ?? 0) + 1;
  }
  return histogram;
}

/** Sans histoire lisible : le soir pèse le plus, le déjeuner ensuite. */
const defaultHourWeight = (hour: number): number => (hour >= 18 && hour <= 21 ? 3 : hour >= 12 && hour <= 13 ? 2 : 1);

const hourWeights = (activeHours: readonly number[] | null, startHours: readonly number[]): number[] => {
  const known = activeHours !== null && activeHours.length === 24 && activeHours.reduce((sum, n) => sum + finite(n), 0) >= MIN_HABIT_SAMPLES;
  return startHours.map((hour) => (known ? 1 + finite(activeHours[hour]) + finite(activeHours[hour + 1]) : defaultHourWeight(hour)));
};

/** Les heures de début encore tenables à cette minute locale : il reste au moins une heure de plage. */
const openStartHours = (nowMinute: number): number[] =>
  Array.from({ length: WINDOW_LATEST_START_HOUR - WINDOW_EARLIEST_START_HOUR + 1 }, (_, i) => WINDOW_EARLIEST_START_HOUR + i).filter(
    (hour) => (hour * 60 + PERSONAL_WINDOW_MINUTES) - nowMinute >= MIN_REMAINING_MINUTES,
  );

/**
 * Une plage tient-elle encore aujourd'hui ? À demander AVANT de lire les habitudes du compte : quand la
 * réponse est non, `drawPersonalMission` rend `null` quelles que soient ses autres entrées.
 */
export const personalWindowStillFits = (nowMinute: number): boolean => openStartHours(nowMinute).length > 0;

export function drawPersonalMission(input: PersonalMissionInput): PersonalMissionDraw | null {
  const startHours = openStartHours(input.nowMinute);
  if (startHours.length === 0) return null;

  const tier = tierOf(input.level);
  const excluded = new Set<string>(input.excludedSignals ?? []);
  const candidates = PERSONAL_POOL.filter((entry) => entry.tier === tier)
    .map((entry) => ({ entry, template: MISSION_TEMPLATES.find((t) => t.key === entry.key) }))
    .filter((c): c is { entry: (typeof PERSONAL_POOL)[number]; template: (typeof MISSION_TEMPLATES)[number] } => c.template !== undefined);
  const open = candidates.filter((c) => !excluded.has(c.template.signal));
  const pool = open.length > 0 ? open : candidates;

  const weights = pool.map(({ template }) => {
    if (template.prism) return input.multilingual ? 3 : 0;
    return 1 + Math.min(6, Math.floor(Math.log2(1 + finite(input.usage[template.signal]))));
  });
  const picked = pool[weightedIndex(seededRng({ userId: input.userId, dayKey: input.dayKey, salt: 'personal-mission' }), weights)];
  if (picked === undefined) return null;

  const startHour = startHours[weightedIndex(seededRng({ userId: input.userId, dayKey: input.dayKey, salt: 'personal-window' }), hourWeights(input.activeHours, startHours))]!;
  const { template } = picked;
  return {
    mission: {
      difficulty: template.difficulty,
      templateKey: template.key,
      signal: template.signal,
      prism: template.prism,
      target: missionObjective({ baseTarget: template.baseTarget, level: input.level }),
      reward: missionReward({ basePoints: template.basePoints, level: input.level, flameDays: input.flameDays }),
      glory: 0,
    },
    startMinute: startHour * 60,
    endMinute: startHour * 60 + PERSONAL_WINDOW_MINUTES,
  };
}

export const PERSONAL_MISSION_STATES = ['upcoming', 'active', 'completed', 'missed'] as const;
export type PersonalMissionState = (typeof PERSONAL_MISSION_STATES)[number];

type Window = { readonly startsAt: Date; readonly endsAt: Date };

/** Début inclus, fin exclue : passé `endsAt`, la mission n'est plus réalisable. */
export const isPersonalMissionOpen = (params: Window & { readonly now: Date }): boolean =>
  params.now.getTime() >= params.startsAt.getTime() && params.now.getTime() < params.endsAt.getTime();

/** Réussie dès qu'elle est faite ; sinon à venir, en cours, ou manquée. */
export function personalMissionState(params: Window & { readonly completedAt: Date | null; readonly now: Date }): PersonalMissionState {
  if (params.completedAt !== null) return 'completed';
  if (params.now.getTime() < params.startsAt.getTime()) return 'upcoming';
  return params.now.getTime() < params.endsAt.getTime() ? 'active' : 'missed';
}

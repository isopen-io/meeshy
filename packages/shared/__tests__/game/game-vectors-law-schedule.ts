/**
 * LE CALENDRIER DES SAISONS SERVI, MIS EN VECTEURS (#10016) — la lecture d'un calendrier (`season-schedule`)
 * et la programmation d'une saison future (`season-edit`).
 *
 * Même contrat que `game-vectors-law-v2.ts`, qui les déclare et les assemble : `expected` est la sortie de la
 * loi TS (`utils/game/season-schedule.ts`), rejouée par iOS sur le miroir du SDK (`GameSeasonSchedule.swift`).
 * Sur divergence, c'est le TS qui a raison. Les calendriers sont donnés BRUTS : la normalisation (repli sur la
 * constante, définition illisible ignorée) fait partie de la loi rejouée.
 */

import {
  applySeasonEdit,
  normalizeSeasonSchedule,
  scheduledSeasonAt,
  scheduledSeasonCalendar,
  scheduledSeasonOfMoment,
  scheduledSeasonWeek,
  scheduledUpcomingSeason,
  seasonDefinitionOf,
  seasonStatusOf,
  type SeasonEdit,
} from '../../utils/game/season-schedule.js';
import { claimSeasonStep } from '../../utils/game/season.js';

export type GameVectorInputSchedule =
  | { readonly law: 'season-schedule'; readonly schedule: unknown; readonly season: number; readonly dayKey: string; readonly minuteOfDay: number }
  | { readonly law: 'season-edit'; readonly schedule: unknown; readonly edit: SeasonEdit; readonly dayKey: string; readonly minuteOfDay: number };

export const GAME_VECTOR_LAWS_SCHEDULE = ['season-schedule', 'season-edit'] as const;

export function evaluateGameVectorSchedule(input: GameVectorInputSchedule): unknown {
  const schedule = normalizeSeasonSchedule(input.schedule);
  switch (input.law) {
    case 'season-schedule': {
      const definition = seasonDefinitionOf(schedule, input.season);
      return {
        revision: schedule.revision,
        kept: schedule.seasons.map((d) => d.number),
        calendar: scheduledSeasonCalendar(schedule, input.season),
        status: seasonStatusOf(schedule, input.season),
        stepPoints: definition?.stepPoints ?? null,
        claim: claimSeasonStep({ season: input.season, step: 1, stepsReached: 1, claimed: [], sealOwned: false, stepPoints: definition?.stepPoints }),
        season: scheduledSeasonAt(schedule, input.dayKey),
        week: scheduledSeasonWeek(schedule, input.dayKey),
        seasonOfMoment: scheduledSeasonOfMoment(schedule, input),
        upcoming: scheduledUpcomingSeason(schedule, input)?.number ?? null,
      };
    }
    case 'season-edit': {
      const result = applySeasonEdit(schedule, input.edit, input);
      return result.ok
        ? { ok: true, revision: result.schedule.revision, calendar: scheduledSeasonCalendar(result.schedule, input.edit.number), status: result.definition.status }
        : { ok: false, reason: result.reason };
    }
  }
}

const vector = (_label: string, input: GameVectorInputSchedule) => ({ _label, input, expected: evaluateGameVectorSchedule(input) });

const def = (number: number, startDay: string, over: Record<string, unknown> = {}) => ({
  number,
  startDay,
  status: 'scheduled',
  themeKey: 'language:fr',
  stepPoints: 100,
  copy: null,
  ...over,
});

const SCHEDULES: readonly (readonly [string, unknown])[] = [
  ['vide', { revision: 0, seasons: [] }],
  ['illisible', 'pas un calendrier'],
  ['seed', { revision: 1, seasons: [def(1, '2026-12-21')] }],
  ['décalé', { revision: 2, seasons: [def(1, '2026-12-21'), def(2, '2027-03-01', { themeKey: 'language:ja', stepPoints: 150 })] }],
  ['en pause', { revision: 2, seasons: [def(1, '2026-12-21'), def(2, '2027-02-15', { status: 'paused' })] }],
  ['chevauchant', { revision: 3, seasons: [def(1, '2026-12-21'), def(2, '2027-02-01'), def(3, '2027-05-03', { stepPoints: 120 })] }],
  ['mardi', { revision: 1, seasons: [def(1, '2026-12-22')] }],
  ['hors bornes', { revision: 1, seasons: [def(1, '2026-12-21', { stepPoints: 500 })] }],
];

const MOMENTS: readonly (readonly [string, number])[] = [
  ['2026-10-11', 600],
  ['2026-12-20', 1200],
  ['2027-01-05', 600],
  ['2027-02-14', 1199],
  ['2027-02-20', 600],
  ['2027-03-01', 0],
  ['2027-05-03', 600],
];

export function buildGameVectorsSchedule() {
  const reads = SCHEDULES.flatMap(([name, schedule]) =>
    MOMENTS.flatMap(([dayKey, minuteOfDay], i) => {
      const season = (i % 3) + 1;
      return [vector(`calendrier ${name} : saison ${season}, le ${dayKey} à ${minuteOfDay} min`, { law: 'season-schedule', schedule, season, dayKey, minuteOfDay })];
    }),
  );
  const seed = SCHEDULES[2]![1];
  const paused = SCHEDULES[4]![1];
  const now = { dayKey: '2027-01-05', minuteOfDay: 600 };
  const edits: readonly (readonly [string, unknown, SeasonEdit, { dayKey: string; minuteOfDay: number }])[] = [
    ['décale la saison 2', seed, { number: 2, startDay: '2027-03-01' }, now],
    ['refuse un mardi', seed, { number: 2, startDay: '2027-03-02' }, now],
    ['refuse un jour illisible', seed, { number: 2, startDay: '2027-02-30' }, now],
    ['refuse la saison en cours', seed, { number: 1, startDay: '2027-01-11' }, now],
    ['refuse un chevauchement', seed, { number: 2, startDay: '2027-02-08' }, now],
    ['refuse une date commencée', { revision: 0, seasons: [] }, { number: 1, startDay: '2026-10-05' }, { dayKey: '2026-10-11', minuteOfDay: 600 }],
    ['met en pause la saison 2', seed, { number: 2, status: 'paused' }, now],
    ['programme derrière une pause, sans dates', paused, { number: 3, startDay: '2027-06-07' }, now],
    ['reprend la saison 2', paused, { number: 2, status: 'scheduled', startDay: '2027-03-08' }, now],
    ['refuse des récompenses hors bornes', seed, { number: 2, stepPoints: 250 }, now],
    ['accepte des récompenses bornées', seed, { number: 2, stepPoints: 50 }, now],
    ['refuse un thème inconnu', seed, { number: 2, themeKey: 'language:xx' }, now],
    ['programme la saison 1 avant son ouverture', seed, { number: 1, startDay: '2027-01-04' }, { dayKey: '2026-10-11', minuteOfDay: 600 }],
  ];
  return [
    ...reads,
    ...edits.map(([label, schedule, edit, moment]) => vector(`programmation : ${label}`, { law: 'season-edit', schedule, edit, ...moment })),
  ];
}

/**
 * LE CALENDRIER DES SAISONS SERVI (#10016) — les bords : entrées illisibles, refus de forme, limites d'Apple, export.
 * Chaque cas est un comportement que la passerelle ou un client peut rencontrer (base corrompue, cache altéré, saisie admin).
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SEASON_SCHEDULE,
  SEASON_COPY_LOCALES,
  applySeasonEdit,
  isLawfulSeasonCopy,
  isLawfulStepPoints,
  isSeasonThemeKey,
  normalizeSeasonSchedule,
  scheduledSeasonAt,
  scheduledSeasonCalendar,
  scheduledSeasonWeek,
  scheduledUpcomingSeason,
  seasonDefinitionOf,
  seasonStatusOf,
  type SeasonSchedule,
} from '../../utils/game/season-schedule';
import {
  replaceAppEventsBlock,
  seasonAppEvent,
  seasonAppEventsYaml,
  upcomingSeasonAppEvents,
  validateAppEvent,
} from '../../utils/game/season-app-events';

const def = (number: number, startDay: string, over: Record<string, unknown> = {}) => ({
  number,
  startDay,
  status: 'scheduled',
  themeKey: 'language:fr',
  stepPoints: 100,
  copy: null,
  ...over,
});
const copy = Object.fromEntries(SEASON_COPY_LOCALES.map((l) => [l, { title: 'Saison', tagline: 'Huit semaines', description: 'Une étoile par jour' }]));
const now = { dayKey: '2027-01-05', minuteOfDay: 600 };
const early = { dayKey: '2026-10-11', minuteOfDay: 600 };

describe('normaliser un calendrier reçu', () => {
  it.each([
    ['pas un objet', 42],
    ['révision négative', { revision: -1, seasons: [] }],
    ['révision fractionnaire', { revision: 1.5, seasons: [] }],
    ['saisons absentes', { revision: 1 }],
  ])('%s : la constante', (_label, raw) => {
    expect(normalizeSeasonSchedule(raw)).toEqual(DEFAULT_SEASON_SCHEDULE);
  });

  it.each([
    ['une entrée qui n’est pas un objet', 'x'],
    ['un numéro nul', def(0, '2027-02-15')],
    ['un jour illisible', def(2, '2027-02-31')],
    ['un statut inconnu', def(2, '2027-02-15', { status: 'cancelled' })],
    ['un thème inconnu', def(2, '2027-02-15', { themeKey: 'language:xx' })],
    ['des points hors bornes', def(2, '2027-02-15', { stepPoints: 7 })],
  ])('ignore %s', (_label, entry) => {
    expect(normalizeSeasonSchedule({ revision: 4, seasons: [entry] })).toEqual({ revision: 4, seasons: [] });
  });

  it('garde la première définition d’un numéro en double', () => {
    const schedule = normalizeSeasonSchedule({ revision: 2, seasons: [def(2, '2027-03-01'), def(2, '2027-03-08')] });
    expect(schedule.seasons).toEqual([expect.objectContaining({ number: 2, startDay: '2027-03-01' })]);
  });

  it('garde des textes conformes', () => {
    expect(normalizeSeasonSchedule({ revision: 1, seasons: [def(2, '2027-03-01', { copy })] }).seasons[0]?.copy).toEqual(copy);
  });
});

describe('les textes et les bornes', () => {
  it.each([
    ['null', null],
    ['un tableau', []],
    ['une langue en trop', { ...copy, ja: copy.fr }],
    ['une langue qui n’est pas un objet', { ...copy, fr: 'Saison' }],
    ['un champ en trop', { ...copy, fr: { ...copy.fr, extra: 'x' } }],
    ['un titre vide', { ...copy, fr: { ...copy.fr, title: '' } }],
    ['un espace en tête', { ...copy, fr: { ...copy.fr, title: ' Saison' } }],
    ['une accroche trop longue', { ...copy, fr: { ...copy.fr, tagline: 'x'.repeat(51) } }],
    ['une description trop longue', { ...copy, fr: { ...copy.fr, description: 'x'.repeat(121) } }],
    ['un saut de ligne', { ...copy, fr: { ...copy.fr, description: 'a\nb' } }],
  ])('refuse %s', (_label, value) => {
    expect(isLawfulSeasonCopy(value)).toBe(false);
  });

  it('les bornes des points et le catalogue des thèmes', () => {
    expect([40, 50, 200, 210, 55, '100', 100.5].map(isLawfulStepPoints)).toEqual([false, true, true, false, false, false, false]);
    expect([isSeasonThemeKey('language:ja'), isSeasonThemeKey(3), isSeasonThemeKey('language:xx')]).toEqual([true, false, false]);
  });
});

describe('lire un numéro ou un jour invalide', () => {
  it('rend null, jamais une saison', () => {
    expect(scheduledSeasonCalendar(DEFAULT_SEASON_SCHEDULE, 0)).toBeNull();
    expect(scheduledSeasonCalendar(DEFAULT_SEASON_SCHEDULE, Number.NaN)).toBeNull();
    expect(scheduledSeasonAt(DEFAULT_SEASON_SCHEDULE, 'hier')).toBeNull();
    expect(scheduledSeasonWeek(DEFAULT_SEASON_SCHEDULE, '2026-12-20')).toBeNull();
    expect(seasonDefinitionOf(DEFAULT_SEASON_SCHEDULE, 1.5)).toBeNull();
    expect(seasonStatusOf(DEFAULT_SEASON_SCHEDULE, 7)).toBe('scheduled');
  });

  it('une saison 1 en pause : rien à venir, aucune saison ouverte', () => {
    const paused: SeasonSchedule = { revision: 1, seasons: [def(1, '2026-12-21', { status: 'paused' }) as never] };
    expect(scheduledSeasonAt(paused, '2027-01-05')).toBeNull();
    expect(scheduledUpcomingSeason(paused, early)).toBeNull();
  });
});

describe('les refus de forme de la programmation', () => {
  const seed = normalizeSeasonSchedule({ revision: 1, seasons: [def(1, '2026-12-21')] });

  it.each([
    ['un numéro nul', { number: 0 }, 'invalid-number'],
    ['un numéro fractionnaire', { number: 2.5 }, 'invalid-number'],
    ['un statut inconnu', { number: 2, status: 'cancelled' }, 'invalid-status'],
    ['un jour qui n’est pas une chaîne', { number: 2, startDay: 20270301 }, 'invalid-day'],
  ])('refuse %s', (_label, edit, reason) => {
    expect(applySeasonEdit(seed, edit as never, now)).toEqual({ ok: false, reason });
  });

  it('retire les textes d’une saison (copy: null)', () => {
    const withCopy = applySeasonEdit(seed, { number: 2, copy }, now);
    if (!withCopy.ok) throw new Error(withCopy.reason);
    const cleared = applySeasonEdit(withCopy.schedule, { number: 2, copy: null }, now);
    expect(cleared.ok && cleared.definition.copy).toBeNull();
  });

  it('une reprise sans date refuse une date prévue trop proche', () => {
    const paused = applySeasonEdit(seed, { number: 2, status: 'paused' }, now);
    if (!paused.ok) throw new Error(paused.reason);
    expect(applySeasonEdit(paused.schedule, { number: 2, status: 'scheduled' }, { dayKey: '2027-02-12', minuteOfDay: 0 })).toEqual({
      ok: false,
      reason: 'start-too-soon',
    });
    expect(applySeasonEdit(paused.schedule, { number: 2, status: 'scheduled' }, now).ok).toBe(true);
  });
});

describe("l'export des événements", () => {
  const seed = normalizeSeasonSchedule({ revision: 1, seasons: [def(1, '2026-12-21')] });

  it('rend les prochaines saisons programmées, s’arrête à une pause, borne le nombre', () => {
    expect(upcomingSeasonAppEvents(seed, early).map((e) => e.key)).toEqual(['saison-1', 'saison-2', 'saison-3']);
    expect(upcomingSeasonAppEvents(seed, early, 50)).toHaveLength(15);
    expect(upcomingSeasonAppEvents(seed, early, -2)).toEqual([]);
    expect(upcomingSeasonAppEvents(seed, now, 2).map((e) => e.key)).toEqual(['saison-2', 'saison-3']);
    const paused = normalizeSeasonSchedule({ revision: 2, seasons: [def(1, '2026-12-21'), def(2, '2027-02-15', { status: 'paused' })] });
    expect(upcomingSeasonAppEvents(paused, early, 5).map((e) => e.key)).toEqual(['saison-1']);
    expect(seasonAppEvent(seed, 0, early)).toBeNull();
  });

  it('les textes propres d’une saison remplacent les textes par défaut', () => {
    const own = normalizeSeasonSchedule({ revision: 2, seasons: [def(1, '2026-12-21', { copy })] });
    expect(seasonAppEvent(own, 1, early)?.localizations['fr-FR']).toEqual({ name: 'Saison', short_description: 'Huit semaines', long_description: 'Une étoile par jour' });
  });

  it('nomme chaque défaut', () => {
    const ev = seasonAppEvent(seed, 1, early)!;
    expect(validateAppEvent({ ...ev, key: 'Saison 1' })).toContain('key');
    expect(validateAppEvent({ ...ev, deep_link: 'http://evil.example/1' })).toContain('deep_link');
    expect(validateAppEvent({ ...ev, event_start: 'demain' })).toContain('dates');
    expect(validateAppEvent({ ...ev, event_end: ev.event_start })).toContain('duration');
    expect(validateAppEvent({ ...ev, publish_start: '2026-12-22T00:00:00+01:00' })).toContain('publish_start');
    const { 'fr-FR': _fr, ...others } = ev.localizations;
    expect(validateAppEvent({ ...ev, localizations: others })).toContain('localizations.fr-FR');
    const fr = ev.localizations['fr-FR']!;
    expect(validateAppEvent({ ...ev, localizations: { ...ev.localizations, 'fr-FR': { ...fr, short_description: '' } } })).toContain('localizations.fr-FR.short_description');
    expect(validateAppEvent({ ...ev, localizations: { ...ev.localizations, 'fr-FR': { ...fr, long_description: 'x'.repeat(121) } } })).toContain('localizations.fr-FR.long_description');
    expect(validateAppEvent({ ...ev, reference_name: '' })).toContain('reference_name');
  });

  it('un bloc vide, et un andp.yml sans store:', () => {
    expect(seasonAppEventsYaml([])).toBe('  app_events: []\n');
    expect(() => replaceAppEventsBlock('app:\n  name: x\n', seasonAppEventsYaml([]))).toThrow();
  });

  it('remplace un bloc app_events existant suivi d’une autre clé de store', () => {
    const andp = ['store:', '  platform: IOS', '  app_events:', '    - key: vieux', '', '  accessibility:', '    x: 1', ''].join('\n');
    const out = replaceAppEventsBlock(andp, seasonAppEventsYaml([seasonAppEvent(seed, 1, early)!]));
    expect(out).not.toContain('vieux');
    expect(out).toContain('- key: saison-1');
    expect(out).toContain('  accessibility:\n    x: 1');
  });
});

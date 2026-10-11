/**
 * LE CALENDRIER DES SAISONS EN BASE (#10016) — la loi qui lit un calendrier SERVI.
 *
 * Le calendrier par défaut (aucune définition, ou la seule saison 1 du seed) rend
 * EXACTEMENT la constante : saison 1 le 2026-12-21, saisons enchaînées de 56 jours,
 * thèmes en boucle. Une saison future se programme, se décale ou se met en pause ;
 * une saison en cours ou passée ne se réécrit pas ; une saison commence un lundi.
 */

import { describe, it, expect } from 'vitest';
import { SEASON_ONE_START, seasonCalendar, seasonAt, seasonWeek, upcomingSeason } from '../../utils/game/season';
import {
  DEFAULT_SEASON_SCHEDULE,
  SEASON_COPY_LOCALES,
  SEASON_STEP_POINTS_MAX,
  SEASON_STEP_POINTS_MIN,
  applySeasonEdit,
  normalizeSeasonSchedule,
  scheduledSeasonCalendar,
  scheduledSeasonAt,
  scheduledSeasonWeek,
  scheduledUpcomingSeason,
  seasonDefinitionOf,
  seasonStatusOf,
  type SeasonSchedule,
} from '../../utils/game/season-schedule';
import { replaceAppEventsBlock, seasonAppEvent, seasonAppEventsYaml, validateAppEvent } from '../../utils/game/season-app-events';

const SEED: SeasonSchedule = {
  revision: 1,
  seasons: [{ number: 1, startDay: '2026-12-21', status: 'scheduled', themeKey: 'language:fr', stepPoints: 100, copy: null }],
};

const before = { dayKey: '2026-10-11', minuteOfDay: 22 * 60 };

describe('le calendrier par défaut rend la constante', () => {
  it.each([1, 2, 3, 9, 40])('saison %i identique, sans calendrier, avec le seed', (n) => {
    expect(scheduledSeasonCalendar(DEFAULT_SEASON_SCHEDULE, n)).toEqual(seasonCalendar(n));
    expect(scheduledSeasonCalendar(SEED, n)).toEqual(seasonCalendar(n));
  });

  it.each(['2026-12-20', '2026-12-21', '2027-02-14', '2027-02-15', '2030-06-03'])('le jour %s tombe dans la même saison et la même semaine', (day) => {
    expect(scheduledSeasonAt(SEED, day)).toBe(seasonAt(day));
    expect(scheduledSeasonWeek(SEED, day)).toBe(seasonWeek(day));
  });

  it('la saison à venir est la saison 1 avant le 2026-12-21', () => {
    expect(scheduledUpcomingSeason(SEED, before)).toEqual(upcomingSeason(before));
    expect(scheduledUpcomingSeason(SEED, before)?.startDay).toBe(SEASON_ONE_START);
  });

  it('un calendrier illisible retombe sur la constante', () => {
    expect(normalizeSeasonSchedule(null)).toEqual(DEFAULT_SEASON_SCHEDULE);
    expect(normalizeSeasonSchedule({ revision: 'x', seasons: 'y' })).toEqual(DEFAULT_SEASON_SCHEDULE);
    expect(normalizeSeasonSchedule({ revision: 3, seasons: [{ number: 2, startDay: '2027-03-02' }] }).seasons).toEqual([]);
  });
});

describe('une saison décalée', () => {
  const shifted: SeasonSchedule = {
    revision: 2,
    seasons: [...SEED.seasons, { number: 2, startDay: '2027-03-01', status: 'scheduled', themeKey: 'language:ja', stepPoints: 120, copy: null }],
  };

  it('ouvre au lundi programmé, laisse un intervalle, et décale les suivantes', () => {
    expect(scheduledSeasonCalendar(shifted, 2)).toMatchObject({ number: 2, startDay: '2027-03-01', endDay: '2027-04-25', themeKey: 'language:ja' });
    expect(scheduledSeasonCalendar(shifted, 3)?.startDay).toBe('2027-04-26');
    expect(scheduledSeasonCalendar(shifted, 3)?.themeKey).toBe('language:ar');
    expect(scheduledSeasonAt(shifted, '2027-02-20')).toBeNull();
    expect(scheduledSeasonWeek(shifted, '2027-02-20')).toBeNull();
    expect(scheduledSeasonAt(shifted, '2027-03-01')).toBe(2);
    expect(scheduledSeasonAt(shifted, '2027-04-26')).toBe(3);
  });

  it("annonce la saison suivante pendant l'intervalle", () => {
    expect(scheduledUpcomingSeason(shifted, { dayKey: '2027-02-20', minuteOfDay: 600 })?.number).toBe(2);
    expect(scheduledUpcomingSeason(shifted, { dayKey: '2027-01-10', minuteOfDay: 600 })).toBeNull();
  });

  it('porte ses récompenses et son thème', () => {
    expect(seasonDefinitionOf(shifted, 2)).toMatchObject({ stepPoints: 120, themeKey: 'language:ja' });
    expect(seasonDefinitionOf(shifted, 3)).toMatchObject({ number: 3, stepPoints: 100, themeKey: 'language:ar', status: 'scheduled' });
  });
});

describe('une saison en pause', () => {
  const paused: SeasonSchedule = {
    revision: 2,
    seasons: [...SEED.seasons, { number: 2, startDay: '2027-02-15', status: 'paused', themeKey: 'language:es', stepPoints: 100, copy: null }],
  };

  it("n'a pas de dates, ni elle ni les suivantes", () => {
    expect(scheduledSeasonCalendar(paused, 1)?.endDay).toBe('2027-02-14');
    expect(scheduledSeasonCalendar(paused, 2)).toBeNull();
    expect(scheduledSeasonCalendar(paused, 3)).toBeNull();
    expect(scheduledSeasonAt(paused, '2027-02-15')).toBeNull();
    expect(seasonStatusOf(paused, 2)).toBe('paused');
    expect(seasonStatusOf(paused, 3)).toBe('paused');
    expect(seasonStatusOf(paused, 1)).toBe('scheduled');
  });
});

describe('la programmation (admin) : futur seulement, un lundi, sans chevauchement', () => {
  const now = { dayKey: '2027-01-05', minuteOfDay: 600 }; // saison 1 en cours

  it('décale une saison future', () => {
    const r = applySeasonEdit(SEED, { number: 2, startDay: '2027-03-01' }, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.schedule.revision).toBe(2);
      expect(scheduledSeasonCalendar(r.schedule, 2)?.startDay).toBe('2027-03-01');
    }
  });

  it('refuse une date qui ne tombe pas un lundi', () => {
    expect(applySeasonEdit(SEED, { number: 2, startDay: '2027-03-02' }, now)).toEqual({ ok: false, reason: 'not-monday' });
  });

  it('refuse un jour illisible', () => {
    expect(applySeasonEdit(SEED, { number: 2, startDay: '2027-13-45' }, now)).toEqual({ ok: false, reason: 'invalid-day' });
  });

  it('refuse de réécrire une saison en cours ou passée', () => {
    expect(applySeasonEdit(SEED, { number: 1, startDay: '2027-01-11' }, now)).toEqual({ ok: false, reason: 'season-not-future' });
    expect(applySeasonEdit(SEED, { number: 1, status: 'paused' }, now)).toEqual({ ok: false, reason: 'season-not-future' });
  });

  it('refuse un chevauchement avec la saison précédente', () => {
    expect(applySeasonEdit(SEED, { number: 2, startDay: '2027-02-08' }, now)).toEqual({ ok: false, reason: 'overlaps-previous' });
  });

  it('refuse un chevauchement avec une saison suivante déjà programmée', () => {
    const r = applySeasonEdit(SEED, { number: 3, startDay: '2027-04-12' }, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(applySeasonEdit(r.schedule, { number: 2, startDay: '2027-03-01' }, now)).toEqual({ ok: false, reason: 'overlaps-next' });
  });

  it('refuse une date déjà commencée, même pour une saison future', () => {
    expect(applySeasonEdit(DEFAULT_SEASON_SCHEDULE, { number: 1, startDay: '2026-10-05' }, before)).toEqual({ ok: false, reason: 'start-not-future' });
  });

  it('met en pause puis reprend une saison future', () => {
    const p = applySeasonEdit(SEED, { number: 2, status: 'paused' }, now);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(scheduledSeasonCalendar(p.schedule, 2)).toBeNull();
    // Derrière une pause, une saison reste programmable (elle n'a jamais commencé) — mais sans dates tant que la pause dure.
    const behind = applySeasonEdit(p.schedule, { number: 3, startDay: '2027-06-07' }, now);
    expect(behind.ok && scheduledSeasonCalendar(behind.schedule, 3)).toBeNull();
    const r = applySeasonEdit(p.schedule, { number: 2, status: 'scheduled', startDay: '2027-03-08' }, now);
    expect(r.ok && scheduledSeasonCalendar(r.schedule, 2)?.startDay).toBe('2027-03-08');
  });

  it('borne les récompenses par la loi', () => {
    expect(applySeasonEdit(SEED, { number: 2, stepPoints: SEASON_STEP_POINTS_MAX + 10 }, now)).toEqual({ ok: false, reason: 'rewards-out-of-bounds' });
    expect(applySeasonEdit(SEED, { number: 2, stepPoints: SEASON_STEP_POINTS_MIN - 10 }, now)).toEqual({ ok: false, reason: 'rewards-out-of-bounds' });
    expect(applySeasonEdit(SEED, { number: 2, stepPoints: 105 }, now)).toEqual({ ok: false, reason: 'rewards-out-of-bounds' });
    expect(applySeasonEdit(SEED, { number: 2, stepPoints: 150 }, now).ok).toBe(true);
  });

  it('refuse un thème hors du catalogue', () => {
    expect(applySeasonEdit(SEED, { number: 2, themeKey: 'language:xx' }, now)).toEqual({ ok: false, reason: 'invalid-theme' });
  });

  it('refuse des textes trop longs ou une langue manquante', () => {
    const copy = Object.fromEntries(SEASON_COPY_LOCALES.map((l) => [l, { title: 'Saison', tagline: 'Huit semaines', description: 'Une étoile par jour' }]));
    expect(applySeasonEdit(SEED, { number: 2, copy }, now).ok).toBe(true);
    expect(applySeasonEdit(SEED, { number: 2, copy: { ...copy, fr: { title: 'x'.repeat(31), tagline: 'y', description: 'z' } } }, now)).toEqual({ ok: false, reason: 'copy-invalid' });
    const { ar: _ar, ...missing } = copy;
    expect(applySeasonEdit(SEED, { number: 2, copy: missing }, now)).toEqual({ ok: false, reason: 'copy-invalid' });
  });
});

describe("l'événement in-app App Store d'une saison", () => {
  const now = { dayKey: '2026-10-11', minuteOfDay: 600 };

  it("s'annonce par son ouverture : 31 jours au plus, publié 7 jours avant", () => {
    const ev = seasonAppEvent(SEED, 1, now);
    expect(ev).not.toBeNull();
    expect(ev).toMatchObject({
      key: 'saison-1',
      reference_name: 'Saison 1',
      badge: 'NEW_SEASON',
      deep_link: 'https://meeshy.me/me/progression/saison/1',
      primary_locale: 'fr-FR',
      territories: 'all',
      publish_start: '2026-12-14T00:00:00+01:00',
      event_start: '2026-12-21T00:00:00+01:00',
      event_end: '2027-01-17T20:00:00+01:00',
    });
    expect(validateAppEvent(ev!)).toEqual([]);
    expect(Object.keys(ev!.localizations).sort()).toEqual(['ar-SA', 'de-DE', 'en-US', 'es-ES', 'fr-FR', 'it', 'pt-BR']);
  });

  it("n'exporte ni une saison en pause ni une saison déjà ouverte", () => {
    const paused: SeasonSchedule = { revision: 2, seasons: [{ ...SEED.seasons[0]!, status: 'paused' }] };
    expect(seasonAppEvent(paused, 1, now)).toBeNull();
    expect(seasonAppEvent(SEED, 1, { dayKey: '2026-12-22', minuteOfDay: 0 })).toBeNull();
  });

  it('signale les limites Apple', () => {
    const ev = seasonAppEvent(SEED, 1, now)!;
    expect(validateAppEvent({ ...ev, reference_name: 'x'.repeat(65) })).toContain('reference_name');
    expect(validateAppEvent({ ...ev, event_end: '2027-01-30T20:00:00+01:00' })).toContain('duration');
    expect(validateAppEvent({ ...ev, publish_start: '2026-12-01T00:00:00+01:00' })).toContain('publish_start');
    expect(validateAppEvent({ ...ev, localizations: { ...ev.localizations, 'fr-FR': { name: 'x'.repeat(31), short_description: 'a', long_description: 'b' } } })).toContain('localizations.fr-FR.name');
  });

  it('se rend en bloc YAML store.app_events', () => {
    const yaml = seasonAppEventsYaml([seasonAppEvent(SEED, 1, now)!]);
    expect(yaml).toContain('app_events:');
    expect(yaml).toContain('- key: saison-1');
    expect(yaml).toContain('badge: NEW_SEASON');
    expect(yaml).toContain('event_start: 2026-12-21T00:00:00+01:00');
    expect(yaml).toContain('fr-FR:');
  });
});

describe("le bloc app_events d'andp.yml", () => {
  const andp = ['app:', '  name: x', 'store:', '  platform: IOS', '', '  accessibility:', '    IPHONE:', '      dark_interface: true', ''].join('\n');
  const block = seasonAppEventsYaml([seasonAppEvent(SEED, 1, { dayKey: '2026-10-11', minuteOfDay: 600 })!]);

  it('s’ajoute à la fin de store:, puis se remplace sans doubler ni toucher au reste', () => {
    const once = replaceAppEventsBlock(andp, block);
    expect(once.startsWith('app:\n  name: x\nstore:\n  platform: IOS')).toBe(true);
    expect(once).toContain('      dark_interface: true\n\n  app_events:\n    - key: saison-1');
    const twice = replaceAppEventsBlock(once, block);
    expect(twice).toBe(once);
    const emptied = replaceAppEventsBlock(once, seasonAppEventsYaml([]));
    expect(emptied).toContain('  app_events: []');
    expect(emptied).not.toContain('saison-1');
    expect(emptied).toContain('      dark_interface: true');
  });

  it('respecte une clé de premier niveau qui suit store:', () => {
    const out = replaceAppEventsBlock(`${andp}after:\n  k: v\n`, block);
    expect(out).toContain('- key: saison-1');
    expect(out.indexOf('after:')).toBeGreaterThan(out.indexOf('- key: saison-1'));
  });
});

describe('les cas de l’audit adversarial', () => {
  const now = { dayKey: '2027-01-05', minuteOfDay: 600 };

  it('une pause ne bloque jamais le calendrier : on décale la suivante, puis on reprend', () => {
    const s3 = applySeasonEdit(SEED, { number: 3, startDay: '2027-04-12' }, now);
    if (!s3.ok) throw new Error(s3.reason);
    const paused = applySeasonEdit(s3.schedule, { number: 2, status: 'paused' }, now);
    if (!paused.ok) throw new Error(paused.reason);
    expect(applySeasonEdit(paused.schedule, { number: 2, status: 'scheduled', startDay: '2027-03-08' }, now)).toEqual({ ok: false, reason: 'overlaps-next' });
    const moved = applySeasonEdit(paused.schedule, { number: 3, startDay: '2027-05-03' }, now);
    if (!moved.ok) throw new Error(moved.reason);
    const resumed = applySeasonEdit(moved.schedule, { number: 2, status: 'scheduled', startDay: '2027-03-08' }, now);
    if (!resumed.ok) throw new Error(resumed.reason);
    expect(scheduledSeasonCalendar(resumed.schedule, 2)?.startDay).toBe('2027-03-08');
    expect(scheduledSeasonCalendar(resumed.schedule, 3)?.startDay).toBe('2027-05-03');
  });

  it('une saison annoncée (J-7) ne se décale ni ne se met en pause ; une date trop proche est refusée', () => {
    const lateNow = { dayKey: '2027-02-09', minuteOfDay: 600 }; // saison 2 le 2027-02-15
    expect(applySeasonEdit(SEED, { number: 2, status: 'paused' }, lateNow)).toEqual({ ok: false, reason: 'season-announced' });
    expect(applySeasonEdit(SEED, { number: 2, startDay: '2027-03-01' }, lateNow)).toEqual({ ok: false, reason: 'season-announced' });
    expect(applySeasonEdit(SEED, { number: 2, startDay: '2027-02-15' }, { dayKey: '2027-02-01', minuteOfDay: 0 }).ok).toBe(true);
    expect(applySeasonEdit({ revision: 0, seasons: [] }, { number: 1, startDay: '2026-10-19' }, { dayKey: '2026-10-13', minuteOfDay: 0 })).toEqual({ ok: false, reason: 'start-too-soon' });
  });

  it.each([
    ['un lien', 'Va sur meeshy.me/promo'],
    ['une URL', 'https://evil.example'],
    ['une devise', 'Gagne 10 €'],
    ['un contrôle bidirectionnel', 'Saison\u202Eetiuq'],
    ['un caractère sans chasse', 'Sai\u200Bson'],
  ])('un texte de saison refuse %s', (_label, text) => {
    const copy = Object.fromEntries(SEASON_COPY_LOCALES.map((l) => [l, { title: 'Saison', tagline: 'Huit semaines', description: 'Une étoile par jour' }]));
    expect(applySeasonEdit(SEED, { number: 2, copy: { ...copy, fr: { ...copy.fr, description: text } } }, now)).toEqual({ ok: false, reason: 'copy-invalid' });
  });

  it('les textes par défaut de l’événement passent la loi', () => {
    const ev = seasonAppEvent(SEED, 1, { dayKey: '2026-10-11', minuteOfDay: 0 })!;
    expect(validateAppEvent(ev)).toEqual([]);
  });
});

describe('des textes devenus illisibles ne décalent jamais une saison', () => {
  it('seuls les textes tombent, les dates restent', () => {
    const bad = Object.fromEntries(SEASON_COPY_LOCALES.map((l) => [l, { title: 'Saison', tagline: 'Gagne 10 €', description: 'x' }]));
    const schedule = normalizeSeasonSchedule({ revision: 2, seasons: [{ number: 2, startDay: '2027-03-01', status: 'scheduled', themeKey: 'language:ja', stepPoints: 150, copy: bad }] });
    expect(schedule.seasons).toEqual([expect.objectContaining({ number: 2, startDay: '2027-03-01', copy: null })]);
  });
});

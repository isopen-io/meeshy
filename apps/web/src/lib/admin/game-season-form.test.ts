import { describe, expect, test } from 'bun:test';

import { SEASON_COPY_LIMITS, SEASON_COPY_LOCALES, SEASON_STEP_POINTS_MAX, SEASON_STEP_POINTS_MIN, isLawfulSeasonCopy } from '@meeshy/shared/utils/game/season-schedule';

import type { AdminSeasonRow } from '@/lib/api/admin-game-seasons';

import { charCount, copyLimit, draftOfRow, editBody, hasIssues, mondayOptions, stepPointsOptions, validateDraft, withCopy } from './game-season-form';

/**
 * LE FORMULAIRE D'UNE SAISON (#10232) — la loi partagée jugée AVANT l'envoi : un lundi, une date à venir, des points
 * bornés et par pas de 10, des textes complets dans les limites 30/50/120. Les champs changés partent seuls.
 */
const COPY = Object.fromEntries(SEASON_COPY_LOCALES.map((l) => [l, { title: `T ${l}`, tagline: `A ${l}`, description: `D ${l}` }]));
const ROW: AdminSeasonRow = {
  number: 3,
  startDay: '2027-04-26',
  endDay: '2027-06-20',
  status: 'scheduled',
  tense: 'upcoming',
  explicit: true,
  editable: true,
  themeKey: 'language:hi',
  stepPoints: 100,
  copy: null,
};
const NOW = { dayKey: '2027-02-01', minuteOfDay: 600 };

describe('mondayOptions', () => {
  test('ne propose que des lundis, strictement après la semaine du moment, en ordre', () => {
    const options = mondayOptions(NOW, 6);
    expect(options).toEqual(['2027-02-08', '2027-02-15', '2027-02-22', '2027-03-01', '2027-03-08', '2027-03-15']);
  });

  test('le dimanche soir après 20 h, la semaine suivante est déjà ouverte : le lundi qui vient n’est plus proposé', () => {
    expect(mondayOptions({ dayKey: '2027-02-07', minuteOfDay: 21 * 60 }, 2)).toEqual(['2027-02-15', '2027-02-22']);
  });
});

describe('stepPointsOptions', () => {
  test('de 50 à 200 par pas de 10', () => {
    const options = stepPointsOptions();
    expect(options[0]).toBe(SEASON_STEP_POINTS_MIN);
    expect(options.at(-1)).toBe(SEASON_STEP_POINTS_MAX);
    expect(options.every((n) => n % 10 === 0)).toBe(true);
    expect(options).toHaveLength(16);
  });
});

describe('validateDraft', () => {
  const draft = draftOfRow(ROW);

  test('un brouillon conforme n’a aucun défaut', () => {
    expect(hasIssues(validateDraft(draft, NOW))).toBe(false);
  });

  test('une date qui n’est pas un lundi est refusée avant l’envoi', () => {
    expect(validateDraft({ ...draft, startDay: '2027-04-27' }, NOW).startDay).toBe('not-monday');
  });

  test('une date illisible ou vide', () => {
    expect(validateDraft({ ...draft, startDay: '' }, NOW).startDay).toBe('invalid-day');
    expect(validateDraft({ ...draft, startDay: '2027-02-30' }, NOW).startDay).toBe('invalid-day');
  });

  test('une date déjà commencée (cette semaine ou avant) est refusée', () => {
    expect(validateDraft({ ...draft, startDay: '2027-02-01' }, NOW).startDay).toBe('start-not-future');
    expect(validateDraft({ ...draft, startDay: '2027-01-25' }, NOW).startDay).toBe('start-not-future');
  });

  test('en pause, la date est ignorée : aucun défaut de date', () => {
    expect(validateDraft({ ...draft, status: 'paused', startDay: '2027-04-27' }, NOW).startDay).toBeUndefined();
  });

  test('des points hors bornes ou hors pas', () => {
    for (const bad of ['40', '210', '105', '', 'abc', '99.5']) expect(validateDraft({ ...draft, stepPoints: bad }, NOW).stepPoints).toBe('rewards-out-of-bounds');
    for (const good of ['50', '120', '200']) expect(validateDraft({ ...draft, stepPoints: good }, NOW).stepPoints).toBeUndefined();
  });

  test('un thème hors catalogue', () => {
    expect(validateDraft({ ...draft, themeKey: 'language:xx' }, NOW).themeKey).toBe('invalid-theme');
  });

  test('des textes tous vides : c’est permis (les textes par défaut serviront)', () => {
    expect(validateDraft(draft, NOW).copy).toBeUndefined();
  });

  test('des textes partiels : le défaut nomme la langue et le champ vides', () => {
    const partial = withCopy(draft, 'fr', 'title', 'Saison trois');
    const issues = validateDraft(partial, NOW);
    expect(issues.copy).toBe('copy-invalid');
    expect(issues.copyFields).toContainEqual({ locale: 'en', field: 'title', issue: 'empty' });
    expect(issues.copyFields).not.toContainEqual({ locale: 'fr', field: 'title', issue: 'empty' });
  });

  test('des textes trop longs : 30, 50 et 120 signes', () => {
    let full = draftOfRow({ ...ROW, copy: COPY as AdminSeasonRow['copy'] });
    full = withCopy(full, 'ar', 'title', 'x'.repeat(SEASON_COPY_LIMITS.title + 1));
    full = withCopy(full, 'de', 'tagline', 'x'.repeat(SEASON_COPY_LIMITS.tagline + 1));
    full = withCopy(full, 'it', 'description', 'x'.repeat(SEASON_COPY_LIMITS.description + 1));
    const issues = validateDraft(full, NOW);
    expect(issues.copyFields).toContainEqual({ locale: 'ar', field: 'title', issue: 'too-long' });
    expect(issues.copyFields).toContainEqual({ locale: 'de', field: 'tagline', issue: 'too-long' });
    expect(issues.copyFields).toContainEqual({ locale: 'it', field: 'description', issue: 'too-long' });
  });

  test('les limites se comptent en signes, pas en octets (arabe, émojis)', () => {
    expect(charCount('الموسم')).toBe(6);
    expect(charCount('🎮🎮')).toBe(2);
    expect(copyLimit('title')).toBe(30);
    expect(copyLimit('tagline')).toBe(50);
    expect(copyLimit('description')).toBe(120);
  });
});

describe('editBody', () => {
  const baseline = draftOfRow(ROW);

  test('rien n’a changé : seule la révision part', () => {
    expect(editBody(ROW, baseline, 9)).toEqual({ expectedRevision: 9 });
  });

  test('seuls les champs changés partent', () => {
    const body = editBody(ROW, { ...baseline, startDay: '2027-05-03', stepPoints: '130' }, 9);
    expect(body).toEqual({ expectedRevision: 9, startDay: '2027-05-03', stepPoints: 130 });
  });

  test('mettre en pause / reprendre', () => {
    expect(editBody(ROW, { ...baseline, status: 'paused' }, 9)).toEqual({ expectedRevision: 9, status: 'paused' });
    const paused: AdminSeasonRow = { ...ROW, status: 'paused', endDay: null };
    expect(editBody(paused, { ...draftOfRow(paused), status: 'scheduled' }, 9)).toEqual({ expectedRevision: 9, status: 'scheduled' });
  });

  test('un thème changé', () => {
    expect(editBody(ROW, { ...baseline, themeKey: 'language:ja' }, 9).themeKey).toBe('language:ja');
  });

  test('des textes complets sont envoyés ROGNÉS et conformes à la loi partagée', () => {
    let draft = baseline;
    for (const locale of SEASON_COPY_LOCALES) {
      draft = withCopy(draft, locale, 'title', ` Titre ${locale} `);
      draft = withCopy(draft, locale, 'tagline', `Accroche ${locale}`);
      draft = withCopy(draft, locale, 'description', `Description ${locale}`);
    }
    const body = editBody(ROW, draft, 9);
    expect(isLawfulSeasonCopy(body.copy)).toBe(true);
    expect(body.copy?.fr.title).toBe('Titre fr');
  });

  test('vider tous les textes d’une saison qui en avait : copy null (efface) ; sinon rien', () => {
    const withText: AdminSeasonRow = { ...ROW, copy: COPY as AdminSeasonRow['copy'] };
    const cleared = draftOfRow({ ...withText, copy: null });
    expect(editBody(withText, cleared, 9)).toEqual({ expectedRevision: 9, copy: null });
    expect(editBody(ROW, cleared, 9)).toEqual({ expectedRevision: 9 });
  });

  test('en pause, la date n’est pas envoyée même si elle a changé', () => {
    const body = editBody(ROW, { ...baseline, status: 'paused', startDay: '2027-05-03' }, 9);
    expect(body).toEqual({ expectedRevision: 9, status: 'paused' });
  });
});

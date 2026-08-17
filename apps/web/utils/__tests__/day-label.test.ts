import { formatDayLabel } from '../date-format';

const TRANSLATIONS: Record<string, string> = {
  'messageTimestamp.today': "Aujourd'hui",
  'messageTimestamp.yesterday': 'Hier',
};

const t = (key: string) => TRANSLATIONS[key] ?? key;

const NOW = new Date('2026-08-15T14:00:00');

describe('formatDayLabel — les libellés du sticker de date', () => {
  it('labels today', () => {
    expect(formatDayLabel(new Date('2026-08-15T08:12:00'), { t, locale: 'fr', now: NOW }))
      .toBe("Aujourd'hui");
  });

  it('labels yesterday', () => {
    expect(formatDayLabel(new Date('2026-08-14T23:59:00'), { t, locale: 'fr', now: NOW }))
      .toBe('Hier');
  });

  // « Lundi 9 mai » : jour de la semaine + jour + mois, sans l'année quand elle
  // est la même — c'est le libellé long d'iOS (MessageDayLabel).
  it('labels an older day of the current year with weekday, day and month', () => {
    const label = formatDayLabel(new Date('2026-05-09T10:00:00'), { t, locale: 'fr', now: NOW });

    expect(label.toLowerCase()).toContain('mai');
    expect(label).toMatch(/9/);
  });

  it('includes the year once the day belongs to another year', () => {
    const label = formatDayLabel(new Date('2025-12-24T10:00:00'), { t, locale: 'fr', now: NOW });

    expect(label).toContain('2025');
  });

  it('starts the label with a capital letter in every locale', () => {
    const label = formatDayLabel(new Date('2026-05-09T10:00:00'), { t, locale: 'fr', now: NOW });

    expect(label[0]).toBe(label[0].toUpperCase());
  });
});

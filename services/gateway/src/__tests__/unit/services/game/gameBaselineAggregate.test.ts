import { describe, it, expect } from '@jest/globals';
import {
  summarizeRollingRetention,
  signupWeekOf,
  type SignupActivityRow,
} from '../../../../services/game/gameBaselineAggregate';

const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string): Date => new Date(iso);
const account = (createdAt: string, activeDaysLater: number): SignupActivityRow => ({
  createdAt: at(createdAt),
  lastActiveAt: new Date(at(createdAt).getTime() + activeDaysLater * DAY),
});

describe('signupWeekOf', () => {
  it('rend le lundi UTC de la semaine du compte', () => {
    expect(signupWeekOf(at('2026-11-04T15:30:00Z'))).toBe('2026-11-02');
    expect(signupWeekOf(at('2026-11-02T00:00:00Z'))).toBe('2026-11-02');
    expect(signupWeekOf(at('2026-11-08T23:59:59Z'))).toBe('2026-11-02');
  });
});

describe('summarizeRollingRetention', () => {
  const now = at('2026-11-10T12:00:00Z');

  it('compte revenu au jour N un compte encore actif N jours pleins après son inscription', () => {
    const [cohort] = summarizeRollingRetention({
      rows: [account('2026-09-01T10:00:00Z', 0), account('2026-09-01T10:00:00Z', 1), account('2026-09-02T10:00:00Z', 8), account('2026-09-03T10:00:00Z', 40)],
      now,
    });

    expect(cohort).toEqual({
      weekStart: '2026-08-31',
      accounts: 4,
      day1: { eligible: 4, returned: 3, rate: 75 },
      day7: { eligible: 4, returned: 2, rate: 50 },
      day30: { eligible: 4, returned: 1, rate: 25 },
    });
  });

  it("n'observe pas un horizon que le compte n'a pas encore pu atteindre", () => {
    const [cohort] = summarizeRollingRetention({
      rows: [account('2026-11-09T00:30:00Z', 1), account('2026-11-10T06:00:00Z', 0)],
      now,
    });

    expect(cohort?.day1).toEqual({ eligible: 1, returned: 1, rate: 100 });
    expect(cohort?.day7).toEqual({ eligible: 0, returned: 0, rate: null });
    expect(cohort?.day30).toEqual({ eligible: 0, returned: 0, rate: null });
  });

  it('range les cohortes de la plus récente à la plus ancienne', () => {
    const cohorts = summarizeRollingRetention({
      rows: [account('2026-10-06T10:00:00Z', 2), account('2026-10-20T10:00:00Z', 2), account('2026-10-13T10:00:00Z', 2)],
      now,
    });

    expect(cohorts.map((cohort) => cohort.weekStart)).toEqual(['2026-10-19', '2026-10-12', '2026-10-05']);
  });

  it("ignore une date illisible, et compte non revenu un compte dont l'activité précède l'inscription", () => {
    const cohorts = summarizeRollingRetention({
      rows: [
        { createdAt: at('2026-10-06T10:00:00Z'), lastActiveAt: at('2026-10-01T10:00:00Z') },
        { createdAt: new Date(Number.NaN), lastActiveAt: at('2026-10-08T10:00:00Z') },
        account('2026-10-06T10:00:00Z', 2),
      ],
      now,
    });

    expect(cohorts).toHaveLength(1);
    expect(cohorts[0]?.accounts).toBe(2);
    expect(cohorts[0]?.day1).toEqual({ eligible: 2, returned: 1, rate: 50 });
  });

  it('rend une liste vide sans compte', () => {
    expect(summarizeRollingRetention({ rows: [], now })).toEqual([]);
  });
});

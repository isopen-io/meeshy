import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { seasonTenseAt } from '@meeshy/shared/utils/game/season';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { msUntilNextWeekClose, useWeekCloseMoment, type SeasonClock } from './season-clock';

/**
 * UNE PAGE SAISON RESTÉE OUVERTE SE REPEINT AU DIMANCHE 20 H (#10225) — l'état d'une saison ne change qu'à une
 * fermeture de semaine (`nextLeagueWeekClose`) : un minuteur calé sur la prochaine relit l'horloge et repeint.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/saison' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(unmountAll);
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

describe('le délai jusqu’à la prochaine fermeture', () => {
  test('dimanche 19:59:30 local : trente secondes', () => {
    expect(msUntilNextWeekClose(new Date(2026, 11, 20, 19, 59, 30))).toBe(30_000);
  });
  test('dimanche 20:00 pile : la semaine suivante', () => {
    expect(msUntilNextWeekClose(new Date(2026, 11, 20, 20, 0, 0))).toBe(7 * 24 * 3_600_000);
  });
  test('mercredi 10:00 : dimanche 20:00', () => {
    expect(msUntilNextWeekClose(new Date(2026, 11, 16, 10, 0, 0))).toBe((4 * 24 + 10) * 3_600_000);
  });
});

const SEASON_1 = { startDay: '2026-12-21', endDay: '2027-02-14' };

function fakeClock(start: Date) {
  let now = start;
  const pending: { fire: () => void; delay: number }[] = [];
  const clock: SeasonClock = {
    now: () => now,
    setTimeout: (fire, delay) => {
      pending.push({ fire, delay });
      return pending.length;
    },
    clearTimeout: () => undefined,
  };
  return {
    clock,
    pending,
    advanceTo: (at: Date) => {
      now = at;
      const next = pending.pop();
      next?.fire();
    },
  };
}

function Probe({ clock }: { readonly clock: SeasonClock }) {
  const moment = useWeekCloseMoment(clock);
  return <p data-tense={seasonTenseAt(SEASON_1, moment)} />;
}

describe('la page restée ouverte', () => {
  test('passe « à venir » → « en cours » au dimanche 20 h, sans navigation ni réseau', async () => {
    const fake = fakeClock(new Date(2026, 11, 20, 19, 59, 30));
    const host = await mount(<Probe clock={fake.clock} />);
    expect(host.querySelector('[data-tense]')?.getAttribute('data-tense')).toBe('upcoming');
    expect(fake.pending.at(-1)?.delay).toBe(30_000);

    await act(async () => fake.advanceTo(new Date(2026, 11, 20, 20, 0, 0)));

    expect(host.querySelector('[data-tense]')?.getAttribute('data-tense')).toBe('current');
    expect(fake.pending.at(-1)?.delay).toBe(7 * 24 * 3_600_000);
  });
});

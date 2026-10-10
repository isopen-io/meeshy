import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { ROLL_MS } from '@/lib/game/rolling';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useRollingNumber, type RollEnv } from './use-rolling-number';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, rerender, unmountAll } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(unmountAll);
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const clock = (reduced = false) => {
  let queued: { readonly id: number; readonly run: (t: number) => void }[] = [];
  let next = 1;
  const stats = { requests: 0, cancels: 0 };
  const env: RollEnv = {
    reducedMotion: () => reduced,
    raf: (run) => {
      stats.requests += 1;
      const id = next++;
      queued.push({ id, run });
      return id;
    },
    cancelRaf: (id) => {
      stats.cancels += 1;
      queued = queued.filter((job) => job.id !== id);
    },
  };
  const frame = (t: number): void => {
    const batch = queued;
    queued = [];
    act(() => batch.forEach((job) => job.run(t)));
  };
  return { env, frame, stats, pending: () => queued.length };
};

function Probe({ value, env }: { readonly value: number; readonly env: RollEnv }) {
  return <output data-shown="">{useRollingNumber(value, env)}</output>;
}
const shown = (host: ParentNode): string => host.querySelector('[data-shown]')?.textContent ?? '';

describe('le chiffre qui roule', () => {
  test('à la première peinture il vaut la cible : rien ne roule depuis le cache', async () => {
    const c = clock();
    const host = await mount(<Probe value={120} env={c.env} />);
    expect(shown(host)).toBe('120');
    expect(c.stats.requests).toBe(0);
  });

  test('un gain défile de l’ancienne valeur à la nouvelle, puis s’arrête', async () => {
    const c = clock();
    const host = await mount(<Probe value={100} env={c.env} />);
    await rerender(host, <Probe value={160} env={c.env} />);
    c.frame(0);
    expect(Number(shown(host))).toBeGreaterThanOrEqual(100);
    c.frame(ROLL_MS / 2);
    const middle = Number(shown(host));
    expect(middle).toBeGreaterThan(100);
    expect(middle).toBeLessThan(160);
    c.frame(ROLL_MS + 10);
    expect(shown(host)).toBe('160');
    expect(c.pending()).toBe(0);
  });

  test('animations réduites : le chiffre saute, aucune image demandée', async () => {
    const c = clock(true);
    const host = await mount(<Probe value={100} env={c.env} />);
    await rerender(host, <Probe value={160} env={c.env} />);
    expect(shown(host)).toBe('160');
    expect(c.stats.requests).toBe(0);
  });

  test('le démontage annule la boucle', async () => {
    const c = clock();
    const host = await mount(<Probe value={100} env={c.env} />);
    await rerender(host, <Probe value={160} env={c.env} />);
    unmountAll();
    expect(c.stats.cancels).toBeGreaterThan(0);
  });
});

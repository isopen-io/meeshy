import { describe, expect, test } from 'bun:test';

import { ARRIVAL_MAX_MS, ARRIVAL_MIN_MS, arrivalReady } from './arrival';

/**
 * L'ARRIVÉE PAR LE LIEN (#8088) — la célébration dure AU MOINS le minimum
 * (~1,5 s) et JAMAIS plus que le plafond (~4 s) : un préchargement lent ne
 * retient pas l'utilisateur, un préchargement rapide ne l'escamote pas.
 */
function manualTimers() {
  const pending: Array<{ readonly ms: number; readonly fire: () => void }> = [];
  const wait = (ms: number) => new Promise<void>((resolve) => pending.push({ ms, fire: resolve }));
  const fire = (ms: number) => pending.filter((t) => t.ms === ms).forEach((t) => t.fire());
  return { wait, fire, asked: () => pending.map((t) => t.ms) };
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

function track(promise: Promise<void>) {
  const state = { done: false };
  void promise.then(() => {
    state.done = true;
  });
  return state;
}

describe('arrivalReady (#8088)', () => {
  test('le minimum et le plafond sont ceux de la demande porteur', () => {
    expect(ARRIVAL_MIN_MS).toBe(1_500);
    expect(ARRIVAL_MAX_MS).toBe(4_000);
  });

  test('préchargement fini AVANT le minimum ⇒ on attend quand même le minimum', async () => {
    const timers = manualTimers();
    const ready = track(arrivalReady(Promise.resolve(), timers.wait));
    await flush();
    expect(ready.done).toBe(false);
    timers.fire(ARRIVAL_MIN_MS);
    await flush();
    expect(ready.done).toBe(true);
  });

  test('minimum écoulé, préchargement en cours ⇒ on attend le préchargement', async () => {
    const timers = manualTimers();
    let finish!: () => void;
    const prefetch = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const ready = track(arrivalReady(prefetch, timers.wait));
    timers.fire(ARRIVAL_MIN_MS);
    await flush();
    expect(ready.done).toBe(false);
    finish();
    await flush();
    expect(ready.done).toBe(true);
  });

  test('préchargement bloqué ⇒ le plafond tranche, on part quand même', async () => {
    const timers = manualTimers();
    const ready = track(arrivalReady(new Promise<void>(() => undefined), timers.wait));
    timers.fire(ARRIVAL_MIN_MS);
    await flush();
    expect(ready.done).toBe(false);
    timers.fire(ARRIVAL_MAX_MS);
    await flush();
    expect(ready.done).toBe(true);
  });

  test('préchargement en ÉCHEC ⇒ jamais une exception : on part au minimum', async () => {
    const timers = manualTimers();
    const ready = track(arrivalReady(Promise.reject(new Error('réseau')), timers.wait));
    timers.fire(ARRIVAL_MIN_MS);
    await flush();
    expect(ready.done).toBe(true);
  });
});

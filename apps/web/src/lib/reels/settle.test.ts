import { describe, expect, test } from 'bun:test';

import { createPagerSettle, PAGER_SETTLE_QUIET_MS } from './settle';

/**
 * LE RÉEL REGARDÉ CHANGE QUAND LE GESTE EST FINI, JAMAIS AU MILIEU — témoin de
 * `createPagerSettle`. Les minuteurs sont injectés : on avance l'horloge à la
 * main, comme le ferait le navigateur entre deux `scroll`.
 */
function harness() {
  let now = 0;
  const timers = new Map<unknown, { readonly at: number; readonly run: () => void }>();
  let nextId = 1;
  const settles: number[] = [];
  const pager = createPagerSettle({
    onSettle: () => settles.push(now),
    schedule: (run, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    cancel: (id) => {
      timers.delete(id);
    },
  });
  const advance = (ms: number) => {
    const until = now + ms;
    [...timers.entries()]
      .filter(([, t]) => t.at <= until)
      .sort(([, a], [, b]) => a.at - b.at)
      .forEach(([id, t]) => {
        timers.delete(id);
        now = t.at;
        t.run();
      });
    now = until;
  };
  return { pager, settles, advance };
}

describe('createPagerSettle — le réel regardé se décide geste FINI', () => {
  test('un défilement en cours ne décide rien : seul le silence qui le suit tranche, une fois', () => {
    const { pager, settles, advance } = harness();
    for (let frame = 0; frame < 20; frame += 1) {
      pager.scrolled();
      advance(16);
    }
    expect(settles).toEqual([]);
    advance(PAGER_SETTLE_QUIET_MS);
    expect(settles.length).toBe(1);
  });

  test('`scrollend` tranche aussitôt, sans attendre le silence', () => {
    const { pager, settles, advance } = harness();
    pager.scrolled();
    advance(16);
    pager.scrollEnded();
    expect(settles.length).toBe(1);
    advance(PAGER_SETTLE_QUIET_MS * 2);
    expect(settles.length).toBe(1);
  });

  test('un doigt posé, même immobile, retient la décision ; il la rend en se levant', () => {
    const { pager, settles, advance } = harness();
    pager.touchStarted();
    pager.scrolled();
    advance(PAGER_SETTLE_QUIET_MS * 5);
    pager.scrollEnded();
    expect(settles).toEqual([]);
    pager.touchEnded();
    advance(PAGER_SETTLE_QUIET_MS);
    expect(settles.length).toBe(1);
  });

  test('l’élan après le doigt levé repousse la décision jusqu’à son arrêt', () => {
    const { pager, settles, advance } = harness();
    pager.touchStarted();
    pager.touchEnded();
    for (let frame = 0; frame < 30; frame += 1) {
      pager.scrolled();
      advance(16);
    }
    expect(settles).toEqual([]);
    advance(PAGER_SETTLE_QUIET_MS);
    expect(settles.length).toBe(1);
  });

  test('dispose annule la décision en attente', () => {
    const { pager, settles, advance } = harness();
    pager.scrolled();
    pager.dispose();
    advance(PAGER_SETTLE_QUIET_MS * 2);
    expect(settles).toEqual([]);
  });
});

import { describe, expect, test } from 'bun:test';

import { PRELOADED_SCREENS, preloadScreensWhenIdle, type IdleScheduler } from './screen-preload';

/**
 * LE PRÉCHARGEMENT DES ÉCRANS PRINCIPAUX (#10636) — en tâche de fond, un écran
 * par moment d'inactivité, jamais sur un réseau économe.
 */
const manualIdle = () => {
  const queue: Array<() => void> = [];
  const idle: IdleScheduler = (run) => {
    queue.push(run);
  };
  const flush = async () => {
    for (let i = 0; i < 50; i += 1) {
      queue.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  return { idle, queue, flush };
};

describe('preloadScreensWhenIdle', () => {
  test('précharge les écrans principaux, un par moment d’inactivité, dans l’ordre', async () => {
    const loaded: string[] = [];
    const clock = manualIdle();
    preloadScreensWhenIdle({ preload: (key) => (loaded.push(key), Promise.resolve()), idle: clock.idle, network: {} });
    expect(loaded).toEqual([]);
    clock.queue.shift()?.();
    expect(loaded).toEqual([PRELOADED_SCREENS[0]]);
    await clock.flush();
    expect(loaded).toEqual([...PRELOADED_SCREENS]);
  });

  test('les écrans principaux comprennent la liste, le fil, le Flux, les réglages, le profil, la cloche et le jeu', () => {
    expect([...PRELOADED_SCREENS].sort()).toEqual(['feed', 'list', 'notifications', 'profile', 'progression', 'settings', 'thread']);
  });

  test('un écran qui échoue n’arrête pas les suivants', async () => {
    const loaded: string[] = [];
    const clock = manualIdle();
    preloadScreensWhenIdle({
      preload: (key) => (loaded.push(key), key === 'list' ? Promise.reject(new Error('hors ligne')) : Promise.resolve()),
      idle: clock.idle,
      network: {},
    });
    await clock.flush();
    expect(loaded).toEqual([...PRELOADED_SCREENS]);
  });

  test('rien ne part sur un réseau économe ou très lent', async () => {
    for (const network of [{ saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }]) {
      const loaded: string[] = [];
      const clock = manualIdle();
      preloadScreensWhenIdle({ preload: (key) => (loaded.push(key), Promise.resolve()), idle: clock.idle, network });
      await clock.flush();
      expect(loaded).toEqual([]);
    }
  });
});

import { describe, expect, test } from 'bun:test';

import { focusComposerWhenReady, listenComposerFocusIntents } from './composer-focus-intent';
import { NOTIFICATION_CLICKED_MESSAGE } from './tap-navigation';

/**
 * « RÉPONDRE » DEPUIS UNE NOTIFICATION MET LE CURSEUR DANS LE COMPOSEUR (#8860).
 */

const clock = () => {
  let now = 0;
  const queue: Array<() => void> = [];
  return {
    env: {
      schedule: (run: () => void, delayMs: number) => {
        queue.push(() => {
          now += delayMs;
          run();
        });
      },
      now: () => now,
    },
    drain: () => {
      while (queue.length > 0) queue.shift()?.();
    },
  };
};

describe('focusComposerWhenReady — le fil arrive d’un chunk, le curseur l’attend', () => {
  test('le composeur paraît au troisième essai : il reçoit le focus, une fois', () => {
    const { env, drain } = clock();
    const focused: unknown[] = [];
    const input = { focus: (options?: unknown) => void focused.push(options) };
    let tries = 0;
    focusComposerWhenReady({ ...env, find: () => (++tries >= 3 ? input : null) });
    drain();
    expect(focused).toEqual([{ preventScroll: true }]);
  });

  test('un fil qui ne vient jamais : l’attente est BORNÉE', () => {
    const { env, drain } = clock();
    let tries = 0;
    focusComposerWhenReady({
      ...env,
      find: () => {
        tries += 1;
        return null;
      },
    });
    drain();
    expect(tries).toBeGreaterThan(1);
    expect(tries).toBeLessThan(200);
  });
});

describe('listenComposerFocusIntents — les portes de l’intention', () => {
  const container = () => {
    const listeners: Array<(event: { data: unknown }) => void> = [];
    return {
      listeners,
      container: { addEventListener: (_type: 'message', listener: (event: { data: unknown }) => void) => void listeners.push(listener) },
    };
  };

  test('un onglet NEUF ouvert avec ?ecrire=1 met le curseur et retire le paramètre', () => {
    const calls: string[] = [];
    const { container: host } = container();
    listenComposerFocusIntents({
      search: '?ecrire=1',
      forgetParam: () => void calls.push('forget'),
      container: host,
      focusComposer: () => void calls.push('focus'),
    });
    expect(calls).toEqual(['forget', 'focus']);
  });

  test('un onglet OUVERT reçoit « compose » du worker ; un simple tap ne vole pas le focus', () => {
    const calls: string[] = [];
    const { container: host, listeners } = container();
    listenComposerFocusIntents({ search: '', forgetParam: () => void calls.push('forget'), container: host, focusComposer: () => void calls.push('focus') });
    listeners.forEach((listener) => listener({ data: { type: NOTIFICATION_CLICKED_MESSAGE, url: '/c/c1' } }));
    listeners.forEach((listener) => listener({ data: { type: NOTIFICATION_CLICKED_MESSAGE, url: '/c/c1', compose: true } }));
    listeners.forEach((listener) => listener({ data: { type: 'AUTRE', compose: true } }));
    expect(calls).toEqual(['focus']);
  });
});

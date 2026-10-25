import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act, lazy, type ComponentType } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand/react';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { OptionalChunk } from './optional-chunk';

/**
 * UN CHUNK DE CHROME QUI NE VIENT PAS NE FIGE PAS L'APPLICATION — le défaut mesuré sur
 * `check-thread-states.mjs` (CI, CPU lent) : l'hôte des invitations photo, armé AU REPOS, va chercher son chunk
 * au moment où l'appareil vient de perdre le réseau. `lazy()` garde le rejet et le LÈVE à chaque rendu ; sans
 * frontière, Preact abandonne toute sa file de rendu (le fil ne se repeint plus : ni la bulle « Non envoyé », ni le
 * champ vidé) et React démonte la racine entière.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  unmountAll();
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

const unreachableChunk = (): ComponentType<{ readonly tick: number }> =>
  lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/host.js')));

describe('un chunk optionnel injoignable', () => {
  test("le reste de l'écran continue de se peindre et de suivre son état", async () => {
    const Host = unreachableChunk();
    const ticks = createStore(() => ({ tick: 0 }));
    function Chrome() {
      const tick = useStore(ticks, (s) => s.tick);
      return (
        <OptionalChunk>
          <Host tick={tick} />
        </OptionalChunk>
      );
    }
    function Screen() {
      const tick = useStore(ticks, (s) => s.tick);
      return <p data-screen="">{`rendu ${tick}`}</p>;
    }
    const silenced = console.error;
    console.error = () => undefined;
    try {
      const root = await mount(
        <div>
          <Chrome />
          <main>
            <Screen />
          </main>
        </div>,
      );
      await settle();
      await act(async () => {
        ticks.setState({ tick: 1 });
      });
      await settle();

      expect(root.querySelector('[data-screen]')?.textContent).toBe('rendu 1');
    } finally {
      console.error = silenced;
    }
  });

  test('un chunk qui arrive se peint normalement', async () => {
    const Host = lazy(async () => ({ default: ({ label }: { readonly label: string }) => <span data-host="">{label}</span> }));
    const root = await mount(
      <OptionalChunk>
        <Host label="présent" />
      </OptionalChunk>,
    );
    await settle();

    expect(root.querySelector('[data-host]')?.textContent).toBe('présent');
  });
});

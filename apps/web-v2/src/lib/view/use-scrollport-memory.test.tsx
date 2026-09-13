import type { RefObject } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { useScrollportMemory } from './use-scrollport-memory';

/**
 * `useScrollportMemory` (#5893, § 0 de la spécification) — le retour d'un
 * écran à scrollport propre RETROUVE sa position, à la MÊME adresse. Le
 * routeur (`lib/router.tsx`) démonte l'écran quitté (`Screen key={routeKey}`
 * change) : ce témoin reproduit exactement ce cycle — DÉMONTER puis
 * REMONTER un COMPOSANT NEUF — plutôt que de ne jamais démonter, ce qui
 * aurait laissé passer un hook qui ne fait rien.
 *
 * `scrollTop` est LU/ÉCRIT sur un objet FAUX, jamais un vrai nœud
 * `happy-dom` — même dispositif que `pin-to-bottom.test.tsx#scroller` :
 * happy-dom ne calcule aucune mise en page, et `scrollTop` y est une
 * propriété LECTURE SEULE sur un élément réel.
 */
type FakeScrollport = HTMLElement & { scrollTop: number };

function fakeScrollport(): FakeScrollport {
  let top = 0;
  const element = {
    get scrollTop(): number {
      return top;
    },
    set scrollTop(value: number) {
      top = value;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return element as unknown as FakeScrollport;
}

describe('useScrollportMemory — un retour à la MÊME adresse retrouve sa position', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    ensureHappyDomRegistered({ url: 'http://localhost/feed' });
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function Probe({ target }: { readonly target: RefObject<HTMLElement | null> }) {
    useScrollportMemory(target);
    return null;
  }

  const monte = (target: RefObject<HTMLElement | null>): void => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Probe target={target} />));
  };

  test('démonté puis remonté à la MÊME adresse ⇒ la position revient sur un scrollport NEUF', () => {
    const first = { current: fakeScrollport() };
    monte(first);
    first.current.scrollTop = 340;
    act(() => root.unmount());
    container.remove();

    const second = { current: fakeScrollport() };
    monte(second);
    expect(second.current.scrollTop).toBe(340);
  });

  test('une adresse DIFFÉRENTE ne porte aucune mémoire — jamais la position d’un autre écran', () => {
    const first = { current: fakeScrollport() };
    monte(first);
    first.current.scrollTop = 500;
    act(() => root.unmount());
    container.remove();

    window.history.replaceState(null, '', '/feed?autre=1');
    const second = { current: fakeScrollport() };
    monte(second);
    expect(second.current.scrollTop).toBe(0);
    window.history.replaceState(null, '', '/feed');
  });
});

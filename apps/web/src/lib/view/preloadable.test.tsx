import { Suspense, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { preloadable } from './preloadable';

/**
 * #8598 — UN CHUNK DÉJÀ CHARGÉ SE REND SANS SUSPENDRE. `lazy()` suspend au
 * PREMIER rendu de chaque composant paresseux, même quand son module est déjà
 * en mémoire : la visionneuse ouvrait donc sa scène sur une image VIDE
 * (`Suspense fallback={null}`) pendant que le fil venait de la peindre.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

function Greeting({ name }: { readonly name: string }) {
  return <span data-greeting>{`bonjour ${name}`}</span>;
}

function mount(node: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container;
}

describe('preloadable — le chunk préchargé se rend au premier rendu', () => {
  test('préchargé, le composant se peint SANS passer par le repli', async () => {
    let loads = 0;
    const lazyGreeting = preloadable(async () => {
      loads += 1;
      return { default: Greeting };
    });
    await lazyGreeting.preload();
    const container = mount(
      <Suspense fallback={<span data-fallback />}>
        <lazyGreeting.Component name="Ada" />
      </Suspense>,
    );
    expect(container.querySelector('[data-fallback]')).toBeNull();
    expect(container.querySelector('[data-greeting]')?.textContent).toBe('bonjour Ada');
    expect(loads).toBe(1);
  });

  test('non préchargé, il suspend puis se peint — et le module ne se charge qu’une fois', async () => {
    let loads = 0;
    const lazyGreeting = preloadable(async () => {
      loads += 1;
      return { default: Greeting };
    });
    const container = mount(
      <Suspense fallback={<span data-fallback />}>
        <lazyGreeting.Component name="Grace" />
      </Suspense>,
    );
    expect(container.querySelector('[data-fallback]')).not.toBeNull();
    await act(async () => {
      await lazyGreeting.preload();
    });
    expect(container.querySelector('[data-greeting]')?.textContent).toBe('bonjour Grace');
    expect(loads).toBe(1);
  });
});

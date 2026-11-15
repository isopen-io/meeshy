import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { IDLE_CHROME_DELAY_MS, useIdleChrome } from './use-idle-chrome';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const wait = (ms: number) => act(async () => new Promise<void>((resolve) => setTimeout(resolve, ms)));

function Probe({ active, held = false }: { readonly active: boolean; readonly held?: boolean }) {
  const idle = useIdleChrome({ active, held, delayMs: 30 });
  return <span data-idle={String(idle)} />;
}

const mount = (active: boolean, held = false) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Probe active={active} held={held} />));
  return {
    idle: () => container.querySelector('[data-idle]')?.getAttribute('data-idle'),
    root,
    container,
    rerender: (next: boolean, nextHeld = false) => act(() => root.render(<Probe active={next} held={nextHeld} />)),
  };
};

describe('le chrome s’efface pendant l’écoute', () => {
  test('inactif (rien ne joue) : jamais au repos', async () => {
    const view = mount(false);
    await wait(60);
    expect(view.idle()).toBe('false');
    act(() => view.root.unmount());
  });

  test('en lecture : s’efface après le délai, revient au moindre geste, puis s’efface de nouveau', async () => {
    const view = mount(true);
    expect(view.idle()).toBe('false');
    await wait(60);
    expect(view.idle()).toBe('true');
    await act(async () => {
      window.dispatchEvent(new Event('pointermove'));
    });
    expect(view.idle()).toBe('false');
    await wait(60);
    expect(view.idle()).toBe('true');
    act(() => view.root.unmount());
  });

  test('la pause rend le chrome immédiatement', async () => {
    const view = mount(true);
    await wait(60);
    expect(view.idle()).toBe('true');
    view.rerender(false);
    expect(view.idle()).toBe('false');
    act(() => view.root.unmount());
  });

  test('une touche du clavier le fait revenir, et il ne s’efface plus : on pilote au clavier', async () => {
    const view = mount(true);
    await wait(60);
    await act(async () => {
      window.dispatchEvent(new Event('keydown'));
    });
    expect(view.idle()).toBe('false');
    await wait(60);
    expect(view.idle()).toBe('false');
    act(() => view.root.unmount());
  });

  test('une activation sans pointeur (lecteur d’écran, clavier : click.detail === 0) le garde à l’écran', async () => {
    const view = mount(true);
    await act(async () => {
      window.dispatchEvent(new MouseEvent('click', { detail: 0 }));
    });
    await wait(60);
    expect(view.idle()).toBe('false');
    act(() => view.root.unmount());
  });

  test('un clic de souris ou un toucher ne le retient pas', async () => {
    const view = mount(true);
    await act(async () => {
      window.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    });
    await wait(60);
    expect(view.idle()).toBe('true');
    act(() => view.root.unmount());
  });

  test('une ouverture (rangée d’émojis, menu) le tient à l’écran, et sa fermeture relance le délai', async () => {
    const view = mount(true, true);
    await wait(60);
    expect(view.idle()).toBe('false');
    view.rerender(true, false);
    expect(view.idle()).toBe('false');
    await wait(60);
    expect(view.idle()).toBe('true');
    act(() => view.root.unmount());
  });

  test('le délai est celui d’iOS (FullscreenChromeMetrics.autoHideDelay = 3 s)', () => {
    expect(IDLE_CHROME_DELAY_MS).toBe(3000);
  });
});

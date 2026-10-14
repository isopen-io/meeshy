import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useIdleChrome } from './use-idle-chrome';

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

function Probe({ active }: { readonly active: boolean }) {
  const idle = useIdleChrome({ active, delayMs: 30 });
  return <span data-idle={String(idle)} />;
}

const mount = (active: boolean) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Probe active={active} />));
  return { idle: () => container.querySelector('[data-idle]')?.getAttribute('data-idle'), root, container, rerender: (next: boolean) => act(() => root.render(<Probe active={next} />)) };
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

  test('une touche du clavier le fait revenir', async () => {
    const view = mount(true);
    await wait(60);
    await act(async () => {
      window.dispatchEvent(new Event('keydown'));
    });
    expect(view.idle()).toBe('false');
    act(() => view.root.unmount());
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useEffacingControl } from './use-effacing-control';

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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const DELAY = 40;

function Harness({ active }: { readonly active: boolean }) {
  const { effaced, reveal } = useEffacingControl(active, DELAY);
  return <button type="button" data-effaced={String(effaced)} onClick={reveal} />;
}

const render = (active: boolean): void => {
  act(() => {
    root.render(<Harness active={active} />);
  });
};

const mount = (active: boolean): HTMLButtonElement => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  render(active);
  return container.querySelector('button')!;
};

const wait = async (ms: number): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe('useEffacingControl — un contrôle qui s’efface pendant la lecture (#9577)', () => {
  test('au repos, il reste affiché, aussi longtemps qu’on attende', async () => {
    const button = mount(false);
    await wait(DELAY * 2);
    expect(button.getAttribute('data-effaced')).toBe('false');
  });

  test('la lecture partie, il est encore là, puis s’efface au bout du délai', async () => {
    const button = mount(true);
    expect(button.getAttribute('data-effaced')).toBe('false');
    await wait(DELAY * 2);
    expect(button.getAttribute('data-effaced')).toBe('true');
  });

  test('un toucher le ramène et réarme le délai', async () => {
    const button = mount(true);
    await wait(DELAY * 2);
    act(() => button.click());
    expect(button.getAttribute('data-effaced')).toBe('false');
    await wait(DELAY * 2);
    expect(button.getAttribute('data-effaced')).toBe('true');
  });

  test('un toucher avant l’échéance repousse l’effacement', async () => {
    const button = mount(true);
    await wait(DELAY * 0.6);
    act(() => button.click());
    await wait(DELAY * 0.6);
    expect(button.getAttribute('data-effaced')).toBe('false');
  });

  test('la pause le ramène et le garde affiché', async () => {
    const button = mount(true);
    await wait(DELAY * 2);
    render(false);
    expect(button.getAttribute('data-effaced')).toBe('false');
    await wait(DELAY * 2);
    expect(button.getAttribute('data-effaced')).toBe('false');
  });

  test('la lecture qui reprend réarme le délai depuis zéro', async () => {
    const button = mount(true);
    await wait(DELAY * 2);
    render(false);
    render(true);
    expect(button.getAttribute('data-effaced')).toBe('false');
    await wait(DELAY * 2);
    expect(button.getAttribute('data-effaced')).toBe('true');
  });
});

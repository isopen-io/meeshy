import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '../happy-dom-environment';

/* L'INNOCENT (#9509) : des témoins React ordinaires, qui ne doivent rien aux
   deux fichiers qui le précèdent. Le dernier dure assez longtemps pour que le
   corps abandonné du second se réveille pendant qu'il tourne. */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const mounted: Root[] = [];
beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  for (const root of mounted.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      {count}
    </button>
  );
}

const mount = async (): Promise<HTMLElement> => {
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<Counter />);
  });
  return host;
};

const press = async (host: HTMLElement): Promise<void> => {
  await act(async () => {
    host.querySelector('button')?.click();
  });
};

test('un compteur rendu se lit', async () => {
  const host = await mount();
  expect(host.textContent).toBe('0');
});

test('un clic se lit aussitôt', async () => {
  const host = await mount();
  await press(host);
  expect(host.textContent).toBe('1');
});

test('pendant que le corps abandonné se réveille, les clics se lisent encore', async () => {
  const host = await mount();
  for (let i = 1; i <= 10; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    await press(host);
    expect(host.textContent).toBe(String(i));
  }
});

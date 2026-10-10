import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '../happy-dom-environment';

/* LE COUPABLE (#9509) : son `act` ne se résout jamais, il dépasse son délai
   DANS la portée. Sans garde, le compteur de React reste au-dessus de zéro
   pour tout le reste du processus. */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

test('un témoin qui dépasse son délai dans un act', async () => {
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => {
    root.render(<p>en cours</p>);
    await new Promise<void>(() => {});
  });
}, 100);

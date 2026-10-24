import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';

/**
 * L'ENREGISTREMENT SE VOIT DÈS L'APPUI (#12471) — dans la coque Android, la
 * boîte de permission du micro peut mettre des secondes à paraître ; seul le
 * glyphe du micro clignotait, et un toucher posé entre-temps tombait sur la
 * boîte. La barre d'enregistrement (croix, 0:00) s'affiche donc pendant la
 * demande de permission, et la croix l'annule.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('en');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.lang = 'fr';
  Reflect.deleteProperty(globalThis, 'MediaRecorder');
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

/** La permission n'est jamais répondue : le composeur reste en `requesting`. */
function permissionPending(): void {
  Object.defineProperty(globalThis, 'MediaRecorder', { value: class {}, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: () => new Promise(() => {}) },
    configurable: true,
  });
}

const cancelButton = (el: HTMLDivElement) =>
  el.querySelector<HTMLButtonElement>(`[aria-label="${translate('en', 'composer.recording.cancel')}"]`);

/** La barre vit dans un module chargé à la demande (`Suspense`) : on attend
 * qu'il soit monté, la permission restant, elle, toujours en suspens. */
async function mountAndPressMicrophone(): Promise<HTMLDivElement> {
  document.documentElement.lang = 'en';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Composer onSend={() => {}} />);
  });
  act(() => {
    container.querySelector<HTMLButtonElement>(`[aria-label="${translate('en', 'composer.attach.voice.action')}"]`)!.click();
  });
  const deadline = Date.now() + 2000;
  while (cancelButton(container) === null && Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container;
}

describe('enregistrement visible dès l’appui (#12471)', () => {
  test('pendant la demande de permission, la barre est là : croix et 0:00', async () => {
    permissionPending();
    const el = await mountAndPressMicrophone();

    expect(cancelButton(el)).not.toBe(null);
    expect(el.querySelector('[role="timer"]')?.textContent?.includes('0:00')).toBe(true);
  });

  test('la croix annule avant la permission : retour au micro, rien n’est joint', async () => {
    permissionPending();
    const el = await mountAndPressMicrophone();

    act(() => cancelButton(el)!.click());

    expect(cancelButton(el)).toBe(null);
    expect(el.querySelector(`[aria-label="${translate('en', 'composer.attach.voice.action')}"]`)).not.toBe(null);
  });
});

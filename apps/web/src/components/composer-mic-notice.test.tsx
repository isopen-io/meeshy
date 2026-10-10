import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';

/**
 * LE BANDEAU DU MICRO PARLE LA LANGUE D'INTERFACE, ET PAS DE « NAVIGATEUR »
 * (#9016) — comme les bandeaux de la position à côté de lui. Dans la coque
 * Android, « indisponible » arrive quand le micro est pris par une autre
 * application ou absent : il n'y a pas de navigateur à incriminer.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
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

function microphoneRejects(name: string): void {
  Object.defineProperty(globalThis, 'MediaRecorder', { value: class {}, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: () => Promise.reject(new DOMException('micro', name)) },
    configurable: true,
  });
}

async function pressMicrophone(language: 'fr' | 'en'): Promise<HTMLDivElement> {
  document.documentElement.lang = language;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Composer onSend={() => {}} />);
  });
  act(() => {
    container.querySelector<HTMLButtonElement>('[aria-label="Enregistrer un message vocal"]')!.click();
  });
  const deadline = Date.now() + 2000;
  while (!/Micro/.test(container.textContent ?? '') && Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container;
}

describe('bandeau du micro (#9016)', () => {
  test('interface en anglais ⇒ le refus se dit en anglais', async () => {
    microphoneRejects('NotAllowedError');
    const el = await pressMicrophone('en');
    expect(el.textContent?.includes('Microphone denied — allow it in settings')).toBe(true);
    expect(el.textContent?.includes('Micro refusé')).toBe(false);
  });

  test('micro pris par une autre application ⇒ « sur cet appareil », jamais « navigateur »', async () => {
    microphoneRejects('NotReadableError');
    const el = await pressMicrophone('fr');
    expect(el.textContent?.includes('Micro indisponible sur cet appareil')).toBe(true);
    expect(el.textContent?.includes('navigateur')).toBe(false);
  });
});

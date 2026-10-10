import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';

/**
 * UN REFUS DÉFINITIF MÈNE AUX RÉGLAGES DE L'APP (#8882) — miroir
 * `MediaPermissionCoordinator.deniedMessage` iOS (« toucher pour ouvrir les
 * Réglages »). Dans la coque Android, deux refus suffisent pour qu'Android ne
 * redemande plus jamais : « Réessayer » y rejetterait aussitôt, en silence.
 * Seule la fiche de l'app rend la permission — `MeeshyNotificationSettings.openApp`.
 * Le navigateur garde « Réessayer » : sa propre interface de permission rejoue.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; Capacitor?: unknown };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
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
  Reflect.deleteProperty(globalThis, 'Capacitor');
  Reflect.deleteProperty(globalThis, 'MediaRecorder');
  Reflect.deleteProperty(navigator, 'mediaDevices');
  Reflect.deleteProperty(navigator, 'geolocation');
});

type NativeCall = { readonly plugin: string; readonly method: string };

function androidShell(): NativeCall[] {
  const calls: NativeCall[] = [];
  globals.Capacitor = {
    getPlatform: () => 'android',
    PluginHeaders: [{ name: 'MeeshyNotificationSettings', methods: [{ name: 'open' }, { name: 'openApp' }, { name: 'fcmStatus' }] }],
    nativePromise: (plugin: string, method: string) => {
      calls.push({ plugin, method });
      return Promise.resolve({});
    },
  };
  return calls;
}

function microphoneRefused(): void {
  Object.defineProperty(globalThis, 'MediaRecorder', { value: class {}, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: () => Promise.reject(new DOMException('refusé', 'NotAllowedError')) },
    configurable: true,
  });
}

function locationRefused(): void {
  Object.defineProperty(navigator, 'geolocation', {
    value: {
      getCurrentPosition: (_ok: unknown, fail: (error: { code: number; PERMISSION_DENIED: number }) => void) =>
        fail({ code: 1, PERMISSION_DENIED: 1 }),
    },
    configurable: true,
  });
}

function mount(): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Composer onSend={() => {}} />);
  });
  return container;
}

const until = async (condition: () => boolean): Promise<void> => {
  const deadline = Date.now() + 2000;
  for (;;) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (condition() || Date.now() >= deadline) return;
  }
};

const button = (el: HTMLElement, label: string): HTMLButtonElement | undefined =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent?.trim() === label);

async function refuseMicrophone(el: HTMLDivElement): Promise<void> {
  act(() => {
    el.querySelector<HTMLButtonElement>('[aria-label="Enregistrer un message vocal"]')!.click();
  });
  await until(() => el.textContent?.includes('Micro refusé') === true);
}

async function refuseLocation(el: HTMLDivElement): Promise<void> {
  act(() => {
    el.querySelector<HTMLButtonElement>('[aria-label="Ouvrir le menu des pièces jointes"]')!.click();
  });
  await until(() => el.querySelector('[aria-label="Partager ma position"]') !== null);
  act(() => {
    el.querySelector<HTMLButtonElement>('[aria-label="Partager ma position"]')!.click();
  });
  await until(() => el.textContent?.includes('Position refusée') === true);
}

describe('micro refusé', () => {
  test('dans la coque Android, « Réglages » ouvre la fiche de l’app — plus de « Réessayer » sans effet', async () => {
    const calls = androidShell();
    microphoneRefused();
    const el = mount();
    await refuseMicrophone(el);
    expect(button(el, 'Réessayer') === undefined).toBe(true);
    act(() => button(el, 'Réglages')!.click());
    expect(calls).toEqual([{ plugin: 'MeeshyNotificationSettings', method: 'openApp' }]);
  });

  test('dans le navigateur, « Réessayer » reste : sa propre demande de permission rejoue', async () => {
    microphoneRefused();
    const el = mount();
    await refuseMicrophone(el);
    expect(button(el, 'Réessayer') !== undefined).toBe(true);
    expect(button(el, 'Réglages') === undefined).toBe(true);
  });
});

describe('position refusée', () => {
  test('dans la coque Android, « Réglages » ouvre la fiche de l’app', async () => {
    const calls = androidShell();
    locationRefused();
    const el = mount();
    await refuseLocation(el);
    expect(button(el, 'Réessayer') === undefined).toBe(true);
    act(() => button(el, 'Réglages')!.click());
    expect(calls).toEqual([{ plugin: 'MeeshyNotificationSettings', method: 'openApp' }]);
  });
});

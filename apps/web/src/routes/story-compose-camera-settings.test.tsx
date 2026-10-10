import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StudioCamera } from './story-compose-camera';

/**
 * LE REFUS DE LA CAMÉRA MÈNE AUX RÉGLAGES DE L'APP (#9032) — comme le micro et
 * la position du composeur (#8882) : dans la coque Android, deux refus suffisent
 * pour qu'Android ne redemande plus jamais. Sans « Réglages », la caméra du
 * studio reste morte, et le texte renvoyait à un navigateur qui n'existe pas.
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
const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  Reflect.deleteProperty(globalThis, 'Capacitor');
});

const refusedEngine: CameraEngine = {
  open: async () => ({ ok: false }),
  live: async () => undefined,
  lit: async () => undefined,
  setTorch: async () => undefined,
  photo: async () => null,
  setZoom: async () => undefined,
  startRecording: () => undefined,
  stopRecording: async () => null,
  release: () => undefined,
  maxBrightness: async () => () => undefined,
};

type NativeCall = { readonly plugin: string; readonly method: string };

function androidShell(): NativeCall[] {
  const calls: NativeCall[] = [];
  globals.Capacitor = {
    getPlatform: () => 'android',
    PluginHeaders: [{ name: 'MeeshyNotificationSettings', methods: [{ name: 'openApp' }] }],
    nativePromise: (plugin: string, method: string) => {
      calls.push({ plugin, method });
      return Promise.resolve({});
    },
  };
  return calls;
}

async function refusedCamera(): Promise<HTMLElement> {
  const host = await mounter.mount(
    <StudioCamera
      lang="fr"
      kind="STORY"
      intent="manual"
      holding={false}
      flash={false}
      onFlash={() => undefined}
      engine={refusedEngine}
      onTake={() => undefined}
      onClose={() => undefined}
    />,
  );
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return host;
}

const settingsButton = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-story-camera-settings]');

describe('caméra du studio refusée (#9032)', () => {
  test('dans la coque Android ⇒ « Réglages » ouvre la fiche de l’app', async () => {
    const calls = androidShell();
    const host = await refusedCamera();
    expect(settingsButton(host)?.textContent?.trim()).toBe('Réglages');
    await act(async () => settingsButton(host)?.click());
    expect(calls).toEqual([{ plugin: 'MeeshyNotificationSettings', method: 'openApp' }]);
  });

  test('le texte ne renvoie plus à un navigateur', async () => {
    androidShell();
    const host = await refusedCamera();
    const text = host.querySelector('[data-story-camera-unavailable]')?.textContent ?? '';
    expect(text.includes('réglages')).toBe(true);
    expect(text.includes('navigateur')).toBe(false);
  });

  test('dans un navigateur ⇒ aucun bouton : la demande du navigateur se rejoue', async () => {
    const host = await refusedCamera();
    expect(host.querySelector('[data-story-camera-unavailable]')).not.toBeNull();
    expect(settingsButton(host)).toBeNull();
  });
});

/**
 * AU RETOUR DES RÉGLAGES, LA CAMÉRA SE RALLUME (#9193) — « Réglages » sort de
 * l'app ; l'utilisateur y autorise la caméra et revient. Sans relecture au
 * retour au premier plan, l'écran restait « indisponible » jusqu'à fermer le
 * studio : la sortie de secours de #9032 ne menait nulle part.
 */

function grantedAfterRefusal(): { readonly engine: CameraEngine; readonly opens: () => number } {
  let count = 0;
  const engine: CameraEngine = {
    ...refusedEngine,
    open: async () => {
      count += 1;
      return count === 1 ? { ok: false } : { ok: true, stream: new MediaStream(), torch: false, zoom: { mode: 'hardware', min: 1, max: 8, step: 0.1 } };
    },
  };
  return { engine, opens: () => count };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function cameraWith(engine: CameraEngine): Promise<HTMLElement> {
  const host = await mounter.mount(
    <StudioCamera lang="fr" kind="STORY" intent="manual" holding={false} flash={false} onFlash={() => undefined} engine={engine} onTake={() => undefined} onClose={() => undefined} />,
  );
  await settle();
  return host;
}

async function backToForeground(): Promise<void> {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  Reflect.deleteProperty(document, 'visibilityState');
  await settle();
}

const cameraState = (host: ParentNode) => host.querySelector('[data-story-camera]')?.getAttribute('data-story-camera');

describe('retour des réglages (#9193)', () => {
  test('caméra refusée puis autorisée dans les réglages ⇒ elle se rallume au retour, sans fermer le studio', async () => {
    androidShell();
    const { engine, opens } = grantedAfterRefusal();
    const host = await cameraWith(engine);
    expect(cameraState(host)).toBe('unavailable');
    await backToForeground();
    expect(opens()).toBe(2);
    expect(cameraState(host)).toBe('live');
  });

  test('une caméra déjà en direct n’est pas rouverte au retour au premier plan', async () => {
    let opens = 0;
    const host = await cameraWith({
      ...refusedEngine,
      open: async () => {
        opens += 1;
        return { ok: true, stream: new MediaStream(), torch: false, zoom: { mode: 'hardware', min: 1, max: 8, step: 0.1 } };
      },
    });
    expect(cameraState(host)).toBe('live');
    await backToForeground();
    expect(opens).toBe(1);
  });
});

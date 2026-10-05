import { describe, expect, test } from 'bun:test';

import { chooseCallDevice, type DeviceChoiceDeps } from './call-device-choice';
import { CALL_DEVICES_KEY, preferredInputs, readDevicePreferences } from './call-devices';
import { createCallOutputStore } from './call-output';

/**
 * **CHOISIR UN PÉRIPHÉRIQUE PENDANT L'APPEL** (#8046, D5) — un geste du
 * sélecteur : l'appareil est acquis, remis au moteur, PUIS retenu pour les
 * appels suivants. Un appareil qui refuse de s'ouvrir (occupé, débranché entre
 * la liste et le geste) laisse l'appel et la préférence tels qu'ils étaient.
 */

const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
};

const fakeTrack = (kind: string) => ({ kind }) as unknown as MediaStreamTrack;

function harness(options: { readonly failing?: boolean } = {}) {
  const storage = memoryStorage();
  const output = createCallOutputStore();
  const replaced: Array<readonly [string, MediaStreamTrack]> = [];
  const acquired: Array<readonly [string, string | null]> = [];
  const deps: DeviceChoiceDeps = {
    storage,
    output,
    acquireMicrophone: async (id) => {
      acquired.push(['microphone', id]);
      if (options.failing === true) throw Object.assign(new Error('busy'), { name: 'NotReadableError' });
      return fakeTrack('audio');
    },
    acquireCamera: async (id) => {
      acquired.push(['camera', id]);
      if (options.failing === true) throw Object.assign(new Error('busy'), { name: 'NotReadableError' });
      return fakeTrack('video');
    },
    replaceInput: async (kind, track) => void replaced.push([kind, track]),
  };
  return { deps, storage, output, replaced, acquired };
}

describe('chooseCallDevice', () => {
  test('un micro choisi est ouvert, remis au moteur, puis retenu', async () => {
    const h = harness();
    expect(await chooseCallDevice(h.deps, 'microphone', 'mic-2')).toBe(true);
    expect(h.acquired).toEqual([['microphone', 'mic-2']]);
    expect(h.replaced.map(([kind]) => kind)).toEqual(['microphone']);
    expect(preferredInputs(h.storage)).toEqual({ microphoneId: 'mic-2', cameraId: null });
  });

  test('une caméra choisie suit le même chemin', async () => {
    const h = harness();
    expect(await chooseCallDevice(h.deps, 'camera', 'cam-2')).toBe(true);
    expect(h.replaced.map(([kind]) => kind)).toEqual(['camera']);
    expect(readDevicePreferences(h.storage).camera).toBe('cam-2');
  });

  test('un appareil qui refuse de s’ouvrir ne change ni l’appel ni la préférence', async () => {
    const h = harness({ failing: true });
    expect(await chooseCallDevice(h.deps, 'microphone', 'mic-occupe')).toBe(false);
    expect(h.replaced).toEqual([]);
    expect(h.storage.getItem(CALL_DEVICES_KEY)).toBeNull();
  });

  test('une sortie audio se pose sur le magasin de sortie, sans rien acquérir', async () => {
    const h = harness();
    expect(await chooseCallDevice(h.deps, 'speaker', 'spk-2')).toBe(true);
    expect(h.acquired).toEqual([]);
    expect(h.output.getState().sinkId).toBe('spk-2');
    expect(readDevicePreferences(h.storage).speaker).toBe('spk-2');
  });

  test('« Par défaut » efface la préférence et rouvre l’appareil du système', async () => {
    const h = harness();
    await chooseCallDevice(h.deps, 'microphone', 'mic-2');
    await chooseCallDevice(h.deps, 'microphone', null);
    expect(h.acquired.at(-1)).toEqual(['microphone', null]);
    expect(readDevicePreferences(h.storage).microphone).toBeNull();
  });
});

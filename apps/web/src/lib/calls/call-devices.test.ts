import { describe, expect, test } from 'bun:test';

import {
  CALL_DEVICES_KEY,
  groupCallDevices,
  preferredDevice,
  readDevicePreferences,
  sinkSelectionSupported,
  writeDevicePreference,
} from './call-devices';
import { acquireChosenInput, audioInputConstraints, videoInputConstraints } from './call-media';

/**
 * **LES PÉRIPHÉRIQUES D'UN APPEL** (#8046, D5) — la caméra, le micro et la
 * sortie audio se choisissent pendant l'appel et se retiennent PAR APPAREIL :
 * le prochain appel part avec les mêmes, sans rien redemander. Un choix dont
 * l'appareil a disparu (casque débranché) ne bloque rien : on retombe sur le
 * défaut du système.
 */

const info = (kind: MediaDeviceKind, deviceId: string, label = ''): MediaDeviceInfo =>
  ({ kind, deviceId, label, groupId: 'g', toJSON: () => ({}) }) as MediaDeviceInfo;

const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    dump: () => Object.fromEntries(values),
  };
};

describe('groupCallDevices', () => {
  test('range les appareils par rôle, nomme ceux que le navigateur tait, et écarte les doublons « default »', () => {
    const groups = groupCallDevices(
      [
        info('videoinput', 'cam-1', 'FaceTime HD'),
        info('videoinput', 'cam-2'),
        info('audioinput', 'default', 'Défaut — Micro interne'),
        info('audioinput', 'mic-1', 'Micro interne'),
        info('audiooutput', 'spk-1', 'Haut-parleurs'),
        info('audiooutput', 'communications', 'Communications'),
      ],
      { camera: 'Caméra', microphone: 'Micro', speaker: 'Sortie' },
    );
    expect(groups.camera).toEqual([
      { deviceId: 'cam-1', label: 'FaceTime HD' },
      { deviceId: 'cam-2', label: 'Caméra 2' },
    ]);
    expect(groups.microphone).toEqual([{ deviceId: 'mic-1', label: 'Micro interne' }]);
    expect(groups.speaker).toEqual([{ deviceId: 'spk-1', label: 'Haut-parleurs' }]);
  });
});

describe('préférences par appareil', () => {
  test('un choix se relit au prochain appel, les autres rôles restent au défaut', () => {
    const storage = memoryStorage();
    writeDevicePreference(storage, 'microphone', 'mic-1');
    expect(readDevicePreferences(storage)).toEqual({ camera: null, microphone: 'mic-1', speaker: null });
    writeDevicePreference(storage, 'microphone', null);
    expect(readDevicePreferences(storage).microphone).toBeNull();
  });

  test('un stockage illisible ou qui lève rend les défauts, jamais une erreur', () => {
    expect(readDevicePreferences(memoryStorage({ [CALL_DEVICES_KEY]: '{pas du json' }))).toEqual({ camera: null, microphone: null, speaker: null });
    const throwing = { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); } };
    expect(readDevicePreferences(throwing)).toEqual({ camera: null, microphone: null, speaker: null });
    expect(() => writeDevicePreference(throwing, 'camera', 'cam-1')).not.toThrow();
    expect(readDevicePreferences(null)).toEqual({ camera: null, microphone: null, speaker: null });
  });

  test('un choix dont l’appareil a disparu retombe sur le défaut', () => {
    const list = [{ deviceId: 'mic-1', label: 'Micro' }];
    expect(preferredDevice(list, 'mic-1')).toBe('mic-1');
    expect(preferredDevice(list, 'mic-casque')).toBeNull();
    expect(preferredDevice(list, null)).toBeNull();
  });
});

describe('contraintes', () => {
  test('le micro choisi est DEMANDÉ (ideal), jamais exigé : un micro disparu ne fait pas échouer l’appel', () => {
    expect(audioInputConstraints(null)).not.toHaveProperty('deviceId');
    expect(audioInputConstraints('mic-1')).toMatchObject({ echoCancellation: true, deviceId: { ideal: 'mic-1' } });
  });

  test('la caméra choisie remplace la face avant ; retourner la caméra cherche l’autre face', () => {
    expect(videoInputConstraints('user', 'cam-2')).toMatchObject({ deviceId: { ideal: 'cam-2' } });
    expect(videoInputConstraints('user', 'cam-2')).not.toHaveProperty('facingMode');
    expect(videoInputConstraints('environment', 'cam-2')).toMatchObject({ facingMode: 'environment' });
    expect(videoInputConstraints('environment', 'cam-2')).not.toHaveProperty('deviceId');
    expect(videoInputConstraints('user', null)).toMatchObject({ facingMode: 'user' });
  });
});

describe('sinkSelectionSupported', () => {
  test('la sortie audio ne se propose que là où `setSinkId` existe', () => {
    expect(sinkSelectionSupported({ prototype: { setSinkId: () => undefined } })).toBe(true);
    expect(sinkSelectionSupported({ prototype: {} })).toBe(false);
    expect(sinkSelectionSupported(undefined)).toBe(false);
  });
});

describe('acquireChosenInput', () => {
  const recorder = () => {
    const asked: MediaStreamConstraints[] = [];
    const mediaDevices = {
      getUserMedia: async (constraints: MediaStreamConstraints) => {
        asked.push(constraints);
        const tracks = [{ kind: constraints.audio === false ? 'video' : 'audio' }];
        return { getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'), getVideoTracks: () => tracks.filter((t) => t.kind === 'video') } as unknown as MediaStream;
      },
    };
    return { asked, mediaDevices };
  };

  test('un appareil choisi au sélecteur est EXIGÉ : occupé, il échoue au lieu d’ouvrir son voisin', async () => {
    const r = recorder();
    await acquireChosenInput({ kind: 'microphone', deviceId: 'mic-2', mediaDevices: r.mediaDevices });
    await acquireChosenInput({ kind: 'camera', deviceId: 'cam-2', mediaDevices: r.mediaDevices });
    expect(r.asked[0]).toMatchObject({ audio: { deviceId: { exact: 'mic-2' }, echoCancellation: true }, video: false });
    expect(r.asked[1]).toMatchObject({ audio: false, video: { deviceId: { exact: 'cam-2' } } });
  });

  test('« Par défaut » rouvre l’appareil du système', async () => {
    const r = recorder();
    await acquireChosenInput({ kind: 'microphone', deviceId: null, mediaDevices: r.mediaDevices });
    expect(r.asked[0]?.audio).not.toHaveProperty('deviceId');
  });
});

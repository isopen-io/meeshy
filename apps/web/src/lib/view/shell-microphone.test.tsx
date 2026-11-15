import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { shellMicrophoneHold, type MicrophoneHold } from './shell-microphone';
import { useRecorder, type RecorderEngine } from './use-recorder';

/**
 * **UN VOCAL NE DEVIENT PAS MUET QUAND ON QUITTE LA COQUE ANDROID** (#9238) —
 * un navigateur tient lui-même le micro d'un onglet masqué, iOS a son mode
 * d'arrière-plan `audio`. La coque, elle, ne tenait rien : Android coupe le
 * micro d'une app en arrière-plan et `MediaRecorder` enregistrait du silence
 * jusqu'au retour. Pendant un enregistrement, la page demande donc à la coque
 * de TENIR le micro (`MeeshyRecorder.holdMicrophone`), et le RENDS dès qu'il
 * s'arrête, quelle qu'en soit la raison.
 */

type Appel = { readonly plugin: string; readonly methode: string };

function coque(methodes: readonly string[], issue: 'resout' | 'rejette' = 'resout'): CoqueNative & { readonly appels: Appel[] } {
  const appels: Appel[] = [];
  return {
    appels,
    getPlatform: () => 'android',
    PluginHeaders: [{ name: 'MeeshyRecorder', methods: methodes.map((name) => ({ name })) }],
    nativePromise: (plugin, methode) => {
      appels.push({ plugin, methode });
      return issue === 'resout' ? Promise.resolve({}) : Promise.reject(new Error('coque'));
    },
  };
}

describe('la prise du micro par la coque (#9238)', () => {
  test('dans la coque, tenir puis rendre appellent le plugin du vocal', () => {
    const hote = coque(['holdMicrophone', 'releaseMicrophone']);
    const prise = shellMicrophoneHold(hote);
    prise.hold();
    prise.release();
    expect(hote.appels).toEqual([
      { plugin: 'MeeshyRecorder', methode: 'holdMicrophone' },
      { plugin: 'MeeshyRecorder', methode: 'releaseMicrophone' },
    ]);
  });

  test('un navigateur, ou une coque construite avant le plugin, ne reçoit aucun appel', () => {
    const ancienne = coque([]);
    const prises = [shellMicrophoneHold(undefined), shellMicrophoneHold(ancienne)];
    for (const prise of prises) {
      expect(() => {
        prise.hold();
        prise.release();
      }).not.toThrow();
    }
    expect(ancienne.appels).toEqual([]);
  });

  test('un refus de la coque ne remonte jamais jusqu’au composeur', async () => {
    const prise = shellMicrophoneHold(coque(['holdMicrophone', 'releaseMicrophone'], 'rejette'));
    prise.hold();
    prise.release();
    await Promise.resolve();
    await Promise.resolve();
  });
});

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

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

const moteur: RecorderEngine = {
  requestStream: async () => ({ ok: true, stream: {} as MediaStream }),
  start: () => {},
  stop: async () => ({ blob: new Blob([new Uint8Array([1])]), mimeType: 'audio/webm' }),
  release: () => {},
};

function priseComptee(): MicrophoneHold & { readonly journal: string[] } {
  const journal: string[] = [];
  return { journal, hold: () => journal.push('hold'), release: () => journal.push('release') };
}

type Recorder = ReturnType<typeof useRecorder>;

function monter(microphone: MicrophoneHold, engine: RecorderEngine = moteur): () => Recorder {
  let recorder!: Recorder;
  function Harness() {
    recorder = useRecorder({ engine, microphone, now: () => 0, interval: () => () => {} });
    return null;
  }
  const container = document.createElement('div');
  root = createRoot(container);
  act(() => root?.render(<Harness />));
  return () => recorder;
}

async function demarrer(recorder: () => Recorder): Promise<void> {
  await act(async () => {
    recorder().start();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('le vocal tient le micro tant qu’il enregistre (#9238)', () => {
  test('le micro est tenu dès que l’enregistrement commence', async () => {
    const prise = priseComptee();
    const recorder = monter(prise);
    expect(prise.journal).toEqual([]);
    await demarrer(recorder);
    expect(prise.journal).toEqual(['hold']);
  });

  test('envoyer le vocal rend le micro', async () => {
    const prise = priseComptee();
    const recorder = monter(prise);
    await demarrer(recorder);
    await act(async () => {
      await recorder().stop();
    });
    expect(prise.journal).toEqual(['hold', 'release']);
  });

  test('annuler le vocal rend le micro', async () => {
    const prise = priseComptee();
    const recorder = monter(prise);
    await demarrer(recorder);
    act(() => recorder().cancel());
    expect(prise.journal).toEqual(['hold', 'release']);
  });

  test('fermer le composeur pendant l’enregistrement rend le micro', async () => {
    const prise = priseComptee();
    const recorder = monter(prise);
    await demarrer(recorder);
    act(() => root?.unmount());
    root = null;
    expect(prise.journal).toEqual(['hold', 'release']);
  });

  test('un micro refusé n’est jamais tenu, donc jamais rendu', async () => {
    const prise = priseComptee();
    const refus: RecorderEngine = { ...moteur, requestStream: async () => ({ ok: false, reason: 'refused' }) };
    const recorder = monter(prise, refus);
    await demarrer(recorder);
    act(() => recorder().cancel());
    expect(prise.journal).toEqual([]);
  });
});

import { describe, expect, test } from 'bun:test';

import { hasLiveVideo, incomingAcceptOptions, incomingConsentKey, startSelfPreview } from './incoming-self-preview';

/**
 * MA CAMÉRA PENDANT QU'UN APPEL VIDÉO SONNE (#16944, vue P17) — l'aperçu ne
 * s'ouvre que si la caméra est DÉJÀ autorisée : la sonnerie ne pose jamais de
 * question. Il se ferme au décroché, au refus et au démontage, même quand la
 * caméra arrive après.
 */

type FakeTrack = { stopped: boolean; readonly stop: () => void };
const track = (): FakeTrack => {
  const made: FakeTrack = { stopped: false, stop: () => void (made.stopped = true) };
  return made;
};
const streamOf = (tracks: readonly FakeTrack[]) => ({ getTracks: () => tracks });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startSelfPreview', () => {
  test('caméra déjà autorisée : l’aperçu s’ouvre, puis s’arrête quand on le quitte', async () => {
    const camera = track();
    const shown: Array<ReturnType<typeof streamOf> | null> = [];
    const stop = startSelfPreview({ granted: async () => true, open: async () => streamOf([camera]) }, (stream) => void shown.push(stream));
    await flush();
    expect(shown).toHaveLength(1);
    expect(shown[0]?.getTracks()).toEqual([camera]);
    stop();
    expect(camera.stopped).toBe(true);
    expect(shown.at(-1)).toBeNull();
  });

  test('quitté avant la réponse sur l’autorisation : la caméra ne s’ouvre pas', async () => {
    const opened = { count: 0 };
    const stop = startSelfPreview(
      {
        granted: async () => true,
        open: async () => {
          opened.count += 1;
          return streamOf([track()]);
        },
      },
      () => undefined,
    );
    stop();
    await flush();
    expect(opened.count).toBe(0);
  });

  test('caméra pas encore autorisée : rien ne s’ouvre, aucune demande', async () => {
    const opened = { count: 0 };
    const shown: unknown[] = [];
    startSelfPreview(
      {
        granted: async () => false,
        open: async () => {
          opened.count += 1;
          return streamOf([track()]);
        },
      },
      (stream) => void shown.push(stream),
    );
    await flush();
    expect(opened.count).toBe(0);
    expect(shown).toEqual([]);
  });

  test('quitté avant que la caméra arrive : elle s’arrête à son arrivée, et ne se montre jamais', async () => {
    const camera = track();
    const shown: unknown[] = [];
    const arrival: { resolve: (stream: ReturnType<typeof streamOf>) => void } = { resolve: () => undefined };
    const opening = new Promise<ReturnType<typeof streamOf>>((resolve) => void (arrival.resolve = resolve));
    const stop = startSelfPreview({ granted: async () => true, open: () => opening }, (stream) => void shown.push(stream));
    await flush();
    stop();
    arrival.resolve(streamOf([camera]));
    await flush();
    expect(camera.stopped).toBe(true);
    expect(shown).toEqual([]);
  });

  test('une caméra qui refuse de s’ouvrir ne montre rien et ne lève rien', async () => {
    const shown: unknown[] = [];
    startSelfPreview({ granted: async () => true, open: async () => Promise.reject(new Error('busy')) }, (stream) => void shown.push(stream));
    await flush();
    expect(shown).toEqual([]);
  });
});

describe('ce que l’on promet en décrochant', () => {
  test('quatre phrases : vu et entendu, entendu sans être vu, vu micro coupé, ni vu ni entendu (P17.7)', () => {
    expect(incomingConsentKey({ micOn: true, cameraOn: true }, true)).toBe('callControls.incoming.seenBy');
    expect(incomingConsentKey({ micOn: false, cameraOn: true }, true)).toBe('callControls.incoming.seenMuted');
    expect(incomingConsentKey({ micOn: true, cameraOn: false }, false)).toBe('callControls.incoming.heardBy');
    expect(incomingConsentKey({ micOn: false, cameraOn: false }, false)).toBe('callControls.incoming.silent');
  });

  test('« vous verra » n’est promis que si une caméra tourne vraiment : choisie ne suffit pas', () => {
    expect(incomingConsentKey({ micOn: true, cameraOn: true }, false)).toBe('callControls.incoming.heardBy');
    expect(incomingConsentKey({ micOn: false, cameraOn: true }, false)).toBe('callControls.incoming.silent');
  });

  test('une caméra tourne quand une piste vidéo VIVANTE est ouverte', () => {
    const stream = (states: readonly string[]) => ({ getVideoTracks: () => states.map((readyState) => ({ readyState })) });
    expect(hasLiveVideo(stream(['live']))).toBe(true);
    expect(hasLiveVideo(stream(['ended']))).toBe(false);
    expect(hasLiveVideo(stream([]))).toBe(false);
    expect(hasLiveVideo(null)).toBe(false);
  });

  test('décrocher tient parole : sans caméra, l’appel part sans vidéo ; micro coupé, il part coupé', () => {
    expect(incomingAcceptOptions({ micOn: true, cameraOn: true })).toEqual({ audioOnly: false, micMuted: false });
    expect(incomingAcceptOptions({ micOn: false, cameraOn: false })).toEqual({ audioOnly: true, micMuted: true });
  });
});

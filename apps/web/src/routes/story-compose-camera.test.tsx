import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import type { CameraFacing } from '@/lib/stories/studio-quick-capture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StudioCamera, type StudioCameraIntent } from './story-compose-camera';

/**
 * LA CAMÉRA DU COMPOSER (#8654, jumelle de #8653) — ouverte par la capture
 * rapide d'une scène vide : le toucher prend la photo, l'appui long filme tant
 * qu'il dure, le (X) est toujours là, le flash éclaire vraiment.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

type Journal = string[];

/** Un moteur de test : il journalise, et le témoin lit l'état de l'écran
 * AU MOMENT où la lumière du flash est attendue. */
function fakeEngine({ torch = false, available = true, probe }: { torch?: boolean; available?: boolean; probe?: () => void } = {}) {
  const journal: Journal = [];
  const stream = new MediaStream();
  const engine: CameraEngine = {
    open: async (facing: CameraFacing) => {
      journal.push(`open:${facing}`);
      return available ? { ok: true, stream, torch } : { ok: false };
    },
    live: async () => {
      journal.push('live');
    },
    lit: async () => {
      probe?.();
      journal.push('lit');
    },
    setTorch: async (_stream, on) => {
      journal.push(`torch:${on}`);
    },
    photo: async (_video, mirrored) => {
      journal.push(`photo:${mirrored ? 'mirrored' : 'plain'}`);
      return new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' });
    },
    startRecording: () => {
      journal.push('record');
    },
    stopRecording: async () => {
      journal.push('stop');
      return new File(['mp4'], 'video.mp4', { type: 'video/mp4' });
    },
    release: () => {
      journal.push('release');
    },
    maxBrightness: async () => {
      journal.push('brightness:max');
      return () => journal.push('brightness:restore');
    },
  };
  return { engine, journal };
}

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function camera(overrides: {
  engine: CameraEngine;
  intent?: StudioCameraIntent;
  holding?: boolean;
  flash?: boolean;
  kind?: 'STORY' | 'POST' | 'REEL';
  taken?: File[];
  closed?: string[];
}) {
  const taken = overrides.taken ?? [];
  const closed = overrides.closed ?? [];
  return (
    <StudioCamera
      lang="fr"
      kind={overrides.kind ?? 'STORY'}
      intent={overrides.intent ?? 'manual'}
      holding={overrides.holding ?? false}
      flash={overrides.flash ?? false}
      onFlash={() => undefined}
      engine={overrides.engine}
      onTake={(file) => taken.push(file)}
      onClose={() => closed.push('closed')}
    />
  );
}

const closeButton = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-story-camera-close]');
const shutter = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-story-camera-shutter]');

describe('StudioCamera — le (X) est toujours là', () => {
  test('ouverte, puis caméra indisponible : le (X) reste, nommé, et referme sans rien prendre', async () => {
    const { engine, journal } = fakeEngine({ available: false });
    const closed: string[] = [];
    const taken: File[] = [];
    const host = await mounter.mount(camera({ engine, intent: 'photo', closed, taken }));
    await settle();
    expect(host.querySelector('[data-story-camera-unavailable]')).not.toBeNull();
    expect(closeButton(host)?.getAttribute('aria-label')).toBe('Revenir à la scène');
    await act(async () => closeButton(host)?.click());
    expect(closed).toEqual(['closed']);
    expect(taken).toEqual([]);
    expect(journal).toEqual(['open:environment']);
  });

  test('pendant un film, le (X) quitte, relâche la caméra et ne pose rien', async () => {
    const { engine, journal } = fakeEngine();
    const closed: string[] = [];
    const taken: File[] = [];
    const host = await mounter.mount(camera({ engine, intent: 'hold', holding: true, closed, taken }));
    await settle();
    expect(journal).toContain('record');
    expect(closeButton(host)).not.toBeNull();
    await act(async () => closeButton(host)?.click());
    await settle();
    expect(closed).toEqual(['closed']);
    expect(taken).toEqual([]);
    expect(journal).toContain('release');
  });
});

describe('StudioCamera — la capture rapide', () => {
  test('toucher : la caméra s’ouvre ET prend la photo dès qu’elle voit', async () => {
    const { engine, journal } = fakeEngine();
    const taken: File[] = [];
    await mounter.mount(camera({ engine, intent: 'photo', taken }));
    await settle();
    expect(journal).toEqual(['open:environment', 'live', 'photo:plain', 'release']);
    expect(taken.map((file) => file.type)).toEqual(['image/jpeg']);
  });

  test('appui long : elle filme tant que l’appui dure, relâcher clôt et pose la vidéo', async () => {
    const { engine, journal } = fakeEngine();
    const taken: File[] = [];
    const host = await mounter.mount(camera({ engine, intent: 'hold', holding: true, taken }));
    await settle();
    expect(journal).toEqual(['open:environment', 'live', 'record']);
    expect(host.querySelector('[data-story-camera-recording]')).not.toBeNull();
    await mounter.rerender(host, camera({ engine, intent: 'hold', holding: false, taken }));
    await settle();
    expect(journal.slice(3)).toEqual(['stop', 'release']);
    expect(taken.map((file) => file.type)).toEqual(['video/mp4']);
  });

  test('relâché avant que la caméra voie : rien n’est pris, le viseur reste ouvert', async () => {
    const { engine, journal } = fakeEngine();
    const taken: File[] = [];
    const host = await mounter.mount(camera({ engine, intent: 'hold', holding: false, taken }));
    await settle();
    expect(journal).toEqual(['open:environment', 'live']);
    expect(taken).toEqual([]);
    expect(shutter(host)).not.toBeNull();
  });

  test('un réel : le toucher ouvre sans rien prendre', async () => {
    const { engine, journal } = fakeEngine();
    const taken: File[] = [];
    await mounter.mount(camera({ engine, intent: 'arm', kind: 'REEL', taken }));
    await settle();
    expect(journal).toEqual(['open:environment', 'live']);
    expect(taken).toEqual([]);
  });

  test('le déclencheur au clavier prend une photo (story), démarre puis arrête un film (réel)', async () => {
    const photo = fakeEngine();
    const taken: File[] = [];
    const host = await mounter.mount(camera({ engine: photo.engine, taken }));
    await settle();
    expect(shutter(host)?.getAttribute('aria-label')).toBe('Prendre une photo');
    await act(async () => shutter(host)?.click());
    await settle();
    expect(taken.map((file) => file.type)).toEqual(['image/jpeg']);

    const reel = fakeEngine();
    const films: File[] = [];
    const reelHost = await mounter.mount(camera({ engine: reel.engine, kind: 'REEL', taken: films }));
    await settle();
    expect(shutter(reelHost)?.getAttribute('aria-label')).toBe('Démarrer l’enregistrement');
    await act(async () => shutter(reelHost)?.click());
    await settle();
    expect(shutter(reelHost)?.getAttribute('aria-label')).toBe('Arrêter l’enregistrement');
    await act(async () => shutter(reelHost)?.click());
    await settle();
    expect(films.map((file) => file.type)).toEqual(['video/mp4']);
  });
});

describe('StudioCamera — le flash éclaire vraiment', () => {
  test('caméra avant : le sol devient BLANC pendant la prise, luminosité au maximum puis restituée', async () => {
    let whiteDuringLight = false;
    const { engine, journal } = fakeEngine({
      probe: () => {
        whiteDuringLight = document.querySelector('[data-story-camera-screen-flash="full"]') !== null;
      },
    });
    const taken: File[] = [];
    const host = await mounter.mount(camera({ engine, flash: true, taken }));
    await settle();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-story-camera-flip]')?.click());
    await settle();
    await act(async () => shutter(host)?.click());
    await settle();
    expect(whiteDuringLight).toBe(true);
    expect(journal).toContain('photo:mirrored');
    expect(journal.indexOf('brightness:max')).toBeLessThan(journal.indexOf('photo:mirrored'));
    expect(journal.indexOf('brightness:restore')).toBeGreaterThan(journal.indexOf('photo:mirrored'));
    expect(host.querySelector('[data-story-camera-screen-flash]')).toBeNull();
    expect(taken).toHaveLength(1);
  });

  test('caméra arrière avec torche : la torche s’allume pour la prise, puis s’éteint ; aucun sol blanc', async () => {
    let white = true;
    const { engine, journal } = fakeEngine({
      torch: true,
      probe: () => {
        white = document.querySelector('[data-story-camera-screen-flash]') !== null;
      },
    });
    await mounter.mount(camera({ engine, intent: 'photo', flash: true }));
    await settle();
    expect(journal).toEqual(['open:environment', 'live', 'torch:true', 'lit', 'photo:plain', 'torch:false', 'release']);
    expect(white).toBe(false);
  });

  test('caméra arrière sans torche : repli sur le sol blanc', async () => {
    const { engine, journal } = fakeEngine({ torch: false });
    await mounter.mount(camera({ engine, intent: 'photo', flash: true }));
    await settle();
    expect(journal).not.toContain('torch:true');
    expect(journal).toContain('brightness:max');
  });

  test('la bascule du flash dit son état', async () => {
    const { engine } = fakeEngine();
    const host = await mounter.mount(camera({ engine, flash: true }));
    await settle();
    const toggle = host.querySelector<HTMLButtonElement>('[data-story-camera-flash]');
    expect(toggle?.getAttribute('aria-label')).toBe('Flash');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
  });
});

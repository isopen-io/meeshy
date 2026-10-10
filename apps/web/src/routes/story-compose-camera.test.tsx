import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { CameraZoomRange } from '@/lib/stories/studio-capture-gestures';
import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import type { CameraFacing } from '@/lib/stories/studio-quick-capture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StudioCamera, type StudioCameraIntent, type StudioHoldDrag } from './story-compose-camera';

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
const DIGITAL: CameraZoomRange = { mode: 'recorded', min: 1, max: 4, step: 0 };

function fakeEngine({
  torch = false,
  available = true,
  probe,
  zoom = DIGITAL,
}: { torch?: boolean; available?: boolean; probe?: () => void; zoom?: CameraZoomRange } = {}) {
  const journal: Journal = [];
  const stream = new MediaStream();
  const engine: CameraEngine = {
    open: async (facing: CameraFacing) => {
      journal.push(`open:${facing}`);
      return available ? { ok: true, stream, torch, zoom } : { ok: false };
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
    photo: async (_video, digitalZoom) => {
      journal.push(`photo:${digitalZoom}`);
      return new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' });
    },
    setZoom: async (_stream, value) => {
      journal.push(`zoom:${value.toFixed(1)}`);
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
  intensity?: number;
  onIntensity?: (next: number) => void;
  holdDrag?: StudioHoldDrag;
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
      {...(overrides.intensity !== undefined ? { intensity: overrides.intensity } : {})}
      {...(overrides.onIntensity !== undefined ? { onIntensity: overrides.onIntensity } : {})}
      {...(overrides.holdDrag !== undefined ? { holdDrag: overrides.holdDrag } : {})}
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
    const host = await mounter.mount(camera({ engine, intent: 'arm', closed, taken }));
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
  test('premier toucher : le viseur s’ouvre ARMÉ, rien n’est pris ; un second toucher n’importe où sur le viseur prend la photo (#8711)', async () => {
    const { engine, journal } = fakeEngine();
    const taken: File[] = [];
    const host = await mounter.mount(camera({ engine, intent: 'arm', taken }));
    await settle();
    expect(journal).toEqual(['open:environment', 'live']);
    expect(taken).toEqual([]);
    expect(host.querySelector('[data-story-camera-hint]')?.textContent).toBe('Toucher l’écran : photo · le maintenir : vidéo');
    await act(async () => host.querySelector<HTMLElement>('[data-story-camera-preview]')?.click());
    await settle();
    expect(journal).toEqual(['open:environment', 'live', 'photo:1', 'release']);
    expect(taken.map((file) => file.type)).toEqual(['image/jpeg']);
  });

  test('toucher un contrôle du viseur armé (flash, optique) ne prend rien', async () => {
    const { engine, journal } = fakeEngine();
    const taken: File[] = [];
    const host = await mounter.mount(camera({ engine, intent: 'arm', taken }));
    await settle();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-story-camera-flash]')?.click());
    await settle();
    expect(journal).not.toContain('photo:1');
    expect(taken).toEqual([]);
  });

  test('un réel : toucher le viseur armé ne prend pas de photo', async () => {
    const { engine, journal } = fakeEngine();
    const taken: File[] = [];
    const host = await mounter.mount(camera({ engine, intent: 'arm', kind: 'REEL', taken }));
    await settle();
    await act(async () => host.querySelector<HTMLElement>('[data-story-camera-preview]')?.click());
    await settle();
    expect(journal).toEqual(['open:environment', 'live']);
    expect(taken).toEqual([]);
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

  test('relâché pendant que la lumière du flash monte : aucun enregistrement ne reste en marche', async () => {
    const { engine, journal } = fakeEngine();
    const brightness: { release: () => void } = { release: () => undefined };
    const slow: CameraEngine = {
      ...engine,
      maxBrightness: () =>
        new Promise((resolve) => {
          brightness.release = () => resolve(() => journal.push('brightness:restore'));
        }),
    };
    const taken: File[] = [];
    const host = await mounter.mount(camera({ engine: slow, intent: 'hold', holding: true, flash: true, taken }));
    await settle();
    await mounter.rerender(host, camera({ engine: slow, intent: 'hold', holding: false, flash: true, taken }));
    await settle();
    await act(async () => brightness.release());
    await settle();
    expect(journal).not.toContain('record');
    expect(journal).toContain('brightness:restore');
    expect(host.querySelector('[data-story-camera-screen-flash]')).toBeNull();
    expect(taken).toEqual([]);
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
    expect(host.querySelector<HTMLVideoElement>('[data-story-camera-preview]')?.style.transform).toContain('scaleX(-1)');
    await act(async () => shutter(host)?.click());
    await settle();
    expect(whiteDuringLight).toBe(true);
    expect(journal).toContain('photo:1');
    expect(journal.indexOf('brightness:max')).toBeLessThan(journal.indexOf('photo:1'));
    expect(journal.indexOf('brightness:restore')).toBeGreaterThan(journal.indexOf('photo:1'));
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
    const host = await mounter.mount(camera({ engine, intent: 'arm', flash: true }));
    await settle();
    await act(async () => host.querySelector<HTMLElement>('[data-story-camera-preview]')?.click());
    await settle();
    expect(journal).toEqual(['open:environment', 'live', 'torch:true', 'lit', 'photo:1', 'torch:false', 'release']);
    expect(white).toBe(false);
  });

  test('caméra arrière sans torche : repli sur le sol blanc', async () => {
    const { engine, journal } = fakeEngine({ torch: false });
    const host = await mounter.mount(camera({ engine, intent: 'arm', flash: true }));
    await settle();
    await act(async () => host.querySelector<HTMLElement>('[data-story-camera-preview]')?.click());
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

describe('StudioCamera — le verrou du film (#8672)', () => {
  test('l’appui long de la scène, glissé jusqu’au cadenas, verrouille : relâcher ne clôt pas, le stop pose la vidéo', async () => {
    const { engine, journal } = fakeEngine();
    const taken: File[] = [];
    const holdDrag: StudioHoldDrag = { current: null };
    const host = await mounter.mount(camera({ engine, intent: 'hold', holding: true, taken, holdDrag }));
    await settle();
    expect(journal).toContain('record');
    expect(host.querySelector('[data-story-camera-lock="shown"]')).not.toBeNull();
    await act(async () => holdDrag.current?.(-48, 0));
    expect(host.querySelector('[data-story-camera-lock="near"]')).not.toBeNull();
    await act(async () => holdDrag.current?.(-120, 0));
    expect(host.querySelector('[data-story-camera-recording]')?.textContent).toBe('Enregistrement verrouillé');
    expect(host.querySelector('[data-story-camera-lock]')).toBeNull();

    await mounter.rerender(host, camera({ engine, intent: 'hold', holding: false, taken, holdDrag }));
    await settle();
    expect(journal).not.toContain('stop');
    expect(shutter(host)?.getAttribute('aria-label')).toBe('Arrêter l’enregistrement');

    await act(async () => shutter(host)?.click());
    await settle();
    expect(journal.slice(-2)).toEqual(['stop', 'release']);
    expect(taken.map((file) => file.type)).toEqual(['video/mp4']);
  });

  test('sans atteindre le cadenas, relâcher clôt la prise comme avant', async () => {
    const { engine, journal } = fakeEngine();
    const holdDrag: StudioHoldDrag = { current: null };
    const host = await mounter.mount(camera({ engine, intent: 'hold', holding: true, holdDrag }));
    await settle();
    await act(async () => holdDrag.current?.(-40, 0));
    await mounter.rerender(host, camera({ engine, intent: 'hold', holding: false, holdDrag }));
    await settle();
    expect(journal).toContain('stop');
  });
});

describe('StudioCamera — le zoom au glisser (#8672)', () => {
  const root = () => document.querySelector<HTMLElement>('[data-story-camera]');
  const preview = (host: ParentNode) => host.querySelector<HTMLVideoElement>('[data-story-camera-preview]');

  test('zoom matériel : glisser vers le haut zoome la piste, revenir dézoome', async () => {
    const { engine, journal } = fakeEngine({ zoom: { mode: 'hardware', min: 1, max: 8, step: 0.1 } });
    const holdDrag: StudioHoldDrag = { current: null };
    const host = await mounter.mount(camera({ engine, intent: 'hold', holding: true, holdDrag }));
    await settle();
    expect(root()?.getAttribute('data-story-camera-zoom-mode')).toBe('hardware');
    await act(async () => holdDrag.current?.(0, -140));
    expect(journal).toContain('zoom:2.0');
    expect(host.querySelector('[data-story-camera-zoom]')?.textContent).toBe('2.0×');
    expect(preview(host)?.style.transform ?? '').not.toContain('scale(');
    await act(async () => holdDrag.current?.(0, 0));
    expect(journal.at(-1)).toBe('zoom:1.0');
  });

  test('zoom numérique : aucune contrainte sur la piste, l’aperçu grandit avec ce qui est filmé', async () => {
    const { engine, journal } = fakeEngine();
    const holdDrag: StudioHoldDrag = { current: null };
    const host = await mounter.mount(camera({ engine, intent: 'hold', holding: true, holdDrag }));
    await settle();
    expect(root()?.getAttribute('data-story-camera-zoom-mode')).toBe('recorded');
    await act(async () => holdDrag.current?.(0, -140));
    expect(journal.some((entry) => entry.startsWith('zoom:'))).toBe(false);
    expect(preview(host)?.style.transform).toContain('scale(2)');
  });

  test('film verrouillé : glisser sur le viseur zoome', async () => {
    const { engine } = fakeEngine();
    const holdDrag: StudioHoldDrag = { current: null };
    const host = await mounter.mount(camera({ engine, intent: 'hold', holding: true, holdDrag }));
    await settle();
    await act(async () => holdDrag.current?.(-120, 0));
    await mounter.rerender(host, camera({ engine, intent: 'hold', holding: false, holdDrag }));
    await settle();
    const layer = root();
    if (layer === null) throw new Error('aucune caméra');
    layer.setPointerCapture = () => undefined;
    const video = preview(host);
    await act(async () => {
      video?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 3, clientX: 200, clientY: 500 }));
      video?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, pointerId: 3, clientX: 200, clientY: 360 }));
      video?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 3, clientX: 200, clientY: 360 }));
    });
    expect(host.querySelector('[data-story-camera-zoom]')?.textContent).toBe('2.0×');
  });
});

describe('StudioCamera — le curseur de verre du flash (#8672)', () => {
  const slider = (host: ParentNode) => host.querySelector<HTMLInputElement>('[data-story-camera-flash-intensity]');
  const capsule = (host: ParentNode) => host.querySelector('[data-story-camera-flash-capsule]');

  test('flash coupé : le curseur est replié, hors d’atteinte', async () => {
    const { engine } = fakeEngine();
    const host = await mounter.mount(camera({ engine, flash: false }));
    await settle();
    expect(capsule(host)?.getAttribute('data-story-camera-flash-capsule')).toBe('closed');
    expect(slider(host)?.getAttribute('aria-hidden')).toBe('true');
    expect(slider(host)?.tabIndex).toBe(-1);
  });

  test('flash activé, sol blanc : le curseur s’allonge collé au bouton, nommé, avec sa valeur', async () => {
    const { engine } = fakeEngine();
    const host = await mounter.mount(camera({ engine, flash: true, intensity: 0.6 }));
    await settle();
    expect(capsule(host)?.getAttribute('data-story-camera-flash-capsule')).toBe('open');
    expect(capsule(host)?.querySelector('[data-story-camera-flash]')).not.toBeNull();
    expect(slider(host)?.getAttribute('aria-label')).toBe('Intensité du flash');
    expect(slider(host)?.getAttribute('aria-valuetext')).toBe('60 %');
    expect(slider(host)?.hasAttribute('aria-hidden')).toBe(false);
  });

  test('caméra arrière avec torche : la torche n’a pas de puissance réglable sur le web — replié', async () => {
    const { engine } = fakeEngine({ torch: true });
    const host = await mounter.mount(camera({ engine, flash: true }));
    await settle();
    expect(capsule(host)?.getAttribute('data-story-camera-flash-capsule')).toBe('closed');
  });

  test('régler le curseur rend la valeur à l’hôte et montre le sol à cette intensité', async () => {
    const { engine } = fakeEngine();
    const chosen: number[] = [];
    const host = await mounter.mount(camera({ engine, flash: true, intensity: 0.5, onIntensity: (next) => chosen.push(next) }));
    await settle();
    const input = slider(host);
    if (input === null) throw new Error('aucun curseur');
    await act(async () => {
      input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 4 }));
      input.value = '0.8';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(chosen.at(-1)).toBe(0.8);
    const floor = host.querySelector<HTMLElement>('[data-story-camera-screen-flash]');
    expect(floor?.getAttribute('data-story-camera-screen-flash')).toBe('ring');
    expect(floor?.style.backgroundColor).toBe('rgb(128, 128, 128)');
    await act(async () => input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 4 })));
    expect(host.querySelector('[data-story-camera-screen-flash]')).toBeNull();
  });

  test('la prise allume le sol à l’intensité choisie', async () => {
    let color = '';
    const { engine } = fakeEngine({
      probe: () => {
        color = document.querySelector<HTMLElement>('[data-story-camera-screen-flash="full"]')?.style.backgroundColor ?? '';
      },
    });
    const host = await mounter.mount(camera({ engine, flash: true, intensity: 0.4 }));
    await settle();
    await act(async () => shutter(host)?.click());
    await settle();
    expect(color).toBe('rgb(102, 102, 102)');
  });
});

/** VISEUR ARMÉ : L'APPUI LONG N'IMPORTE OÙ SUR LUI FILME (#8849, jumelle web de
 * #8846) — toucher = photo, tenir = vidéo, relâcher = arrêt, glisser = cadenas
 * puis zoom : la même tenue que l'appui long d'une scène vide. */
describe('StudioCamera — le viseur armé, tenu, filme (#8849)', () => {
  const view = (host: ParentNode) => host.querySelector<HTMLVideoElement>('[data-story-camera-preview]');
  const armed = () => {
    const layer = document.querySelector<HTMLElement>('[data-story-camera]');
    if (layer !== null) layer.setPointerCapture = () => undefined;
  };
  const press = (target: Element | null, type: string, x = 200, y = 500) =>
    target?.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 7, clientX: x, clientY: y }));
  const hold = () => new Promise((resolve) => setTimeout(resolve, 420));

  test('tenir le viseur armé démarre la vidéo ; relâcher la clôt et la pose — aucune photo', async () => {
    const { engine, journal } = fakeEngine();
    const taken: File[] = [];
    const host = await mounter.mount(camera({ engine, intent: 'arm', taken }));
    await settle();
    armed();
    await act(async () => {
      press(view(host), 'pointerdown');
      await hold();
    });
    await settle();
    expect(journal).toContain('record');
    expect(host.querySelector('[data-story-camera-recording]')).not.toBeNull();
    await act(async () => {
      press(view(host), 'pointerup');
      view(host)?.click();
    });
    await settle();
    expect(journal.slice(-2)).toEqual(['stop', 'release']);
    expect(journal.some((entry) => entry.startsWith('photo:'))).toBe(false);
    expect(taken.map((file) => file.type)).toEqual(['video/mp4']);
  });

  test('un toucher bref sur le viseur armé reste la photo', async () => {
    const { engine, journal } = fakeEngine();
    const taken: File[] = [];
    const host = await mounter.mount(camera({ engine, intent: 'arm', taken }));
    await settle();
    armed();
    await act(async () => {
      press(view(host), 'pointerdown');
      press(view(host), 'pointerup');
      view(host)?.click();
    });
    await settle();
    expect(journal).not.toContain('record');
    expect(taken.map((file) => file.type)).toEqual(['image/jpeg']);
  });

  test('un réel : tenir le viseur armé filme aussi', async () => {
    const { engine, journal } = fakeEngine();
    const host = await mounter.mount(camera({ engine, intent: 'arm', kind: 'REEL' }));
    await settle();
    armed();
    await act(async () => {
      press(view(host), 'pointerdown');
      await hold();
    });
    await settle();
    expect(journal).toContain('record');
  });

  test('tenu, le doigt glisse jusqu’au cadenas : relâcher ne clôt pas, le film continue', async () => {
    const { engine, journal } = fakeEngine();
    const host = await mounter.mount(camera({ engine, intent: 'arm' }));
    await settle();
    armed();
    await act(async () => {
      press(view(host), 'pointerdown');
      await hold();
    });
    await settle();
    await act(async () => {
      press(view(host), 'pointermove', 80, 500);
      press(view(host), 'pointerup', 80, 500);
    });
    await settle();
    expect(host.querySelector('[data-story-camera-recording]')?.getAttribute('data-story-camera-recording')).toBe('locked');
    expect(journal).not.toContain('stop');
  });

  test('tenir un contrôle du viseur (le flash) ne filme pas', async () => {
    const { engine, journal } = fakeEngine();
    const host = await mounter.mount(camera({ engine, intent: 'arm' }));
    await settle();
    armed();
    await act(async () => {
      press(host.querySelector('[data-story-camera-flash]'), 'pointerdown');
      await hold();
    });
    await settle();
    expect(journal).not.toContain('record');
  });
});

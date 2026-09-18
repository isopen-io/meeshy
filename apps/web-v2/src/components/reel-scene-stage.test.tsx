import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument } from '@/lib/canvas/document';
import type { FeedCardScene } from '@/lib/feed/card-model';

import ReelSceneStage, { type ReelSceneStageProps } from './reel-scene-stage';

/**
 * T6 (#6903) — `ReelSceneStage` : un réel COMPOSÉ se rejoue comme sa scène,
 * en boucle et avec son son de fond. Patron `feed-scene-surface.test.tsx`
 * (chunks chargés À LA DEMANDE, flush par un second `act(async () => {})`)
 * et `media-viewer.test.tsx:417` (géométrie par `getBoundingClientRect`
 * stubé — happy-dom ne fait aucune mise en page réelle).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let playCalls = 0;
let pauseCalls = 0;
let playImpl: () => Promise<void> = () => Promise.resolve();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  window.HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    playCalls += 1;
    return playImpl();
  };
  window.HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
    pauseCalls += 1;
  };
  // Le moteur et la piste sont chargés À LA DEMANDE (`lazy`) — le PREMIER
  // `import()` coûte une compilation qu'une brève attente ne couvre pas
  // toujours (motif `feed-scene-surface.test.tsx:17-26`).
  await import('@/components/scene-player');
  await import('@/components/background-track-audio');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;
let stageSize = { width: 390, height: 844 };
let originalRect: (this: HTMLElement) => DOMRect;

beforeEach(() => {
  originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function stubbedRect(this: HTMLElement) {
    return {
      x: 0,
      y: 0,
      width: stageSize.width,
      height: stageSize.height,
      top: 0,
      left: 0,
      right: stageSize.width,
      bottom: stageSize.height,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

afterEach(() => {
  window.HTMLElement.prototype.getBoundingClientRect = originalRect;
  act(() => {
    root.unmount();
  });
  container.remove();
  playCalls = 0;
  pauseCalls = 0;
  playImpl = () => Promise.resolve();
  stageSize = { width: 390, height: 844 };
});

async function mount(node: ReactElement): Promise<HTMLDivElement> {
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return container;
}

/** Une scène à fond vidéo COUPÉ (l'auteur a coupé le son de la vidéo — c'est
 * le son de fond qui parle) + un son de fond `document.sound: original`,
 * miroir de `REEL_SCENE_LOOP` (§ 5.6 de la spécification). */
function sceneWithSound(overrides?: { readonly withSound?: boolean }): FeedCardScene {
  const withSound = overrides?.withSound ?? true;
  const document = parseCanvasDocument({
    v: 3,
    scenes: [
      {
        id: 's1',
        objects: [
          {
            id: 'bg1',
            kind: 'media',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'bg',
            z: 0,
            transform: { scale: 1, rotation: 0, opacity: 1 },
            payload: { postMediaId: 'vid', mediaType: 'video/webm', muted: true },
          },
        ],
      },
    ],
    ...(withSound ? { sound: { source: { t: 'original' }, volume: 1 } } : {}),
  });
  if (document === null) throw new Error('vecteur de test invalide');
  const carrier: SceneCarrier = {
    postId: 'p-scene',
    media: [
      { id: 'vid', src: 'clip.webm', mimeType: 'video/webm', poster: 'poster.png' },
      ...(withSound ? [{ id: 'aud', src: 'son.webm', mimeType: 'audio/webm' }] : []),
    ],
  };
  return { document, carrier };
}

function propsOf(overrides: Partial<ReelSceneStageProps> = {}): ReelSceneStageProps {
  return {
    scene: sceneWithSound(),
    mode: 'active',
    soundOn: true,
    accent: '#4F46E5',
    language: 'fr',
    preferredLanguages: ['fr'],
    onSoundBlocked: () => {},
    ...overrides,
  };
}

function playingOf(el: HTMLDivElement): string | null {
  return el.querySelector('[data-reel-scene]')?.getAttribute('data-reel-scene-playing') ?? null;
}

describe('ReelSceneStage — un réel composé se rejoue comme sa scène (T6, #6903)', () => {
  test('(a) mode="active" ⇒ le player et la piste montent ; aucun <video data-reel-media>', async () => {
    const el = await mount(<ReelSceneStage {...propsOf()} />);
    expect(playingOf(el)).toBe('true');
    expect(el.querySelector('[data-scene-player]')).not.toBeNull();
    expect(el.querySelector('[data-scene-sound-track]')).not.toBeNull();
    expect(el.querySelector('[data-reel-media]')).toBeNull();
  });

  test('(b) géométrie : 9:16 centrée sur 390×844', async () => {
    stageSize = { width: 390, height: 844 };
    const el = await mount(<ReelSceneStage {...propsOf()} />);
    const stage = el.querySelector('[data-reel-scene-stage]') as HTMLElement;
    expect(stage.style.width).toBe('390px');
    expect(Number.parseFloat(stage.style.height)).toBeCloseTo(693.33, 1);
    expect(stage.style.left).toBe('0px');
    expect(Number.parseFloat(stage.style.top)).toBeCloseTo(75.33, 1);
  });

  test('(b bis) géométrie : 9:16 centrée sur 320×568', async () => {
    stageSize = { width: 320, height: 568 };
    const el = await mount(<ReelSceneStage {...propsOf()} />);
    const stage = el.querySelector('[data-reel-scene-stage]') as HTMLElement;
    expect(Number.parseFloat(stage.style.width)).toBeCloseTo(319.5, 1);
    expect(stage.style.height).toBe('568px');
    expect(Number.parseFloat(stage.style.left)).toBeCloseTo(0.25, 1);
    expect(stage.style.top).toBe('0px');
  });

  test('(c) tap [data-reel-surface] met en pause et reprend, aria-label suit', async () => {
    const el = await mount(<ReelSceneStage {...propsOf()} />);
    const surface = el.querySelector('[data-reel-surface]') as HTMLButtonElement;
    expect(surface.getAttribute('aria-label')).toBe('Mettre le réel en pause');
    await act(async () => {
      surface.click();
    });
    expect(playingOf(el)).toBe('false');
    expect(surface.getAttribute('aria-label')).toBe('Lire le réel');
    expect(surface.querySelector('svg, span')).not.toBeNull();
    await act(async () => {
      surface.click();
    });
    expect(playingOf(el)).toBe('true');
    expect(surface.getAttribute('aria-label')).toBe('Mettre le réel en pause');
  });

  test('(d) mode → near : playing faux, piste absente ; retour actif : reprend SANS tap ; far : poster seul', async () => {
    const el = await mount(<ReelSceneStage {...propsOf({ mode: 'active' })} />);
    const surface = () => el.querySelector('[data-reel-surface]') as HTMLButtonElement;
    await act(async () => {
      surface().click();
    });
    expect(playingOf(el)).toBe('false');

    await act(async () => {
      root.render(<ReelSceneStage {...propsOf({ mode: 'near' })} />);
    });
    expect(playingOf(el)).toBe('false');
    expect(el.querySelector('[data-scene-sound-track]')).toBeNull();
    expect(el.querySelector('[data-scene-player]')).not.toBeNull();

    await act(async () => {
      root.render(<ReelSceneStage {...propsOf({ mode: 'active' })} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    // La pause a été OUBLIÉE en quittant `active` — reprend sans nouveau tap.
    expect(playingOf(el)).toBe('true');

    await act(async () => {
      root.render(<ReelSceneStage {...propsOf({ mode: 'far' })} />);
    });
    expect(el.querySelector('[data-scene-player]')).toBeNull();
    expect(el.querySelector('[data-scene-sound-track]')).toBeNull();
    expect(el.querySelector('[data-reel-poster]')).not.toBeNull();
  });

  test('(e) soundOn faux ⇒ le moteur ET la piste sont muets', async () => {
    const el = await mount(<ReelSceneStage {...propsOf({ soundOn: false })} />);
    expect(el.querySelector('[data-scene-sound="muted"]')).not.toBeNull();
    expect((el.querySelector('[data-scene-sound-track]') as HTMLAudioElement | null)?.muted).toBe(true);
  });

  test('(e bis) soundOn vrai ⇒ ni pastille muette, ni piste muette', async () => {
    const el = await mount(<ReelSceneStage {...propsOf({ soundOn: true })} />);
    expect(el.querySelector('[data-scene-sound="muted"]')).toBeNull();
    expect((el.querySelector('[data-scene-sound-track]') as HTMLAudioElement | null)?.muted).toBe(false);
  });

  test('(f) refus de lecture sonore ⇒ onSoundBlocked appelé (moteur et/ou piste, le refus atteint l’écran)', async () => {
    let blocked = 0;
    playImpl = () => Promise.reject(Object.assign(new Error('refusé'), { name: 'NotAllowedError' }));
    await mount(<ReelSceneStage {...propsOf({ soundOn: true, onSoundBlocked: () => (blocked += 1) })} />);
    await act(async () => {});
    expect(blocked).toBeGreaterThanOrEqual(1);
  });

  test('(g)+(h) la progression s’écrit sur la ref sans re-rendu ; le tour de boucle REMONTE la piste', async () => {
    const originalRaf = window.requestAnimationFrame;
    const originalCaf = window.cancelAnimationFrame;
    const queue: Array<(t: number) => void> = [];
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      queue.push(cb as (t: number) => void);
      return queue.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
    const flushTo = (ms: number) => {
      const cb = queue.shift();
      if (cb !== undefined) act(() => cb(ms));
    };
    try {
      let renders = 0;
      function Spy({ children }: { readonly children: ReactNode }) {
        renders += 1;
        return <>{children}</>;
      }
      const el = await mount(
        <Spy>
          <ReelSceneStage {...propsOf()} />
        </Spy>,
      );
      const video = el.querySelector('[data-scene-player] video') as HTMLVideoElement;
      Object.defineProperty(video, 'duration', { value: 3, configurable: true });
      await act(async () => {
        video.dispatchEvent(new window.Event('loadedmetadata'));
      });
      const trackBefore = el.querySelector('[data-scene-sound-track]');
      const playsBefore = playCalls;
      const before = renders;
      flushTo(0);
      flushTo(1500);
      const bar = el.querySelector('[data-reel-progress]') as HTMLElement;
      expect(bar.style.transform).toBe('scaleX(0.5)');
      expect(renders).toBe(before);
      flushTo(3200); // delta 1700ms depuis 1500 ⇒ t=3,2 ⇒ le wrap
      const trackAfter = el.querySelector('[data-scene-sound-track]');
      expect(trackAfter).not.toBe(trackBefore);
      expect(playCalls).toBeGreaterThan(playsBefore);
    } finally {
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCaf;
    }
  });

  test('(i) aucune durée connue ⇒ [data-reel-progress] ABSENT (loi 4)', async () => {
    const el = await mount(<ReelSceneStage {...propsOf()} />);
    expect(el.querySelector('[data-reel-progress]')).toBeNull();
  });

  test('(j) onglet caché ⇒ pause ; retour ⇒ reprend', async () => {
    const el = await mount(<ReelSceneStage {...propsOf()} />);
    const originalHidden = Object.getOwnPropertyDescriptor(window.document, 'hidden');
    try {
      Object.defineProperty(window.document, 'hidden', { value: true, configurable: true });
      await act(async () => {
        window.document.dispatchEvent(new window.Event('visibilitychange'));
      });
      expect(playingOf(el)).toBe('false');
      Object.defineProperty(window.document, 'hidden', { value: false, configurable: true });
      await act(async () => {
        window.document.dispatchEvent(new window.Event('visibilitychange'));
      });
      expect(playingOf(el)).toBe('true');
    } finally {
      if (originalHidden !== undefined) Object.defineProperty(window.document, 'hidden', originalHidden);
    }
  });

  test('(k) démontage ⇒ pause() sur la piste', async () => {
    await mount(<ReelSceneStage {...propsOf()} />);
    const before = pauseCalls;
    act(() => {
      root.unmount();
    });
    expect(pauseCalls).toBeGreaterThan(before);
  });
});

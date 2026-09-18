import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { BackgroundTrack } from '@/lib/canvas/background-sound';

import { BackgroundTrackAudio } from './background-track-audio';

/**
 * T5 (#6903) — `BackgroundTrackAudio`, SITE UNIQUE du son de fond d'une
 * scène, extrait de `story-scene-layer.tsx` pour être consommé aussi par le
 * lecteur des Réels. Patron `use-reel-playback.test.tsx:26-45` (happy-dom +
 * `createRoot` + `act`, `play`/`pause` bouchonnés sur le PROTOTYPE).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let playImpl: () => Promise<void> = () => Promise.resolve();
let playCalls = 0;
let pauseCalls = 0;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  window.HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    playCalls += 1;
    return playImpl();
  };
  window.HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
    pauseCalls += 1;
  };
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  playCalls = 0;
  pauseCalls = 0;
  playImpl = () => Promise.resolve();
});

function mount(node: ReactElement): HTMLDivElement {
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container;
}

const trackOf = (overrides: Partial<BackgroundTrack> = {}): BackgroundTrack => ({
  src: 'son.webm',
  volume: 1,
  startOffsetMs: 0,
  loop: false,
  ...overrides,
});

function audioOf(root: HTMLDivElement): HTMLAudioElement {
  const el = root.querySelector('[data-scene-sound-track]');
  if (el === null) throw new Error('aucune piste montée');
  return el as HTMLAudioElement;
}

describe('BackgroundTrackAudio — le son de fond, site unique (T5, #6903)', () => {
  test('(a) playing ⇒ play() une fois ; playing faux ⇒ pause()', () => {
    mount(<BackgroundTrackAudio track={trackOf()} playing muted={false} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    expect(playCalls).toBe(1);
    act(() => {
      root.render(<BackgroundTrackAudio track={trackOf()} playing={false} muted={false} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    });
    expect(pauseCalls).toBe(1);
  });

  test('(b) muted ⇒ attribut muted posé, play() TOUT DE MÊME appelé (une lecture muette avance)', () => {
    const el = mount(<BackgroundTrackAudio track={trackOf()} playing muted onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    expect(audioOf(el).muted).toBe(true);
    expect(playCalls).toBe(1);
  });

  test('(c) refus NotAllowedError, muted faux ⇒ onPlaybackBlocked appelé', async () => {
    let blocked = 0;
    playImpl = () => Promise.reject(Object.assign(new Error('refused'), { name: 'NotAllowedError' }));
    await act(async () => {
      mount(<BackgroundTrackAudio track={trackOf()} playing muted={false} onDurationKnown={() => {}} onPlaybackBlocked={() => (blocked += 1)} />);
    });
    await act(async () => {});
    expect(blocked).toBe(1);
  });

  test('(c bis) refus NotAllowedError, muted vrai ⇒ onPlaybackBlocked PAS appelé', async () => {
    let blocked = 0;
    playImpl = () => Promise.reject(Object.assign(new Error('refused'), { name: 'NotAllowedError' }));
    await act(async () => {
      mount(<BackgroundTrackAudio track={trackOf()} playing muted onDurationKnown={() => {}} onPlaybackBlocked={() => (blocked += 1)} />);
    });
    await act(async () => {});
    expect(blocked).toBe(0);
  });

  test('(d) key changée ⇒ nouvel élément, play() DE NOUVEAU (le redépart d’un tour)', () => {
    mount(<BackgroundTrackAudio key="a" track={trackOf()} playing muted={false} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    expect(playCalls).toBe(1);
    act(() => {
      root.render(<BackgroundTrackAudio key="b" track={trackOf()} playing muted={false} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    });
    expect(playCalls).toBe(2);
  });

  test('(e) loadedmetadata (durée stubée 2 s) ⇒ onDurationKnown(startOffsetMs + 2000)', () => {
    const durations: number[] = [];
    const el = mount(
      <BackgroundTrackAudio
        track={trackOf({ startOffsetMs: 500 })}
        playing
        muted={false}
        onDurationKnown={(ms) => durations.push(ms)}
        onPlaybackBlocked={() => {}}
      />,
    );
    const audio = audioOf(el);
    Object.defineProperty(audio, 'duration', { value: 2, configurable: true });
    act(() => {
      audio.dispatchEvent(new window.Event('loadedmetadata'));
    });
    expect(durations).toEqual([2500]);
  });

  test('(f) bounds ⇒ currentTime = start au chargement ; au-delà de end ⇒ pause (sans loop)', () => {
    const el = mount(
      <BackgroundTrackAudio
        track={trackOf({ bounds: { startMs: 1000, endMs: 3000 } })}
        playing
        muted={false}
        onDurationKnown={() => {}}
        onPlaybackBlocked={() => {}}
      />,
    );
    const audio = audioOf(el);
    Object.defineProperty(audio, 'duration', { value: 9, configurable: true });
    Object.defineProperty(audio, 'currentTime', { value: 0, configurable: true, writable: true });
    act(() => {
      audio.dispatchEvent(new window.Event('loadedmetadata'));
    });
    expect(audio.currentTime).toBe(1);
    audio.currentTime = 3.1;
    const pausedBefore = pauseCalls;
    act(() => {
      audio.dispatchEvent(new window.Event('timeupdate'));
    });
    expect(pauseCalls).toBeGreaterThan(pausedBefore);
  });

  test('(f bis) bounds + loop ⇒ au-delà de end, REBOUCLE au début de la fenêtre au lieu de pauser', () => {
    const el = mount(
      <BackgroundTrackAudio
        track={trackOf({ bounds: { startMs: 1000, endMs: 3000 }, loop: true })}
        playing
        muted={false}
        onDurationKnown={() => {}}
        onPlaybackBlocked={() => {}}
      />,
    );
    const audio = audioOf(el);
    Object.defineProperty(audio, 'duration', { value: 9, configurable: true });
    Object.defineProperty(audio, 'currentTime', { value: 0, configurable: true, writable: true });
    act(() => {
      audio.dispatchEvent(new window.Event('loadedmetadata'));
    });
    audio.currentTime = 3.1;
    const pausedBefore = pauseCalls;
    act(() => {
      audio.dispatchEvent(new window.Event('timeupdate'));
    });
    expect(audio.currentTime).toBe(1);
    expect(pauseCalls).toBe(pausedBefore);
  });

  test('(g) [data-scene-sound-track] posé — le gate de story le lit', () => {
    const el = mount(<BackgroundTrackAudio track={trackOf()} playing muted={false} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    expect(el.querySelector('[data-scene-sound-track]')).not.toBeNull();
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createMediaCoordinator, type MediaCoordinator } from './media-coordinator';
import { useMediaPlayback, type MediaPlayback } from './use-media-playback';

/**
 * TÉMOIN (#5805, renommé #6221 étape 0 — `use-audio-playback.test.tsx`).
 * Patron `use-recorder.test.tsx` (happy-dom + `createRoot` + `act`).
 * L'élément est RÉEL (`<audio>` ou `<video>`), mais `play`/`pause`/`load`
 * sont BOUCHONNÉS sur CHAQUE instance (`stubMedia`) : happy-dom implémente
 * ces méthodes en suivant un état interne `paused` qui ne reflète pas
 * nécessairement ce que le hook vient de faire dans un test qui compose
 * plusieurs éléments — le bouchon rend chaque test indépendant de ce détail
 * d'implémentation, exactement la forme que la spécification prescrit (§4.5).
 */
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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function Harness({
  onReady,
  attachmentId,
  coordinator,
  tag = 'audio',
}: {
  readonly onReady: (playback: MediaPlayback) => void;
  readonly attachmentId: string;
  readonly coordinator: MediaCoordinator;
  readonly tag?: 'audio' | 'video';
}) {
  const playback = useMediaPlayback({ attachmentId, coordinator });
  onReady(playback);
  if (tag === 'video') {
    return <video ref={playback.bind} data-status={playback.status} data-progress={playback.progress} />;
  }
  return <audio ref={playback.bind} data-status={playback.status} data-progress={playback.progress} />;
}

function mount(params: {
  readonly onReady: (playback: MediaPlayback) => void;
  readonly attachmentId: string;
  readonly coordinator: MediaCoordinator;
  readonly tag?: 'audio' | 'video';
}): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness {...params} />);
  });
  return container;
}

const mediaOf = (el: HTMLDivElement): HTMLMediaElement => el.querySelector('audio, video')!;
const statusOf = (el: HTMLDivElement): string | null => mediaOf(el).getAttribute('data-status');
const progressOf = (el: HTMLDivElement): number => Number(mediaOf(el).getAttribute('data-progress'));

/** Remplace `play`/`pause`/`load` par des bouchons qui dispatchent l'événement natif correspondant. */
function stubMedia(el: HTMLMediaElement): { playCalls: number; pauseCalls: number; loadCalls: number } {
  const calls = { playCalls: 0, pauseCalls: 0, loadCalls: 0 };
  el.play = () => {
    calls.playCalls += 1;
    el.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  el.pause = () => {
    calls.pauseCalls += 1;
    el.dispatchEvent(new Event('pause'));
  };
  el.load = () => {
    calls.loadCalls += 1;
    el.dispatchEvent(new Event('emptied'));
  };
  return calls;
}

describe('useMediaPlayback — permission et bascule (#5805)', () => {
  test('toggle() sur idle : play(), claim le coordinateur, status playing après l’événement play', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const calls = stubMedia(mediaOf(el));

    expect(statusOf(el)).toBe('idle');

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });

    expect(calls.playCalls).toBe(1);
    expect(coordinator.active()).toBe('a');
    expect(statusOf(el)).toBe('playing');
  });

  test('toggle() sur playing : pause(), status paused, coordinateur relâché', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const calls = stubMedia(mediaOf(el));

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });
    expect(statusOf(el)).toBe('playing');

    await act(async () => {
      playback.toggle();
    });

    expect(calls.pauseCalls).toBe(1);
    expect(statusOf(el)).toBe('paused');
    expect(coordinator.active()).toBeNull();
  });
});

describe('useMediaPlayback — un seul média à la fois (#5805)', () => {
  test('un claim d’un AUTRE id met CET élément en pause — le rappel remis au coordinateur est bien pause() de cet élément', async () => {
    const coordinator = createMediaCoordinator();
    let playbackA!: MediaPlayback;
    let playbackB!: MediaPlayback;

    const elA = mount({ onReady: (p) => (playbackA = p), attachmentId: 'a', coordinator });
    const callsA = stubMedia(mediaOf(elA));
    await act(async () => {
      playbackA.toggle();
      await Promise.resolve();
    });
    expect(statusOf(elA)).toBe('playing');

    // Un SECOND montage, MÊME coordinateur — deux widgets d'un même fil.
    const elB = mount({ onReady: (p) => (playbackB = p), attachmentId: 'b', coordinator });
    stubMedia(mediaOf(elB));
    await act(async () => {
      playbackB.toggle();
      await Promise.resolve();
    });

    expect(coordinator.active()).toBe('b');
    expect(callsA.pauseCalls).toBe(1);
    expect(statusOf(elA)).toBe('paused');
    expect(statusOf(elB)).toBe('playing');
  });

  /**
   * T9 (#6221) — LE COORDINATEUR NE DISTINGUE PAS LES ÉLÉMENTS : un `<video>`
   * qui réclame l'exclusivité fait `pause()` sur l'`<audio>` actif, exactement
   * comme un second `<audio>` l'aurait fait. C'est la preuve, avec de VRAIS
   * éléments DOM, que `HTMLMediaElement` est le bon type commun — le témoin
   * pur équivalent vit dans `media-coordinator.test.ts`.
   */
  test('une vidéo qui réclame l’exclusivité met en pause un vocal actif — le coordinateur ne distingue pas les éléments', async () => {
    const coordinator = createMediaCoordinator();
    let voice!: MediaPlayback;
    let video!: MediaPlayback;

    const voiceEl = mount({ onReady: (p) => (voice = p), attachmentId: 'voice-1', coordinator, tag: 'audio' });
    const voiceCalls = stubMedia(mediaOf(voiceEl));
    await act(async () => {
      voice.toggle();
      await Promise.resolve();
    });
    expect(statusOf(voiceEl)).toBe('playing');

    const videoEl = mount({ onReady: (p) => (video = p), attachmentId: 'video-1', coordinator, tag: 'video' });
    stubMedia(mediaOf(videoEl));
    await act(async () => {
      video.toggle();
      await Promise.resolve();
    });

    expect(coordinator.active()).toBe('video-1');
    expect(voiceCalls.pauseCalls).toBe(1);
    expect(statusOf(voiceEl)).toBe('paused');
    expect(statusOf(videoEl)).toBe('playing');
  });
});

describe('useMediaPlayback — progression et fin (#5805)', () => {
  test('timeupdate (currentTime 3, duration 12) ⇒ progress 0.25 ; ended ⇒ idle, progress 1, coordinateur relâché', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const media = mediaOf(el);
    stubMedia(media);
    Object.defineProperty(media, 'duration', { value: 12, configurable: true });

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });

    await act(async () => {
      Object.defineProperty(media, 'currentTime', { value: 3, configurable: true });
      media.dispatchEvent(new Event('timeupdate'));
    });
    expect(progressOf(el)).toBe(0.25);

    await act(async () => {
      media.dispatchEvent(new Event('ended'));
    });
    expect(statusOf(el)).toBe('idle');
    expect(progressOf(el)).toBe(1);
    expect(coordinator.active()).toBeNull();
  });
});

describe('useMediaPlayback — échec de lecture (#5805)', () => {
  test('error ⇒ status error ; toggle() réessaie (load() puis play())', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const media = mediaOf(el);
    const calls = stubMedia(media);

    await act(async () => {
      media.dispatchEvent(new Event('error'));
    });
    expect(statusOf(el)).toBe('error');

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });

    expect(calls.loadCalls).toBe(1);
    expect(calls.playCalls).toBe(1);
    expect(statusOf(el)).toBe('playing');
  });
});

describe('useMediaPlayback — démontage (#5805)', () => {
  test('démontage : le coordinateur est relâché et l’élément mis en pause — aucun son orphelin', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const calls = stubMedia(mediaOf(el));

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });
    expect(coordinator.active()).toBe('a');

    act(() => {
      root.unmount();
    });

    expect(coordinator.active()).toBeNull();
    expect(calls.pauseCalls).toBe(1);
  });
});

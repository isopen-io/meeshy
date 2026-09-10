import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createAudioCoordinator, type AudioCoordinator } from './audio-coordinator';
import { useAudioPlayback, type AudioPlayback } from './use-audio-playback';

/**
 * TÉMOIN (#5805) — patron `use-recorder.test.tsx` (happy-dom + `createRoot` +
 * `act`). L'`<audio>` est un élément RÉEL, mais `play`/`pause`/`load` sont
 * BOUCHONNÉS sur CHAQUE instance (`stubAudio`) : happy-dom implémente ces
 * méthodes en suivant un état interne `paused` qui ne reflète pas
 * nécessairement ce que le hook vient de faire dans un test qui compose
 * plusieurs éléments — le bouchon rend chaque test indépendant de ce détail
 * d'implémentation, exactement la forme que la spécification prescrit (§4.5).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  GlobalRegistrator.register();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
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
}: {
  readonly onReady: (playback: AudioPlayback) => void;
  readonly attachmentId: string;
  readonly coordinator: AudioCoordinator;
}) {
  const playback = useAudioPlayback({ attachmentId, coordinator });
  onReady(playback);
  return <audio ref={playback.bind} data-status={playback.status} data-progress={playback.progress} />;
}

function mount(params: {
  readonly onReady: (playback: AudioPlayback) => void;
  readonly attachmentId: string;
  readonly coordinator: AudioCoordinator;
}): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness {...params} />);
  });
  return container;
}

const audioOf = (el: HTMLDivElement): HTMLAudioElement => el.querySelector('audio')!;
const statusOf = (el: HTMLDivElement): string | null => audioOf(el).getAttribute('data-status');
const progressOf = (el: HTMLDivElement): number => Number(audioOf(el).getAttribute('data-progress'));

/** Remplace `play`/`pause`/`load` par des bouchons qui dispatchent l'événement natif correspondant. */
function stubAudio(el: HTMLAudioElement): { playCalls: number; pauseCalls: number; loadCalls: number } {
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

describe('useAudioPlayback — permission et bascule (#5805)', () => {
  test('toggle() sur idle : play(), claim le coordinateur, status playing après l’événement play', async () => {
    const coordinator = createAudioCoordinator();
    let playback!: AudioPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const calls = stubAudio(audioOf(el));

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
    const coordinator = createAudioCoordinator();
    let playback!: AudioPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const calls = stubAudio(audioOf(el));

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

describe('useAudioPlayback — un seul vocal à la fois (#5805)', () => {
  test('un claim d’un AUTRE id met CET élément en pause — le rappel remis au coordinateur est bien pause() de cet élément', async () => {
    const coordinator = createAudioCoordinator();
    let playbackA!: AudioPlayback;
    let playbackB!: AudioPlayback;

    const elA = mount({ onReady: (p) => (playbackA = p), attachmentId: 'a', coordinator });
    const callsA = stubAudio(audioOf(elA));
    await act(async () => {
      playbackA.toggle();
      await Promise.resolve();
    });
    expect(statusOf(elA)).toBe('playing');

    // Un SECOND montage, MÊME coordinateur — deux widgets audio d'un même fil.
    const elB = mount({ onReady: (p) => (playbackB = p), attachmentId: 'b', coordinator });
    stubAudio(audioOf(elB));
    await act(async () => {
      playbackB.toggle();
      await Promise.resolve();
    });

    expect(coordinator.active()).toBe('b');
    expect(callsA.pauseCalls).toBe(1);
    expect(statusOf(elA)).toBe('paused');
    expect(statusOf(elB)).toBe('playing');
  });
});

describe('useAudioPlayback — progression et fin (#5805)', () => {
  test('timeupdate (currentTime 3, duration 12) ⇒ progress 0.25 ; ended ⇒ idle, progress 1, coordinateur relâché', async () => {
    const coordinator = createAudioCoordinator();
    let playback!: AudioPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const audio = audioOf(el);
    stubAudio(audio);
    Object.defineProperty(audio, 'duration', { value: 12, configurable: true });

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });

    await act(async () => {
      Object.defineProperty(audio, 'currentTime', { value: 3, configurable: true });
      audio.dispatchEvent(new Event('timeupdate'));
    });
    expect(progressOf(el)).toBe(0.25);

    await act(async () => {
      audio.dispatchEvent(new Event('ended'));
    });
    expect(statusOf(el)).toBe('idle');
    expect(progressOf(el)).toBe(1);
    expect(coordinator.active()).toBeNull();
  });
});

describe('useAudioPlayback — échec de lecture (#5805)', () => {
  test('error ⇒ status error ; toggle() réessaie (load() puis play())', async () => {
    const coordinator = createAudioCoordinator();
    let playback!: AudioPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const audio = audioOf(el);
    const calls = stubAudio(audio);

    await act(async () => {
      audio.dispatchEvent(new Event('error'));
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

describe('useAudioPlayback — démontage (#5805)', () => {
  test('démontage : le coordinateur est relâché et l’élément mis en pause — aucun son orphelin', async () => {
    const coordinator = createAudioCoordinator();
    let playback!: AudioPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const calls = stubAudio(audioOf(el));

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

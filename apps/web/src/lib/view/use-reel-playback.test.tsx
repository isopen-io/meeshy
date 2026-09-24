import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createMediaCoordinator, type MediaCoordinator } from './media-coordinator';
import { useReelPlayback } from './use-reel-playback';

/**
 * TÉMOIN (#6457) — un seul réel joue, celui qui est visible ; aucun lecteur ne
 * survit au démontage. Patron `use-media-playback.test.tsx` (happy-dom +
 * `createRoot` + `act`), à une différence près : la lecture part d'un EFFET au
 * montage, donc `play`/`pause` sont bouchonnés sur le PROTOTYPE avant le rendu —
 * chaque appel est compté par élément et dispatche son événement natif.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

type Calls = { play: number; pause: number };
const calls = new Map<string, Calls>();
const callsOf = (id: string): Calls => calls.get(id) ?? { play: 0, pause: 0 };

let restore: () => void = () => undefined;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const proto = window.HTMLMediaElement.prototype;
  const originalPlay = proto.play;
  const originalPause = proto.pause;
  const bump = (el: HTMLMediaElement, key: keyof Calls) => {
    const id = el.getAttribute('data-id') ?? '';
    const current = callsOf(id);
    calls.set(id, { ...current, [key]: current[key] + 1 });
  };
  proto.play = function play(this: HTMLMediaElement) {
    bump(this, 'play');
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  proto.pause = function pause(this: HTMLMediaElement) {
    bump(this, 'pause');
    this.dispatchEvent(new Event('pause'));
  };
  restore = () => {
    proto.play = originalPlay;
    proto.pause = originalPause;
  };
});

afterAll(async () => {
  restore();
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  calls.clear();
});

type Page = { readonly id: string; readonly active: boolean };

function Reel({ id, active, soundOn, coordinator }: Page & { readonly soundOn: boolean; readonly coordinator: MediaCoordinator }) {
  const playback = useReelPlayback({ mediaId: id, active, soundOn, coordinator });
  return <video ref={playback.bind} data-id={id} data-status={playback.status} />;
}

function Pager({ pages, soundOn, coordinator }: { readonly pages: readonly Page[]; readonly soundOn: boolean; readonly coordinator: MediaCoordinator }) {
  return (
    <>
      {pages.map((page) => (
        <Reel key={page.id} {...page} soundOn={soundOn} coordinator={coordinator} />
      ))}
    </>
  );
}

async function render(props: { readonly pages: readonly Page[]; readonly soundOn: boolean; readonly coordinator: MediaCoordinator }) {
  if (container === null) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root?.render(<Pager {...props} />);
    await Promise.resolve();
  });
}

const videoOf = (id: string): HTMLVideoElement => container!.querySelector(`[data-id="${id}"]`)!;

describe('useReelPlayback — la lecture suit la visibilité', () => {
  test('le réel visible joue dès son montage, ses voisins restent en attente', async () => {
    const coordinator = createMediaCoordinator();
    await render({ pages: [{ id: 'a', active: true }, { id: 'b', active: false }], soundOn: true, coordinator });

    expect(callsOf('a').play).toBe(1);
    expect(callsOf('b').play).toBe(0);
    expect(coordinator.active()).toBe('a');
    expect(videoOf('a').getAttribute('data-status')).toBe('playing');
  });

  test('balayer vers le suivant : l’ancien se met en pause, le nouveau joue — jamais deux à la fois', async () => {
    const coordinator = createMediaCoordinator();
    await render({ pages: [{ id: 'a', active: true }, { id: 'b', active: false }], soundOn: true, coordinator });
    await render({ pages: [{ id: 'a', active: false }, { id: 'b', active: true }], soundOn: true, coordinator });

    expect(callsOf('a').pause).toBeGreaterThanOrEqual(1);
    expect(callsOf('b').play).toBe(1);
    expect(coordinator.active()).toBe('b');
    expect(videoOf('a').getAttribute('data-status')).toBe('paused');
    expect(videoOf('b').getAttribute('data-status')).toBe('playing');
  });

  test('une pause voulue n’est pas annulée par un rendu qui ne change pas la visibilité', async () => {
    const coordinator = createMediaCoordinator();
    await render({ pages: [{ id: 'a', active: true }], soundOn: true, coordinator });
    await act(async () => {
      videoOf('a').pause();
      await Promise.resolve();
    });
    await render({ pages: [{ id: 'a', active: true }], soundOn: true, coordinator });

    expect(callsOf('a').play).toBe(1);
    expect(videoOf('a').getAttribute('data-status')).toBe('paused');
  });

  test('le son suit la préférence de l’écran, posée avant la lecture', async () => {
    const coordinator = createMediaCoordinator();
    await render({ pages: [{ id: 'a', active: true }], soundOn: false, coordinator });
    expect(videoOf('a').muted).toBe(true);

    await render({ pages: [{ id: 'a', active: true }], soundOn: true, coordinator });
    expect(videoOf('a').muted).toBe(false);
  });

  test('l’onglet masqué suspend la lecture et la rend au retour', async () => {
    const coordinator = createMediaCoordinator();
    await render({ pages: [{ id: 'a', active: true }], soundOn: true, coordinator });
    const hidden = Object.getOwnPropertyDescriptor(window.Document.prototype, 'hidden');

    await act(async () => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(videoOf('a').getAttribute('data-status')).toBe('paused');

    await act(async () => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(callsOf('a').play).toBe(2);
    expect(videoOf('a').getAttribute('data-status')).toBe('playing');

    delete (document as { hidden?: boolean }).hidden;
    if (hidden !== undefined) Object.defineProperty(window.Document.prototype, 'hidden', hidden);
  });
});

describe('useReelPlayback — aucune fuite de lecteur', () => {
  test('quitter l’écran coupe le réel qui jouait et relâche le coordinateur', async () => {
    const coordinator = createMediaCoordinator();
    await render({ pages: [{ id: 'a', active: true }, { id: 'b', active: false }], soundOn: true, coordinator });
    expect(coordinator.active()).toBe('a');
    const pausesBefore = callsOf('a').pause;

    act(() => root?.unmount());
    root = null;

    expect(coordinator.active()).toBeNull();
    expect(callsOf('a').pause).toBe(pausesBefore + 1);
  });

  test('un réel qui sort de la fenêtre est démonté : son lecteur est libéré', async () => {
    const coordinator = createMediaCoordinator();
    await render({ pages: [{ id: 'a', active: true }, { id: 'b', active: false }], soundOn: true, coordinator });
    await render({ pages: [{ id: 'b', active: true }], soundOn: true, coordinator });

    expect(container!.querySelector('[data-id="a"]')).toBeNull();
    expect(coordinator.active()).toBe('b');
    expect(container!.querySelectorAll('video')).toHaveLength(1);
  });
});

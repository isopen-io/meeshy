import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { SceneClockHandle } from '@/components/scene-clock';
import type { StudioTiming } from '@/lib/stories/studio-text';
import type { StudioTrack } from '@/lib/stories/studio-timeline';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StudioTimelinePanel } from './story-compose-timeline';

/**
 * LA FRISE SE RÈGLE À LA MAIN (lot 7, retour porteur 2026-09-28, miroir
 * `ComposerSceneFrise.swift`) — toucher une piste choisit l'objet et place la
 * tête ; glisser sa barre la DÉPLACE ; ses poignées l'allongent ou la
 * raccourcissent ; tout marche pendant la lecture ; UN engagement au lâcher ;
 * les flèches du clavier la déplacent plus tôt / plus tard.
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
  act(() => root.unmount());
  container.remove();
});

const BOX = { left: 0, top: 0, width: 600, height: 30, right: 600, bottom: 30, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;

type Journal = { selected: string[]; seeks: number[]; timings: { id: string; timing: StudioTiming }[] };

function fakeClock(journal: Journal): SceneClockHandle {
  return {
    now: () => 0,
    seek: (t: number) => {
      journal.seeks.push(t);
    },
    subscribe: () => () => undefined,
    subscribeSeek: () => () => undefined,
    isDriving: () => true,
  };
}

function mountPanel({ selectedId = null as string | null, playing = false } = {}) {
  const journal: Journal = { selected: [], seeks: [], timings: [] };
  const tracks: readonly StudioTrack[] = [{ id: 'text-1', kind: 'text', timing: { start: 1, end: 3 } }];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <StudioTimelinePanel
        lang="fr"
        tracks={tracks}
        labelOf={() => 'Bonjour'}
        selectedId={selectedId}
        duration={6}
        clock={fakeClock(journal)}
        playing={playing}
        onPlayPause={() => undefined}
        onSelect={(id) => journal.selected.push(id)}
        onEnter={() => undefined}
        onExit={() => undefined}
        onTiming={(id, timing) => journal.timings.push({ id, timing })}
      />,
    ),
  );
  container.querySelectorAll<HTMLElement>('[data-story-track-lane]').forEach((lane) => {
    lane.getBoundingClientRect = () => BOX;
  });
  return journal;
}

const pointer = (target: Element, type: string, clientX: number) =>
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX, pointerId: 1 }));
  });

const grab = (selector: string): HTMLElement => {
  const element = container.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`${selector} absent`);
  element.setPointerCapture = () => undefined;
  return element;
};

describe('toucher une piste', () => {
  test('choisit l’objet et place la tête là où l’on a touché', () => {
    const journal = mountPanel();
    const bar = grab('[data-story-track-bar="text-1"]');
    pointer(bar, 'pointerdown', 150);
    pointer(bar, 'pointerup', 150);
    expect(journal.selected).toEqual(['text-1']);
    expect(journal.seeks).toEqual([1.5]);
    expect(journal.timings).toEqual([]);
  });
});

describe('glisser la barre déplace la fenêtre', () => {
  test('durée gardée, UN seul engagement au lâcher', () => {
    const journal = mountPanel({ selectedId: 'text-1' });
    const bar = grab('[data-story-track-bar="text-1"]');
    pointer(bar, 'pointerdown', 150);
    pointer(bar, 'pointermove', 200);
    pointer(bar, 'pointermove', 250);
    expect(journal.timings).toEqual([]);
    expect(container.querySelector('[data-story-track="text-1"]')?.getAttribute('data-story-track-start')).toBe('2');
    pointer(bar, 'pointerup', 250);
    expect(journal.timings).toEqual([{ id: 'text-1', timing: { start: 2, end: 4 } }]);
  });

  test('bornée à la scène', () => {
    const journal = mountPanel({ selectedId: 'text-1' });
    const bar = grab('[data-story-track-bar="text-1"]');
    pointer(bar, 'pointerdown', 150);
    pointer(bar, 'pointermove', 900);
    pointer(bar, 'pointerup', 900);
    expect(journal.timings).toEqual([{ id: 'text-1', timing: { start: 4, end: 6 } }]);
  });

  test('marche aussi pendant la lecture', () => {
    const journal = mountPanel({ selectedId: 'text-1', playing: true });
    const bar = grab('[data-story-track-bar="text-1"]');
    pointer(bar, 'pointerdown', 150);
    pointer(bar, 'pointermove', 50);
    pointer(bar, 'pointerup', 50);
    expect(journal.timings).toEqual([{ id: 'text-1', timing: { start: 0, end: 2 } }]);
  });
});

describe('les poignées de début et de fin', () => {
  test('n’existent que sur la piste choisie', () => {
    mountPanel();
    expect(container.querySelector('[data-story-track-grip]')).toBeNull();
  });

  test('début : allonge vers la gauche, sans franchir la fin', () => {
    const journal = mountPanel({ selectedId: 'text-1' });
    const start = grab('[data-story-track-grip="start"]');
    pointer(start, 'pointerdown', 100);
    pointer(start, 'pointermove', 50);
    pointer(start, 'pointerup', 50);
    pointer(start, 'pointerdown', 100);
    pointer(start, 'pointermove', 900);
    pointer(start, 'pointerup', 900);
    expect(journal.timings).toEqual([
      { id: 'text-1', timing: { start: 0.5, end: 3 } },
      { id: 'text-1', timing: { start: 2.95, end: 3 } },
    ]);
  });

  test('fin : raccourcit sans croiser le début', () => {
    const journal = mountPanel({ selectedId: 'text-1' });
    const end = grab('[data-story-track-grip="end"]');
    pointer(end, 'pointerdown', 300);
    pointer(end, 'pointermove', -500);
    pointer(end, 'pointerup', -500);
    expect(journal.timings).toEqual([{ id: 'text-1', timing: { start: 1, end: 1.05 } }]);
  });
});

describe('au clavier', () => {
  test('les flèches déplacent la piste plus tôt / plus tard', () => {
    const journal = mountPanel({ selectedId: 'text-1' });
    const track = grab('[data-story-track="text-1"]');
    act(() => {
      track.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    act(() => {
      track.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(journal.timings).toEqual([
      { id: 'text-1', timing: { start: 1.5, end: 3.5 } },
      { id: 'text-1', timing: { start: 0.5, end: 2.5 } },
    ]);
  });

  test('« Plus tôt » / « Plus tard » se touchent aussi au lecteur d’écran', () => {
    const journal = mountPanel({ selectedId: 'text-1' });
    act(() => grab('[data-story-track-later]').click());
    expect(journal.timings).toEqual([{ id: 'text-1', timing: { start: 1.5, end: 3.5 } }]);
  });
});

describe('Entre ici / Sort ici', () => {
  test('restent offerts pendant la lecture quand un objet est choisi', () => {
    mountPanel({ selectedId: 'text-1', playing: true });
    expect(container.querySelector('[data-story-timeline-enter]')).not.toBeNull();
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { HOLD_THRESHOLD_MS } from '@/lib/stories/gesture';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useStoryGestures } from './use-story-gestures';

/**
 * L'APPUI LONG N'EST PAS UN GLISSÉ (#11198) — le doigt qui part à
 * l'horizontale tourne le cube : il ne doit pas, 450 ms plus tard, figer la
 * story et masquer le chrome au milieu de la rotation. Le doigt POSÉ, lui,
 * met toujours en pause.
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

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

const noop = () => undefined;

function Stage({ journal }: { readonly journal: string[] }) {
  const gestures = useStoryGestures({
    paused: false,
    pause: () => journal.push('pause'),
    resume: () => journal.push('resume'),
    advance: (direction) => journal.push(direction),
    setChromeHidden: (hidden) => journal.push(hidden ? 'chrome-hidden' : 'chrome-shown'),
    layerOpen: false,
    swipe: { onPointerDown: noop, onPointerMove: noop, onPointerUp: noop, onPointerCancel: noop },
    dismissLayer: () => false,
  });
  return <div data-stage="" {...gestures} />;
}

async function mount(): Promise<{ stage: HTMLElement; journal: string[] }> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const journal: string[] = [];
  await act(async () => root?.render(<Stage journal={journal} />));
  const stage = container.querySelector<HTMLElement>('[data-stage]');
  if (stage === null) throw new Error('scène absente');
  return { stage, journal };
}

const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true });

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

describe('useStoryGestures — l’appui long et le glissé horizontal', () => {
  test('le doigt posé met en pause et masque le chrome', async () => {
    const { stage, journal } = await mount();
    await act(async () => stage.dispatchEvent(pointer('pointerdown', 200, 300)));
    await wait(HOLD_THRESHOLD_MS + 60);
    expect(journal).toEqual(['pause', 'chrome-hidden']);
    await act(async () => stage.dispatchEvent(pointer('pointerup', 200, 300)));
  });

  test('le doigt parti à l’horizontale ne déclenche jamais l’appui long', async () => {
    const { stage, journal } = await mount();
    await act(async () => stage.dispatchEvent(pointer('pointerdown', 200, 300)));
    await act(async () => stage.dispatchEvent(pointer('pointermove', 170, 302)));
    await wait(HOLD_THRESHOLD_MS + 60);
    expect(journal).toEqual([]);
    await act(async () => stage.dispatchEvent(pointer('pointerup', 120, 302)));
  });

  test('un glissé vertical garde son comportement d’avant', async () => {
    const { stage, journal } = await mount();
    await act(async () => stage.dispatchEvent(pointer('pointerdown', 200, 300)));
    await act(async () => stage.dispatchEvent(pointer('pointermove', 202, 340)));
    await wait(HOLD_THRESHOLD_MS + 60);
    expect(journal).toEqual(['pause', 'chrome-hidden']);
    await act(async () => stage.dispatchEvent(pointer('pointerup', 202, 340)));
  });
});

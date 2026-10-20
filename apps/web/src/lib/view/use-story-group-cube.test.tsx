import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { useViewerSwipe } from '@/components/viewer-chrome-gestures';
import { CUBE_EDGE_RESISTANCE_IN_WIDTHS, projectPoint } from '@/lib/stories/group-cube';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useStoryGroupCube, type StoryCubeNeighbours } from './use-story-group-cube';

/**
 * LE CUBE DU LECTEUR, AU DOIGT (#11198) — la scène tourne pendant le
 * glissé, la lecture est retenue le temps du geste, le relâcher décide :
 * l'auteur voisin, ou le retour à plat.
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

const WIDTH = 390;
const HEIGHT = 844;

type Journal = { readonly events: string[] };

type Setup = {
  readonly neighbours: StoryCubeNeighbours<{ readonly storyId: string }>;
  readonly rtl?: boolean;
  readonly paused?: boolean;
};

function Stage({ setup, journal }: { readonly setup: Setup; readonly journal: Journal }) {
  const cube = useStoryGroupCube({
    neighbours: setup.neighbours,
    storyId: 'current',
    rtl: setup.rtl ?? false,
    paused: setup.paused ?? false,
    pause: () => journal.events.push('pause'),
    resume: () => journal.events.push('resume'),
    onLand: (storyId) => journal.events.push(`land:${storyId}`),
  });
  const swipe = useViewerSwipe({ onDismiss: () => journal.events.push('dismiss'), horizontal: cube.horizontal });
  const measured = (element: HTMLElement | null) => {
    if (element !== null) {
      Object.defineProperty(element, 'clientWidth', { value: WIDTH, configurable: true });
      Object.defineProperty(element, 'clientHeight', { value: HEIGHT, configurable: true });
    }
    cube.faceRef(element);
  };
  return (
    <div>
      <div data-face="" ref={measured} {...swipe.handlers} />
      {cube.sides.left === null ? null : <div data-side="left" ref={cube.sideRef('left')} style={{ visibility: 'hidden' }} />}
      {cube.sides.right === null ? null : <div data-side="right" ref={cube.sideRef('right')} style={{ visibility: 'hidden' }} />}
    </div>
  );
}

async function mount(setup: Setup): Promise<{ face: HTMLElement; side: (which: 'left' | 'right') => HTMLElement | null; journal: Journal }> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const journal: Journal = { events: [] };
  await act(async () => root?.render(<Stage setup={setup} journal={journal} />));
  const face = container.querySelector<HTMLElement>('[data-face]');
  if (face === null) throw new Error('scène absente');
  return { face, side: (which) => container?.querySelector<HTMLElement>(`[data-side="${which}"]`) ?? null, journal };
}

const pointer = (type: string, x: number) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 400, pointerId: 1, pointerType: 'touch', isPrimary: true });

const frames = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

/* Le doigt se POSE avant de lever (150 ms > la fenêtre de vitesse) : seule la
   course décide, jamais un lancer né de la cadence du témoin. */
async function press(face: HTMLElement, from: number, path: readonly number[]): Promise<void> {
  await act(async () => face.dispatchEvent(pointer('pointerdown', from)));
  for (const x of path) await act(async () => face.dispatchEvent(pointer('pointermove', x)));
  await frames(150);
}

async function release(face: HTMLElement, x: number): Promise<void> {
  await act(async () => face.dispatchEvent(pointer('pointerup', x)));
}

const both = { next: { storyId: 'next-entry' }, previous: { storyId: 'previous-entry' } } as const;

describe('useStoryGroupCube — la scène tourne au doigt', () => {
  test('pendant le glissé, la scène et la face voisine tournent ; la lecture est retenue', async () => {
    const { face, side, journal } = await mount({ neighbours: both });
    await press(face, 300, [280, 200, 120]);
    expect(face.style.transform.startsWith('matrix3d(')).toBe(true);
    expect(side('right')?.style.visibility).toBe('visible');
    expect(side('left')?.style.visibility).toBe('hidden');
    expect(journal.events).toEqual(['pause']);
    await release(face, 120);
    await frames(450);
  });

  test('relâché au-delà de la moitié : l’auteur suivant, puis la scène revient à plat et la lecture reprend', async () => {
    const { face, side, journal } = await mount({ neighbours: both });
    await press(face, 350, [330, 250, 150, 100]);
    await release(face, 100);
    await frames(450);
    expect(journal.events).toEqual(['pause', 'land:next-entry', 'resume']);
    expect(face.style.transform).toBe('');
    expect(face.style.visibility).toBe('');
    expect(side('right')?.style.visibility).toBe('hidden');
  });

  test('relâché avant la moitié : le cube revient, sans changer d’auteur', async () => {
    const { face, journal } = await mount({ neighbours: both });
    await press(face, 300, [290, 250]);
    await release(face, 250);
    await frames(400);
    expect(journal.events).toEqual(['pause', 'resume']);
    expect(face.style.transform).toBe('');
  });

  test('vers la droite : l’auteur précédent', async () => {
    const { face, journal } = await mount({ neighbours: both });
    await press(face, 40, [60, 150, 280]);
    await release(face, 280);
    await frames(450);
    expect(journal.events).toEqual(['pause', 'land:previous-entry', 'resume']);
  });

  test('sans auteur suivant, la scène résiste au bord et revient', async () => {
    const { face, journal } = await mount({ neighbours: { next: null, previous: both.previous } });
    await press(face, 380, [360, 200, 40]);
    const values = face.style.transform.replace('matrix3d(', '').replace(')', '').split(',').map(Number);
    expect(values).toHaveLength(16);
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0] = values;
    const edge = projectPoint({ x: WIDTH, y: HEIGHT / 2 }, [a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p]);
    expect(edge.x).toBeLessThan(WIDTH);
    expect(edge.x).toBeGreaterThan(WIDTH * (1 - CUBE_EDGE_RESISTANCE_IN_WIDTHS));
    await release(face, 40);
    await frames(400);
    expect(journal.events).toEqual(['pause', 'resume']);
  });

  test('en écriture de droite à gauche, l’auteur suivant vient de GAUCHE', async () => {
    const { face, journal } = await mount({ neighbours: both, rtl: true });
    await press(face, 40, [60, 150, 280]);
    await release(face, 280);
    await frames(450);
    expect(journal.events).toEqual(['pause', 'land:next-entry', 'resume']);
  });

  test('une pause déjà demandée n’est ni reprise ni doublée par le glissé', async () => {
    const { face, journal } = await mount({ neighbours: both, paused: true });
    await press(face, 300, [290, 250]);
    await release(face, 250);
    await frames(400);
    expect(journal.events).toEqual([]);
  });
});

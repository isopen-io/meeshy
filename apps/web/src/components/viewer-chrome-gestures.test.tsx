import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  VIEWER_DISMISS_PX,
  VIEWER_PAGE_PX,
  VIEWER_TAP_SLOP_PX,
  resolveViewerSwipe,
  useViewerSwipe,
  type ViewerSwipeOptions,
} from './viewer-chrome-gestures';

/**
 * LE GESTE COMMUN DES VISIONNEUSES PLEIN ÉCRAN (#8879) — glisser vers le bas
 * ferme, glisser à l'horizontale change de page, un toucher qui a bougé n'est
 * pas un toucher. La loi est PURE ; le crochet la branche sur le doigt et fait
 * SUIVRE la scène pendant la fermeture.
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

describe('resolveViewerSwipe — la loi', () => {
  test('un glissé vers le BAS au-delà du seuil ferme, en deçà ne fait rien', () => {
    expect(resolveViewerSwipe({ dx: 0, dy: VIEWER_DISMISS_PX, paging: true })).toBe('dismiss');
    expect(resolveViewerSwipe({ dx: 0, dy: VIEWER_DISMISS_PX - 1, paging: true })).toBe('none');
  });

  test('un glissé vers le HAUT au-delà du seuil rend « up » — l’hôte décide (plein cadre, rien)', () => {
    expect(resolveViewerSwipe({ dx: 10, dy: -VIEWER_DISMISS_PX, paging: false })).toBe('up');
  });

  test('l’horizontale dominante pagine : vers la gauche la suivante, vers la droite la précédente', () => {
    expect(resolveViewerSwipe({ dx: -VIEWER_PAGE_PX, dy: 20, paging: true })).toBe('next');
    expect(resolveViewerSwipe({ dx: VIEWER_PAGE_PX, dy: -20, paging: true })).toBe('previous');
    expect(resolveViewerSwipe({ dx: -(VIEWER_PAGE_PX - 1), dy: 0, paging: true })).toBe('none');
  });

  test('une visionneuse sans pagination ne tourne aucune page, et un glissé horizontal ne ferme jamais', () => {
    expect(resolveViewerSwipe({ dx: -300, dy: 0, paging: false })).toBe('none');
    expect(resolveViewerSwipe({ dx: -300, dy: 160, paging: true })).toBe('next');
  });

  test('en écriture de droite à gauche, le sens de la page se retourne', () => {
    expect(resolveViewerSwipe({ dx: -VIEWER_PAGE_PX, dy: 0, paging: true, rtl: true })).toBe('previous');
    expect(resolveViewerSwipe({ dx: VIEWER_PAGE_PX, dy: 0, paging: true, rtl: true })).toBe('next');
  });
});

const pointer = (type: string, x: number, y: number, isPrimary = true) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 3, pointerType: 'touch', isPrimary });

type Probe = { wasDrag: () => boolean };

function Stage({ options, probe }: { readonly options: Omit<ViewerSwipeOptions, 'follow'>; readonly probe: Probe }) {
  const follow = useRef<HTMLDivElement | null>(null);
  const swipe = useViewerSwipe({ ...options, follow });
  probe.wasDrag = swipe.wasDrag;
  return (
    <div data-stage="" {...swipe.handlers}>
      <div ref={follow} data-follow="" />
    </div>
  );
}

async function mount(options: Omit<ViewerSwipeOptions, 'follow'>): Promise<{ stage: HTMLElement; follow: HTMLElement; probe: Probe }> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const probe: Probe = { wasDrag: () => false };
  await act(async () => root?.render(<Stage options={options} probe={probe} />));
  const stage = container.querySelector<HTMLElement>('[data-stage]');
  const follow = container.querySelector<HTMLElement>('[data-follow]');
  if (stage === null || follow === null) throw new Error('scène absente');
  return { stage, follow, probe };
}

async function drag(stage: Element, path: readonly (readonly [number, number])[], isPrimary = true): Promise<void> {
  const [first, ...rest] = path;
  if (first === undefined) return;
  await act(async () => stage.dispatchEvent(pointer('pointerdown', first[0], first[1], isPrimary)));
  for (const [x, y] of rest) await act(async () => stage.dispatchEvent(pointer('pointermove', x, y, isPrimary)));
  const last = rest[rest.length - 1] ?? first;
  await act(async () => stage.dispatchEvent(pointer('pointerup', last[0], last[1], isPrimary)));
}

describe('useViewerSwipe — le doigt', () => {
  test('la scène SUIT le doigt vers le bas, puis la visionneuse se ferme au relâcher', async () => {
    const journal: string[] = [];
    const { stage, follow } = await mount({ onDismiss: () => journal.push('dismiss') });
    await act(async () => stage.dispatchEvent(pointer('pointerdown', 100, 100)));
    await act(async () => stage.dispatchEvent(pointer('pointermove', 102, 190)));
    expect(follow.style.transform).toBe('translateY(90px)');
    await act(async () => stage.dispatchEvent(pointer('pointermove', 104, 280)));
    await act(async () => stage.dispatchEvent(pointer('pointerup', 104, 280)));
    expect(journal).toEqual(['dismiss']);
    expect(follow.style.transform).toBe('');
  });

  test('un glissé trop court revient en place sans fermer', async () => {
    const journal: string[] = [];
    const { stage, follow } = await mount({ onDismiss: () => journal.push('dismiss') });
    await drag(stage, [
      [100, 100],
      [100, 180],
    ]);
    expect(journal).toEqual([]);
    expect(follow.style.transform).toBe('');
  });

  test('un glissé horizontal tourne la page — et ne fait jamais descendre la scène', async () => {
    const journal: string[] = [];
    const { stage, follow } = await mount({
      onDismiss: () => journal.push('dismiss'),
      onNext: () => journal.push('next'),
      onPrevious: () => journal.push('previous'),
    });
    await act(async () => stage.dispatchEvent(pointer('pointerdown', 300, 100)));
    await act(async () => stage.dispatchEvent(pointer('pointermove', 200, 130)));
    expect(follow.style.transform).toBe('');
    await act(async () => stage.dispatchEvent(pointer('pointerup', 200, 130)));
    await drag(stage, [
      [100, 100],
      [220, 100],
    ]);
    expect(journal).toEqual(['next', 'previous']);
  });

  test('un glissé vers le haut remet « up » à l’hôte qui l’écoute', async () => {
    const journal: string[] = [];
    const { stage } = await mount({ onDismiss: () => journal.push('dismiss'), onUp: () => journal.push('up') });
    await drag(stage, [
      [100, 400],
      [100, 200],
    ]);
    expect(journal).toEqual(['up']);
  });

  test('« wasDrag » départage le toucher du glissé, et reste lisible au clic qui suit le relâcher', async () => {
    const { stage, probe } = await mount({ onDismiss: () => undefined });
    await drag(stage, [
      [100, 100],
      [100 + VIEWER_TAP_SLOP_PX - 1, 100],
    ]);
    expect(probe.wasDrag()).toBe(false);
    await drag(stage, [
      [100, 100],
      [100, 100 + VIEWER_TAP_SLOP_PX + 1],
    ]);
    expect(probe.wasDrag()).toBe(true);
  });

  test('un second doigt (pincement) et une visionneuse désactivée n’arment rien', async () => {
    const journal: string[] = [];
    const secondary = await mount({ onDismiss: () => journal.push('dismiss') });
    await drag(
      secondary.stage,
      [
        [100, 100],
        [100, 400],
      ],
      false,
    );
    expect(journal).toEqual([]);
    await act(async () => root?.unmount());
    root = undefined;
    const disabled = await mount({ onDismiss: () => journal.push('dismiss'), enabled: false });
    await drag(disabled.stage, [
      [100, 100],
      [100, 400],
    ]);
    expect(journal).toEqual([]);
  });

  test('un geste annulé par le système remet la scène en place sans rien décider', async () => {
    const journal: string[] = [];
    const { stage, follow } = await mount({ onDismiss: () => journal.push('dismiss') });
    await act(async () => stage.dispatchEvent(pointer('pointerdown', 100, 100)));
    await act(async () => stage.dispatchEvent(pointer('pointermove', 100, 400)));
    await act(async () => stage.dispatchEvent(pointer('pointercancel', 100, 400)));
    expect(journal).toEqual([]);
    expect(follow.style.transform).toBe('');
  });
});

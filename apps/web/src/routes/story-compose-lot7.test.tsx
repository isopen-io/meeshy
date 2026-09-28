import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { flush, harness, mount, publishButton, registerStudioBench, typeText } from '@/test-support/story-studio-bench';

/**
 * LOT 7 DU COMPOSER PLEIN ÉCRAN (#8482, retour porteur du 2026-09-28, déjà
 * livré sur iOS par #8473) — au DOM : la frise dont les pistes se glissent et
 * s'étirent, le texte du post qui suit le format ARMÉ, et l'édition d'un
 * composant qui ne touche que lui. La géométrie (marges de la scène, plaques
 * bornées à l'écran) est gardée au navigateur par `check-story-studio.mjs`.
 */

registerStudioBench();

const click = (element: Element | null) => {
  if (element === null) throw new Error('élément absent');
  act(() => (element as HTMLElement).click());
};

const LANE = { left: 0, top: 0, width: 100, height: 28, right: 100, bottom: 28, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;

const pointer = (target: Element, type: string, clientX: number) =>
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX, pointerId: 1 }));
  });

/** Glisse `target` de `from` à `to` (px d'une voie de 100 px, scène de 6 s). */
const drag = (target: Element, from: number, to: number) => {
  pointer(target, 'pointerdown', from);
  pointer(target, 'pointermove', to);
  pointer(target, 'pointerup', to);
};

const windowOf = (el: HTMLElement, id: string) => {
  const lane = el.querySelector(`[data-story-track="${id}"]`);
  return [Number(lane?.getAttribute('data-story-track-start')), Number(lane?.getAttribute('data-story-track-end'))];
};

async function openFrise(el: HTMLElement) {
  click(el.querySelector('[data-story-animated]'));
  await flush(() => el.querySelector('[data-story-track]') !== null);
  el.querySelectorAll<HTMLElement>('[data-story-track]').forEach((lane) => {
    lane.getBoundingClientRect = () => LANE;
  });
}

describe('la frise : une piste se choisit, se glisse et s’étire (#8482)', () => {
  test('pendant la LECTURE, toucher la barre choisit la piste, et « Entre ici » / « Sort ici » restent là', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Un');
    click(el.querySelector('[data-story-option="add-text"]'));
    typeText(el, 'Deux');
    await openFrise(el);
    expect(el.querySelector('[data-story-timeline-play]')?.getAttribute('data-story-timeline-play')).toBe('playing');
    const bar = el.querySelector('[data-story-track-bar="text-1"]')!;
    pointer(bar, 'pointerdown', 10);
    pointer(bar, 'pointerup', 10);
    expect(bar.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-story-timeline-enter]')).not.toBeNull();
    expect(el.querySelector('[data-story-timeline-exit]')).not.toBeNull();
  });

  test('les deux ancres ne paraissent QUE sur la piste choisie, saisies sur 28 px', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Un');
    click(el.querySelector('[data-story-option="add-text"]'));
    typeText(el, 'Deux');
    await openFrise(el);
    const handles = [...el.querySelectorAll<HTMLElement>('[data-story-track-handle]')];
    expect(handles.map((handle) => handle.getAttribute('data-story-track-handle'))).toEqual(['start', 'end']);
    expect(handles.every((handle) => handle.closest('[data-story-track]')?.getAttribute('data-story-track') === 'text-2')).toBe(true);
    expect(handles.every((handle) => handle.style.width === '28px')).toBe(true);
  });

  test('l’ancre de fin raccourcit, la barre DÉPLACE durée gardée — et la fenêtre PART', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Bonjour');
    await openFrise(el);
    drag(el.querySelector('[data-story-track-handle="end"]')!, 100, 50);
    expect(windowOf(el, 'text-1')).toEqual([0, 3]);
    drag(el.querySelector('[data-story-track-bar="text-1"]')!, 20, 45);
    expect(windowOf(el, 'text-1')).toEqual([1.5, 4.5]);
    drag(el.querySelector('[data-story-track-bar="text-1"]')!, 20, 200);
    expect(windowOf(el, 'text-1')).toEqual([3, 6]);
    drag(el.querySelector('[data-story-track-handle="start"]')!, 50, 100);
    expect(windowOf(el, 'text-1')).toEqual([5.7, 6]);
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    const scene = (bench.posts[0]?.storyEffects as { scenes: { objects: { kind: string; timing?: unknown }[] }[] }).scenes[0]!;
    expect(scene.objects.find((object) => object.kind === 'text')?.timing).toEqual({ start: 5.7, end: 6 });
  });

  test('le clavier : flèches sur une ancre ou la barre, 0,1 s par pas', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Bonjour');
    await openFrise(el);
    const start = el.querySelector('[data-story-track-handle="start"]')!;
    act(() => {
      start.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(windowOf(el, 'text-1')).toEqual([0.1, 6]);
    const bar = el.querySelector('[data-story-track-bar="text-1"]')!;
    act(() => {
      bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, shiftKey: true }));
    });
    expect(windowOf(el, 'text-1')).toEqual([0, 5.9]);
  });

  test('un glisser est UN pas d’historique', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Bonjour');
    await openFrise(el);
    const end = el.querySelector('[data-story-track-handle="end"]')!;
    pointer(end, 'pointerdown', 100);
    pointer(end, 'pointermove', 80);
    pointer(end, 'pointermove', 50);
    pointer(end, 'pointerup', 50);
    expect(windowOf(el, 'text-1')).toEqual([0, 3]);
    click(el.querySelector('[data-story-animated]'));
    click(el.querySelector('[data-story-option="undo"]'));
    await openFrise(el);
    expect(windowOf(el, 'text-1')).toEqual([0, 6]);
  });
});

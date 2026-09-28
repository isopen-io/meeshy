import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import { VIEWER_ID, flush, harness, mount, onePageSnapshot, publishButton, registerStudioBench, typeText } from '@/test-support/story-studio-bench';

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

describe('le texte du post suit le format ARMÉ au chevron (#8482)', () => {
  const arm = (el: HTMLElement, kind: 'STORY' | 'POST') => {
    click(el.querySelector('[data-publish-kind-toggle]'));
    click(document.querySelector(`[data-publish-kind-choice="${kind}"]`));
  };

  test('une story qui arme « Post » peint le bouton ; réarmer la story le retire', async () => {
    const bench = harness({});
    const el = mount(bench.deps, 'STORY');
    typeText(el, 'Sur la scène');
    expect(el.querySelector('[data-story-post-text]')).toBeNull();
    arm(el, 'POST');
    await flush();
    expect(bench.posts).toHaveLength(0);
    expect(el.querySelector('[data-story-post-text]')).not.toBeNull();
    arm(el, 'STORY');
    await flush();
    expect(el.querySelector('[data-story-post-text]')).toBeNull();
  });

  test('son éditeur MONTE du bas dans un cadre de verre, et le texte PART avec la scène', async () => {
    const bench = harness({});
    const el = mount(bench.deps, 'STORY');
    typeText(el, 'Sur la scène');
    arm(el, 'POST');
    await flush();
    click(el.querySelector('[data-story-post-text]'));
    await flush(() => el.querySelector('[data-story-post-text-plaque]') !== null);
    const plaque = el.querySelector<HTMLElement>('[data-story-post-text-plaque]')!;
    expect(plaque.closest('[data-story-studio-bottom]')).not.toBeNull();
    expect(plaque.className.split(' ')).toContain('glass');
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(el.querySelector('[data-story-socle-row]')?.className).toContain('max-md:hidden');
    const field = plaque.querySelector<HTMLTextAreaElement>('#story-studio-post-text')!;
    act(() => {
      field.value = 'Le corps du post';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(plaque.querySelector('[data-story-post-text-done]'));
    expect(el.querySelector('[data-story-post-text-plaque]')).toBeNull();
    expect(el.querySelector('[data-story-post-text]')?.getAttribute('data-story-post-text')).toBe('written');
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    expect(bench.posts[0]?.type).toBe('POST');
    expect(bench.posts[0]?.content).toBe('Le corps du post');
  });
});

describe('éditer un composant ne touche QUE lui (#8482)', () => {
  const POSE = { x: 0.3, y: 0.7, scale: 1, rotation: 0 };
  const TEXT = (id: string, text: string) => ({ id, text, language: 'fr', style: 'bold' as const, effect: 'none' as const, color: 'FFFFFF', align: 'center' as const, pose: { x: 0.5, y: 0.5, scale: 1, rotation: 0 } });

  /** Une scène à QUATRE composants : un fond, un calque, deux textes. */
  function scene() {
    const drafts = createStudioDraftStore(null);
    drafts.set(
      VIEWER_ID,
      onePageSnapshot({
        texts: [TEXT('text-1', 'Un'), TEXT('text-2', 'Deux')],
        background: { postMediaId: 'pm-bg', fileUrl: '2026/09/u/bg.jpg', mediaType: 'image', aspectRatio: 4 / 3 },
        overlay: { postMediaId: 'pm-ov', fileUrl: '2026/09/u/ov.jpg', mediaType: 'image', aspectRatio: 1, pose: POSE },
      }),
    );
    const bench = harness({ drafts });
    return { bench, el: mount(bench.deps) };
  }

  type Scene = { objects: { id: string; kind: string }[] };
  const published = async (bench: ReturnType<typeof harness>, el: HTMLElement) => {
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    return (bench.posts[0]?.storyEffects as { scenes: Scene[] }).scenes[0]!;
  };
  /** Ce que la même scène publie SANS aucune retouche — la référence. */
  const untouched = () => {
    const probe = scene();
    return published(probe.bench, probe.el);
  };
  /** Chaque composant publié, par identité : les AUTRES doivent rester identiques. */
  const others = (published: Scene, id: string) => published.objects.filter((object) => object.id !== id);
  const one = (published: Scene, id: string) => published.objects.find((object) => object.id === id);

  test('l’éditeur du calque ne montre QUE ses outils — aucun outil de texte', async () => {
    const { el } = scene();
    click(el.querySelector('[data-story-object-edit="overlay"]'));
    await flush(() => el.querySelector('[data-story-edit-plaque] [data-story-overlay-editor]') !== null);
    const plaque = el.querySelector('[data-story-edit-plaque]')!;
    expect(plaque.querySelector('[data-story-object-editor]')).toBeNull();
    expect(plaque.querySelector('[data-story-option^="style:"], [data-story-option^="color:"]')).toBeNull();
    expect(el.querySelector('[data-story-frame-panel]')).toBeNull();
    // Ni l'invite « Ajouter du texte » sur un calque : la saisie de texte n'a rien à dire d'une image.
    expect(el.querySelector('#story-studio-text')?.getAttribute('placeholder') ?? null).toBeNull();
    // Le Cadre règle le FOND : il ne s'offre pas pendant qu'on édite le calque.
    expect(el.querySelector('[data-story-option="frame"]') === null).toBe(true);
    click(el.querySelector('[data-story-edit-done]'));
    expect(el.querySelector('[data-story-option="frame"]') !== null).toBe(true);
  });

  test('agrandir et légender le calque laisse le fond et les textes intacts', async () => {
    const reference = await untouched();
    const { bench, el } = scene();
    click(el.querySelector('[data-story-object-edit="overlay"]'));
    await flush(() => el.querySelector('[data-story-overlay-editor]') !== null);
    click(el.querySelector('[data-story-edit-plaque] [data-story-option="pose:bigger"]'));
    const caption = el.querySelector<HTMLInputElement>('#story-studio-caption-overlay')!;
    act(() => {
      caption.value = 'Le calque';
      caption.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const after = await published(bench, el);
    expect(others(after, 'overlay')).toEqual(others(reference, 'overlay'));
    expect(one(after, 'overlay')).not.toEqual(one(reference, 'overlay'));
  });

  test('le Cadre du FOND ne touche ni le calque ni les textes', async () => {
    const reference = await untouched();
    const { bench, el } = scene();
    click(el.querySelector('[data-story-option="frame"]'));
    await flush(() => el.querySelector('[data-story-frame-option="fill"]') !== null);
    click(el.querySelector('[data-story-frame-option="fill"]'));
    const after = await published(bench, el);
    expect(others(after, 'background')).toEqual(others(reference, 'background'));
    expect(one(after, 'background')).not.toEqual(one(reference, 'background'));
  });

  test('le style d’un texte ne s’applique qu’à LUI', async () => {
    const reference = await untouched();
    const { bench, el } = scene();
    click(el.querySelector('[data-story-object-edit="text-2"]'));
    await flush(() => el.querySelector('[data-story-object-editor="text-2"]') !== null);
    click(el.querySelector('[data-story-edit-plaque] [data-story-option="style:neon"]'));
    const after = await published(bench, el);
    expect(others(after, 'text-2')).toEqual(others(reference, 'text-2'));
    expect(JSON.stringify(one(after, 'text-2'))).toContain('neon');
  });
});

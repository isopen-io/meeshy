import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import {
  VIEWER_ID,
  fakeRect,
  flush,
  harness,
  mount,
  onePageSnapshot,
  publishButton,
  registerStudioBench,
  tapInvite,
  tapStageAt,
  typeText,
} from '@/test-support/story-studio-bench';

/**
 * **ON ÉCRIT SUR LA SCÈNE AU DOIGT ET À LA SOURIS** (#8515, BLOQUANT) — le
 * calque des gestes couvre la saisie : seule la touche Tab ×10 y arrivait.
 * Ces témoins passent par le calque, comme le doigt ; ils ne remplissent
 * jamais le champ directement.
 */

registerStudioBench();

const click = (element: Element | null) => {
  if (element === null) throw new Error('élément absent');
  act(() => (element as HTMLElement).click());
};

const field = (el: ParentNode) => el.querySelector<HTMLTextAreaElement>('#story-studio-text');

/** Pose une boîte peinte sur l'objet `id` — `happy-dom` ne peint rien. */
const paint = (el: ParentNode, id: string, box = { top: 10, left: 10, width: 100, height: 40 }) => {
  const painted = el.querySelector<HTMLElement>(`[data-scene-object-id="${id}"]`);
  if (painted === null) throw new Error(`objet ${id} non peint`);
  painted.getBoundingClientRect = () => fakeRect(box);
};

describe('l’invite « Écrivez… » s’écrit au doigt', () => {
  test('toucher l’invite d’une scène neuve donne le focus à la saisie : le clavier écrit, le texte paraît sur la scène', async () => {
    const el = mount(harness({}).deps);
    expect(document.activeElement).not.toBe(field(el));
    tapInvite(el);
    expect(document.activeElement).toBe(field(el));
    typeText(el, 'Au doigt');
    await flush(() => el.querySelector('[data-scene-text]')?.textContent === 'Au doigt');
    expect(el.querySelector('[data-scene-text]')?.textContent).toBe('Au doigt');
  });

  test('« T+ » pose un texte ET ouvre sa saisie : on tape aussitôt', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Un');
    click(el.querySelector('[data-story-option="add-text"]'));
    expect(document.activeElement).toBe(field(el));
    expect(field(el)?.dataset.storyTextTarget).toBe('text-2');
    typeText(el, 'Deux');
    await flush(() => el.querySelectorAll('[data-scene-text]').length === 2);
    expect([...el.querySelectorAll('[data-scene-text]')].map((node) => node.textContent)).toEqual(['Un', 'Deux']);
  });
});

describe('toucher le vide désélectionne', () => {
  test('hors de tout objet, le toucher ferme l’édition et retire la sélection', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Sélectionné');
    await flush(() => el.querySelector('[data-scene-object-id="text-1"]') !== null);
    expect(el.querySelector('[data-story-edit-plaque]')).not.toBeNull();
    paint(el, 'text-1');
    tapStageAt(el, { clientX: 300, clientY: 500 });
    expect(el.querySelector('[data-story-edit-plaque]')).toBeNull();
    // Rien de sélectionné et la page déjà écrite : aucune invite ne recouvre la scène.
    expect(field(el)).toBeNull();
    // Le texte reste, il n'est que désélectionné.
    expect(el.querySelector('[data-scene-text]')?.textContent).toBe('Sélectionné');
  });
});

describe('« Sortir de la scène » n’existe plus (absent d’iOS, il supprimait le média)', () => {
  test('le menu du calque d’un POST offre Modifier et Retirer, rien d’autre', async () => {
    const drafts = createStudioDraftStore(null);
    drafts.set(VIEWER_ID, onePageSnapshot({ texts: [], overlay: { postMediaId: 'pm-ov', fileUrl: '2026/09/u/ov.jpg', mediaType: 'image', aspectRatio: 1 } }));
    const el = mount(harness({ drafts }).deps, 'POST');
    await flush(() => el.querySelector('[data-scene-object-id="overlay"]') !== null);
    paint(el, 'overlay');
    const layer = el.querySelector<HTMLElement>('[data-story-stage-gestures]')!;
    act(() => layer.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 30 })));
    await flush(() => document.querySelector('[data-story-object-menu]') !== null);
    const actions = [...document.querySelectorAll('[data-story-object-menu] [data-story-object-action]')];
    expect(actions.map((action) => action.getAttribute('data-story-object-action'))).toEqual(['edit', 'remove']);
    expect(document.querySelector('[data-story-object-menu]')?.textContent).not.toContain('Sortir');
  });
});

describe('deux doigts pincent et tournent un objet (miroir iOS)', () => {
  test('écarter du double agrandit du double ; tourner de 90° tourne de 45° ; le document publié le porte', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Pincé');
    click(el.querySelector('[data-story-edit-done]'));
    await flush(() => el.querySelector('[data-scene-object-id="text-1"]') !== null);
    paint(el, 'text-1', { top: 0, left: 0, width: 200, height: 200 });
    const layer = el.querySelector<HTMLElement>('[data-story-stage-gestures]')!;
    layer.setPointerCapture = () => undefined;
    const finger = (type: string, pointerId: number, clientX: number, clientY: number) =>
      act(() => layer.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId, clientX, clientY })));
    finger('pointerdown', 1, 50, 100);
    finger('pointerdown', 2, 150, 100);
    finger('pointermove', 1, 100, 0);
    finger('pointermove', 2, 100, 200);
    finger('pointerup', 2, 100, 200);
    finger('pointerup', 1, 100, 0);
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    const scene = (bench.posts[0]?.storyEffects as { scenes: { objects: { kind: string; transform?: { scale?: number; rotation?: number } }[] }[] }).scenes[0]!;
    const transform = scene.objects.find((object) => object.kind === 'text')?.transform;
    expect(transform?.scale).toBeCloseTo(2, 6);
    expect(transform?.rotation).toBeCloseTo(45, 6);
  });
});

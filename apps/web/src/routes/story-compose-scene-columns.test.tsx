import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import type { StudioMediaKind } from '@/lib/stories/story-document';
import { VIEWER_ID, fakeRect, flush, harness, mount, onePageSnapshot, publishButton, registerStudioBench, tapStageAt } from '@/test-support/story-studio-bench';

/**
 * **LES COLONNES DE LA SCÈNE, AU DOM** (#8715, #8794 — jumelles web de
 * #8712–#8717 et #8792) : ce que la colonne droite montre selon ce qu'on
 * touche, le carrousel d'effets qui prend la place de l'audience et de
 * Publier, la répétition des transitions, et les menus d'appui long.
 */

registerStudioBench();

const click = (element: Element | null) => {
  if (element === null) throw new Error('élément absent');
  act(() => (element as HTMLElement).click());
};

const trailing = (el: ParentNode) =>
  [...el.querySelectorAll('[data-story-studio-rail="trailing"] [data-story-option]')].map((tile) => tile.getAttribute('data-story-option'));

type Seed = { readonly background?: StudioMediaKind; readonly overlay?: boolean };

/** Un brouillon SEMÉ de médias déjà prêts — ni montée, ni attente. */
function seeded({ background, overlay = false }: Seed) {
  const drafts = createStudioDraftStore(null);
  drafts.set(
    VIEWER_ID,
    onePageSnapshot({
      texts: [],
      ...(background !== undefined
        ? { background: { postMediaId: 'pm-bg', fileUrl: `2026/09/u/bg.${background === 'video' ? 'mp4' : 'jpg'}`, mediaType: background, aspectRatio: 9 / 16, durationMs: 8000 } }
        : {}),
      ...(overlay ? { overlay: { postMediaId: 'pm-ov', fileUrl: '2026/09/u/ov.jpg', mediaType: 'image', aspectRatio: 1 } } : {}),
    }),
  );
  return harness({ drafts });
}

/** Le FOND peint par le moteur — il n'est pas un objet saisissable, il se
 * reconnaît à son image. */
const backgroundImage = (el: ParentNode) =>
  [...el.querySelectorAll<HTMLImageElement>('[data-scene-stage] img')].find((img) => (img.getAttribute('src') ?? '').includes('bg.jpg')) ?? null;

const paint = (el: ParentNode, id: string) => {
  const painted = el.querySelector<HTMLElement>(`[data-scene-object-id="${id}"]`);
  if (painted === null) throw new Error(`objet ${id} non peint`);
  painted.getBoundingClientRect = () => fakeRect({ top: 10, left: 10, width: 100, height: 40 });
};

type Published = { storyEffects?: { scenes: { opening?: unknown; closing?: unknown; objects: { id: string; kind: string; payload: Record<string, unknown> }[] }[] } };
const sceneOf = (post: unknown) => (post as Published).storyEffects!.scenes[0]!;

describe('une scène à fond IMAGE : les effets à droite, le carrousel à la place du socle (#8712, #8792)', () => {
  test('deux familles en haut de la colonne, l’historique en bas ; toucher « Effet visuel » remplace audience et Publier par son carrousel', async () => {
    const el = mount(seeded({ background: 'image' }).deps, 'POST');
    await flush(() => el.querySelector('[data-story-option="effect:visual"]') !== null);
    expect(trailing(el)).toEqual(['effect:opening', 'effect:visual']);
    expect(el.querySelector('[data-story-socle-row]')).not.toBeNull();
    click(el.querySelector('[data-story-option="effect:visual"]'));
    await flush(() => el.querySelector('[data-story-effect-carousel="visual"]') !== null);
    expect(el.querySelector('[data-story-option="effect:visual"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-story-socle-row]')).toBeNull();
    expect(publishButton(el)).toBeNull();
    // « Aucun » puis les huit filtres, chacun peint sur le fond RÉEL.
    const tiles = [...el.querySelectorAll('[data-story-visual-effects] [data-story-option]')];
    expect(tiles.map((tile) => tile.getAttribute('data-story-option'))).toEqual([
      'filter:none', 'filter:vintage', 'filter:bw', 'filter:warm', 'filter:cool', 'filter:dramatic', 'filter:vivid', 'filter:fade', 'filter:chrome',
    ]);
    await flush(() => el.querySelector('[data-story-visual-effects] img') !== null);
    expect(el.querySelector<HTMLImageElement>('[data-story-option="filter:bw"] img')?.style.filter).toContain('grayscale');
    click(el.querySelector('[data-story-effect-close]'));
    expect(el.querySelector('[data-story-effect-carousel]')).toBeNull();
    expect(publishButton(el)).not.toBeNull();
  });

  test('choisir un effet visuel met la scène à jour EN DIRECT, et il part avec le fond', async () => {
    const bench = seeded({ background: 'image' });
    const el = mount(bench.deps, 'POST');
    await flush(() => el.querySelector('[data-story-option="effect:visual"]') !== null);
    click(el.querySelector('[data-story-option="effect:visual"]'));
    await flush(() => el.querySelector('[data-story-option="filter:bw"]') !== null);
    click(el.querySelector('[data-story-option="filter:bw"]'));
    await flush(() => el.querySelector('[data-story-option="filter:bw"]')?.getAttribute('aria-pressed') === 'true');
    const filtered = () => [...el.querySelectorAll<HTMLImageElement>('[data-scene-stage] img')].some((img) => (img.getAttribute('src') ?? '').includes('bg.jpg') && img.style.filter.includes('grayscale'));
    await flush(filtered);
    expect(filtered()).toBe(true);
    click(el.querySelector('[data-story-effect-close]'));
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    expect(sceneOf(bench.posts[0]).objects.find((object) => object.id === 'background')?.payload.filter).toBe('bw');
  });

  test('l’effet d’ouverture porte deux rangées ; chaque choix REJOUE l’ouverture puis la fermeture, et part dans le document', async () => {
    const bench = seeded({ background: 'image' });
    const el = mount(bench.deps, 'POST');
    await flush(() => el.querySelector('[data-story-option="effect:opening"]') !== null);
    const stage = el.querySelector<HTMLElement>('[data-scene-stage]')!;
    const played: string[] = [];
    stage.animate = ((frames: Keyframe[]) => {
      played.push(JSON.stringify(frames[0]));
      return { cancel: () => undefined } as unknown as Animation;
    }) as HTMLElement['animate'];
    click(el.querySelector('[data-story-option="effect:opening"]'));
    await flush(() => el.querySelector('[data-story-transition-row="closing"]') !== null);
    // Une fermeture seule : la pause, puis la fermeture.
    click(el.querySelector('[data-story-option="closing:fade"]'));
    expect(played).toEqual([]);
    await flush(() => played.length === 1);
    expect(played).toEqual([JSON.stringify({ opacity: 1 })]);
    // Une ouverture ajoutée : elle se rejoue AUSSITÔT, la fermeture suivra.
    click(el.querySelector('[data-story-option="opening:zoom"]'));
    expect(played[1]).toBe(JSON.stringify({ transform: 'scale(1.08)' }));
    expect(el.querySelector('[data-story-option="opening:zoom"]')?.getAttribute('aria-pressed')).toBe('true');
    click(el.querySelector('[data-story-effect-close]'));
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    const scene = sceneOf(bench.posts[0]);
    expect([scene.opening, scene.closing]).toEqual([{ type: 'zoom' }, { type: 'fade' }]);
  });

  test('un fond VIDÉO n’a pas d’effet visuel (#8798) ; sans fond média, aucune colonne d’effets', async () => {
    const video = mount(seeded({ background: 'video' }).deps, 'STORY');
    await flush(() => video.querySelector('[data-story-option="effect:opening"]') !== null);
    expect(trailing(video)).toEqual(['effect:opening']);
    const blank = mount(seeded({}).deps, 'STORY');
    await flush();
    expect(blank.querySelector('[data-story-option^="effect:"]')).toBeNull();
  });
});

describe('toucher un objet : ses options à droite depuis le haut, terminées par (x) (#8714)', () => {
  test('le calque touché : Modifier, Remplacer le fond, Retirer, puis (x) ; (x) rend les effets de la scène', async () => {
    const el = mount(seeded({ background: 'image', overlay: true }).deps, 'POST');
    await flush(() => el.querySelector('[data-scene-object-id="overlay"]') !== null);
    paint(el, 'overlay');
    tapStageAt(el, { clientX: 50, clientY: 30 });
    await flush(() => el.querySelector('[data-story-option="deselect"]') !== null);
    expect(trailing(el)).toEqual(['object:edit', 'object:replace-background', 'object:remove', 'deselect']);
    expect(el.querySelector('[data-story-trailing-options]')?.getAttribute('aria-label')).toBe('Options de Calque');
    click(el.querySelector('[data-story-option="deselect"]'));
    expect(trailing(el)).toEqual(['effect:opening', 'effect:visual']);
  });

  test('« Remplacer le fond » : le calque devient le fond, l’ancien part — d’un seul geste qu’Annuler défait', async () => {
    const bench = seeded({ background: 'image', overlay: true });
    const el = mount(bench.deps, 'POST');
    await flush(() => el.querySelector('[data-scene-object-id="overlay"]') !== null);
    paint(el, 'overlay');
    tapStageAt(el, { clientX: 50, clientY: 30 });
    await flush(() => el.querySelector('[data-story-option="object:replace-background"]') !== null);
    click(el.querySelector('[data-story-option="object:replace-background"]'));
    await flush(() => el.querySelector('[data-scene-object-id="overlay"]') === null);
    click(el.querySelector('[data-story-option="undo"]'));
    await flush(() => el.querySelector('[data-scene-object-id="overlay"]') !== null);
    click(el.querySelector('[data-story-option="redo"]'));
    await flush(() => el.querySelector('[data-scene-object-id="overlay"]') === null);
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    const objects = sceneOf(bench.posts[0]).objects;
    expect(objects.find((object) => object.id === 'background')?.payload.postMediaId).toBe('pm-ov');
    expect(objects.some((object) => object.id === 'overlay')).toBe(false);
  });
});

describe('l’appui long sur le FOND ouvre son menu de verre (#8716, #8717)', () => {
  const openBackgroundMenu = async (el: HTMLElement) => {
    const layer = el.querySelector<HTMLElement>('[data-story-stage-gestures]')!;
    act(() => layer.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 400 })));
    await flush(() => document.querySelector('[data-story-object-menu]') !== null);
  };
  const entries = () => [...document.querySelectorAll('[data-story-object-menu] [data-story-object-action]')].map((entry) => entry.getAttribute('data-story-object-action'));

  test('un en-tête, puis Modifier, Reprendre une photo, Passer au premier plan, Retirer ; en verre', async () => {
    const el = mount(seeded({ background: 'image' }).deps, 'POST');
    await flush(() => backgroundImage(el) !== null);
    await openBackgroundMenu(el);
    expect(entries()).toEqual(['edit', 'retake', 'forward', 'remove']);
    expect(document.querySelector('[data-story-object-menu]')?.textContent).toContain('Fond de la scène');
    expect(document.querySelector('[data-story-object-menu]')?.className.split(' ')).toContain('glass-prominent');
    expect(document.querySelector('[data-story-object-action="remove"]')?.getAttribute('style')).toContain('var(--color-error)');
  });

  test('le clavier y arrive aussi : un bouton nommé « Fond de la scène » ouvre le même menu', async () => {
    const el = mount(seeded({ background: 'image' }).deps, 'POST');
    await flush(() => el.querySelector('[data-story-background-menu]') !== null);
    expect(el.querySelector('[data-story-background-menu]')?.textContent).toBe('Fond de la scène');
    click(el.querySelector('[data-story-background-menu]'));
    await flush(() => document.querySelector('[data-story-object-menu]') !== null);
    expect(entries()).toEqual(['edit', 'retake', 'forward', 'remove']);
  });

  test('« Reprendre une photo » ouvre le viseur ARMÉ ; le refermer laisse le fond intact', async () => {
    const el = mount(seeded({ background: 'image' }).deps, 'POST');
    await flush(() => backgroundImage(el) !== null);
    await openBackgroundMenu(el);
    click(document.querySelector('[data-story-object-action="retake"]'));
    await flush(() => document.querySelector('[data-story-camera]') !== null);
    click(document.querySelector('[data-story-camera-close]'));
    await flush(() => document.querySelector('[data-story-camera]') === null);
    expect(backgroundImage(el)).not.toBeNull();
  });

  test('« Passer au premier plan » : le fond devient le calque', async () => {
    const el = mount(seeded({ background: 'image' }).deps, 'POST');
    await flush(() => backgroundImage(el) !== null);
    await openBackgroundMenu(el);
    click(document.querySelector('[data-story-object-action="forward"]'));
    await flush(() => el.querySelector('[data-scene-object-id="overlay"]') !== null);
    expect(el.querySelector('[data-scene-object-id="overlay"] img')?.getAttribute('src')).toContain('bg.jpg');
  });

  test('un réel n’offre pas « Reprendre une photo » ; un calque posé ferme le premier plan', async () => {
    const el = mount(seeded({ background: 'video', overlay: true }).deps, 'REEL');
    await flush(() => backgroundImage(el) !== null);
    await openBackgroundMenu(el);
    expect(entries()).toEqual(['edit', 'remove']);
  });
});

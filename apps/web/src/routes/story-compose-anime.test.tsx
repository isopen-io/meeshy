import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { flush, harness, image, mount, publishButton, registerStudioBench, selectFile, typeText } from '@/test-support/story-studio-bench';

/**
 * **ÉTEINDRE ANIMÉ REND LA SCÈNE STATIQUE, LA FRISE SE RANGE PAR « TEMPS »**
 * (#8516, miroir `MeeshyComposerHost+Animated.swift` et
 * `ComposerTrailingRail.swift`) — au DOM : ce qui part, ce que le rail droit
 * montre et dans quel ordre, ce qui reste frise ouverte.
 */

registerStudioBench();

const click = (element: Element | null) => {
  if (element === null) throw new Error('élément absent');
  act(() => (element as HTMLElement).click());
};

const trailing = (el: ParentNode) =>
  [...el.querySelectorAll('[data-story-studio-rail="trailing"] [data-story-option]')].map((tile) => tile.getAttribute('data-story-option'));

type PublishedScene = { timelineDuration?: number; objects: { kind: string; timing?: unknown }[] };
const sceneOf = (post: Record<string, unknown> | undefined): PublishedScene => (post?.storyEffects as { scenes: PublishedScene[] }).scenes[0]!;

describe('éteindre Animé rend la scène STATIQUE', () => {
  test('allumer puis éteindre : la pastille retombe, et rien d’animé ne part (ni durée, ni fenêtre)', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Bonjour');
    click(el.querySelector('[data-story-edit-done]'));
    click(el.querySelector('[data-story-animated]'));
    await flush(() => el.querySelector('[data-story-timeline]') !== null);
    click(el.querySelector('[data-story-animated]'));
    expect(el.querySelector('[data-story-animated]')?.getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector('[data-story-timeline]')).toBeNull();
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    const scene = sceneOf(bench.posts[0]);
    expect(scene.timelineDuration).toBeUndefined();
    expect(scene.objects.find((object) => object.kind === 'text')?.timing).toBeUndefined();
  });
});

describe('la tuile Temps range la frise d’une scène qui RESTE animée', () => {
  test('absente d’une scène statique ; frise ouverte, elle est la SEULE tuile du rail droit ; la toucher range la frise sans éteindre Animé', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Bonjour');
    click(el.querySelector('[data-story-edit-done]'));
    expect(el.querySelector('[data-story-option="time"]')).toBeNull();
    click(el.querySelector('[data-story-animated]'));
    await flush(() => el.querySelector('[data-story-timeline]') !== null);
    expect(trailing(el)).toEqual(['time']);
    expect(el.querySelector('[data-story-option="time"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-story-studio-rail="leading"]')).toBeNull();
    click(el.querySelector('[data-story-option="time"]'));
    expect(el.querySelector('[data-story-timeline]')).toBeNull();
    expect(el.querySelector('[data-story-animated]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-story-option="time"]')?.getAttribute('aria-pressed')).toBe('false');
    click(el.querySelector('[data-story-option="time"]'));
    await flush(() => el.querySelector('[data-story-timeline]') !== null);
    expect(el.querySelector('[data-story-timeline]')).not.toBeNull();
  });
});

describe('les rails suivent la géographie d’iOS (#8713)', () => {
  test('à droite, les effets du fond en haut puis Temps, annuler, rétablir en bas ; à gauche, les portes, puis l’éclair, puis le Cadre ; le (+) de scène en barre haute', async () => {
    const el = mount(harness({}).deps);
    selectFile(el, 'visual', image());
    await flush(() => el.querySelector('[data-story-option="frame"]') !== null);
    typeText(el, 'Bonjour');
    click(el.querySelector('[data-story-edit-done]'));
    click(el.querySelector('[data-story-animated]'));
    await flush(() => el.querySelector('[data-story-timeline]') !== null);
    click(el.querySelector('[data-story-option="time"]'));
    // Un geste APRÈS l'animation, défait : de quoi annuler ET rétablir.
    click(el.querySelector('[data-story-option="add-text"]'));
    click(el.querySelector('[data-story-option="undo"]'));
    expect(trailing(el)).toEqual(['effect:opening', 'effect:visual', 'time', 'undo', 'redo']);
    const leading = [...el.querySelectorAll('[data-story-studio-rail="leading"] [data-story-option], [data-story-studio-rail="leading"] [data-story-animated]')];
    expect(leading.map((tile) => tile.getAttribute('data-story-option') ?? 'animated')).toEqual(['add-text', 'animated', 'frame']);
    expect(el.querySelector('[data-story-option="add-page"]')?.closest('[data-story-studio-rail]')).toBeNull();
    expect(el.querySelector('[data-story-studio-rail="trailing"] [data-story-option="add-text"]')).toBeNull();
  });
});

describe('l’unité des secondes de la frise se traduit', () => {
  test('en arabe, la frise ne dit pas « s »', async () => {
    await loadInterfaceCatalog('ar');
    document.documentElement.lang = 'ar';
    const el = mount(harness({}).deps);
    typeText(el, 'مرحبا');
    click(el.querySelector('[data-story-edit-done]'));
    click(el.querySelector('[data-story-animated]'));
    await flush(() => el.querySelector('[data-story-timeline-duration]') !== null);
    const counter = el.querySelector('[data-story-timeline-duration]')?.parentElement?.textContent ?? '';
    expect(counter).toContain('ث');
    expect(counter).not.toMatch(/\bs\b/);
  });
});

import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import { VIEWER_ID, flush, harness, mount, onePageSnapshot, publishButton, registerStudioBench, typeText } from '@/test-support/story-studio-bench';

/**
 * **LE COMPOSEUR WEB SUIT iOS** (#9140) — jumelle de #9137 (« T+ » fait
 * naître un texte en place ; une saisie fermée vide ne laisse rien) et de
 * #9138 (texte, calque et fond s'éditent dans la vue de base : leurs
 * sous-outils au rail DROIT, leurs options dans un panneau à droite, depuis le
 * HAUT — plus jamais une plaque en bas).
 */

registerStudioBench();

const click = (element: Element | null) => {
  if (element === null) throw new Error('élément absent');
  act(() => (element as HTMLElement).click());
};

const trailing = (el: ParentNode) =>
  [...el.querySelectorAll('[data-story-studio-rail="trailing"] [data-story-trailing-options] [data-story-option]')].map((tile) => tile.getAttribute('data-story-option'));

const textsOf = (drafts: ReturnType<typeof createStudioDraftStore>) => drafts.get(VIEWER_ID)?.pages[0]?.texts.map((text) => text.text) ?? [];

const footer = (el: ParentNode) => el.querySelector('[data-story-studio-bottom]')!;
const plateau = (el: ParentNode) => el.querySelector('[data-story-studio-plateau]')!;

describe('« T+ » puis une saisie fermée vide ne laisse aucun texte fantôme (#9137)', () => {
  test('poser un texte puis le quitter sans écrire : le brouillon n’en garde rien, « Annuler » défait le geste d’AVANT', async () => {
    const drafts = createStudioDraftStore(null);
    const el = mount(harness({ drafts }).deps, 'POST');
    typeText(el, 'Premier');
    click(el.querySelector('[data-story-option="edit:exit"]'));
    await flush(() => el.querySelector('[data-story-option="edit:exit"]') === null);
    const before = textsOf(drafts);

    click(el.querySelector('[data-story-option="add-text"]'));
    await flush(() => el.querySelector('[data-story-option="edit:exit"]') !== null);
    expect(textsOf(drafts)).toHaveLength(before.length + 1);
    click(el.querySelector('[data-story-option="edit:exit"]'));
    await flush(() => el.querySelector('[data-story-option="edit:exit"]') === null);

    expect(textsOf(drafts)).toEqual(before);
    click(el.querySelector('[data-story-option="undo"]'));
    await flush();
    expect(textsOf(drafts).filter((text) => text !== '')).toEqual([]);
  });

  test('« T+ » deux fois sans écrire : un seul texte vide à la fois, jamais une pile', async () => {
    const drafts = createStudioDraftStore(null);
    const el = mount(harness({ drafts }).deps, 'POST');
    typeText(el, 'Premier');
    click(el.querySelector('[data-story-option="add-text"]'));
    await flush(() => el.querySelector('[data-story-option="edit:exit"]') !== null);
    const once = textsOf(drafts).length;
    click(el.querySelector('[data-story-option="add-text"]'));
    await flush();
    expect(textsOf(drafts)).toHaveLength(once);
  });

  test('un texte écrit puis effacé avant de fermer part aussi', async () => {
    const drafts = createStudioDraftStore(null);
    const el = mount(harness({ drafts }).deps, 'POST');
    typeText(el, 'Premier');
    click(el.querySelector('[data-story-option="add-text"]'));
    await flush(() => el.querySelector('[data-story-option="edit:exit"]') !== null);
    typeText(el, 'Deux');
    typeText(el, '');
    click(el.querySelector('[data-story-option="edit:exit"]'));
    await flush(() => el.querySelector('[data-story-option="edit:exit"]') === null);
    expect(textsOf(drafts)).toEqual(['Premier']);
  });
});

describe('un texte s’édite dans la vue de base : sous-outils à droite, options depuis le haut (#9138)', () => {
  test('« T+ » ouvre l’édition : le rail droit porte ses sous-outils, ses gestes et le (x) — aucune plaque en bas', async () => {
    const el = mount(harness({}).deps, 'POST');
    typeText(el, 'Un');
    click(el.querySelector('[data-story-option="add-text"]'));
    await flush(() => el.querySelector('[data-story-option="edit:exit"]') !== null);
    expect(trailing(el)).toEqual([
      'section:style',
      'section:effect',
      'section:color',
      'section:align',
      'section:background',
      'section:language',
      'section:pose',
      'object:lower',
      'object:duplicate',
      'object:remove',
      'edit:exit',
    ]);
    expect(el.querySelector('[data-story-inline-panel]')).toBeNull();
    expect(footer(el).querySelector('[data-story-edit-plaque]')).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('#story-studio-text'));
  });

  test('toucher « Police » ouvre ses options DANS le plateau, en haut ; choisir s’applique ; retoucher range', async () => {
    const bench = harness({});
    const el = mount(bench.deps, 'POST');
    typeText(el, 'Un');
    await flush(() => el.querySelector('[data-story-option="section:style"]') !== null);
    click(el.querySelector('[data-story-option="section:style"]'));
    await flush(() => el.querySelector('[data-story-inline-panel="style"]') !== null);
    const panel = el.querySelector<HTMLElement>('[data-story-inline-panel="style"]')!;
    expect(plateau(el).contains(panel)).toBe(true);
    expect(footer(el).contains(panel)).toBe(false);
    expect(panel.style.top).toBe('8px');
    expect(el.querySelector('[data-story-option="section:style"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(panel.querySelector('[data-story-option="effect:neon"]')).toBeNull();

    click(panel.querySelector('[data-story-option="style:typewriter"]'));
    click(el.querySelector('[data-story-option="section:style"]'));
    await flush(() => el.querySelector('[data-story-inline-panel]') === null);
    click(el.querySelector('[data-story-option="edit:exit"]'));
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    expect(JSON.stringify(bench.posts[0]?.storyEffects)).toContain('typewriter');
  });

  test('Échap range d’abord les options, puis quitte l’édition', async () => {
    const el = mount(harness({}).deps, 'POST');
    typeText(el, 'Un');
    await flush(() => el.querySelector('[data-story-option="section:color"]') !== null);
    click(el.querySelector('[data-story-option="section:color"]'));
    await flush(() => el.querySelector('[data-story-inline-panel="color"]') !== null);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await flush(() => el.querySelector('[data-story-inline-panel]') === null);
    expect(el.querySelector('[data-story-option="edit:exit"]')).not.toBeNull();
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await flush(() => el.querySelector('[data-story-option="edit:exit"]') === null);
    expect(el.querySelector('[data-scene-text]')?.textContent).toBe('Un');
  });
});

describe('le calque et le fond suivent la même grammaire (#9138)', () => {
  function withOverlay() {
    const drafts = createStudioDraftStore(null);
    drafts.set(
      VIEWER_ID,
      onePageSnapshot({
        texts: [],
        background: { postMediaId: 'pm-bg', fileUrl: '2026/09/u/bg.jpg', mediaType: 'image', aspectRatio: 9 / 16 },
        overlay: { postMediaId: 'pm-ov', fileUrl: '2026/09/u/ov.jpg', mediaType: 'image', aspectRatio: 1 },
      }),
    );
    return harness({ drafts });
  }

  test('« Modifier » le calque : décrire, filtrer, poser au rail ; « Décrire » ouvre sa légende en haut du plateau', async () => {
    const el = mount(withOverlay().deps, 'POST');
    await flush(() => el.querySelector('[data-story-object-edit="overlay"]') !== null);
    click(el.querySelector('[data-story-object-edit="overlay"]'));
    await flush(() => el.querySelector('[data-story-option="edit:exit"]') !== null);
    expect(trailing(el).filter((probe) => probe?.startsWith('section:'))).toEqual(['section:describe', 'section:filter', 'section:pose']);
    click(el.querySelector('[data-story-option="section:describe"]'));
    await flush(() => el.querySelector('[data-story-inline-panel="describe"]') !== null);
    expect(plateau(el).querySelector('[data-story-inline-panel="describe"] #story-studio-caption-overlay')).not.toBeNull();
  });

  test('un outil du fond ouvre ses contrôles dans le plateau, en haut — plus sous la scène', async () => {
    const el = mount(withOverlay().deps, 'POST');
    await flush(() => el.querySelector('[data-story-option="frame"]') !== null);
    click(el.querySelector('[data-story-option="frame"]'));
    await flush(() => el.querySelector('[data-story-background-tool="frame"]') !== null);
    const panel = el.querySelector<HTMLElement>('[data-story-background-tool="frame"]')!;
    expect(plateau(el).contains(panel)).toBe(true);
    expect(footer(el).contains(panel)).toBe(false);
    expect(panel.closest<HTMLElement>('[data-story-inline-panel]')?.style.top).toBe('8px');
  });
});

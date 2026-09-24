import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { PublicationKind } from '@/lib/stories/publication-kind';
import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import {
  VIEWER_ID,
  flush,
  harness,
  image,
  mount,
  publishButton,
  registerStudioBench,
  selectFile,
  typeText,
  unmountAll,
  type Harness,
} from '@/test-support/story-studio-bench';

/**
 * `StoryComposeScreen` — PLUSIEURS PAGES DE MÉDIAS, ET LEUR AGENCEMENT
 * (#7684) : le critère de fin de l'issue (trois images ⇒ trois tuiles, le tap
 * change la scène, Post déplie ses agencements et le corps porte
 * `canvas.layout`, une page ⇒ aucun sous-menu, deux images ⇒ réel, le
 * brouillon survit avec ses pages) ET les défauts relevés en revue-correction
 * (corbeille qui abandonne la montée, page vide qui ne compte pas, story de
 * plusieurs pages refusée, média échoué dit sur sa tuile, clavier).
 */

registerStudioBench();

describe('StoryComposeScreen — PLUSIEURS PAGES DE MÉDIAS, ET LEUR AGENCEMENT (#7684)', () => {
  const pageTiles = (host: ParentNode) => host.querySelectorAll<HTMLButtonElement>('[data-story-studio-page-tile]');
  const pageRail = (host: ParentNode) => host.querySelector('[data-story-studio-page-rail]');
  const addPage = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-story-option="add-page"]');
  const pageDelete = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-story-studio-page-delete]');
  const kindChoice = (kind: string) => document.querySelector<HTMLButtonElement>(`[data-publish-kind-choice="${kind}"]`);
  const layoutChoices = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-publish-layout-choice]'));
  const layoutChoice = (mode: string) => document.querySelector<HTMLButtonElement>(`[data-publish-layout-choice="${mode}"]`);
  const kindToggle = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-publish-kind-toggle]');
  const kindMenu = () => document.querySelector<HTMLDivElement>('[data-publish-kind-menu]');
  const stage = (host: ParentNode) => host.querySelector<HTMLElement>('[data-scene-stage]');
  const textField = (host: ParentNode) => host.querySelector<HTMLTextAreaElement>('#story-studio-text');
  const another = (name: string) => new File([new Uint8Array([9, 9, 9])], name, { type: 'image/jpeg' });
  const press = (key: string) =>
    act(() => {
      kindMenu()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });

  async function twoTypedPages(bench: Harness, kind: PublicationKind = 'POST'): Promise<HTMLDivElement> {
    const el = mount(bench.deps, kind);
    typeText(el, 'Page une');
    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 2);
    typeText(el, 'Page deux');
    return el;
  }

  test('une SEULE page : aucun rail, et la ligne Post publie directement — aucun sous-menu (loi 4)', async () => {
    const bench = harness({});
    const el = mount(bench.deps, 'POST');
    typeText(el, 'Une seule page');
    expect(pageRail(el)).toBeNull();
    act(() => kindToggle(el)!.click());
    expect(kindChoice('POST')?.hasAttribute('aria-haspopup')).toBe(false);
    act(() => kindChoice('POST')!.click());
    await flush(() => bench.posts.length > 0);
    expect(layoutChoices()).toHaveLength(0);
    expect('layout' in (bench.posts[0]!.storyEffects as object)).toBe(false);
  });

  test('créer une page ⇒ deux tuiles, la NOUVELLE est courante, la scène et le champ sont les SIENS (vide)', async () => {
    const el = mount(harness({}).deps, 'POST');
    typeText(el, 'Page une');
    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 2);

    const tiles = pageTiles(el);
    expect(tiles[1]?.getAttribute('aria-current')).toBe('true');
    expect(tiles[0]?.getAttribute('aria-current')).toBeNull();
    expect(stage(el)?.getAttribute('data-story-studio-current-page')).toBe(tiles[1]?.getAttribute('data-story-studio-page'));
    expect(textField(el)?.value).toBe('');
  });

  test('taper sur une tuile change la SCÈNE COURANTE — son fond, son texte ; la page 2 ne touche pas la page 1', async () => {
    const el = mount(harness({}).deps, 'POST');
    typeText(el, 'Texte de la une');
    selectFile(el, 'visual', image());
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    const firstSrc = el.querySelector<HTMLImageElement>('[data-scene-player] img')?.getAttribute('src');

    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 2);
    expect(el.querySelector('[data-asset-phase]')).toBeNull();
    selectFile(el, 'visual', another('deuxieme.jpg'));
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    expect(el.querySelector<HTMLImageElement>('[data-scene-player] img')?.getAttribute('src')).not.toBe(firstSrc);

    act(() => pageTiles(el)[0]!.click());
    await flush();
    expect(pageTiles(el)[0]?.getAttribute('aria-current')).toBe('true');
    expect(el.querySelector<HTMLImageElement>('[data-scene-player] img')?.getAttribute('src')).toBe(firstSrc);
    expect(textField(el)?.value).toBe('Texte de la une');
  });

  test('la corbeille retire la page COURANTE, ABANDONNE sa montée en vol ; sous deux pages, elle disparaît avec le rail', async () => {
    const hold = { value: false };
    const bench = harness({ uploadsHold: () => hold.value });
    const el = mount(bench.deps, 'POST');
    typeText(el, 'Page une');
    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 2);
    hold.value = true;
    selectFile(el, 'visual', image());
    await flush(() => bench.uploadCreations() === 1);
    await flush();
    expect(pageDelete(el)).not.toBeNull();

    act(() => pageDelete(el)!.click());
    await flush(() => pageRail(el) === null);
    expect(pageTiles(el)).toHaveLength(0);
    await flush(() => bench.uploadAborts() === 1);
    expect(bench.uploadAborts()).toBe(1);
    expect(textField(el)?.value).toBe('Page une');
  });

  test('au PLAFOND (dix pages), le geste « créer une page » disparaît — jamais grisé (loi 4)', async () => {
    const el = mount(harness({}).deps, 'POST');
    typeText(el, 'Page une');
    for (let i = 1; i < 10; i += 1) {
      act(() => addPage(el)!.click());
      await flush(() => pageTiles(el).length === i + 1);
    }
    expect(pageTiles(el)).toHaveLength(10);
    expect(addPage(el)).toBeNull();
  });

  test('deux pages AVEC matière : la ligne Post DÉPLIE les cinq agencements, dans l’ordre iOS, sans publier', async () => {
    const bench = harness({});
    const el = await twoTypedPages(bench);
    act(() => kindToggle(el)!.click());
    const post = kindChoice('POST')!;
    expect(post.getAttribute('aria-haspopup')).toBe('menu');
    expect(post.getAttribute('aria-expanded')).toBe('false');
    act(() => post.click());
    await flush();
    expect(kindChoice('POST')?.getAttribute('aria-expanded')).toBe('true');
    expect(layoutChoices().map((row) => row.getAttribute('data-publish-layout-choice'))).toEqual(['carousel', 'reel', 'hero', 'wave', 'sine']);
    expect(layoutChoices().every((row) => row.getAttribute('role') === 'menuitem')).toBe(true);
    expect(bench.posts).toHaveLength(0);
  });

  test('une seconde page VIDE ne déplie rien — une disposition sans seconde scène serait un contrôle sans effet', async () => {
    const el = mount(harness({}).deps, 'POST');
    typeText(el, 'Page une');
    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 2);
    act(() => kindToggle(el)!.click());
    expect(kindChoice('POST')?.hasAttribute('aria-haspopup')).toBe(false);
  });

  test('choisir une disposition PUBLIE en POST avec `canvas.layout` et les deux scènes', async () => {
    const bench = harness({});
    const el = await twoTypedPages(bench);
    act(() => kindToggle(el)!.click());
    act(() => kindChoice('POST')!.click());
    await flush(() => layoutChoice('hero') !== null);
    act(() => layoutChoice('hero')!.click());
    await flush(() => bench.posts.length > 0);

    expect(bench.posts[0]?.type).toBe('POST');
    const effects = bench.posts[0]?.storyEffects as { readonly scenes: readonly unknown[]; readonly layout?: string } | undefined;
    expect(effects?.scenes).toHaveLength(2);
    expect(effects?.layout).toBe('hero');
  });

  test('au CLAVIER : ArrowRight déplie Post et entre dans les agencements, ArrowLeft replie et rend le focus à Post', async () => {
    // Le focus se lit par ses ATTRIBUTS, jamais par `toBe(élément)` : un
    // échec imprimerait tout l'arbre happy-dom et le témoin ne rendrait plus.
    const focused = () => {
      const active = document.activeElement;
      return active?.getAttribute('data-publish-layout-choice') ?? active?.getAttribute('data-publish-kind-choice') ?? null;
    };
    const el = await twoTypedPages(harness({}));
    act(() => kindToggle(el)!.click());
    await flush();
    kindChoice('POST')!.focus();
    press('ArrowDown');
    press('ArrowUp');
    expect(focused()).toBe('POST');
    press('ArrowRight');
    await flush();
    expect(focused()).toBe('carousel');
    press('ArrowDown');
    expect(focused()).toBe('reel');
    press('ArrowLeft');
    await flush();
    expect(layoutChoices()).toHaveLength(0);
    expect(focused()).toBe('POST');
  });

  test('sans toucher au chevron, un post de plusieurs pages part SANS `layout` (le repli du modèle)', async () => {
    const bench = harness({});
    await twoTypedPages(bench);
    act(() => publishButton(document)!.click());
    await flush(() => bench.posts.length > 0);
    const effects = bench.posts[0]?.storyEffects as { readonly layout?: string } | undefined;
    expect(effects && 'layout' in effects).toBe(false);
  });

  test('une STORY de deux pages avec matière se REFUSE en le disant ; retirer la seconde lève le refus', async () => {
    const bench = harness({});
    const el = await twoTypedPages(bench, 'STORY');
    expect(el.querySelector('[data-publish-refusal="story-with-several-pages"]')).not.toBeNull();
    expect(publishButton(el)?.disabled).toBe(true);
    act(() => kindToggle(el)!.click());
    expect(kindChoice('STORY')?.getAttribute('aria-disabled')).toBe('true');
    act(() => kindChoice('STORY')!.click());
    await flush();
    expect(bench.posts).toHaveLength(0);

    act(() => pageDelete(el)!.click());
    await flush(() => pageRail(el) === null);
    expect(el.querySelector('[data-publish-refusal]')).toBeNull();
    expect(publishButton(el)?.disabled).toBe(false);
  });

  test('DEUX IMAGES, une par page, qualifient le RÉEL — et son corps ne porte PAS `layout`', async () => {
    const bench = harness({});
    const el = mount(bench.deps, 'REEL');
    selectFile(el, 'visual', image());
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    expect(el.querySelector('[data-publish-refusal="reel-without-qualifying-media"]')).not.toBeNull();

    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 2);
    selectFile(el, 'visual', another('deuxieme.jpg'));
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);

    expect(el.querySelector('[data-publish-refusal]')).toBeNull();
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts[0]?.type).toBe('REEL');
    expect(bench.posts[0]?.mediaIds).toEqual(['pm-1', 'pm-2']);
    expect('layout' in (bench.posts[0]!.storyEffects as object)).toBe(false);
  });

  test('un média ÉCHOUÉ sur une page NON courante se dit sur SA tuile — Publier inerte pour une raison visible', async () => {
    const failing = { value: false };
    const el = mount(harness({ uploadsFail: () => failing.value }).deps, 'POST');
    failing.value = true;
    selectFile(el, 'visual', image());
    await flush(() => el.querySelector('[data-asset-phase="failed"]') !== null);
    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 2);
    typeText(el, 'Page deux');

    expect(pageTiles(el)[0]?.getAttribute('data-page-phase')).toBe('failed');
    expect(pageTiles(el)[1]?.hasAttribute('data-page-phase')).toBe(false);
    expect(publishButton(el)?.disabled).toBe(true);
  });

  test('le brouillon PERSISTÉ survit avec ses PAGES et la page courante', async () => {
    const drafts = createStudioDraftStore(null);
    const el = mount(harness({ drafts }).deps, 'POST');
    typeText(el, 'Page une');
    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 2);
    typeText(el, 'Page deux');
    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 3);
    act(() => pageTiles(el)[1]!.click());
    await flush();

    unmountAll();
    const reopened = mount(harness({ drafts }).deps, 'POST');
    await flush(() => pageTiles(reopened).length === 3);
    expect(pageTiles(reopened)[1]?.getAttribute('aria-current')).toBe('true');
    expect(textField(reopened)?.value).toBe('Page deux');
  });

  test('un brouillon de l’ANCIENNE forme (sans schéma) s’ouvre sur UNE page qui le porte', () => {
    const drafts = createStudioDraftStore(null);
    const legacy = { texts: [{ id: 'text-1', text: 'Écrit avant les pages' }] };
    const backing = new Map<string, string>([[`meeshy.draft.story.${VIEWER_ID}`, JSON.stringify(legacy)]]);
    const store = createStudioDraftStore({
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => void backing.set(key, value),
      removeItem: (key: string) => void backing.delete(key),
    });
    expect(drafts.get(VIEWER_ID)).toBeNull();
    const el = mount(harness({ drafts: store }).deps, 'POST');
    expect(pageRail(el)).toBeNull();
    expect(textField(el)?.value).toBe('Écrit avant les pages');
  });

  test('en ALLEMAND, le geste de page et le titre des agencements viennent du catalogue — jamais un libellé en dur', async () => {
    document.documentElement.lang = 'de';
    try {
      const el = await twoTypedPages(harness({}));
      expect(addPage(el)?.getAttribute('aria-label')).toBe('Szene erstellen');
      act(() => kindToggle(el)!.click());
      act(() => kindChoice('POST')!.click());
      await flush(() => layoutChoice('hero') !== null);
      expect(document.querySelector('[data-publish-layout-group]')?.getAttribute('aria-label')).toBe('Anordnung der Szenen');
    } finally {
      document.documentElement.lang = 'fr';
    }
  });
});

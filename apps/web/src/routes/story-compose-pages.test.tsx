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
 * plusieurs pages publiée en autant de stories — #7707 —, média échoué dit sur
 * sa tuile, clavier).
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

  async function threeTypedPages(bench: Harness, kind: PublicationKind = 'STORY'): Promise<HTMLDivElement> {
    const el = mount(bench.deps, kind);
    typeText(el, 'Une');
    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 2);
    typeText(el, 'Deux');
    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 3);
    typeText(el, 'Trois');
    return el;
  }

  test('une STORY de trois pages part en TROIS stories, dans l’ordre (#7707)', async () => {
    const bench = harness({});
    const el = await threeTypedPages(bench, 'STORY');
    expect(el.querySelector('[data-publish-refusal]')).toBeNull();
    expect(publishButton(el)?.disabled).toBe(false);
    act(() => kindToggle(el)!.click());
    expect(kindChoice('STORY')?.getAttribute('aria-disabled')).toBe('false');
    act(() => kindMenu()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length >= 3);

    expect(bench.posts).toHaveLength(3);
    bench.posts.forEach((post, index) => {
      const pageId = `page-${index + 1}`;
      expect(post.type).toBe('STORY');
      const effects = post.storyEffects as { readonly scenes: readonly { readonly id: string }[] };
      expect(effects.scenes).toHaveLength(1);
      expect(effects.scenes[0]?.id).toBe(pageId);
      expect(post.originalLanguage).toBeDefined();
      expect(post.mediaIds).toEqual([]);
    });
  });

  test('avec des médias, chaque story de la séquence porte SES `mediaIds` — pas ceux des autres pages', async () => {
    const bench = harness({});
    const el = mount(bench.deps, 'STORY');
    selectFile(el, 'visual', image());
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 2);
    selectFile(el, 'visual', another('deuxieme.jpg'));
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 3);
    selectFile(el, 'visual', another('troisieme.jpg'));
    await flush(() => bench.uploadCreations() === 3 && el.querySelector('[data-asset-phase="ready"]') !== null);

    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length >= 3);

    bench.posts.forEach((post, index) => {
      expect(post.mediaIds).toEqual([`pm-${index + 1}`]);
      const effects = post.storyEffects as { readonly scenes: readonly { readonly objects: readonly { readonly payload: Record<string, unknown> }[] }[] };
      const postMediaIds = effects.scenes[0]!.objects.map((o) => o.payload.postMediaId).filter((id): id is string => typeof id === 'string');
      expect(postMediaIds).toEqual([`pm-${index + 1}`]);
    });
  });

  test('échec PARTIEL : la 2ᵉ story échoue ⇒ 1 story part, le brouillon garde les pages 2 et 3, le retry ne renvoie JAMAIS la page 1', async () => {
    const drafts = createStudioDraftStore(null);
    const bench = harness({ postsStatus: () => (bench.posts.length === 2 ? 500 : 201), drafts });
    const el = await threeTypedPages(bench, 'STORY');

    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length >= 2);
    await flush(() => pageTiles(el).length === 2);

    expect(bench.posts).toHaveLength(2);
    expect(Array.from(pageTiles(el)).map((tile) => tile.getAttribute('data-story-studio-page'))).toEqual(['page-2', 'page-3']);
    expect(drafts.get(VIEWER_ID)?.pages.map((p) => p.id)).toEqual(['page-2', 'page-3']);
    const outcome = el.querySelector('[data-publish-outcome="partial"]');
    expect(outcome).not.toBeNull();
    expect(outcome?.getAttribute('data-published')).toBe('1');
    expect(outcome?.getAttribute('data-total')).toBe('3');
    expect(outcome?.textContent).toContain('1 sur 3 publiées');
    expect(outcome?.textContent).toContain('La passerelle est indisponible.');
    expect(publishButton(el)?.disabled).toBe(false);

    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length >= 4);
    expect(bench.posts).toHaveLength(4);
    const effects2 = bench.posts[2]!.storyEffects as { readonly scenes: readonly { readonly id: string }[] };
    const effects3 = bench.posts[3]!.storyEffects as { readonly scenes: readonly { readonly id: string }[] };
    expect(effects2.scenes[0]?.id).toBe('page-2');
    expect(effects3.scenes[0]?.id).toBe('page-3');
    expect(bench.posts.every((post, index) => index < 2 || (post.storyEffects as { scenes: { id: string }[] }).scenes[0]?.id !== 'page-1')).toBe(true);
    await flush(() => drafts.get(VIEWER_ID) === null);
    expect(drafts.get(VIEWER_ID)).toBeNull();
  });

  test('échec TOTAL : la 1ʳᵉ story échoue ⇒ rien ne bouge, le message est celui d’aujourd’hui', async () => {
    const bench = harness({ postsStatus: () => 500 });
    const el = await threeTypedPages(bench, 'STORY');

    act(() => publishButton(el)!.click());
    await flush(() => el.querySelector('[role="alert"]') !== null);

    expect(bench.posts).toHaveLength(1);
    expect(pageTiles(el)).toHaveLength(3);
    expect(el.querySelector('[data-publish-outcome]')).toBeNull();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('La story n’a pas pu être publiée.');
    expect(publishButton(el)?.disabled).toBe(false);
  });

  test('pendant l’envoi, la capsule dit « Publication k/N… » et chaque page PARTIE quitte le rail et le brouillon aussitôt', async () => {
    const drafts = createStudioDraftStore(null);
    const bench = harness({ postsHold: () => true, drafts });
    const el = await threeTypedPages(bench, 'STORY');

    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length === 1);
    expect(publishButton(el)?.textContent).toBe('Publication 1/3…');
    expect(pageTiles(el)).toHaveLength(3);

    bench.releasePost();
    await flush(() => bench.posts.length === 2);
    expect(publishButton(el)?.textContent).toBe('Publication 2/3…');
    expect(Array.from(pageTiles(el)).map((tile) => tile.getAttribute('data-story-studio-page'))).toEqual(['page-2', 'page-3']);
    expect(drafts.get(VIEWER_ID)?.pages.map((p) => p.id)).toEqual(['page-2', 'page-3']);

    bench.releasePost();
    await flush(() => bench.posts.length === 3);
    expect(publishButton(el)?.textContent).toBe('Publication 3/3…');
    bench.releasePost();
    await flush(() => drafts.get(VIEWER_ID) === null);
    expect(drafts.get(VIEWER_ID)).toBeNull();
  });

  test('une story d’UNE page garde « Publication… » — une fraction 1/1 ne dirait rien', async () => {
    const bench = harness({ postsHold: () => true });
    const el = mount(bench.deps, 'STORY');
    typeText(el, 'Seule');

    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length === 1);
    expect(publishButton(el)?.textContent).toBe('Publication…');
    bench.releasePost();
    await flush();
  });

  test('quitter le studio PENDANT l’envoi arrête la séquence entre deux requêtes — le brouillon rouvert ne porte que ce qui n’est pas parti', async () => {
    const drafts = createStudioDraftStore(null);
    const bench = harness({ postsHold: () => true, drafts });
    const el = await threeTypedPages(bench, 'STORY');
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length === 1);

    unmountAll();
    bench.releasePost();
    await flush();
    await flush();

    expect(bench.posts).toHaveLength(1);
    expect(drafts.get(VIEWER_ID)?.pages.map((p) => p.id)).toEqual(['page-2', 'page-3']);

    const retry = harness({ drafts });
    const reopened = mount(retry.deps, 'STORY');
    await flush(() => pageTiles(reopened).length === 2);
    act(() => publishButton(reopened)!.click());
    await flush(() => retry.posts.length >= 2);
    const sceneOf = (post: Record<string, unknown>) => (post.storyEffects as { readonly scenes: readonly { readonly id: string }[] }).scenes[0]?.id;
    expect(retry.posts.map(sceneOf)).toEqual(['page-2', 'page-3']);
  });

  test('quitter le studio pendant la DERNIÈRE requête : la story part, le brouillon est purgé, et l’auteur n’est pas ramené de force', async () => {
    const happyDom: unknown = Reflect.get(window, 'happyDOM');
    const setUrl: unknown = typeof happyDom === 'object' && happyDom !== null ? Reflect.get(happyDom, 'setURL') : undefined;
    const goTo = (url: string) => {
      if (typeof setUrl === 'function') Reflect.apply(setUrl, happyDom, [url]);
    };
    const before = window.location.href;
    goTo('http://localhost/stories/new');
    try {
      const drafts = createStudioDraftStore(null);
      const bench = harness({ postsHold: () => true, drafts });
      const el = mount(bench.deps, 'STORY');
      typeText(el, 'Partie quand même');
      act(() => publishButton(el)!.click());
      await flush(() => bench.posts.length === 1);

      unmountAll();
      goTo('http://localhost/');
      bench.releasePost();
      await flush(() => drafts.get(VIEWER_ID) === null);
      await flush();

      expect(drafts.get(VIEWER_ID)).toBeNull();
      expect(window.location.pathname).toBe('/');
    } finally {
      goTo(before);
    }
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

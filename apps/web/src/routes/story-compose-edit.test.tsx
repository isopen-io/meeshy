import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';
import { buildStoryCanvasEffectsPages } from '@/lib/stories/story-document';
import { studioEditHydration } from '@/lib/stories/studio-edit';
import { newTextLayer } from '@/lib/stories/studio-text';
import type { StudioEdit } from '@/routes/use-studio-edit';
import { VIEWER_ID, flush, harness, mountEdit, publishButton, registerStudioBench, typeText } from '@/test-support/story-studio-bench';

/**
 * **MODIFIER UNE PUBLICATION ROUVRE LE STUDIO** (#9317) — le critère de fin
 * de l'issue, joué à l'écran : la publication s'ouvre dans le studio avec
 * ses scènes, on y AJOUTE une scène (+), on en SUPPRIME une (jamais la
 * dernière), la capsule dit « Enregistrer », et l'enregistrement part en
 * `PUT` (post, réel) — ou en `PUT` + une story NEUVE par scène ajoutée
 * (story). Aucun média déjà monté n'est remonté.
 */

registerStudioBench();

const pageTiles = (host: ParentNode) => host.querySelectorAll<HTMLButtonElement>('[data-story-studio-page-tile]');
const addPage = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-story-option="add-page"]');
const pageDelete = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-story-studio-page-delete]');
const kindToggle = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-publish-kind-toggle]');

const scene = (id: string, value: string, postMediaId: string) => ({
  id,
  texts: [{ ...newTextLayer({ id: `text-${id}`, language: 'fr' }), text: value }],
  background: { source: { postMediaId, fileUrl: `2026/10/u/${postMediaId}.jpg` }, mediaType: 'image' as const },
});

const served = (overrides: Partial<FeedPost> = {}): FeedPost => ({
  id: 'p-1',
  type: 'POST',
  createdAt: '2026-10-01T10:00:00.000Z',
  content: 'Le corps',
  originalLanguage: 'fr',
  author: { id: VIEWER_ID },
  storyEffects: buildStoryCanvasEffectsPages([scene('1', 'Une', 'pm-1'), scene('2', 'Deux', 'pm-2')], null),
  media: [
    { id: 'pm-1', fileUrl: '2026/10/u/pm-1.jpg', mimeType: 'image/jpeg' },
    { id: 'pm-2', fileUrl: '2026/10/u/pm-2.jpg', mimeType: 'image/jpeg' },
  ],
  ...overrides,
});

const editOf = (post: FeedPost, journal: string[]): StudioEdit => {
  const hydration = studioEditHydration({ post, viewerId: VIEWER_ID, resolveUrl: (url) => `https://cdn.test/${url}`, language: 'fr' });
  if (hydration.kind !== 'studio') throw new Error(hydration.reason);
  return { draft: hydration.draft, origin: hydration.origin, onSaved: () => journal.push('saved'), onCancel: () => journal.push('cancel') };
};

describe('StoryComposeScreen — modifier une publication (#9317)', () => {
  test('la publication s’ouvre avec SES scènes ; la capsule dit « Enregistrer » et ne propose pas d’autre format', async () => {
    const bench = harness({});
    const el = mountEdit(bench.deps, editOf(served(), []));
    await flush(() => pageTiles(el).length === 2);
    expect(pageTiles(el)).toHaveLength(2);
    expect(publishButton(el)?.textContent).toBe('Enregistrer');
    expect(kindToggle(el)?.disabled).toBe(true);
    expect(bench.uploadCreations()).toBe(0);
  });

  test('enregistrer sans rien changer : UN PUT, le document entier, aucun média remonté, aucune création', async () => {
    const bench = harness({});
    const journal: string[] = [];
    const el = mountEdit(bench.deps, editOf(served(), journal));
    await flush(() => publishButton(el) !== null);
    act(() => publishButton(el)!.click());
    await flush(() => journal.includes('saved'));

    expect(bench.puts.map((put) => put.path)).toEqual(['/api/v1/posts/p-1']);
    expect((bench.puts[0]?.body.storyEffects as { readonly scenes: readonly unknown[] }).scenes).toHaveLength(2);
    expect(bench.posts).toHaveLength(0);
    expect(bench.uploadCreations()).toBe(0);
    expect(journal).toEqual(['saved']);
  });

  test('AJOUTER une scène (+) : elle part dans le même document', async () => {
    const bench = harness({});
    const journal: string[] = [];
    const el = mountEdit(bench.deps, editOf(served(), journal));
    await flush(() => addPage(el) !== null);
    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 3);
    typeText(el, 'Trois');
    act(() => publishButton(el)!.click());
    await flush(() => journal.includes('saved'));

    const scenes = (bench.puts[0]?.body.storyEffects as { readonly scenes: readonly { readonly objects: readonly { readonly payload: { readonly text?: string } }[] }[] }).scenes;
    expect(scenes).toHaveLength(3);
    expect(scenes[2]?.objects.some((object) => object.payload.text === 'Trois')).toBe(true);
  });

  test('SUPPRIMER une scène : son média part en `removeMediaIds` ; la dernière scène ne se supprime pas', async () => {
    const bench = harness({});
    const journal: string[] = [];
    const el = mountEdit(bench.deps, editOf(served(), journal));
    await flush(() => pageTiles(el).length === 2);
    act(() => pageTiles(el)[1]!.click());
    await flush(() => pageDelete(el) !== null);
    act(() => pageDelete(el)!.click());
    await flush(() => pageTiles(el).length === 0);
    expect(pageDelete(el)).toBeNull();
    act(() => publishButton(el)!.click());
    await flush(() => journal.includes('saved'));

    expect(bench.puts[0]?.body.removeMediaIds).toEqual(['pm-2']);
    expect((bench.puts[0]?.body.storyEffects as { readonly scenes: readonly unknown[] }).scenes).toHaveLength(1);
  });

  test('une STORY : sa scène part en PUT, la scène AJOUTÉE devient une story NEUVE', async () => {
    const bench = harness({});
    const journal: string[] = [];
    const story = served({
      type: 'STORY',
      content: null,
      storyEffects: buildStoryCanvasEffectsPages([scene('1', 'Ma story', 'pm-1')], null),
      media: [{ id: 'pm-1', fileUrl: '2026/10/u/pm-1.jpg', mimeType: 'image/jpeg' }],
    });
    const el = mountEdit(bench.deps, editOf(story, journal));
    await flush(() => addPage(el) !== null);
    act(() => addPage(el)!.click());
    await flush(() => pageTiles(el).length === 2);
    typeText(el, 'La suite');
    act(() => publishButton(el)!.click());
    await flush(() => journal.includes('saved'));

    expect(bench.puts.map((put) => put.path)).toEqual(['/api/v1/posts/p-1']);
    expect((bench.puts[0]?.body.storyEffects as { readonly scenes: readonly unknown[] }).scenes).toHaveLength(1);
    expect(bench.posts).toHaveLength(1);
    expect(bench.posts[0]?.type).toBe('STORY');
  });

  test('un refus de la passerelle : l’échec se dit, l’écran reste, rien n’est annoncé comme enregistré', async () => {
    const bench = harness({ putsStatus: () => 422 });
    const journal: string[] = [];
    const el = mountEdit(bench.deps, editOf(served(), journal));
    await flush(() => publishButton(el) !== null);
    act(() => publishButton(el)!.click());
    await flush(() => bench.puts.length === 1 && publishButton(el)?.disabled === false);
    expect(journal).toEqual([]);
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });
});

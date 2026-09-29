import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { PublicationKind } from '@/lib/stories/publication-kind';
import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import type { StudioMediaKind } from '@/lib/stories/story-document';
import { VIEWER_ID, flush, harness, mount, onePageSnapshot, publishButton, registerStudioBench } from '@/test-support/story-studio-bench';

/**
 * **UN POST À UNE SEULE VIDÉO PROPOSE LE RÉEL** (#8603, demande porteur
 * 2026-09-28) — au studio, Publier sur un POST dont le seul média est une
 * vidéo ouvre « Publier en réel ? » : « C'est un Réel » publie un RÉEL avec
 * le même contenu (vidéo, texte, audience), « C'est un Post » publie le post
 * tel quel, Annuler ne publie rien. Aucun modal hors de ce cas.
 */

registerStudioBench();

const seeded = (mediaType: StudioMediaKind = 'video') => {
  const drafts = createStudioDraftStore(null);
  drafts.set(VIEWER_ID, {
    ...onePageSnapshot({
      texts: [],
      visibility: 'FRIENDS',
      background: { postMediaId: 'pm-v', fileUrl: `2026/09/u/v.${mediaType === 'video' ? 'mp4' : 'jpg'}`, mediaType, aspectRatio: 9 / 16, durationMs: 12_000 },
    }),
    postText: 'Mon texte',
  });
  return harness({ drafts });
};

const offer = () => document.querySelector<HTMLDialogElement>('dialog[data-reel-offer]');
const choice = (name: 'reel' | 'post' | 'cancel') => document.querySelector<HTMLButtonElement>(`[data-reel-offer-choice="${name}"]`);

const openOffer = async (kind: PublicationKind = 'POST') => {
  const bench = seeded();
  const el = mount(bench.deps, kind);
  await flush(() => publishButton(el) !== null);
  act(() => publishButton(el)!.click());
  await flush();
  return { bench, el };
};

describe('studio — Publier un post à une seule vidéo ouvre « Publier en réel ? »', () => {
  test('le modal s’ouvre, et RIEN n’est parti tant que l’auteur n’a pas choisi', async () => {
    const { bench } = await openOffer();
    expect(offer()).not.toBeNull();
    expect(bench.posts).toHaveLength(0);
  });

  test('« C’est un Réel » publie un RÉEL avec la vidéo, le texte et l’audience du post', async () => {
    const { bench } = await openOffer();
    act(() => choice('reel')!.click());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts).toHaveLength(1);
    expect(bench.posts[0]?.type).toBe('REEL');
    expect(bench.posts[0]?.mediaIds).toEqual(['pm-v']);
    expect(bench.posts[0]?.content).toBe('Mon texte');
    expect(bench.posts[0]?.visibility).toBe('FRIENDS');
    expect(offer()).toBeNull();
  });

  test('« C’est un Post » publie le post tel quel', async () => {
    const { bench } = await openOffer();
    act(() => choice('post')!.click());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts[0]?.type).toBe('POST');
    expect(bench.posts[0]?.content).toBe('Mon texte');
    expect(bench.posts[0]?.mediaIds).toEqual(['pm-v']);
  });

  test('Annuler ferme le modal sans rien publier', async () => {
    const { bench } = await openOffer();
    act(() => choice('cancel')!.click());
    await flush();
    expect(offer()).toBeNull();
    expect(bench.posts).toHaveLength(0);
  });
});

describe('studio — aucun modal hors du post à une seule vidéo', () => {
  test('une photo seule part en post, sans question', async () => {
    const bench = seeded('image');
    const el = mount(bench.deps, 'POST');
    await flush(() => publishButton(el) !== null);
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(offer()).toBeNull();
    expect(bench.posts[0]?.type).toBe('POST');
  });

  test('une story à une seule vidéo part en story, sans question', async () => {
    const { bench } = await openOffer('STORY');
    await flush(() => bench.posts.length > 0);
    expect(offer()).toBeNull();
    expect(bench.posts[0]?.type).toBe('STORY');
  });

  test('ouvert en réel, la vidéo part en réel, sans question', async () => {
    const { bench } = await openOffer('REEL');
    await flush(() => bench.posts.length > 0);
    expect(offer()).toBeNull();
    expect(bench.posts[0]?.type).toBe('REEL');
  });

  test('« Post » choisi au chevron : l’auteur l’a déjà dit, le post part', async () => {
    const bench = seeded();
    const el = mount(bench.deps, 'POST');
    await flush(() => publishButton(el) !== null);
    act(() => el.querySelector<HTMLButtonElement>('[data-publish-kind-toggle]')!.click());
    act(() => document.querySelector<HTMLButtonElement>('[data-publish-kind-choice="POST"]')!.click());
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(offer()).toBeNull();
    expect(bench.posts[0]?.type).toBe('POST');
  });
});

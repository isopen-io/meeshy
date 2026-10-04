import { describe, expect, test } from 'bun:test';

import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';

import type { FeedPost } from '@/lib/api/feed-pages';

import { buildStoryCanvasEffectsPages } from './story-document';
import { withAddedPage, withAudience, withPage, withPostText, withoutPage, type StudioDraft } from './studio';
import { studioEditHydration, type StudioEditOrigin } from './studio-edit';
import { studioEditSavePlan, type StudioEditSavePlan } from './studio-edit-plan';
import { pageWithBackgroundCrop, pageWithText, pageWithVisual, type StudioVisualAsset } from './studio-page';
import { IDENTITY_POSE } from './studio-pose';
import { settlePages } from './studio-publish';
import { newTextLayer } from './studio-text';

/**
 * **CE QU'UN « ENREGISTRER » ENVOIE** (#9317) — la loi PURE de la sauvegarde
 * d'une publication rouverte dans le studio. Un post ou un réel : UN
 * `PUT /posts/:id` qui porte le document ENTIER, les médias montés pendant
 * l'édition (`mediaIds`) et ceux qu'aucune page ne référence plus
 * (`removeMediaIds`). Une story : sa scène part en `PUT`, chaque scène
 * AJOUTÉE devient une story neuve (canal `scene`).
 */

const VIEWER = 'u-auteur';

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
  visibility: 'PUBLIC',
  author: { id: VIEWER },
  storyEffects: buildStoryCanvasEffectsPages([scene('1', 'Une', 'pm-1'), scene('2', 'Deux', 'pm-2')], null),
  media: [
    { id: 'pm-1', fileUrl: '2026/10/u/pm-1.jpg', mimeType: 'image/jpeg' },
    { id: 'pm-2', fileUrl: '2026/10/u/pm-2.jpg', mimeType: 'image/jpeg' },
  ],
  ...overrides,
});

const opened = (post: FeedPost = served()): { readonly draft: StudioDraft; readonly origin: StudioEditOrigin } => {
  const hydration = studioEditHydration({ post, viewerId: VIEWER, resolveUrl: (url) => url, language: 'fr' });
  if (hydration.kind !== 'studio') throw new Error(hydration.reason);
  return hydration;
};

/** Un média MONTÉ pendant l'édition — prêt, sous une identité neuve. */
const uploaded = (postMediaId: string, caption = ''): StudioVisualAsset => ({
  previewUrl: `blob:${postMediaId}`,
  mediaType: 'image',
  upload: { phase: 'ready', postMediaId, fileUrl: `2026/10/u/${postMediaId}.jpg` },
  caption,
  pose: IDENTITY_POSE,
});

const plan = async (draft: StudioDraft, origin: StudioEditOrigin): Promise<StudioEditSavePlan> =>
  studioEditSavePlan({ origin, draft, settled: await settlePages(draft.pages, () => null), language: 'fr' });

const ready = (result: StudioEditSavePlan) => {
  if (result.kind !== 'ready') throw new Error(`plan non prêt : ${result.kind}`);
  return result;
};

describe('studioEditSavePlan — un post se réenregistre en UN PUT (#9317)', () => {
  test('rien de changé côté médias : le document entier part, sans `mediaIds` ni `removeMediaIds`, sans corps inchangé', async () => {
    const { draft, origin } = opened();
    const { update, creations } = ready(await plan(draft, origin));
    expect(update.postId).toBe('p-1');
    expect(update.body.storyEffects.scenes).toHaveLength(2);
    expect(CanvasV3Schema.safeParse(update.body.storyEffects).success).toBe(true);
    expect('mediaIds' in update.body).toBe(false);
    expect('removeMediaIds' in update.body).toBe(false);
    expect('content' in update.body).toBe(false);
    expect('visibility' in update.body).toBe(false);
    expect(creations).toBeNull();
  });

  test('une scène SUPPRIMÉE : son média part en `removeMediaIds`, le document n’a plus qu’une scène', async () => {
    const { draft, origin } = opened();
    const { update } = ready(await plan(withoutPage(draft, 'page-2'), origin));
    expect(update.body.storyEffects.scenes).toHaveLength(1);
    expect(update.body.removeMediaIds).toEqual(['pm-2']);
  });

  test('une scène AJOUTÉE avec un média monté : `mediaIds` ne porte QUE le neuf, et sa légende le suit', async () => {
    const { draft, origin } = opened();
    const added = withAddedPage(draft, 'fr');
    const withMedia = withPage(added, added.currentPage, (page) => pageWithVisual(page, 'visual', uploaded('pm-neuf', 'La plage')));
    const { update } = ready(await plan(withMedia, origin));
    expect(update.body.storyEffects.scenes).toHaveLength(3);
    expect(update.body.mediaIds).toEqual(['pm-neuf']);
    expect(update.body.mediaCaption).toEqual({ 'pm-neuf': 'La plage' });
    expect('removeMediaIds' in update.body).toBe(false);
  });

  test('un fond REMPLACÉ : le neuf est rattaché, l’ancien retiré', async () => {
    const { draft, origin } = opened();
    const replaced = withPage(draft, 'page-1', (page) => pageWithVisual(page, 'visual', uploaded('pm-autre')));
    const { update } = ready(await plan(replaced, origin));
    expect(update.body.mediaIds).toEqual(['pm-autre']);
    expect(update.body.removeMediaIds).toEqual(['pm-1']);
  });

  test('le texte d’une scène modifié repart dans le document', async () => {
    const { draft, origin } = opened();
    const edited = withPage(draft, 'page-1', (page) => pageWithText(page, page.texts[0]!.id, 'Une, corrigée'));
    const { update } = ready(await plan(edited, origin));
    const texts = update.body.storyEffects.scenes?.[0]?.objects.filter((object) => object.kind === 'text').map((object) => object.payload.text);
    expect(texts).toEqual(['Une, corrigée']);
  });

  test('le corps du post ne part que CHANGÉ — et vidé, il part vide pour être effacé', async () => {
    const { draft, origin } = opened();
    expect(ready(await plan(withPostText(draft, 'Le nouveau corps'), origin)).update.body.content).toBe('Le nouveau corps');
    expect(ready(await plan(withPostText(draft, '   '), origin)).update.body.content).toBe('');
  });

  test('une audience CHANGÉE part ; la même ne part pas', async () => {
    const { draft, origin } = opened();
    expect(ready(await plan(withAudience(draft, 'FRIENDS'), origin)).update.body.visibility).toBe('FRIENDS');
    expect('visibility' in ready(await plan(withAudience(draft, 'PUBLIC'), origin)).update.body).toBe(false);
  });

  test('la disposition choisie à la publication est conservée', async () => {
    const { draft, origin } = opened(served({ storyEffects: buildStoryCanvasEffectsPages([scene('1', 'Une', 'pm-1'), scene('2', 'Deux', 'pm-2')], 'wave') }));
    expect(ready(await plan(draft, origin)).update.body.storyEffects.layout).toBe('wave');
  });

  test('un RECADRAGE hydraté repart tel quel — l’édition ne défait pas une retouche', async () => {
    const { draft, origin } = opened();
    const cropped = withPage(draft, 'page-1', (page) => pageWithBackgroundCrop(page, { x: 0.1, y: 0.2, width: 0.5, height: 0.6 }));
    const first = ready(await plan(cropped, origin)).update.body.storyEffects;
    const reopened = opened(served({ storyEffects: first }));
    const background = ready(await plan(reopened.draft, reopened.origin)).update.body.storyEffects.scenes?.[0]?.objects.find((object) => object.id === 'background');
    expect(background?.payload).toMatchObject({ cropX: 0.1, cropY: 0.2, cropW: 0.5, cropH: 0.6 });
  });

  test('un RÉEL qui ne qualifie plus (une image seule) est refusé avant tout envoi', async () => {
    const { draft, origin } = opened(served({ type: 'REEL' }));
    expect(await plan(withoutPage(draft, 'page-2'), origin)).toEqual({ kind: 'refused', refusal: 'reel-without-qualifying-media' });
  });

  test('un média encore en échec : rien ne part', async () => {
    const { draft, origin } = opened();
    const failed = withPage(draft, 'page-1', (page) => pageWithVisual(page, 'visual', { ...uploaded('x'), upload: { phase: 'failed', reasonKey: 'story.studio.failure.network' } }));
    expect((await plan(failed, origin)).kind).toBe('unresolved');
  });
});

describe('studioEditSavePlan — une story : sa scène en PUT, chaque scène ajoutée en story NEUVE (#9317)', () => {
  const story = () =>
    served({ type: 'STORY', content: null, storyEffects: buildStoryCanvasEffectsPages([scene('1', 'Ma story', 'pm-1')], null), media: [{ id: 'pm-1', fileUrl: '2026/10/u/pm-1.jpg', mimeType: 'image/jpeg' }] });

  test('sans scène ajoutée : un PUT, aucune création, jamais de corps', async () => {
    const { draft, origin } = opened(story());
    const { update, creations } = ready(await plan(draft, origin));
    expect(update.body.storyEffects.scenes).toHaveLength(1);
    expect('content' in update.body).toBe(false);
    expect(creations).toBeNull();
  });

  test('une scène ajoutée : la première part en PUT, la nouvelle en story neuve avec SON média', async () => {
    const { draft, origin } = opened(story());
    const added = withAddedPage(draft, 'fr');
    const withMedia = withPage(added, added.currentPage, (page) => pageWithVisual(page, 'visual', uploaded('pm-neuf')));
    const { update, creations } = ready(await plan(withMedia, origin));
    expect(update.pageIds).toEqual(['page-1']);
    expect(update.body.storyEffects.scenes).toHaveLength(1);
    expect('mediaIds' in update.body).toBe(false);
    expect(creations?.publications).toHaveLength(1);
    expect(creations?.publications[0]?.pageIds).toEqual([added.currentPage]);
    expect(creations?.publications[0]?.mediaIds).toEqual(['pm-neuf']);
  });
});

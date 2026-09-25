import { describe, expect, test } from 'bun:test';

import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';

import { settle, studioPublishPayload, studioPublishPlan, uploadStateOf, type SettledPage } from './studio-publish';
import { emptyStudioPage, pageWithText, pageWithVisual, type StudioPage, type StudioVisualAsset } from './studio-page';
import { IDENTITY_POSE } from './studio-pose';

const ready = (postMediaId: string) => ({ kind: 'ready', ready: { postMediaId, fileUrl: `2026/09/u1/${postMediaId}.jpg` } }) as const;
const NONE = { kind: 'none' } as const;

const visual = (caption = ''): StudioVisualAsset => ({
  previewUrl: 'blob:local',
  mediaType: 'image',
  upload: { phase: 'uploading', progress: 0.4 },
  caption,
  pose: IDENTITY_POSE,
});

const pageWithBackground = (id: string, textId: string, caption = ''): StudioPage =>
  pageWithVisual(emptyStudioPage(id, textId, 'fr'), 'visual', visual(caption));

describe('studioPublishPayload — la loi PURE d’un envoi à plusieurs pages (#7684)', () => {
  test('deux pages avec fond ⇒ deux scènes, `mediaIds` dans l’ORDRE des pages, `layout` posé', () => {
    const pages = [pageWithBackground('page-1', 'text-1'), pageWithBackground('page-2', 'text-2')];
    const settled = new Map<string, SettledPage>([
      ['page-1', [ready('pm-1'), NONE, NONE]],
      ['page-2', [ready('pm-2'), NONE, NONE]],
    ]);
    const payload = studioPublishPayload({ pages, settled, layout: 'hero' });
    expect(payload.kind).toBe('ready');
    if (payload.kind !== 'ready') return;
    expect(payload.storyEffects.scenes).toHaveLength(2);
    expect(payload.storyEffects.layout).toBe('hero');
    expect(payload.mediaIds).toEqual(['pm-1', 'pm-2']);
    expect(CanvasV3Schema.safeParse(payload.storyEffects).success).toBe(true);
  });

  test('sans disposition choisie, la clé `layout` est ABSENTE du document', () => {
    const pages = [pageWithBackground('page-1', 'text-1'), pageWithBackground('page-2', 'text-2')];
    const settled = new Map<string, SettledPage>([
      ['page-1', [ready('pm-1'), NONE, NONE]],
      ['page-2', [ready('pm-2'), NONE, NONE]],
    ]);
    const payload = studioPublishPayload({ pages, settled, layout: null });
    expect(payload.kind === 'ready' && 'layout' in payload.storyEffects).toBe(false);
  });

  test('un média d’une page NON courante qui n’est pas prêt ⇒ `unresolved`, rien ne part', () => {
    const pages = [pageWithBackground('page-1', 'text-1'), pageWithBackground('page-2', 'text-2')];
    const settled = new Map<string, SettledPage>([
      ['page-1', [ready('pm-1'), NONE, NONE]],
      ['page-2', [{ kind: 'failed' }, NONE, NONE]],
    ]);
    expect(studioPublishPayload({ pages, settled, layout: null }).kind).toBe('unresolved');
  });

  test('une page ajoutée APRÈS le règlement (absente de la carte) et portant un média ⇒ `unresolved`', () => {
    const pages = [pageWithBackground('page-1', 'text-1'), pageWithBackground('page-2', 'text-2')];
    const settled = new Map<string, SettledPage>([['page-1', [ready('pm-1'), NONE, NONE]]]);
    expect(studioPublishPayload({ pages, settled, layout: null }).kind).toBe('unresolved');
  });

  test('toutes les pages vides ⇒ `empty`', () => {
    const pages = [emptyStudioPage('page-1', 'text-1', 'fr'), emptyStudioPage('page-2', 'text-2', 'fr')];
    expect(studioPublishPayload({ pages, settled: new Map(), layout: 'hero' }).kind).toBe('empty');
  });

  test('les légendes partent PAGE PAR PAGE, adressées par le `postMediaId` de CHAQUE fond', () => {
    const pages = [pageWithBackground('page-1', 'text-1', 'Première'), pageWithBackground('page-2', 'text-2', 'Seconde')];
    const settled = new Map<string, SettledPage>([
      ['page-1', [ready('pm-1'), NONE, NONE]],
      ['page-2', [ready('pm-2'), NONE, NONE]],
    ]);
    const payload = studioPublishPayload({ pages, settled, layout: null });
    expect(payload.kind === 'ready' ? payload.mediaCaption : undefined).toEqual({ 'pm-1': 'Première', 'pm-2': 'Seconde' });
  });

  test('un texte seul sur la page 2 ne réclame aucun média, et part comme scène', () => {
    const pages = [pageWithBackground('page-1', 'text-1'), pageWithText(emptyStudioPage('page-2', 'text-2', 'fr'), 'text-2', 'Deux')];
    const settled = new Map<string, SettledPage>([
      ['page-1', [ready('pm-1'), NONE, NONE]],
      ['page-2', [NONE, NONE, NONE]],
    ]);
    const payload = studioPublishPayload({ pages, settled, layout: null });
    expect(payload.kind === 'ready' ? payload.mediaIds : null).toEqual(['pm-1']);
    expect(payload.kind === 'ready' ? payload.storyEffects.scenes?.map((scene) => scene.id) : null).toEqual(['page-1', 'page-2']);
  });
});

const pageWithBackgroundAndText = (id: string, textId: string, text: string, caption = ''): StudioPage =>
  pageWithText(pageWithBackground(id, textId, caption), textId, text);

describe('studioPublishPlan — le canal de la STORY publie UNE fois PAR PAGE (#7707)', () => {
  const threePages = () => [
    pageWithBackgroundAndText('page-1', 'text-1', 'Un'),
    pageWithBackgroundAndText('page-2', 'text-2', 'Deux'),
    pageWithBackgroundAndText('page-3', 'text-3', 'Trois'),
  ];
  const settledThree = () =>
    new Map<string, SettledPage>([
      ['page-1', [ready('pm-1'), NONE, NONE]],
      ['page-2', [ready('pm-2'), NONE, NONE]],
      ['page-3', [ready('pm-3'), NONE, NONE]],
    ]);

  test('trois pages avec matière, format STORY ⇒ TROIS publications, dans l’ORDRE, chacune SA scène et SES mediaIds', () => {
    const plan = studioPublishPlan({ pages: threePages(), settled: settledThree(), choice: { kind: 'STORY', layout: null } });
    expect(plan.kind).toBe('ready');
    if (plan.kind !== 'ready') return;
    expect(plan.publications).toHaveLength(3);
    plan.publications.forEach((publication, index) => {
      const pageId = `page-${index + 1}`;
      expect(publication.pageIds).toEqual([pageId]);
      expect(publication.storyEffects.scenes).toHaveLength(1);
      expect(publication.storyEffects.scenes?.[0]?.id).toBe(pageId);
      expect(publication.mediaIds).toEqual([`pm-${index + 1}`]);
      expect(publication.hasText).toBe(true);
      expect('layout' in publication.storyEffects).toBe(false);
    });
  });

  test('les mêmes trois pages en POST ⇒ UNE publication portant les trois scènes, avec la disposition ; en REEL, SANS disposition', () => {
    const post = studioPublishPlan({ pages: threePages(), settled: settledThree(), choice: { kind: 'POST', layout: 'hero' } });
    expect(post.kind).toBe('ready');
    if (post.kind === 'ready') {
      expect(post.publications).toHaveLength(1);
      expect(post.publications[0]!.pageIds).toEqual(['page-1', 'page-2', 'page-3']);
      expect(post.publications[0]!.storyEffects.scenes).toHaveLength(3);
      expect(post.publications[0]!.storyEffects.layout).toBe('hero');
    }
    const reel = studioPublishPlan({ pages: threePages(), settled: settledThree(), choice: { kind: 'REEL', layout: null } });
    expect(reel.kind === 'ready' && 'layout' in reel.publications[0]!.storyEffects).toBe(false);
  });

  test('une page VIDE entre deux pages avec matière ne produit AUCUNE publication — jamais une scène vide', () => {
    const pages = [pageWithBackgroundAndText('page-1', 'text-1', 'Un'), emptyStudioPage('page-2', 'text-2', 'fr'), pageWithBackgroundAndText('page-3', 'text-3', 'Trois')];
    const settled = new Map<string, SettledPage>([
      ['page-1', [ready('pm-1'), NONE, NONE]],
      ['page-3', [ready('pm-3'), NONE, NONE]],
    ]);
    const plan = studioPublishPlan({ pages, settled, choice: { kind: 'STORY', layout: null } });
    expect(plan.kind).toBe('ready');
    if (plan.kind === 'ready') expect(plan.publications.map((p) => p.pageIds)).toEqual([['page-1'], ['page-3']]);
  });

  test('toutes les pages vides ⇒ `empty`', () => {
    const pages = [emptyStudioPage('page-1', 'text-1', 'fr'), emptyStudioPage('page-2', 'text-2', 'fr')];
    expect(studioPublishPlan({ pages, settled: new Map(), choice: { kind: 'STORY', layout: null } }).kind).toBe('empty');
  });

  test('un média non réglé (échoué) sur UNE page ⇒ `unresolved` pour le PLAN ENTIER, rien ne part — pas même la page 1', () => {
    const pages = threePages();
    const settled = new Map<string, SettledPage>([
      ['page-1', [ready('pm-1'), NONE, NONE]],
      ['page-2', [ready('pm-2'), NONE, NONE]],
      ['page-3', [{ kind: 'failed' }, NONE, NONE]],
    ]);
    expect(studioPublishPlan({ pages, settled, choice: { kind: 'STORY', layout: null } }).kind).toBe('unresolved');
  });
});

describe('settle / uploadStateOf — un média PRÊT n’est jamais remonté, un média EN VOL est attendu', () => {
  const accepted = { ok: true, data: { postMediaId: 'pm-9', fileUrl: 'f/9.jpg', mimeType: 'image/jpeg' } } as const;

  test('prêt dans le brouillon ⇒ son identité, sans attendre', async () => {
    expect(await settle({ phase: 'ready', postMediaId: 'pm-1', fileUrl: 'f/1.jpg' }, null)).toEqual({
      kind: 'ready',
      ready: { postMediaId: 'pm-1', fileUrl: 'f/1.jpg' },
    });
  });

  test('en vol ⇒ l’accusé de SA montée ; sans montée en vol ⇒ échec', async () => {
    expect(await settle({ phase: 'uploading', progress: 0.5 }, Promise.resolve(accepted))).toEqual({
      kind: 'ready',
      ready: { postMediaId: 'pm-9', fileUrl: 'f/9.jpg' },
    });
    expect(await settle({ phase: 'uploading', progress: 0.5 }, null)).toEqual({ kind: 'failed' });
  });

  test('une annulation voulue (ABORTED) ne s’inscrit pas comme un échec', () => {
    expect(uploadStateOf({ ok: false, status: 0, error: 'annulé', code: 'ABORTED' })).toBeNull();
  });
});

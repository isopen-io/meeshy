import { describe, expect, test } from 'bun:test';

import { currentStudioPage, emptyStudioDraft, studioDraftFromSnapshot, studioSnapshotOf, withVisual, type StudioDraft, type StudioVisualAsset } from './studio';
import { withBackgroundForward, withOverlayAsBackground, withPageTransitions } from './studio-scene-edit';
import { buildStoryCanvasEffectsPages } from './story-document';
import { studioPreviewDocument } from './studio-preview';
import { IDENTITY_POSE } from './studio-pose';

/** Les gestes de scène du composer (#8715, #8794) — jumelles de
 * `makeSceneBackground` et de `ComposerSceneEffects.transitions` iOS. */

const asset = (previewUrl: string, overrides: Partial<StudioVisualAsset> = {}): StudioVisualAsset => ({
  previewUrl,
  mediaType: 'image',
  upload: { phase: 'ready', postMediaId: `id-${previewUrl}`, fileUrl: `https://cdn/${previewUrl}` },
  caption: '',
  pose: IDENTITY_POSE,
  ...overrides,
});

const withBoth = (): StudioDraft =>
  withVisual(withVisual(emptyStudioDraft('fr'), 'visual', asset('bg', { frame: { fitMode: 'fill', backdrop: 'blur' } })), 'overlay', asset('ov', { pose: { x: 0.3, y: 0.7, scale: 0.5, rotation: 12 }, filter: 'bw' }));

describe('withOverlayAsBackground — « Mettre en fond » / « Remplacer le fond » (#8716)', () => {
  test('le calque devient le fond, garde son fichier et son filtre, perd sa pose ; l’ancien fond part', () => {
    const page = currentStudioPage(withOverlayAsBackground(withBoth()));
    expect(page.overlay).toBeNull();
    expect(page.background?.previewUrl).toBe('ov');
    expect(page.background?.filter).toBe('bw');
    expect(page.background?.pose).toEqual(IDENTITY_POSE);
    expect(page.background?.frame).toBeUndefined();
  });

  test('sans fond, le calque le devient simplement', () => {
    const draft = withVisual(emptyStudioDraft('fr'), 'overlay', asset('ov'));
    const page = currentStudioPage(withOverlayAsBackground(draft));
    expect(page.background?.previewUrl).toBe('ov');
    expect(page.overlay).toBeNull();
  });

  test('sans calque, le brouillon reste le même objet (aucun pas d’historique)', () => {
    const draft = withVisual(emptyStudioDraft('fr'), 'visual', asset('bg'));
    expect(withOverlayAsBackground(draft)).toBe(draft);
  });
});

describe('withBackgroundForward — « Passer au premier plan » (menu du fond)', () => {
  test('le fond devient le calque, centré ; la scène perd son fond', () => {
    const draft = withVisual(emptyStudioDraft('fr'), 'visual', asset('bg', { frame: { fitMode: 'fill', backdrop: 'blur' } }));
    const page = currentStudioPage(withBackgroundForward(draft));
    expect(page.background).toBeNull();
    expect(page.overlay?.previewUrl).toBe('bg');
    expect(page.overlay?.pose).toEqual(IDENTITY_POSE);
    expect(page.overlay?.frame).toBeUndefined();
  });

  test('un calque déjà posé : rien ne bouge (une scène n’en porte qu’un)', () => {
    const draft = withBoth();
    expect(withBackgroundForward(draft)).toBe(draft);
  });
});

describe('withPageTransitions — l’ouverture et la fermeture de la scène (#8792)', () => {
  test('posées sur la page courante, elles partent dans le document (`scene.opening` / `scene.closing`)', () => {
    const draft = withPageTransitions(withBoth(), { opening: 'zoom', closing: 'fade' });
    const page = currentStudioPage(draft);
    expect(page.opening).toBe('zoom');
    expect(page.closing).toBe('fade');
    const scene = studioPreviewDocument(page)?.scenes[0];
    expect(scene?.opening).toEqual({ type: 'zoom' });
    expect(scene?.closing).toEqual({ type: 'fade' });
  });

  test('« Aucun » les retire', () => {
    const page = currentStudioPage(withPageTransitions(withPageTransitions(withBoth(), { opening: 'zoom', closing: 'fade' }), { opening: null, closing: 'fade' }));
    expect(page.opening).toBeUndefined();
    expect(page.closing).toBe('fade');
    expect(studioPreviewDocument(page)?.scenes[0]?.opening).toBeUndefined();
  });

  test('les mêmes transitions : le brouillon reste le même objet', () => {
    const draft = withPageTransitions(withBoth(), { opening: 'slide', closing: null });
    expect(withPageTransitions(draft, { opening: 'slide', closing: null })).toBe(draft);
  });

  test('le brouillon persisté les garde ; une valeur inconnue relue est écartée', () => {
    const draft = withPageTransitions(withBoth(), { opening: 'reveal', closing: 'slide' });
    const snapshot = studioSnapshotOf(draft, 'fr');
    const restored = currentStudioPage(studioDraftFromSnapshot(snapshot, (url) => url, 'fr'));
    expect(restored.opening).toBe('reveal');
    expect(restored.closing).toBe('slide');
    const corrupted = { ...snapshot, pages: snapshot.pages.map((p) => ({ ...p, opening: 'spin', closing: 42 })) };
    const relu = currentStudioPage(studioDraftFromSnapshot(corrupted, (url) => url, 'fr'));
    expect(relu.opening).toBeUndefined();
    expect(relu.closing).toBeUndefined();
  });
});

describe('la publication porte les transitions de CHAQUE page (#8792)', () => {
  test('`buildStoryCanvasEffectsPages` écrit `opening` / `closing` sur la scène de la page', () => {
    const doc = buildStoryCanvasEffectsPages(
      [
        { id: 'page-1', texts: [], background: { source: { postMediaId: 'm1', fileUrl: 'https://cdn/a.jpg' }, mediaType: 'image' }, opening: 'slide' },
        { id: 'page-2', texts: [], background: { source: { postMediaId: 'm2', fileUrl: 'https://cdn/b.jpg' }, mediaType: 'image' }, closing: 'reveal' },
      ],
      null,
    );
    expect((doc?.scenes ?? []).map((scene) => [scene.opening, scene.closing])).toEqual([
      [{ type: 'slide' }, undefined],
      [undefined, { type: 'reveal' }],
    ]);
  });
});

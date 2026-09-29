import { describe, expect, test } from 'bun:test';

import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';

import { buildStoryCanvasEffects } from './story-document';
import { currentStudioPage, emptyStudioDraft, studioDraftFromSnapshot, studioSnapshotOf, withVisual, withVisualFilter, withVisualUpload, type StudioDraft } from './studio';
import { studioPreviewDocument } from './studio-preview';
import { IDENTITY_POSE } from './studio-pose';

/**
 * LE FILTRE D'UN MÉDIA POSÉ (lot 7, #8474, contrat iOS du 2026-09-28) — il
 * s'écrit sur CE média (`payload.filter` de l'objet `overlay`), jamais sur la
 * scène ni sur le fond ; il fait l'aller-retour du brouillon, se voit dans
 * l'aperçu et part dans le document publié.
 */
const asset = (previewUrl: string) => ({
  previewUrl,
  mediaType: 'image' as const,
  upload: { phase: 'uploading' as const, progress: 0 },
  caption: '',
  pose: IDENTITY_POSE,
});

const withBothReady = (): StudioDraft => {
  const placed = withVisual(withVisual(emptyStudioDraft('fr'), 'visual', asset('blob:bg')), 'overlay', asset('blob:ov'));
  const bg = withVisualUpload(placed, 'visual', { phase: 'ready', postMediaId: 'pm-bg', fileUrl: 'bg.jpg' });
  return withVisualUpload(bg, 'overlay', { phase: 'ready', postMediaId: 'pm-ov', fileUrl: 'ov.jpg' });
};

describe('withVisualFilter — le filtre ne touche que le média visé', () => {
  test('filtrer le calque laisse le fond intact ; `null` retire le filtre', () => {
    const filtered = withVisualFilter(withBothReady(), 'overlay', 'bw');
    expect(currentStudioPage(filtered).overlay?.filter).toBe('bw');
    expect(currentStudioPage(filtered).background?.filter).toBeUndefined();
    expect(currentStudioPage(withVisualFilter(filtered, 'overlay', null)).overlay?.filter).toBeUndefined();
  });

  test('sans calque, rien ne change', () => {
    const draft = emptyStudioDraft('fr');
    expect(withVisualFilter(draft, 'overlay', 'bw')).toBe(draft);
  });

  test('le filtre fait l’aller-retour du brouillon ; une valeur inconnue se relit sans filtre', () => {
    const snapshot = studioSnapshotOf(withVisualFilter(withBothReady(), 'overlay', 'warm'), 'fr');
    expect(snapshot.pages[0]!.overlay?.filter).toBe('warm');
    expect(currentStudioPage(studioDraftFromSnapshot(snapshot, (u) => u, 'fr')).overlay?.filter).toBe('warm');
    const corrupted = { ...snapshot, pages: [{ ...snapshot.pages[0]!, overlay: { ...snapshot.pages[0]!.overlay!, filter: 'sepia-plus' } }] };
    expect(currentStudioPage(studioDraftFromSnapshot(corrupted, (u) => u, 'fr')).overlay?.filter).toBeUndefined();
  });
});

describe('le filtre part sur la charge de SON objet', () => {
  test('l’aperçu le peint sur le calque seul', () => {
    const page = currentStudioPage(withVisualFilter(withBothReady(), 'overlay', 'vivid'));
    const objects = studioPreviewDocument(page)!.scenes[0]!.objects;
    expect(objects.find((object) => object.id === 'overlay')?.payload.filter).toBe('vivid');
    expect(objects.find((object) => object.id === 'background')?.payload.filter).toBeUndefined();
  });

  test('le document publié le porte sur le calque, et passe le schéma de la passerelle', () => {
    const ready = { postMediaId: 'pm', fileUrl: 'x.jpg' };
    const effects = buildStoryCanvasEffects({
      texts: [],
      background: { source: ready, mediaType: 'image' },
      overlay: { source: ready, mediaType: 'image', pose: IDENTITY_POSE, filter: 'chrome' },
    })!;
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
    const objects = effects.scenes![0]!.objects;
    expect(objects.find((object) => object.id === 'overlay')?.payload.filter).toBe('chrome');
    expect(objects.find((object) => object.id === 'background')?.payload.filter).toBeUndefined();
  });
});

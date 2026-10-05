import { describe, expect, test } from 'bun:test';

import { STUDIO_COMPOSITE_SIZE, renderStudioComposite, studioCompositePlan } from './studio-composite';
import { emptyStudioPage, pageWithBackgroundFrame, pageWithVisual, type StudioVisualAsset } from './studio-page';
import { IDENTITY_POSE } from './studio-pose';

const asset = (overrides: Partial<StudioVisualAsset> = {}): StudioVisualAsset => ({
  previewUrl: 'blob:fond',
  mediaType: 'image',
  upload: { phase: 'uploading', progress: 0 },
  caption: '',
  pose: IDENTITY_POSE,
  aspectRatio: 4 / 3,
  ...overrides,
});
const page = () => emptyStudioPage('page-1', 'text-1', 'fr');

/** LE COMPOSITE DE LA SCÈNE (#8425) — ce que le composer hache pour peindre
 * son sol : le plan de dessin est PUR, l'exécution vit au navigateur. */
describe('studioCompositePlan — le rendu réduit, couche par couche', () => {
  test('un rendu ≤ 100 px de côté, au rapport 9:16', () => {
    expect(STUDIO_COMPOSITE_SIZE.height).toBeLessThanOrEqual(100);
    expect(STUDIO_COMPOSITE_SIZE.width / STUDIO_COMPOSITE_SIZE.height).toBeCloseTo(9 / 16, 1);
  });

  test('sans média, rien à hacher', () => {
    expect(studioCompositePlan(page())).toBeNull();
  });

  test('un fond 4:3 AJUSTÉ et flou : le flou couvrant, puis l’image entière au centre', () => {
    const plan = studioCompositePlan(pageWithVisual(page(), 'visual', asset()))!;
    expect(plan.map((op) => op.kind)).toEqual(['fill', 'image', 'image']);
    const [, blur, media] = plan;
    expect(blur).toMatchObject({ kind: 'image', src: 'blob:fond', blur: true });
    expect(media).toMatchObject({ kind: 'image', src: 'blob:fond', blur: false, width: 1 });
    expect(media?.kind === 'image' ? media.height : 0).toBeCloseTo((9 / 16) / (4 / 3), 5);
  });

  test('un fond TEINTÉ : la teinte du contrat, puis l’image', () => {
    const framed = pageWithBackgroundFrame(pageWithVisual(page(), 'visual', asset()), { fitMode: 'fit', backdrop: 'indigo' });
    expect(studioCompositePlan(framed)![1]).toEqual({ kind: 'fill', color: '#312E81' });
  });

  test('un fond qui REMPLIT couvre la carte', () => {
    const framed = pageWithBackgroundFrame(pageWithVisual(page(), 'visual', asset()), { fitMode: 'fill', backdrop: 'blur' });
    const plan = studioCompositePlan(framed)!;
    expect(plan).toHaveLength(2);
    expect(plan[1]).toMatchObject({ kind: 'image', height: 1 });
  });

  test('une VIDÉO ne se dessine pas au canvas : pas de composite (le repli sert)', () => {
    expect(studioCompositePlan(pageWithVisual(page(), 'visual', asset({ mediaType: 'video' })))).toBeNull();
  });
});

describe('renderStudioComposite — sans canvas (tests, moteur sans 2D), aucun hash inventé', () => {
  test('rend null', async () => {
    const plan = studioCompositePlan(pageWithVisual(page(), 'visual', asset()))!;
    expect(await renderStudioComposite(plan, { createCanvas: () => null, loadImage: async () => null })).toBeNull();
  });
});

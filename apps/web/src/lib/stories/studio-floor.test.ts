import { describe, expect, test } from 'bun:test';

import { thumbHashImage } from '@/lib/media/thumbhash-image';

import { studioFloor } from './studio-floor';
import { emptyStudioPage, pageWithVisual, type StudioVisualAsset } from './studio-page';
import { IDENTITY_POSE } from './studio-pose';

const HASH = '3nQFFAT4WIiod4WYZ6joeo+u9w==';
const OTHER = '1QcSHQRnh493V4dIh4eXh1h4kJUI';

const asset = (overrides: Partial<StudioVisualAsset> = {}): StudioVisualAsset => ({
  previewUrl: 'blob:local',
  mediaType: 'image',
  upload: { phase: 'uploading', progress: 0.3 },
  caption: '',
  pose: IDENTITY_POSE,
  ...overrides,
});

const page = () => emptyStudioPage('page-1', 'text-1', 'fr');

/** LE SOL DE LA SCÈNE (#8413) — peint du thumbhash de ce que la scène montre,
 * jamais d'une couleur unie dès qu'un média est posé. */
describe('studioFloor — la source du sol, dans l’ordre de justesse', () => {
  test('le hash du COMPOSITE, quand la scène en porte un, passe devant tout', () => {
    const withBackground = pageWithVisual(page(), 'visual', asset({ upload: { phase: 'ready', postMediaId: 'pm', fileUrl: 'f', thumbHash: OTHER } }));
    expect(studioFloor({ page: withBackground, sceneHash: HASH })).toEqual({ kind: 'hash', src: thumbHashImage(HASH)! });
  });

  test('sinon le hash du FOND, dès que l’accusé de montée le porte', () => {
    const withBackground = pageWithVisual(page(), 'visual', asset({ upload: { phase: 'ready', postMediaId: 'pm', fileUrl: 'f', thumbHash: HASH } }));
    expect(studioFloor({ page: withBackground })).toEqual({ kind: 'hash', src: thumbHashImage(HASH)! });
  });

  test('sinon le hash du CALQUE', () => {
    const withOverlay = pageWithVisual(page(), 'overlay', asset({ upload: { phase: 'ready', postMediaId: 'pm', fileUrl: 'f', thumbHash: HASH } }));
    expect(studioFloor({ page: withOverlay })).toEqual({ kind: 'hash', src: thumbHashImage(HASH)! });
  });

  test('avant tout accusé, l’IMAGE de fond elle-même (floutée à la peinture) — jamais un aplat', () => {
    expect(studioFloor({ page: pageWithVisual(page(), 'visual', asset()) })).toEqual({ kind: 'media', src: 'blob:local' });
  });

  test('une VIDÉO sans hash ne se peint pas en sol : la surface reste', () => {
    expect(studioFloor({ page: pageWithVisual(page(), 'visual', asset({ mediaType: 'video' })) })).toBeNull();
  });

  test('une page sans média n’a pas de sol à peindre', () => {
    expect(studioFloor({ page: page() })).toBeNull();
  });
});

/** LE SOL PREND LA TEINTE DU CADRE (lot 6) — noir, blanc, indigo ou sable
 * s'appliquent aussi autour de la carte ; le flou garde le thumbhash. */
describe('studioFloor — la teinte choisie au Cadre', () => {
  test('un fond ajusté sur « sable » : le sol est sable', () => {
    const page = pageWithVisual(emptyStudioPage('page-1', 'text-1', 'fr'), 'visual', asset({ frame: { fitMode: 'fit', backdrop: 'sand' } }));
    expect(studioFloor({ page, sceneHash: HASH })).toEqual({ kind: 'tint', src: '#FDE68A' });
  });

  test('flou (le défaut) : le thumbhash, comme avant', () => {
    const page = pageWithVisual(emptyStudioPage('page-1', 'text-1', 'fr'), 'visual', asset({ frame: { fitMode: 'fit', backdrop: 'blur' } }));
    expect(studioFloor({ page, sceneHash: HASH })?.kind).toBe('hash');
  });

  test('un fond qui REMPLIT n’a pas de bandes : la teinte ne s’applique pas', () => {
    const page = pageWithVisual(emptyStudioPage('page-1', 'text-1', 'fr'), 'visual', asset({ frame: { fitMode: 'fill', backdrop: 'sand' } }));
    expect(studioFloor({ page, sceneHash: HASH })?.kind).toBe('hash');
  });
});

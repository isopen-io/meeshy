import { describe, expect, test } from 'bun:test';
import { APPEARANCE_GAMUT } from '@meeshy/shared/utils/appearance-gamut';
import type { ConversationAppearance } from '@meeshy/shared/types/conversation-appearance';

import { backdropViewOf, designStyle, designStyleCacheSize } from './backdrop-view';
import { findWallpaperDesign } from './wallpaper-catalog';

const appearance = (background: ConversationAppearance['background']): ConversationAppearance => ({ v: 1, background, accent: null, animate: true });
const pattern = findWallpaperDesign('essentiels', 'chevrons');
const scene = findWallpaperDesign('illustrations', 'baobab');
const gradient = findWallpaperDesign('essentiels', 'aurore');
const args = { scheme: 'dark', accent: '#6366F1', photoSrc: undefined } as const;

describe('ce que le fond peint', () => {
  test('Signature ne pose rien : le CSS d’origine peint, à l’identique', () => {
    expect(backdropViewOf({ ...args, appearance: appearance({ kind: 'signature' }), design: undefined })).toEqual({ kind: 'signature' });
  });

  test('la couleur unie lit la surface de la gamme dans le schéma courant', () => {
    const view = backdropViewOf({ ...args, appearance: appearance({ kind: 'solid', color: 'azur' }), design: undefined });
    expect(view).toEqual({ kind: 'solid', style: { backgroundColor: APPEARANCE_GAMUT.azur.dark.surface } });
    const light = backdropViewOf({ ...args, scheme: 'light', appearance: appearance({ kind: 'solid', color: 'azur' }), design: undefined });
    expect(light).toEqual({ kind: 'solid', style: { backgroundColor: APPEARANCE_GAMUT.azur.light.surface } });
  });

  test('un motif se répète à la taille de sa tuile fois l’échelle, sans réseau', () => {
    expect(pattern).toBeDefined();
    const view = backdropViewOf({ ...args, appearance: appearance({ kind: 'design', pack: 'essentiels', design: 'chevrons' }), design: pattern });
    if (view.kind !== 'design') throw new Error('attendu un dessin');
    const tile = pattern?.tile;
    expect(view.style.backgroundRepeat).toBe('repeat');
    expect(view.style.backgroundSize).toBe(`${(tile?.width ?? 0) * (tile?.scale ?? 1)}px ${(tile?.height ?? 0) * (tile?.scale ?? 1)}px`);
    expect(view.style.backgroundImage?.startsWith('url("data:image/svg+xml;utf8,')).toBe(true);
  });

  test('une illustration s’ancre et le baobab se retourne en RTL', () => {
    const view = backdropViewOf({ ...args, appearance: appearance({ kind: 'design', pack: 'illustrations', design: 'baobab' }), design: scene });
    if (view.kind !== 'design') throw new Error('attendu un dessin');
    expect(view.flipInRtl).toBe(true);
    expect(view.style.backgroundPosition).toBe('right bottom');
  });

  test('un dégradé couvre le fil', () => {
    const view = backdropViewOf({ ...args, appearance: appearance({ kind: 'design', pack: 'essentiels', design: 'aurore' }), design: gradient });
    if (view.kind !== 'design') throw new Error('attendu un dessin');
    expect(view.style.backgroundSize).toBe('cover');
  });

  test('l’accent entre dans le dessin : un autre accent, un autre dessin', () => {
    const a = designStyle({ pack: 'essentiels', design: gradient!, scheme: 'dark', accent: '#6366F1' });
    const b = designStyle({ pack: 'essentiels', design: gradient!, scheme: 'dark', accent: '#E0604E' });
    expect(a.backgroundImage).not.toBe(b.backgroundImage);
  });

  test('un modèle inconnu retombe sur Signature, jamais une erreur', () => {
    expect(backdropViewOf({ ...args, appearance: appearance({ kind: 'design', pack: 'inconnu', design: 'x' }), design: undefined })).toEqual({ kind: 'signature' });
  });

  test('une photo illisible retombe sur Signature ; lisible, elle porte flou et voile', () => {
    const photo = { kind: 'photo', attachmentId: 'a'.repeat(24), veil: 0.3, blur: 8 } as const;
    expect(backdropViewOf({ ...args, appearance: appearance(photo), design: undefined })).toEqual({ kind: 'signature' });
    const view = backdropViewOf({ ...args, appearance: appearance(photo), design: undefined, photoSrc: 'https://x/p.jpg' });
    expect(view).toMatchObject({ kind: 'photo', src: 'https://x/p.jpg', blur: 8, veil: 0.3 });
  });

  test('le voile est le fond primaire d’iOS du schéma (MeeshyColors.backgroundPrimary : #09090B en sombre, blanc en clair)', () => {
    const photo = { kind: 'photo', attachmentId: 'a'.repeat(24), veil: 0.3, blur: 0 } as const;
    expect(backdropViewOf({ ...args, appearance: appearance(photo), design: undefined, photoSrc: 'x' })).toMatchObject({ veilColor: '9, 9, 11' });
    expect(backdropViewOf({ ...args, scheme: 'light', appearance: appearance(photo), design: undefined, photoSrc: 'x' })).toMatchObject({ veilColor: '255, 255, 255' });
  });

  test('« Réduire la transparence » force un voile d’au moins 0,6', () => {
    const photo = { kind: 'photo', attachmentId: 'a'.repeat(24), veil: 0.1, blur: 0 } as const;
    const view = backdropViewOf({ ...args, appearance: appearance(photo), design: undefined, photoSrc: 'x', reducedTransparency: true });
    expect(view).toMatchObject({ veil: 0.6 });
  });

  test('le cache des dessins reste borné à 32', () => {
    for (let i = 0; i < 50; i += 1) designStyle({ pack: 'essentiels', design: pattern!, scheme: 'dark', accent: `#${(100000 + i).toString()}` });
    expect(designStyleCacheSize()).toBeLessThanOrEqual(32);
  });
});

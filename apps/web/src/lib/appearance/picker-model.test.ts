import { describe, expect, test } from 'bun:test';
import type { ConversationAppearance } from '@meeshy/shared/types/conversation-appearance';
import { parseConversationAppearance } from '@meeshy/shared/types/conversation-appearance';

import { arrowTarget, clampBlur, clampVeil, designBackground, hasAnimatedLayer, photoBackground, solidBackground, withAccent, withBackground, withPhotoTuning } from './picker-model';
import { findWallpaperDesign } from './wallpaper-catalog';

const base: ConversationAppearance = { v: 1, background: { kind: 'signature' }, accent: null, animate: true };
const ID = 'b'.repeat(24);

describe('les gestes du sélecteur', () => {
  test('changer de fond garde l’accent, changer d’accent garde le fond', () => {
    const accented = withAccent(base, 'framboise');
    expect(withBackground(accented, solidBackground('azur'))).toEqual({ ...accented, background: { kind: 'solid', color: 'azur' } });
    expect(withAccent(withBackground(base, designBackground('essentiels', 'aurore')), null).background).toEqual({ kind: 'design', pack: 'essentiels', design: 'aurore' });
  });

  test('chaque résultat passe la validation STRICTE de la passerelle', () => {
    for (const next of [
      withBackground(base, designBackground('heritages', 'zellige')),
      withBackground(base, solidBackground('graphite')),
      withBackground(base, photoBackground(base.background, ID)),
      withAccent(base, 'lavande'),
    ]) {
      expect(parseConversationAppearance(next)).not.toBeNull();
    }
  });

  test('une première photo part avec les défauts d’iOS : voile 0,3, sans flou (même geste, même fond sur les deux plateformes)', () => {
    expect(photoBackground(base.background, ID)).toEqual({ kind: 'photo', attachmentId: ID, veil: 0.3, blur: 0 });
  });

  test('une nouvelle photo garde le voile et le flou de la précédente', () => {
    const first = photoBackground(base.background, ID);
    const tuned = withPhotoTuning(withBackground(base, first), { veil: 0.5, blur: 12 });
    expect(photoBackground(tuned.background, 'c'.repeat(24))).toEqual({ kind: 'photo', attachmentId: 'c'.repeat(24), veil: 0.5, blur: 12 });
  });

  test('le voile est borné à 0,8 par pas de 0,05 ; le flou est un entier de 0 à 24', () => {
    expect(clampVeil(2)).toBe(0.8);
    expect(clampVeil(-1)).toBe(0);
    expect(clampVeil(0.32)).toBeCloseTo(0.3, 5);
    expect(clampBlur(99)).toBe(24);
    expect(clampBlur(3.6)).toBe(4);
    const tuned = withPhotoTuning(withBackground(base, photoBackground(base.background, ID)), { veil: 0.35, blur: 7.4 });
    expect(parseConversationAppearance(tuned)).not.toBeNull();
  });

  test('régler le voile hors photo ne change rien', () => {
    expect(withPhotoTuning(base, { veil: 0.5 })).toBe(base);
  });

  test('l’interrupteur d’animations n’existe que pour un modèle animé (aucun des 14 ne l’est encore)', () => {
    expect(hasAnimatedLayer(findWallpaperDesign('essentiels', 'aurore'))).toBe(false);
    expect(hasAnimatedLayer(undefined)).toBe(false);
  });
});

describe('la navigation au clavier', () => {
  test('les flèches bouclent dans le groupe', () => {
    expect(arrowTarget({ count: 4, index: 3, key: 'ArrowRight', rtl: false })).toBe(0);
    expect(arrowTarget({ count: 4, index: 0, key: 'ArrowLeft', rtl: false })).toBe(3);
    expect(arrowTarget({ count: 4, index: 1, key: 'End', rtl: false })).toBe(3);
  });

  test('en RTL, la flèche gauche avance', () => {
    expect(arrowTarget({ count: 4, index: 1, key: 'ArrowLeft', rtl: true })).toBe(2);
    expect(arrowTarget({ count: 4, index: 1, key: 'ArrowRight', rtl: true })).toBe(0);
  });

  test('une autre touche ne bouge rien', () => {
    expect(arrowTarget({ count: 4, index: 1, key: 'a', rtl: false })).toBeNull();
    expect(arrowTarget({ count: 0, index: 0, key: 'ArrowRight', rtl: false })).toBeNull();
  });
});

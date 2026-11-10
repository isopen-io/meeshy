import { describe, expect, test } from 'bun:test';

import { CALL_BUTTON_TONES, callButtonGlassTreatment } from './call-button-glass';

/**
 * #17345 · #17418 — la loi pure qui choisit le verre de CHAQUE bouton de
 * l'appel, miroir de `CallButtonGlassRule` (iOS, #17323) : chaque bouton est
 * un disque de verre, le rouge reste rouge, l'enclenché reste blanc plein, et
 * UN SEUL flou (celui de la pilule) pour tenir 60 images par seconde.
 */
describe('le verre de chaque bouton de l’appel', () => {
  test('un bouton au repos dans une pilule est un disque de verre dessiné, jamais transparent', () => {
    const treatment = callButtonGlassTreatment('disc');
    expect(treatment.surface).toBe('drawn-disc');
    expect(treatment.hasSolidBacking).toBe(false);
  });

  test('un disque dessiné est un voile et un liseré : il ne porte AUCUN flou à lui', () => {
    expect(callButtonGlassTreatment('disc').blursBackdrop).toBe(false);
  });

  test('seul le bouton isolé, qui flotte hors de toute pilule, porte son propre flou', () => {
    const blurring = CALL_BUTTON_TONES.filter((tone) => callButtonGlassTreatment(tone).blursBackdrop);
    expect(blurring).toEqual(['glass']);
  });

  test('l’enclenché reste un disque blanc plein : le contraste du glyphe ne dépend jamais du verre', () => {
    const treatment = callButtonGlassTreatment('active');
    expect(treatment.surface).toBe('solid-white');
    expect(treatment.hasSolidBacking).toBe(true);
  });

  test('Fin reste rouge, plein', () => {
    const treatment = callButtonGlassTreatment('danger');
    expect(treatment.surface).toBe('solid-red');
    expect(treatment.hasSolidBacking).toBe(true);
  });

  test('seul Fin est rouge', () => {
    expect(CALL_BUTTON_TONES.filter((tone) => callButtonGlassTreatment(tone).surface === 'solid-red')).toEqual(['danger']);
  });

  test('aucun ton ne laisse un bouton sans fond : chacun dessine un disque, un verre ou un plein', () => {
    for (const tone of CALL_BUTTON_TONES) {
      expect(['drawn-disc', 'own-glass', 'solid-white', 'solid-red']).toContain(callButtonGlassTreatment(tone).surface);
    }
  });

  test('le disque dessiné s’éclaircit sous le doigt ; les pleins et le verre isolé gardent leur retour', () => {
    expect(callButtonGlassTreatment('disc').drawsPressHighlight).toBe(true);
    expect(callButtonGlassTreatment('active').drawsPressHighlight).toBe(false);
    expect(callButtonGlassTreatment('danger').drawsPressHighlight).toBe(false);
  });
});

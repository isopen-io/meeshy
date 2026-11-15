import { describe, expect, test } from 'bun:test';

import { CALL_BUTTON_TONES, callButtonGlassTreatment, callOutputButtonTone } from './call-button-glass';
import { callOutputRouting } from './call-output';

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

/**
 * P1.6 · #17843 — l'état de « Sortie » dans la pilule, miroir de `CallOutputButtonRule` (iOS,
 * `CallButtonGlassRuleTests`) et d'Android (#18411), mêmes vecteurs. En appel vidéo le haut-parleur
 * démarre allumé d'office : c'est le repos, un disque. Un appareil externe est un choix : disque blanc,
 * en audio comme en vidéo.
 */
describe('« Sortie » suit la loi de la sortie (P1.6, #17843)', () => {
  test('en appel vidéo, Sortie reste un disque au repos, même haut-parleur allumé', () => {
    expect(callOutputButtonTone({ isSpeaker: true, routesExternally: false, isVideoCall: true })).toBe('disc');
    expect(callOutputButtonTone({ isSpeaker: false, routesExternally: false, isVideoCall: true })).toBe('disc');
  });

  test('en appel audio, Sortie s’allume quand le haut-parleur est allumé', () => {
    expect(callOutputButtonTone({ isSpeaker: true, routesExternally: false, isVideoCall: false })).toBe('active');
    expect(callOutputButtonTone({ isSpeaker: false, routesExternally: false, isVideoCall: false })).toBe('disc');
  });

  test('vers un appareil externe, Sortie s’allume dans tout appel', () => {
    for (const isVideoCall of [true, false]) expect(callOutputButtonTone({ isSpeaker: false, routesExternally: true, isVideoCall })).toBe('active');
  });
});

/**
 * Où part le son, lu par le web (P1.6) : la route que rapporte la coque décide — filaire et Bluetooth
 * sont externes, le haut-parleur suit la loi du haut-parleur, l'écouteur est le repos (vecteurs de
 * `CallOutputButtonRule.kind(activeRoute:)` d'Android). Hors coque, le navigateur n'a pas de
 * haut-parleur : une sortie CHOISIE et branchée est un appareil externe, le défaut du système ne l'est pas.
 */
describe('où part le son, côté web', () => {
  test('la route de la coque décide : filaire et Bluetooth allument Sortie en audio comme en vidéo', () => {
    for (const route of ['wired', 'bluetooth'] as const)
      for (const isVideoCall of [true, false]) expect(callOutputButtonTone({ ...callOutputRouting({ route, sinkChosen: false }), isVideoCall })).toBe('active');
  });

  test('le haut-parleur de la coque suit la loi du haut-parleur ; l’écouteur est le repos', () => {
    expect(callOutputRouting({ route: 'speaker', sinkChosen: false })).toEqual({ isSpeaker: true, routesExternally: false });
    expect(callOutputButtonTone({ ...callOutputRouting({ route: 'speaker', sinkChosen: false }), isVideoCall: false })).toBe('active');
    expect(callOutputButtonTone({ ...callOutputRouting({ route: 'speaker', sinkChosen: false }), isVideoCall: true })).toBe('disc');
    expect(callOutputRouting({ route: 'earpiece', sinkChosen: true })).toEqual({ isSpeaker: false, routesExternally: false });
  });

  test('dans le navigateur, une sortie choisie et branchée est externe ; le défaut du système ne l’est pas', () => {
    expect(callOutputRouting({ route: null, sinkChosen: true })).toEqual({ isSpeaker: false, routesExternally: true });
    expect(callOutputRouting({ route: null, sinkChosen: false })).toEqual({ isSpeaker: false, routesExternally: false });
  });
});

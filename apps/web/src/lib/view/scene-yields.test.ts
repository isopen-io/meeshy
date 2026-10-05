import { describe, expect, test } from 'bun:test';

import {
  SCENE_READING_BLUR_PX,
  WRITING_SCENE_GAP_PX,
  keyboardInsetOf,
  sceneYieldOf,
  writingSceneScale,
  yieldingScene,
} from './scene-yields';

/**
 * #8643 (jumelle web de #8642) — PENDANT UNE OPÉRATION, LA SCÈNE CÈDE CE QUI
 * NE SERT PAS ET GARDE CE QUI SERT. Lire les commentaires d'une story : la
 * scène se floute un peu, le texte se lit. Écrire : la scène revient nette et
 * se RÉDUIT pour tenir entière au-dessus de la barre de composition et du
 * clavier — on voit ce qu'on commente.
 */
describe('sceneYieldOf — ce que fait la scène pendant l’opération', () => {
  test('rien d’ouvert : la scène est pleine', () => {
    expect(sceneYieldOf({ sheetOpen: false, writing: false })).toBe('full');
  });

  test('une feuille ouverte qu’on LIT : la scène se floute', () => {
    expect(sceneYieldOf({ sheetOpen: true, writing: false })).toBe('reading');
  });

  test('on ÉCRIT dans la feuille : la scène se réduit, nette', () => {
    expect(sceneYieldOf({ sheetOpen: true, writing: true })).toBe('writing');
  });

  test('un « écrire » sans feuille (fermeture en vol) ne réduit rien', () => {
    expect(sceneYieldOf({ sheetOpen: false, writing: true })).toBe('full');
  });
});

describe('writingSceneScale — la scène tient ENTIÈRE au-dessus de la barre', () => {
  test('iPhone 390×844 : barre à 480 px, ancre à 47 px — le bas réduit touche la barre moins l’écart', () => {
    const scale = writingSceneScale({ frameHeight: 844, barTop: 480, anchorTop: 47 });
    const bottom = 47 + (844 - 47) * scale;
    expect(bottom).toBeCloseTo(480 - WRITING_SCENE_GAP_PX, 6);
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThan(1);
  });

  test('sans encoche, l’ancre est le haut du cadre', () => {
    expect(writingSceneScale({ frameHeight: 800, barTop: 408, anchorTop: 0 })).toBeCloseTo((408 - WRITING_SCENE_GAP_PX) / 800, 6);
  });

  test('une barre plus BAS que le cadre ne grandit jamais la scène : échelle plafonnée à 1', () => {
    expect(writingSceneScale({ frameHeight: 600, barTop: 900, anchorTop: 0 })).toBe(1);
  });

  test('une barre au-dessus de l’ancre (paysage, grand clavier) : échelle nulle, jamais négative', () => {
    expect(writingSceneScale({ frameHeight: 400, barTop: 20, anchorTop: 30 })).toBe(0);
  });

  test('un cadre non mesuré (0) : aucune réduction', () => {
    expect(writingSceneScale({ frameHeight: 0, barTop: 300, anchorTop: 0 })).toBe(1);
  });
});

describe('keyboardInsetOf — la hauteur du clavier virtuel, lue au visualViewport', () => {
  test('clavier ouvert sur Safari iOS : la fenêtre garde sa hauteur, la vue visible rétrécit', () => {
    expect(keyboardInsetOf({ innerHeight: 844, viewportHeight: 508, viewportOffsetTop: 0 })).toBe(336);
  });

  test('la vue visible défilée par le navigateur : son décalage est retranché', () => {
    expect(keyboardInsetOf({ innerHeight: 844, viewportHeight: 508, viewportOffsetTop: 100 })).toBe(236);
  });

  test('coque Android (la WebView se redimensionne) : aucun retrait à poser', () => {
    expect(keyboardInsetOf({ innerHeight: 508, viewportHeight: 508, viewportOffsetTop: 0 })).toBe(0);
  });

  test('un arrondi de pixel ne devient jamais un retrait négatif', () => {
    expect(keyboardInsetOf({ innerHeight: 844, viewportHeight: 844.4, viewportOffsetTop: 0 })).toBe(0);
  });
});

describe('yieldingScene — comment la scène cède', () => {
  test('pleine : ni flou, ni réduction, et marquée pour la mesure', () => {
    const props = yieldingScene({ yieldTo: 'full', scale: 0.5, anchorTop: 47, reducedMotion: false });
    expect(props['data-scene-yields']).toBe('full');
    expect(props.style.filter).toBe('none');
    expect(props.style.transform).toBe('none');
  });

  test('lecture : un flou LÉGER, sans réduction', () => {
    const props = yieldingScene({ yieldTo: 'reading', scale: 0.5, anchorTop: 47, reducedMotion: false });
    expect(props['data-scene-yields']).toBe('reading');
    expect(props.style.filter).toBe(`blur(${SCENE_READING_BLUR_PX}px)`);
    expect(SCENE_READING_BLUR_PX).toBeGreaterThan(0);
    expect(SCENE_READING_BLUR_PX).toBeLessThanOrEqual(8);
    expect(props.style.transform).toBe('none');
  });

  test('écriture : nette, réduite, ancrée en haut à l’encoche', () => {
    const props = yieldingScene({ yieldTo: 'writing', scale: 0.5, anchorTop: 47, reducedMotion: false });
    expect(props['data-scene-yields']).toBe('writing');
    expect(props.style.filter).toBe('none');
    expect(props.style.transform).toBe('scale(0.5)');
    expect(props.style.transformOrigin).toBe('50% 47px');
  });

  test('le mouvement est animé, et ne l’est plus sous prefers-reduced-motion', () => {
    expect(yieldingScene({ yieldTo: 'reading', scale: 1, anchorTop: 0, reducedMotion: false }).style.transition).not.toBe('none');
    expect(yieldingScene({ yieldTo: 'reading', scale: 1, anchorTop: 0, reducedMotion: true }).style.transition).toBe('none');
  });
});

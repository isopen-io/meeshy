import { describe, expect, test } from 'bun:test';

import { KEYBOARD_NUDGE, KEYBOARD_ROTATE, KEYBOARD_SCALE, gripPose, keyboardPose, pointerFraction } from './studio-grip';
import { IDENTITY_POSE } from './studio-pose';

const stage = { left: 0, top: 0, width: 400, height: 800 } as const;

describe('pointerFraction — des PIXELS de plateau vers une fraction de scène', () => {
  test('le centre du plateau est (0,5 ; 0,5)', () => {
    expect(pointerFraction(stage, 200, 400)).toEqual({ x: 0.5, y: 0.5 });
  });

  test('l’origine du plateau est (0 ; 0), le coin opposé (1 ; 1)', () => {
    expect(pointerFraction(stage, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(pointerFraction(stage, 400, 800)).toEqual({ x: 1, y: 1 });
  });

  test('un plateau décalé dans la page ne décale pas la fraction', () => {
    expect(pointerFraction({ left: 120, top: 60, width: 400, height: 800 }, 320, 460)).toEqual({ x: 0.5, y: 0.5 });
  });

  test('un plateau de taille NULLE (pas encore mesuré) rend le centre, jamais NaN', () => {
    expect(pointerFraction({ left: 0, top: 0, width: 0, height: 0 }, 10, 10)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('gripPose — UNE poignée qui donne à la fois l’échelle et la rotation', () => {
  const origin = { centerX: 200, centerY: 400, grabX: 300, grabY: 400, scale: 1, rotation: 0 } as const;

  test('rester sur place ne change rien', () => {
    expect(gripPose(IDENTITY_POSE, origin, 300, 400)).toEqual(IDENTITY_POSE);
  });

  test('s’éloigner du centre AGRANDIT, dans le rapport des distances', () => {
    expect(gripPose(IDENTITY_POSE, origin, 400, 400).scale).toBe(2);
  });

  test('se rapprocher RÉDUIT, et l’échelle reste bornée', () => {
    expect(gripPose(IDENTITY_POSE, origin, 250, 400).scale).toBe(0.5);
    expect(gripPose(IDENTITY_POSE, origin, 201, 400).scale).toBe(0.3);
  });

  test('l’échelle COMPOSE avec celle en place — reprendre un objet agrandi ne le fait pas sauter', () => {
    expect(gripPose({ ...IDENTITY_POSE, scale: 1.5 }, { ...origin, scale: 1.5 }, 400, 400).scale).toBe(3);
  });

  test('tourner autour du centre fait TOURNER, du même angle', () => {
    // Saisi à droite du centre (0°), relâché au-dessus (−90° en repère écran).
    expect(gripPose(IDENTITY_POSE, origin, 200, 300).rotation).toBe(-90);
  });

  test('la rotation COMPOSE avec celle en place et se ramène dans le tour', () => {
    expect(gripPose({ ...IDENTITY_POSE, rotation: 170 }, { ...origin, rotation: 170 }, 200, 500).rotation).toBe(-100);
  });

  test('l’ANCRE ne bouge pas — une poignée d’échelle ne déplace pas l’objet', () => {
    const moved = gripPose({ x: 0.2, y: 0.8, scale: 1, rotation: 0 }, origin, 400, 400);
    expect(moved.x).toBe(0.2);
    expect(moved.y).toBe(0.8);
  });

  test('une poignée saisie SUR le centre ne divise pas par zéro', () => {
    const degenerate = { centerX: 200, centerY: 400, grabX: 200, grabY: 400, scale: 1, rotation: 0 } as const;
    expect(gripPose(IDENTITY_POSE, degenerate, 300, 400)).toEqual(IDENTITY_POSE);
  });
});

describe('keyboardPose — TOUT ce que le pointeur fait, le clavier le fait aussi (dimension 5)', () => {
  test('les flèches déplacent d’un pas constant', () => {
    expect(keyboardPose(IDENTITY_POSE, 'ArrowRight', false)).toEqual({ ...IDENTITY_POSE, x: 0.5 + KEYBOARD_NUDGE });
    expect(keyboardPose(IDENTITY_POSE, 'ArrowUp', false)).toEqual({ ...IDENTITY_POSE, y: 0.5 - KEYBOARD_NUDGE });
  });

  test('avec Maj, le pas est DIX fois plus grand — traverser la scène ne demande pas cent frappes', () => {
    expect(keyboardPose(IDENTITY_POSE, 'ArrowRight', true)!.x).toBeCloseTo(0.5 + KEYBOARD_NUDGE * 10, 6);
  });

  test('« + » et « - » changent l’échelle', () => {
    expect(keyboardPose(IDENTITY_POSE, '+', false)!.scale).toBeCloseTo(KEYBOARD_SCALE, 6);
    expect(keyboardPose(IDENTITY_POSE, '-', false)!.scale).toBeCloseTo(1 / KEYBOARD_SCALE, 6);
  });

  test('« [ » et « ] » tournent', () => {
    expect(keyboardPose(IDENTITY_POSE, ']', false)!.rotation).toBe(KEYBOARD_ROTATE);
    expect(keyboardPose(IDENTITY_POSE, '[', false)!.rotation).toBe(-KEYBOARD_ROTATE);
  });

  test('une touche SANS effet rend null — l’hôte ne doit pas avaler ce qu’il ne traite pas', () => {
    expect(keyboardPose(IDENTITY_POSE, 'a', false)).toBeNull();
    expect(keyboardPose(IDENTITY_POSE, 'Tab', false)).toBeNull();
  });

  test('le clavier respecte les MÊMES bornes que le geste', () => {
    expect(keyboardPose({ ...IDENTITY_POSE, x: 1 }, 'ArrowRight', true)!.x).toBe(1);
    expect(keyboardPose({ ...IDENTITY_POSE, scale: 4 }, '+', false)!.scale).toBe(4);
  });
});

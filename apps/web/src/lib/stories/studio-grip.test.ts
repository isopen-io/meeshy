import { describe, expect, test } from 'bun:test';

import { KEYBOARD_NUDGE, KEYBOARD_ROTATE, KEYBOARD_SCALE, keyboardPose, pinchPose, pointerFraction } from './studio-grip';
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

describe('pinchPose — pincer et tourner à DEUX doigts (#8515, miroir iOS)', () => {
  const at = (x: number, y: number) => ({ x, y });

  test('écarter les doigts du double agrandit du double, sans déplacer l’objet', () => {
    const pose = pinchPose(IDENTITY_POSE, [at(100, 100), at(200, 100)], [at(50, 100), at(250, 100)]);
    expect(pose).toEqual({ ...IDENTITY_POSE, scale: 2 });
  });

  test('tourner les doigts de 90° tourne l’objet de 45° — la sensibilité d’iOS est divisée par deux', () => {
    const pose = pinchPose(IDENTITY_POSE, [at(100, 100), at(200, 100)], [at(150, 50), at(150, 150)]);
    expect(pose.rotation).toBeCloseTo(45, 6);
    expect(pose.scale).toBeCloseTo(1, 6);
  });

  test('le pincement COMPOSE avec la pose de départ et respecte les bornes', () => {
    const origin = { ...IDENTITY_POSE, scale: 3, rotation: 170 };
    const pose = pinchPose(origin, [at(0, 0), at(100, 0)], [at(0, 0), at(0, 200)]);
    expect(pose.scale).toBe(4);
    expect(pose.rotation).toBeCloseTo(-145, 6);
  });

  test('deux doigts confondus au départ : aucun effet plutôt qu’une division par zéro', () => {
    expect(pinchPose(IDENTITY_POSE, [at(10, 10), at(10, 10)], [at(0, 0), at(90, 0)])).toEqual(IDENTITY_POSE);
  });
});

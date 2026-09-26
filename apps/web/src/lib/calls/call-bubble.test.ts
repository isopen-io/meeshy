import { describe, expect, test } from 'bun:test';

import {
  BUBBLE_KEY,
  bubbleOrigin,
  bubbleSize,
  DEFAULT_BUBBLE,
  isBubbleTap,
  nudgeBubble,
  PILL_COLLAPSE_DISTANCE,
  readBubblePlacement,
  snapBubble,
  writeBubblePlacement,
} from './call-bubble';

/**
 * **LA BULLE D'APPEL** (#8046, D9) — miroir de `CallBubbleView.swift` :
 * l'appel réduit se déplace librement, se CLIPSE au bord le plus proche au
 * lâcher, ne sort jamais des marges sûres, et retrouve sa place à l'appel
 * suivant. Au clavier, les flèches la déplacent (l'`accessibilityAdjustableAction`
 * d'iOS).
 */

const PHONE = { width: 390, height: 844 };
const INSETS = { top: 44, bottom: 34 };
const VIDEO = bubbleSize('video');

describe('bubbleOrigin', () => {
  test('à droite par défaut, sous l’en-tête, dans les marges sûres', () => {
    const origin = bubbleOrigin(DEFAULT_BUBBLE, PHONE, INSETS, VIDEO);
    expect(origin.left + VIDEO.width).toBe(PHONE.width - 12);
    expect(origin.top).toBeGreaterThanOrEqual(INSETS.top + 12);
  });

  test('aux extrêmes, la bulle reste entière à l’écran, même sur le plus petit gabarit', () => {
    const small = { width: 320, height: 568 };
    const top = bubbleOrigin({ edge: 'left', fraction: 0 }, small, INSETS, VIDEO);
    const bottom = bubbleOrigin({ edge: 'left', fraction: 1 }, small, INSETS, VIDEO);
    expect(top).toEqual({ left: 12, top: INSETS.top + 12 });
    expect(bottom.top + VIDEO.height).toBe(small.height - INSETS.bottom - 12);
  });
});

describe('snapBubble', () => {
  test('lâchée à gauche du milieu, elle se clipse à gauche ; à droite, à droite', () => {
    expect(snapBubble({ x: 100, y: 400 }, PHONE, INSETS, VIDEO).edge).toBe('left');
    expect(snapBubble({ x: 300, y: 400 }, PHONE, INSETS, VIDEO).edge).toBe('right');
  });

  test('la hauteur lâchée est gardée, bornée aux marges', () => {
    const placed = snapBubble({ x: 300, y: 400 }, PHONE, INSETS, VIDEO);
    expect(bubbleOrigin(placed, PHONE, INSETS, VIDEO).top + VIDEO.height / 2).toBeCloseTo(400, 0);
    expect(snapBubble({ x: 300, y: -500 }, PHONE, INSETS, VIDEO).fraction).toBe(0);
    expect(snapBubble({ x: 300, y: 5000 }, PHONE, INSETS, VIDEO).fraction).toBe(1);
  });
});

describe('au clavier', () => {
  test('les flèches changent de bord ou montent et descendent par paliers bornés', () => {
    expect(nudgeBubble({ edge: 'right', fraction: 0.5 }, 'ArrowLeft')).toEqual({ edge: 'left', fraction: 0.5 });
    expect(nudgeBubble({ edge: 'left', fraction: 0.5 }, 'ArrowRight')).toEqual({ edge: 'right', fraction: 0.5 });
    expect(nudgeBubble({ edge: 'left', fraction: 0.05 }, 'ArrowUp')).toEqual({ edge: 'left', fraction: 0 });
    expect(nudgeBubble({ edge: 'left', fraction: 0.95 }, 'ArrowDown')).toEqual({ edge: 'left', fraction: 1 });
    expect(nudgeBubble({ edge: 'left', fraction: 0.5 }, 'Enter')).toBeNull();
  });
});

describe('les gestes', () => {
  test('un toucher qui bouge à peine est un toucher, pas un déplacement', () => {
    expect(isBubbleTap({ x: 3, y: -4 })).toBe(true);
    expect(isBubbleTap({ x: 12, y: 0 })).toBe(false);
  });

  test('la pastille se replie en bulle au-delà d’un glissement franc', () => {
    expect(PILL_COLLAPSE_DISTANCE).toBeGreaterThanOrEqual(48);
  });
});

describe('mémoire de la place', () => {
  const memory = () => {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
  };

  test('la place se relit, une place illisible rend la place par défaut', () => {
    const storage = memory();
    writeBubblePlacement(storage, { edge: 'left', fraction: 0.7 });
    expect(readBubblePlacement(storage)).toEqual({ edge: 'left', fraction: 0.7 });
    storage.setItem(BUBBLE_KEY, '{"edge":"haut","fraction":9}');
    expect(readBubblePlacement(storage)).toEqual(DEFAULT_BUBBLE);
    expect(readBubblePlacement(null)).toEqual(DEFAULT_BUBBLE);
  });
});

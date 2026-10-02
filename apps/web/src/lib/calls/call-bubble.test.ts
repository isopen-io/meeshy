import { describe, expect, test } from 'bun:test';

import {
  BUBBLE_BAR,
  BUBBLE_KEY,
  BUBBLE_TIERS,
  bubbleBarRows,
  bubbleOrigin,
  bubbleSize,
  DEFAULT_BUBBLE,
  fittingTier,
  isBubbleTap,
  nudgeBubble,
  offersOutputChoice,
  PILL_COLLAPSE_DISTANCE,
  pinchTier,
  readBubblePlacement,
  snapBubble,
  WHEEL_STEP,
  wheelTier,
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
    expect(nudgeBubble({ edge: 'right', fraction: 0.5, tier: 'small' }, 'ArrowLeft')).toEqual({ edge: 'left', fraction: 0.5, tier: 'small' });
    expect(nudgeBubble({ edge: 'left', fraction: 0.5, tier: 'small' }, 'ArrowRight')).toEqual({ edge: 'right', fraction: 0.5, tier: 'small' });
    expect(nudgeBubble({ edge: 'left', fraction: 0.05, tier: 'small' }, 'ArrowUp')).toEqual({ edge: 'left', fraction: 0, tier: 'small' });
    expect(nudgeBubble({ edge: 'left', fraction: 0.95, tier: 'small' }, 'ArrowDown')).toEqual({ edge: 'left', fraction: 1, tier: 'small' });
    expect(nudgeBubble({ edge: 'left', fraction: 0.5, tier: 'small' }, 'Enter')).toBeNull();
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

  test('la place et la taille se relisent, une place illisible rend la place par défaut', () => {
    const storage = memory();
    writeBubblePlacement(storage, { edge: 'left', fraction: 0.7, tier: 'large' });
    expect(readBubblePlacement(storage)).toEqual({ edge: 'left', fraction: 0.7, tier: 'large' });
    storage.setItem(BUBBLE_KEY, '{"edge":"left","fraction":0.3}');
    expect(readBubblePlacement(storage)).toEqual({ edge: 'left', fraction: 0.3, tier: 'small' });
    storage.setItem(BUBBLE_KEY, '{"edge":"left","fraction":0.3,"tier":"géant"}');
    expect(readBubblePlacement(storage)).toEqual({ edge: 'left', fraction: 0.3, tier: 'small' });
    storage.setItem(BUBBLE_KEY, '{"edge":"haut","fraction":9}');
    expect(readBubblePlacement(storage)).toEqual(DEFAULT_BUBBLE);
    expect(readBubblePlacement(null)).toEqual(DEFAULT_BUBBLE);
  });
});

describe('les tailles de la bulle (#8145)', () => {
  const PHONE_SPACE = { width: 390, height: 844 };
  const SMALL_PHONE = { width: 320, height: 568 };
  const HEADER_AND_COMPOSER = { top: 64, bottom: 120 };

  test('trois paliers, du plus petit au plus grand, la barre comprise', () => {
    const [small, medium, large] = BUBBLE_TIERS.map((tier) => bubbleSize('video', tier));
    expect(BUBBLE_TIERS).toEqual(['small', 'medium', 'large']);
    expect(small!.width).toBeLessThan(medium!.width);
    expect(medium!.width).toBeLessThan(large!.width);
    expect(small!.height).toBeLessThan(medium!.height);
    expect(medium!.height).toBeLessThan(large!.height);
    expect(bubbleSize('video')).toEqual(small!);
  });

  test('la barre passe à la ligne plutôt que de rogner une cible de 44', () => {
    expect(bubbleBarRows(136, 3)).toBe(1);
    expect(bubbleBarRows(136, 4)).toBe(2);
    expect(bubbleSize('video', 'small', 4).height - bubbleSize('video', 'small', 3).height).toBe(BUBBLE_BAR);
  });

  test('au pincement : écarter les doigts grandit, les rapprocher rapetisse, d’un palier par quart de zoom', () => {
    expect(pinchTier('small', 1.3)).toBe('medium');
    expect(pinchTier('small', 1.6)).toBe('large');
    expect(pinchTier('large', 0.75)).toBe('medium');
    expect(pinchTier('medium', 1.05)).toBe('medium');
    expect(pinchTier('large', 3)).toBe('large');
    expect(pinchTier('small', 0.2)).toBe('small');
  });

  test('à Ctrl + molette : un palier par cran franc, molette vers le haut = plus grand', () => {
    expect(wheelTier('small', 0, -10)).toEqual({ tier: 'small', accumulated: -10 });
    expect(wheelTier('small', -10, -WHEEL_STEP)).toEqual({ tier: 'medium', accumulated: 0 });
    expect(wheelTier('medium', 0, WHEEL_STEP)).toEqual({ tier: 'small', accumulated: 0 });
    expect(wheelTier('large', 0, -WHEEL_STEP * 3)).toEqual({ tier: 'large', accumulated: 0 });
  });

  test('au clavier : + et − changent de palier, bornés ; la place ne bouge pas', () => {
    const at = { edge: 'left', fraction: 0.4, tier: 'small' } as const;
    expect(nudgeBubble(at, '+')).toEqual({ ...at, tier: 'medium' });
    expect(nudgeBubble({ ...at, tier: 'medium' }, '=')).toEqual({ ...at, tier: 'large' });
    expect(nudgeBubble({ ...at, tier: 'large' }, '+')).toEqual({ ...at, tier: 'large' });
    expect(nudgeBubble({ ...at, tier: 'large' }, '-')).toEqual({ ...at, tier: 'medium' });
    expect(nudgeBubble(at, '-')).toEqual(at);
  });

  test('à chaque palier, la bulle reste entière à l’écran, collée à son bord, hors de l’en-tête et du champ d’écriture', () => {
    for (const viewport of [PHONE_SPACE, SMALL_PHONE]) {
      for (const tier of BUBBLE_TIERS) {
        for (const kind of ['video', 'portrait'] as const) {
          const size = bubbleSize(kind, fittingTier(tier, viewport, HEADER_AND_COMPOSER, (candidate) => bubbleSize(kind, candidate, 4)), 4);
          for (const fraction of [0, 1]) {
            for (const edge of ['left', 'right'] as const) {
              const origin = bubbleOrigin({ edge, fraction }, viewport, HEADER_AND_COMPOSER, size);
              expect(origin.top).toBeGreaterThanOrEqual(HEADER_AND_COMPOSER.top);
              expect(origin.top + size.height).toBeLessThanOrEqual(viewport.height - HEADER_AND_COMPOSER.bottom);
              expect(edge === 'left' ? origin.left : viewport.width - origin.left - size.width).toBe(12);
            }
          }
        }
      }
    }
  });

  test('un palier qui ne tient pas dans l’écran descend jusqu’à celui qui tient', () => {
    const landscape = { width: 844, height: 420 };
    const sizeOf = (tier: 'small' | 'medium' | 'large') => bubbleSize('video', tier);
    expect(fittingTier('large', PHONE, INSETS, sizeOf)).toBe('large');
    expect(fittingTier('large', landscape, { top: 64, bottom: 96 }, sizeOf)).toBe('small');
    expect(fittingTier('medium', PHONE, INSETS, sizeOf)).toBe('medium');
  });
});

describe('« Choisir les périphériques » dans la bulle (#9097)', () => {
  test('offert là où l’on choisit la sortie : setSinkId du navigateur, ou les routes de la coque', () => {
    expect(offersOutputChoice({ shell: false, sinks: true })).toBe(true);
    expect(offersOutputChoice({ shell: true, sinks: false })).toBe(true);
    expect(offersOutputChoice({ shell: false, sinks: false })).toBe(false);
  });
});

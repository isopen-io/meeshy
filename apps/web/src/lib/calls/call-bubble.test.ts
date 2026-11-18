import { describe, expect, test } from 'bun:test';

import {
  BUBBLE_KEY,
  BUBBLE_TIERS,
  bubbleOrigin,
  bubbleSize,
  bubbleTranslate,
  BUBBLE_SETTLE_TRANSITION,
  GLIDE_PROJECTION_MS,
  glideBubble,
  MAX_GLIDE,
  releaseVelocity,
  DEFAULT_BUBBLE,
  fittingTier,
  isBubbleTap,
  nudgeBubble,
  PILL_COLLAPSE_DISTANCE,
  pillSwipeOutcome,
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

  test('trois paliers, du plus petit au plus grand — la personne seule, sans barre (#19696)', () => {
    const [small, medium, large] = BUBBLE_TIERS.map((tier) => bubbleSize('video', tier));
    expect(BUBBLE_TIERS).toEqual(['small', 'medium', 'large']);
    expect(small!.width).toBeLessThan(medium!.width);
    expect(medium!.width).toBeLessThan(large!.width);
    expect(small!.height).toBeLessThan(medium!.height);
    expect(medium!.height).toBeLessThan(large!.height);
    expect(bubbleSize('video')).toEqual(small!);
  });

  test('#19696 — la bulle n’a plus de barre de commandes : sa hauteur est celle de son cadre', () => {
    expect(bubbleSize('video', 'small')).toEqual({ width: 136, height: 180 });
    expect(bubbleSize('portrait', 'small')).toEqual({ width: 136, height: 104 });
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
          const size = bubbleSize(kind, fittingTier(tier, viewport, HEADER_AND_COMPOSER, (candidate) => bubbleSize(kind, candidate)));
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
    expect(fittingTier('large', landscape, { top: 64, bottom: 96 }, sizeOf)).toBe('medium');
    expect(fittingTier('medium', PHONE, INSETS, sizeOf)).toBe('medium');
  });
});

describe('bubbleTranslate — la bulle se déplace en `translate`, jamais en left/top (#11314)', () => {
  test('au repos : l’origine, la zone sûre haute ajoutée en CSS', () => {
    expect(bubbleTranslate({ origin: { left: 280, top: 96 }, drag: null })).toBe('280px calc(96px + env(safe-area-inset-top))');
  });

  test('pendant le glissé : le doigt s’ajoute à l’origine', () => {
    expect(bubbleTranslate({ origin: { left: 280, top: 96 }, drag: { x: -30, y: 12 } })).toBe('250px calc(108px + env(safe-area-inset-top))');
  });

  test('l’aimantation au bord ne joue QUE `translate`, au tempo de l’ancienne transition', () => {
    expect(BUBBLE_SETTLE_TRANSITION).toBe('translate 420ms cubic-bezier(0.22, 1, 0.36, 1)');
  });
});

describe('le glissé de la capsule (P18.10)', () => {
  test('un glissé assez long replie la capsule en bulle ; plus court, c’est un toucher', () => {
    expect(pillSwipeOutcome({ travelled: PILL_COLLAPSE_DISTANCE, sharing: false })).toBe('collapse');
    expect(pillSwipeOutcome({ travelled: -PILL_COLLAPSE_DISTANCE - 10, sharing: false })).toBe('collapse');
    expect(pillSwipeOutcome({ travelled: PILL_COLLAPSE_DISTANCE - 1, sharing: false })).toBe('tap');
    expect(pillSwipeOutcome({ travelled: PILL_COLLAPSE_DISTANCE - 1, sharing: true })).toBe('tap');
  });

  test('pendant mon partage d’écran, le glissé ne replie pas, et il n’est pas non plus un toucher qui rouvrirait l’appel', () => {
    expect(pillSwipeOutcome({ travelled: PILL_COLLAPSE_DISTANCE * 3, sharing: true })).toBe('stay');
    expect(pillSwipeOutcome({ travelled: -PILL_COLLAPSE_DISTANCE, sharing: true })).toBe('stay');
  });
});

describe('#19701 — la vignette glisse avec élan', () => {
  test('la vitesse du lâcher se lit sur les derniers instants du doigt', () => {
    expect(releaseVelocity([])).toEqual({ x: 0, y: 0 });
    expect(releaseVelocity([{ x: 10, y: 10, t: 0 }])).toEqual({ x: 0, y: 0 });
    expect(releaseVelocity([{ x: 0, y: 0, t: 0 }, { x: 50, y: -20, t: 50 }])).toEqual({ x: 1, y: -0.4 });
  });

  test('un échantillon trop ancien ne fausse pas la vitesse : un doigt arrêté avant de lâcher ne lance rien', () => {
    expect(releaseVelocity([{ x: 0, y: 0, t: 0 }, { x: 80, y: 0, t: 300 }])).toEqual({ x: 0, y: 0 });
  });

  test('lâchée doucement, elle reste où le doigt l’a laissée ; jetée, elle poursuit sa course', () => {
    expect(glideBubble({ x: 30, y: 10 }, { x: 0, y: 0 })).toEqual({ x: 30, y: 10 });
    expect(glideBubble({ x: 30, y: 10 }, { x: 1, y: -0.5 })).toEqual({ x: 30 + GLIDE_PROJECTION_MS, y: 10 - 0.5 * GLIDE_PROJECTION_MS });
  });

  test('un jet violent est borné sur chaque axe : elle ne traverse pas l’écran', () => {
    expect(glideBubble({ x: 0, y: 0 }, { x: 50, y: -50 })).toEqual({ x: MAX_GLIDE, y: -MAX_GLIDE });
  });

  test('jetée vers l’autre bord, elle change de bord ; sans l’élan, elle serait restée', () => {
    const viewport = { width: 390, height: 844 };
    const size = bubbleSize('video');
    const insets = { top: 64, bottom: 120 };
    const origin = { left: 390 - 12 - size.width, top: 300 };
    const moved = { x: -60, y: 0 };
    const centerOf = (point: { readonly x: number; readonly y: number }) => ({ x: origin.left + point.x + size.width / 2, y: origin.top + point.y + size.height / 2 });
    expect(snapBubble(centerOf(moved), viewport, insets, size).edge).toBe('right');
    expect(snapBubble(centerOf(glideBubble(moved, { x: -1.2, y: 0 })), viewport, insets, size).edge).toBe('left');
  });
});


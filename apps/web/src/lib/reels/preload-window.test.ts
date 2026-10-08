import { describe, expect, test } from 'bun:test';

import {
  PRELOAD_MAX_RADIUS,
  PRELOAD_MIN_RADIUS,
  type PreloadContext,
  preloadTierOf,
  preloadWindowOf,
  primeBytesOf,
  recordVisit,
} from './preload-window';

/**
 * LA FENÊTRE DE PRÉCHARGEMENT DES RÉELS (#9702) — pure : combien de réels
 * préparer devant et derrière celui qu'on regarde, et jusqu'où chacun l'est.
 * Le rayon ne descend JAMAIS sous 2 et ne dépasse jamais 10 ; il s'élargit
 * avec la cadence de balayage, se resserre sous la contrainte (données
 * économisées, réseau lent, mémoire ou batterie faibles).
 */
const context = (partial: Partial<PreloadContext> = {}): PreloadContext => ({
  visits: [],
  network: { effectiveType: '4g', saveData: false },
  ...partial,
});

const visits = (dwellsMs: readonly number[], direction: 'forward' | 'backward' = 'forward') =>
  dwellsMs.map((dwellMs) => ({ dwellMs, direction }));

describe('preloadWindowOf — toujours N−2 à N+2, au moins', () => {
  test('sans historique, la fenêtre est le plancher : deux de chaque côté', () => {
    expect(preloadWindowOf(context())).toEqual({ ahead: PRELOAD_MIN_RADIUS, behind: PRELOAD_MIN_RADIUS });
    expect(PRELOAD_MIN_RADIUS).toBe(2);
    expect(PRELOAD_MAX_RADIUS).toBe(10);
  });

  test('même sous la contrainte la plus forte, le plancher tient', () => {
    const starved = context({
      visits: visits([400, 500, 300, 450]),
      network: { effectiveType: 'slow-2g', saveData: true },
      deviceMemoryGb: 1,
      lowPower: true,
    });
    expect(preloadWindowOf(starved)).toEqual({ ahead: 2, behind: 2 });
  });
});

describe('preloadWindowOf — la cadence de balayage élargit la fenêtre DEVANT', () => {
  test('un lecteur qui regarde chaque réel longtemps garde le plancher', () => {
    expect(preloadWindowOf(context({ visits: visits([12_000, 15_000, 9_000]) })).ahead).toBe(2);
  });

  test('plus on balaie vite, plus on prépare loin, jusqu’à dix', () => {
    const calm = preloadWindowOf(context({ visits: visits([5_000, 4_000, 5_500]) })).ahead;
    const brisk = preloadWindowOf(context({ visits: visits([2_000, 2_500, 1_800]) })).ahead;
    const frantic = preloadWindowOf(context({ visits: visits([600, 500, 700, 400, 650]) })).ahead;
    expect(calm).toBeGreaterThan(2);
    expect(brisk).toBeGreaterThan(calm);
    expect(frantic).toBe(PRELOAD_MAX_RADIUS);
  });

  test('la médiane, pas la moyenne : un seul arrêt long ne referme pas la fenêtre d’un balayeur', () => {
    const withOnePause = preloadWindowOf(context({ visits: visits([600, 500, 60_000, 700, 400]) })).ahead;
    expect(withOnePause).toBe(PRELOAD_MAX_RADIUS);
  });
});

describe('preloadWindowOf — DERRIÈRE, la fenêtre suit les retours en arrière', () => {
  test('un balayeur qui ne revient jamais garde derrière le seul plancher', () => {
    expect(preloadWindowOf(context({ visits: visits([600, 500, 700, 400]) })).behind).toBe(2);
  });

  test('un lecteur qui revient souvent en arrière est servi autant derrière que devant', () => {
    const mixed = [
      ...visits([600, 500], 'forward'),
      ...visits([700, 400], 'backward'),
      ...visits([500], 'forward'),
      ...visits([600], 'backward'),
    ];
    const window = preloadWindowOf(context({ visits: mixed }));
    expect(window.behind).toBe(window.ahead);
  });
});

describe('preloadWindowOf — la contrainte plafonne, jamais sous deux', () => {
  const frantic = visits([600, 500, 700, 400, 650]);

  test('les données économisées ou un réseau 2G rendent le plancher', () => {
    expect(preloadWindowOf(context({ visits: frantic, network: { saveData: true } })).ahead).toBe(2);
    expect(preloadWindowOf(context({ visits: frantic, network: { effectiveType: '2g' } })).ahead).toBe(2);
  });

  test('un réseau 3G plafonne à quatre', () => {
    expect(preloadWindowOf(context({ visits: frantic, network: { effectiveType: '3g' } })).ahead).toBe(4);
  });

  test('un appareil à peu de mémoire plafonne à quatre', () => {
    expect(preloadWindowOf(context({ visits: frantic, deviceMemoryGb: 2 })).ahead).toBe(4);
  });

  test('la batterie faible rend le plancher', () => {
    expect(preloadWindowOf(context({ visits: frantic, lowPower: true })).ahead).toBe(2);
  });

  test('un réseau inconnu (navigateur muet) ne plafonne pas', () => {
    expect(preloadWindowOf(context({ visits: frantic, network: {} })).ahead).toBe(PRELOAD_MAX_RADIUS);
  });
});

describe('preloadTierOf — chaque distance a son palier', () => {
  const window = { ahead: 6, behind: 3 };

  test('le réel regardé joue, ses voisins immédiats ont leur première image décodée', () => {
    expect(preloadTierOf(0, window)).toBe('play');
    expect(preloadTierOf(1, window)).toBe('decode');
    expect(preloadTierOf(-1, window)).toBe('decode');
  });

  test('à deux pas, l’élément est monté ; au-delà et dans la fenêtre, seuls les octets de tête', () => {
    expect(preloadTierOf(2, window)).toBe('mount');
    expect(preloadTierOf(-2, window)).toBe('mount');
    expect(preloadTierOf(3, window)).toBe('prime');
    expect(preloadTierOf(6, window)).toBe('prime');
    expect(preloadTierOf(-3, window)).toBe('prime');
  });

  test('hors de la fenêtre, rien — et la fenêtre est asymétrique', () => {
    expect(preloadTierOf(7, window)).toBe('idle');
    expect(preloadTierOf(-4, window)).toBe('idle');
  });
});

describe('primeBytesOf — l’amorce décroît avec la distance et la contrainte', () => {
  test('rien à amorcer pour un réel déjà monté ou hors fenêtre', () => {
    expect(primeBytesOf({ tier: 'play', distance: 0, network: {} })).toBe(0);
    expect(primeBytesOf({ tier: 'decode', distance: 1, network: {} })).toBe(0);
    expect(primeBytesOf({ tier: 'idle', distance: 9, network: {} })).toBe(0);
  });

  test('le réel monté et le premier amorcé prennent plus que les lointains', () => {
    const mount = primeBytesOf({ tier: 'mount', distance: 2, network: { effectiveType: '4g' } });
    const near = primeBytesOf({ tier: 'prime', distance: 3, network: { effectiveType: '4g' } });
    const far = primeBytesOf({ tier: 'prime', distance: 9, network: { effectiveType: '4g' } });
    expect(mount).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  test('les données économisées divisent l’amorce', () => {
    const open = primeBytesOf({ tier: 'mount', distance: 2, network: { effectiveType: '4g' } });
    const saving = primeBytesOf({ tier: 'mount', distance: 2, network: { saveData: true } });
    expect(saving).toBeLessThan(open);
    expect(saving).toBeGreaterThan(0);
  });
});

describe('recordVisit — l’historique est borné et ignore les traversées', () => {
  test('un réel traversé d’un trait (moins de 150 ms) ne compte pas comme une visite', () => {
    expect(recordVisit([], { dwellMs: 80, direction: 'forward' })).toEqual([]);
  });

  test('garde les douze dernières visites, la plus récente en dernier', () => {
    const history = Array.from({ length: 12 }, (_, i) => ({ dwellMs: 1_000 + i, direction: 'forward' as const }));
    const next = recordVisit(history, { dwellMs: 9_999, direction: 'backward' });
    expect(next).toHaveLength(12);
    expect(next[0]?.dwellMs).toBe(1_001);
    expect(next.at(-1)).toEqual({ dwellMs: 9_999, direction: 'backward' });
  });
});

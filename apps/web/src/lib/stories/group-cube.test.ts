import { describe, expect, test } from 'bun:test';

import {
  CUBE_COMMIT_DURATION_MS,
  CUBE_COMMIT_FRACTION,
  CUBE_EDGE_DEGREES,
  CUBE_EDGE_RESISTANCE_IN_WIDTHS,
  CUBE_REVERSAL_TOLERANCE,
  CUBE_SETTLE_DURATION_MS,
  cubeFace,
  cubeFaces,
  cubicBezier,
  decideGroupSwipe,
  displayedTranslation,
  faceDegrees,
  projectPoint,
  type GroupSwipeOutcome,
} from './group-cube';

/**
 * LE CUBE ENTRE DEUX AUTEURS (#11198) — témoins portés de
 * `StoryGroupCubeTests` (iOS, #11192), mêmes progressions, même écran.
 */
const screen = { width: 390, height: 844 } as const;

type Point = { readonly x: number; readonly y: number };

const point = (x: number, y: number, offsetX: number): Point =>
  projectPoint({ x, y }, cubeFace({ offsetX, ...screen }).matrix);

const expectSame = (a: Point, b: Point): void => {
  expect(a.x).toBeCloseTo(b.x, 2);
  expect(a.y).toBeCloseTo(b.y, 2);
};

const PROGRESSIONS = [0.2, 0.35, 0.5, 0.65, 0.8] as const;

describe('faceDegrees — l’angle d’une face suit le doigt, sans jamais atteindre 90°', () => {
  test('à mi-course 45°, à largeur nulle 0°', () => {
    expect(faceDegrees(512, 1024)).toBeCloseTo(45, 4);
    expect(faceDegrees(0, 0)).toBe(0);
  });

  test('au bord et au-delà, la face reste de profil (89,5°), jamais dégénérée', () => {
    for (const offset of [1024, -1024, 1024 * 1.08, -1024 * 1.08]) {
      const degrees = Math.abs(faceDegrees(offset, 1024));
      expect(degrees).toBeLessThan(90);
      expect(degrees).toBeGreaterThan(89);
    }
    expect(CUBE_EDGE_DEGREES).toBe(89.5);
  });
});

describe('cubeFace — la géométrie d’un vrai cube', () => {
  test('au repos la story n’est pas déformée, ni assombrie', () => {
    for (const corner of [
      { x: 0, y: 0 },
      { x: screen.width, y: screen.height },
      { x: 120, y: 700 },
    ]) {
      expectSame(point(corner.x, corner.y, 0), corner);
    }
    expect(cubeFace({ offsetX: 0, ...screen }).shade).toBeCloseTo(0, 4);
    expect(cubeFace({ offsetX: 0, ...screen }).isFacingViewer).toBe(true);
  });

  test('vers l’auteur suivant, les deux faces partagent leur arête', () => {
    for (const progress of PROGRESSIONS) {
      const current = -progress * screen.width;
      const incoming = current + screen.width;
      expectSame(point(screen.width, 0, current), point(0, 0, incoming));
      expectSame(point(screen.width, screen.height, current), point(0, screen.height, incoming));
    }
  });

  test('vers l’auteur précédent, les deux faces partagent leur arête', () => {
    for (const progress of PROGRESSIONS) {
      const current = progress * screen.width;
      const incoming = current - screen.width;
      expectSame(point(0, 0, current), point(screen.width, 0, incoming));
      expectSame(point(0, screen.height, current), point(screen.width, screen.height, incoming));
    }
  });

  /* Sur chaque face VISIBLE : à 81° (90 % de course) la face sortante est
     déjà vue de dos depuis la caméra, masquée — l'arête n'y est plus tenue que
     par la face entrante. */
  test('l’arête commune reste dans le plan de l’écran, jamais plus haute que lui', () => {
    for (const progress of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const { current, incoming } = cubeFaces({ offsetX: -progress * screen.width, ...screen });
      const edges = [
        ...(current.isFacingViewer ? [{ x: screen.width, matrix: current.matrix }] : []),
        ...(incoming !== null && incoming.face.isFacingViewer ? [{ x: 0, matrix: incoming.face.matrix }] : []),
      ];
      expect(edges.length).toBeGreaterThan(0);
      for (const edge of edges) {
        expect(projectPoint({ x: edge.x, y: 0 }, edge.matrix).y).toBeCloseTo(0, 2);
        expect(projectPoint({ x: edge.x, y: screen.height }, edge.matrix).y).toBeCloseTo(screen.height, 2);
      }
    }
  });

  test('l’arête part du côté du doigt, et se tient sous lui à mi-course', () => {
    const positions = Array.from({ length: 9 }, (_, step) => point(screen.width, screen.height / 2, -(step / 10) * screen.width).x);
    expect(positions).toEqual([...positions].sort((a, b) => b - a));
    expect(point(screen.width, 0, -screen.width / 2).x).toBeCloseTo(screen.width / 2, 2);
  });

  test('la face qui se détourne recule et s’assombrit', () => {
    const current = -0.4 * screen.width;
    const farEdgeHeight = point(0, screen.height, current).y - point(0, 0, current).y;
    expect(farEdgeHeight).toBeLessThan(screen.height * 0.95);
    expect(cubeFace({ offsetX: current, ...screen }).shade).toBeGreaterThan(0.1);
  });

  test('une face vue de dos est masquée — la face entrante ne recouvre pas en miroir le bord de la story', () => {
    const w = screen.width;
    expect(cubeFace({ offsetX: -0.02 * w + w, ...screen }).isFacingViewer).toBe(false);
    expect(cubeFace({ offsetX: 0.02 * w - w, ...screen }).isFacingViewer).toBe(false);
    expect(cubeFace({ offsetX: -0.5 * w + w, ...screen }).isFacingViewer).toBe(true);
    expect(cubeFace({ offsetX: -0.5 * w, ...screen }).isFacingViewer).toBe(true);
    expect(cubeFace({ offsetX: -0.98 * w, ...screen }).isFacingViewer).toBe(false);
  });

  test('une face masquée reçoit une transformation inversible, jamais la projection dégénérée', () => {
    const hidden = cubeFace({ offsetX: -0.02 * screen.width + screen.width, ...screen });
    expect(hidden.transform).toBe('matrix3d(0.001,0,0,0,0,0.001,0,0,0,0,1,0,0,0,0,1)');
  });

  test('au moins une face se voit pendant tout le tour — aucune image vide', () => {
    for (let step = 0; step <= 50; step++) {
      const { current, incoming } = cubeFaces({ offsetX: -(step / 50) * screen.width, ...screen });
      expect(current.isFacingViewer || incoming?.face.isFacingViewer === true).toBe(true);
    }
  });

  test('la transformation CSS est la matrice même, dans l’ordre de `matrix3d`', () => {
    const face = cubeFace({ offsetX: -0.3 * screen.width, ...screen });
    expect(face.transform).toBe(`matrix3d(${face.matrix.join(',')})`);
    expect(cubeFace({ offsetX: 0, ...screen }).transform).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  });
});

describe('cubeFaces — la face voisine attend de l’autre côté de l’arête', () => {
  test('doigt vers la gauche : la voisine vient de DROITE ; vers la droite : de GAUCHE ; au repos : aucune', () => {
    expect(cubeFaces({ offsetX: -100, ...screen }).incoming?.from).toBe('right');
    expect(cubeFaces({ offsetX: 100, ...screen }).incoming?.from).toBe('left');
    expect(cubeFaces({ offsetX: 0, ...screen }).incoming).toBeNull();
  });

  test('au bout de la course la voisine est à plat, à l’identité', () => {
    const landed = cubeFaces({ offsetX: -screen.width, ...screen }).incoming;
    expect(landed?.face.transform).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  });
});

describe('decideGroupSwipe — progressif et annulable jusqu’au bout', () => {
  const decide = (translation: number, predicted: number, neighbours: { readonly hasNext?: boolean; readonly hasPrevious?: boolean } = {}): GroupSwipeOutcome =>
    decideGroupSwipe({
      translation: translation * screen.width,
      predictedEnd: predicted * screen.width,
      width: screen.width,
      hasNext: neighbours.hasNext ?? true,
      hasPrevious: neighbours.hasPrevious ?? true,
    });

  test('les constantes sont celles d’iOS', () => {
    expect(CUBE_COMMIT_FRACTION).toBe(0.5);
    expect(CUBE_REVERSAL_TOLERANCE).toBe(0.04);
    expect(CUBE_EDGE_RESISTANCE_IN_WIDTHS).toBe(0.22);
  });

  test('relâché au-delà de la moitié, le cube tourne', () => {
    expect(decide(-0.6, -0.6)).toBe('next');
    expect(decide(0.6, 0.6)).toBe('previous');
  });

  test('relâché avant la moitié, il revient', () => {
    expect(decide(-0.3, -0.3)).toBe('cancel');
    expect(decide(0.3, 0.3)).toBe('cancel');
  });

  test('un lancer rapide fait tourner le cube', () => {
    expect(decide(-0.1, -0.7)).toBe('next');
    expect(decide(0.1, 0.7)).toBe('previous');
  });

  test('le doigt qui repart vers l’origine annule, même près du bout', () => {
    expect(decide(-0.3, -0.25)).toBe('cancel');
    expect(decide(-0.8, -0.6)).toBe('cancel');
    expect(decide(-0.95, -0.85)).toBe('cancel');
    expect(decide(0.9, 0.75)).toBe('cancel');
  });

  test('un doigt qui tremble n’est pas un retour en arrière', () => {
    expect(decide(-0.7, -0.69)).toBe('next');
  });

  test('un lancer qui retraverse l’origine annule', () => {
    expect(decide(-0.3, 0.6)).toBe('cancel');
    expect(decide(0.3, -0.6)).toBe('cancel');
  });

  test('sans auteur dans ce sens, rien ne tourne', () => {
    expect(decide(-0.8, -0.9, { hasNext: false })).toBe('cancel');
    expect(decide(0.8, 0.9, { hasPrevious: false })).toBe('cancel');
  });

  test('un geste immobile annule', () => {
    expect(decide(0, 0)).toBe('cancel');
  });
});

describe('displayedTranslation — la résistance aux bords', () => {
  test('avec un voisin, la carte suit le doigt 1:1', () => {
    expect(displayedTranslation(-150, screen.width, true)).toBe(-150);
  });

  test('sans voisin, la carte résiste, garde le sens du doigt et reste monotone', () => {
    const limit = screen.width * CUBE_EDGE_RESISTANCE_IN_WIDTHS;
    const drags = [10, 60, 150, 300, 390];
    const shown = drags.map((drag) => displayedTranslation(-drag, screen.width, false));
    drags.forEach((drag, index) => {
      const value = shown[index] ?? 0;
      expect(value).toBeLessThan(0);
      expect(Math.abs(value)).toBeLessThan(drag);
      expect(Math.abs(value)).toBeLessThan(limit);
    });
    expect(shown).toEqual([...shown].sort((a, b) => b - a));
    expect(displayedTranslation(0, screen.width, false)).toBe(0);
    expect(displayedTranslation(80, screen.width, false)).toBeGreaterThan(0);
  });
});

describe('cubicBezier — la courbe du commit, sans dépassement', () => {
  const ease = cubicBezier(0.25, 0.8, 0.35, 1);

  test('part de 0, arrive à 1, ne recule jamais ni ne dépasse', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    const values = Array.from({ length: 101 }, (_, i) => ease(i / 100));
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
  });

  test('une sortie rapide puis amortie (ease-out)', () => {
    expect(ease(0.5)).toBeGreaterThan(0.8);
  });

  test('les durées d’iOS : 340 ms au commit, un retour plus bref', () => {
    expect(CUBE_COMMIT_DURATION_MS).toBe(340);
    expect(CUBE_SETTLE_DURATION_MS).toBeLessThan(CUBE_COMMIT_DURATION_MS);
  });
});

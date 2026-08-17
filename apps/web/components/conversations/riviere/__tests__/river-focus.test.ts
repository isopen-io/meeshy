import { riverFocusRankAt, clampRiverFocusRank } from '../river-focus';

// Trois rangs, chacun haut de 100px : [0,100) [100,200) [200,300).
const ranksAscending = [0, 1, 2];
const rowTop = new Map([[0, 0], [1, 100], [2, 200]]);
const rowBottom = new Map([[0, 100], [1, 200], [2, 300]]);

describe('riverFocusRankAt — hauteur de lecture → rang fractionnaire (§7ter B)', () => {
  it('centre du rang 0 → 0 - 0.5 + 0.5 = 0 exactement', () => {
    expect(riverFocusRankAt(50, ranksAscending, rowTop, rowBottom)).toBeCloseTo(0, 5);
  });

  it('haut du rang 0 (y=0) → -0.5', () => {
    expect(riverFocusRankAt(0, ranksAscending, rowTop, rowBottom)).toBeCloseTo(-0.5, 5);
  });

  it('bas du rang 0 / haut du rang 1 (y=100) → 0.5', () => {
    expect(riverFocusRankAt(100, ranksAscending, rowTop, rowBottom)).toBeCloseTo(0.5, 5);
  });

  it('centre du rang 2 → 2', () => {
    expect(riverFocusRankAt(250, ranksAscending, rowTop, rowBottom)).toBeCloseTo(2, 5);
  });

  it('glisse CONTINÛMENT entre deux rangs (pas de palier)', () => {
    const quarter = riverFocusRankAt(25, ranksAscending, rowTop, rowBottom);
    const threeQuarters = riverFocusRankAt(75, ranksAscending, rowTop, rowBottom);
    expect(quarter).toBeCloseTo(-0.25, 5);
    expect(threeQuarters).toBeCloseTo(0.25, 5);
    expect(threeQuarters).toBeGreaterThan(quarter);
  });

  it('un rang sans extent mesuré est ignoré (mesure partielle, ResizeObserver en vol)', () => {
    const partialTop = new Map([[0, 0]]);
    const partialBottom = new Map([[0, 100]]);
    expect(riverFocusRankAt(50, ranksAscending, partialTop, partialBottom)).toBeCloseTo(0, 5);
  });

  it('liste de rangs vide → rang 0 par défaut (span 1, fraction plafonnée à 1), jamais une exception', () => {
    // rank défaut = 0 ; top/bottom absents ⇒ top=0, span=max(1,0)=1 ;
    // fraction = clamp((50-0)/1, 0, 1) = 1 ⇒ 0 + 1 - 0.5 = 0.5.
    expect(riverFocusRankAt(50, [], new Map(), new Map())).toBe(0.5);
  });
});

describe('clampRiverFocusRank — bornes [-0.5, rankCount - 0.5]', () => {
  it('laisse passer une valeur déjà dans les bornes', () => {
    expect(clampRiverFocusRank(1.5, 5)).toBeCloseTo(1.5, 5);
  });

  it('plafonne au-dessus du dernier rang', () => {
    expect(clampRiverFocusRank(100, 5)).toBeCloseTo(4.5, 5);
  });

  it('plafonne au-dessous du premier rang', () => {
    expect(clampRiverFocusRank(-100, 5)).toBeCloseTo(-0.5, 5);
  });
});

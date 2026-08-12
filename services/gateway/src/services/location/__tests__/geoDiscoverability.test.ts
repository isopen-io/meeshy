import { quantizeCoordinate, resolveDensityGridStepDegrees } from '../geoDiscoverability';

describe('quantizeCoordinate', () => {
  it('EXACT renvoie le point non arrondi', () => {
    expect(quantizeCoordinate(48.8566, 2.3522, 'EXACT')).toEqual({
      type: 'Point',
      coordinates: [2.3522, 48.8566],
    });
  });

  it('arrondit a la grille NEIGHBORHOOD (~1km, pas de 0.01°)', () => {
    expect(quantizeCoordinate(48.8566, 2.3522, 'NEIGHBORHOOD')).toEqual({
      type: 'Point',
      coordinates: [2.35, 48.86],
    });
  });

  it('arrondit a la grille CITY (~10km, pas de 0.1°)', () => {
    expect(quantizeCoordinate(48.8566, 2.3522, 'CITY')).toEqual({
      type: 'Point',
      coordinates: [2.4, 48.9],
    });
  });

  it('arrondit a la grille REGION (~100km, pas de 1°)', () => {
    expect(quantizeCoordinate(48.8566, 2.3522, 'REGION')).toEqual({
      type: 'Point',
      coordinates: [2, 49],
    });
  });

  it('applique la meme grille a des coordonnees negatives (Buenos Aires)', () => {
    expect(quantizeCoordinate(-34.6037, -58.3816, 'NEIGHBORHOOD')).toEqual({
      type: 'Point',
      coordinates: [-58.38, -34.6],
    });
    expect(quantizeCoordinate(-34.6037, -58.3816, 'CITY')).toEqual({
      type: 'Point',
      coordinates: [-58.4, -34.6],
    });
    expect(quantizeCoordinate(-34.6037, -58.3816, 'REGION')).toEqual({
      type: 'Point',
      coordinates: [-58, -35],
    });
  });

  it('arrondit de maniere deterministe pres d une frontiere de grille, dans les deux sens', () => {
    // Une meme grille doit toujours retomber sur la meme cellule pour une
    // meme coordonnee reelle (voir design : pas de bruit aleatoire).
    expect(quantizeCoordinate(10.006, 0, 'NEIGHBORHOOD')).toEqual({
      type: 'Point',
      coordinates: [0, 10.01],
    });
    expect(quantizeCoordinate(10.004, 0, 'NEIGHBORHOOD')).toEqual({
      type: 'Point',
      coordinates: [0, 10],
    });
    expect(quantizeCoordinate(-10.006, 0, 'NEIGHBORHOOD')).toEqual({
      type: 'Point',
      coordinates: [0, -10.01],
    });
    expect(quantizeCoordinate(-10.004, 0, 'NEIGHBORHOOD')).toEqual({
      type: 'Point',
      coordinates: [0, -10],
    });
  });

  it('accepte les bornes exactes (-90/180), comme validCoordinates', () => {
    expect(quantizeCoordinate(-90, 180, 'EXACT')).toEqual({
      type: 'Point',
      coordinates: [180, -90],
    });
  });

  it('rejette des coordonnees hors bornes', () => {
    expect(quantizeCoordinate(90.001, 0, 'EXACT')).toBeNull();
    expect(quantizeCoordinate(0, -180.001, 'EXACT')).toBeNull();
    expect(quantizeCoordinate(0, 180.001, 'NEIGHBORHOOD')).toBeNull();
  });

  it('rejette NaN et les coordonnees non-numeriques', () => {
    expect(quantizeCoordinate(NaN, 0, 'EXACT')).toBeNull();
    expect(quantizeCoordinate(0, NaN, 'CITY')).toBeNull();
    expect(quantizeCoordinate('48' as unknown, 0, 'EXACT')).toBeNull();
    expect(quantizeCoordinate(0, undefined, 'EXACT')).toBeNull();
  });

  it('rejette une valeur de precision invalide', () => {
    expect(quantizeCoordinate(48.8566, 2.3522, 'COUNTRY' as unknown)).toBeNull();
    expect(quantizeCoordinate(48.8566, 2.3522, undefined)).toBeNull();
    expect(quantizeCoordinate(48.8566, 2.3522, null)).toBeNull();
    expect(quantizeCoordinate(48.8566, 2.3522, 42 as unknown)).toBeNull();
  });
});

describe('resolveDensityGridStepDegrees', () => {
  it('cale un cellSizeKm <= 1 sur le pas NEIGHBORHOOD (0.01°)', () => {
    expect(resolveDensityGridStepDegrees(1)).toBe(0.01);
    expect(resolveDensityGridStepDegrees(0.5)).toBe(0.01);
  });

  it('cale un cellSizeKm entre 1 (exclu) et 10 sur le pas CITY (0.1°)', () => {
    expect(resolveDensityGridStepDegrees(1.01)).toBe(0.1);
    expect(resolveDensityGridStepDegrees(10)).toBe(0.1);
  });

  it('cale un cellSizeKm > 10 sur le pas REGION (1°)', () => {
    expect(resolveDensityGridStepDegrees(10.01)).toBe(1);
    expect(resolveDensityGridStepDegrees(500)).toBe(1);
  });

  it('rejette les valeurs non-positives, non-finies ou non-numeriques', () => {
    expect(resolveDensityGridStepDegrees(0)).toBeNull();
    expect(resolveDensityGridStepDegrees(-1)).toBeNull();
    expect(resolveDensityGridStepDegrees(NaN)).toBeNull();
    expect(resolveDensityGridStepDegrees(Infinity)).toBeNull();
    expect(resolveDensityGridStepDegrees('10' as unknown)).toBeNull();
    expect(resolveDensityGridStepDegrees(undefined)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import {
  EPHEMERAL_BURN_DEFAULT_WIND,
  EPHEMERAL_BURN_FADE_MS,
  EPHEMERAL_BURN_FULL_MS,
  EPHEMERAL_BURN_WIND_DEAD_ZONE,
  ephemeralBurnDurationMs,
  ephemeralBurnFrontDirection,
  ephemeralBurnPhaseOf,
  ephemeralBurnRawWind,
  ephemeralBurnWind,
} from './ephemeral-burn';

/**
 * La loi de la combustion d'un éphémère (#17938) — SOURCE des miroirs Swift
 * (`EphemeralBurnLaw`) et Kotlin. Les vecteurs ci-dessous sont rejoués à
 * l'identique par `EphemeralBurnLawTests` : un vecteur qui change ici change là.
 */
describe('ephemeral-burn — la durée', () => {
  it('brûle 1,2 s, et fond en 0,25 s sous « Réduire les animations »', () => {
    expect(EPHEMERAL_BURN_FULL_MS).toBe(1200);
    expect(EPHEMERAL_BURN_FADE_MS).toBe(250);
    expect(ephemeralBurnDurationMs(false)).toBe(1200);
    expect(ephemeralBurnDurationMs(true)).toBe(250);
  });
});

describe('ephemeral-burn — le vent brut', () => {
  it('est absent sans capteur', () => {
    expect(ephemeralBurnRawWind({ rollTurns: null, lateralG: null })).toBeNull();
  });

  it('est absent sous la zone morte : un téléphone tenu en main n’est pas un geste', () => {
    expect(EPHEMERAL_BURN_WIND_DEAD_ZONE).toBe(0.08);
    expect(ephemeralBurnRawWind({ rollTurns: 0.01, lateralG: 0 })).toBeNull();
    expect(ephemeralBurnRawWind({ rollTurns: 0, lateralG: 0.03 })).toBeNull();
  });

  it('somme le roulis (× 4) et l’accélération latérale (× 2)', () => {
    expect(ephemeralBurnRawWind({ rollTurns: 0.1, lateralG: 0 })).toBeCloseTo(0.4, 10);
    expect(ephemeralBurnRawWind({ rollTurns: 0, lateralG: 0.1 })).toBeCloseTo(0.2, 10);
    expect(ephemeralBurnRawWind({ rollTurns: 0.1, lateralG: 0.1 })).toBeCloseTo(0.6, 10);
    expect(ephemeralBurnRawWind({ rollTurns: null, lateralG: 0.1 })).toBeCloseTo(0.2, 10);
  });

  it('est borné à ±1', () => {
    expect(ephemeralBurnRawWind({ rollTurns: 0.5, lateralG: 1 })).toBe(1);
    expect(ephemeralBurnRawWind({ rollTurns: -0.5, lateralG: -1 })).toBe(-1);
  });

  it('traite un capteur en défaut (NaN, infini) comme absent', () => {
    expect(ephemeralBurnRawWind({ rollTurns: Number.NaN, lateralG: Number.POSITIVE_INFINITY })).toBeNull();
    expect(ephemeralBurnRawWind({ rollTurns: Number.NaN, lateralG: 0.1 })).toBeCloseTo(0.2, 10);
  });
});

describe('ephemeral-burn — le vent effectif et le front', () => {
  it('sans geste, souffle à 0,35 vers le bord extérieur de la bulle', () => {
    expect(EPHEMERAL_BURN_DEFAULT_WIND).toBe(0.35);
    expect(ephemeralBurnWind(null, 'mine')).toBe(0.35);
    expect(ephemeralBurnWind(null, 'theirs')).toBe(-0.35);
  });

  it('avec un geste, le geste gagne quel que soit le côté', () => {
    expect(ephemeralBurnWind(-0.6, 'mine')).toBe(-0.6);
    expect(ephemeralBurnWind(0.2, 'theirs')).toBe(0.2);
  });

  it('le feu s’allume du côté d’où vient le vent : le front suit le signe du vent', () => {
    expect(ephemeralBurnFrontDirection(0.35)).toBe(1);
    expect(ephemeralBurnFrontDirection(-0.2)).toBe(-1);
    expect(ephemeralBurnFrontDirection(0)).toBe(1);
  });
});

describe('ephemeral-burn — les trois temps', () => {
  it('ignition jusqu’à 0,15, propagation jusqu’à 0,8, cendres ensuite', () => {
    expect(ephemeralBurnPhaseOf(0)).toBe('ignition');
    expect(ephemeralBurnPhaseOf(0.149)).toBe('ignition');
    expect(ephemeralBurnPhaseOf(0.15)).toBe('spread');
    expect(ephemeralBurnPhaseOf(0.79)).toBe('spread');
    expect(ephemeralBurnPhaseOf(0.8)).toBe('ashes');
    expect(ephemeralBurnPhaseOf(1)).toBe('ashes');
  });
});

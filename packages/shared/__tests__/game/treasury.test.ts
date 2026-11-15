import { describe, it, expect } from 'vitest';
import { TREASURY_TIERS, treasuryTier } from '../../utils/game/treasury.js';

describe('les paliers du trésor', () => {
  it('porte six paliers à clés stables', () => {
    expect(TREASURY_TIERS.map((t) => [t.key, t.minHeld])).toEqual([
      ['bourse', 1],
      ['escarcelle', 10],
      ['coffret', 50],
      ['coffre', 100],
      ['tresor', 500],
      ['reserve', 1000],
    ]);
  });

  it('n\'a aucun palier sans Meesh gardée', () => {
    const t = treasuryTier(0);
    expect(t.tier).toBeNull();
    expect(t.next).toEqual({ key: 'bourse', minHeld: 1, missing: 1 });
  });

  it('lit le palier sur le nombre de Meeshes gardées', () => {
    expect(treasuryTier(1).tier).toBe('bourse');
    expect(treasuryTier(9).tier).toBe('bourse');
    expect(treasuryTier(10).tier).toBe('escarcelle');
    expect(treasuryTier(49).tier).toBe('escarcelle');
    expect(treasuryTier(50).tier).toBe('coffret');
    expect(treasuryTier(100).tier).toBe('coffre');
    expect(treasuryTier(500).tier).toBe('tresor');
    expect(treasuryTier(1000).tier).toBe('reserve');
    expect(treasuryTier(99_999).tier).toBe('reserve');
  });

  it('dit combien il manque pour le suivant, et rien au sommet', () => {
    expect(treasuryTier(9).next).toEqual({ key: 'escarcelle', minHeld: 10, missing: 1 });
    expect(treasuryTier(1000).next).toBeNull();
  });

  it('traite un nombre illisible comme zéro', () => {
    expect(treasuryTier(Number.NaN).tier).toBeNull();
    expect(treasuryTier(-4).tier).toBeNull();
  });
});

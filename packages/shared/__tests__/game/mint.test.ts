/**
 * La rareté croissante des Meeshes (#9373) : prix, édition, niveaux perdus.
 */

import { describe, it, expect } from 'vitest';
import { MEESH_PRICE_CAP, meeshDisplayEdition, meeshEdition, meeshPrice, previewMint } from '../../utils/game/mint.js';
import { LEVEL_CAP_AMBASSADOR, LEVEL_CAP_BASE, levelThreshold } from '../../utils/game/levels.js';
import { MEESH_MINT_COST, computeMeeshMintPlan } from '../../utils/meesh.js';

describe('le prix de la n-ième Meesh', () => {
  it('reste à la base pour les dix premières', () => {
    expect(MEESH_MINT_COST).toBe(1221);
    expect(meeshPrice(1)).toBe(1221);
    expect(meeshPrice(10)).toBe(1221);
  });

  it('monte de 30 % toutes les dix (#10011)', () => {
    expect(meeshPrice(11)).toBe(1587);
    expect(meeshPrice(20)).toBe(1587);
    expect(meeshPrice(21)).toBe(2063);
    expect(meeshPrice(31)).toBe(2683);
    expect(meeshPrice(50)).toBe(3487);
    expect(meeshPrice(51)).toBe(4533);
    expect(meeshPrice(100)).toBe(12_948);
  });

  it('plafonne à 16 556, atteint dès la 101e frappe', () => {
    expect(MEESH_PRICE_CAP).toBe(16_556);
    expect(meeshPrice(91)).toBeLessThan(16_556);
    expect(meeshPrice(101)).toBe(16_556);
    expect(meeshPrice(250)).toBe(16_556);
    expect(meeshPrice(100_000)).toBe(16_556);
    expect(meeshPrice(Number.MAX_SAFE_INTEGER)).toBe(16_556);
  });

  it('ne baisse jamais d\'une frappe à la suivante', () => {
    const prices = Array.from({ length: 300 }, (_, i) => meeshPrice(i + 1));
    prices.forEach((price, i) => {
      if (i > 0) expect(price).toBeGreaterThanOrEqual(prices[i - 1]!);
    });
  });

  it('traite un numéro illisible comme la première', () => {
    expect(meeshPrice(0)).toBe(1221);
    expect(meeshPrice(-3)).toBe(1221);
    expect(meeshPrice(Number.NaN)).toBe(1221);
  });
});

describe('l\'édition', () => {
  it('est argent, sauf chaque centième en or et chaque millième en prisme', () => {
    expect(meeshEdition(1)).toBe('silver');
    expect(meeshEdition(99)).toBe('silver');
    expect(meeshEdition(100)).toBe('gold');
    expect(meeshEdition(500)).toBe('gold');
    expect(meeshEdition(1000)).toBe('prism');
    expect(meeshEdition(2000)).toBe('prism');
  });
});

describe('l\'édition DESSINÉE (#11483)', () => {
  it('est la plus haute édition atteinte : le n° 247 se dessine en or, sa loi reste l\'argent', () => {
    expect(meeshEdition(247)).toBe('silver');
    expect(meeshDisplayEdition(247)).toBe('gold');
  });

  it('est l\'argent avant le n° 100, l\'or à partir du n° 100, le prisme à partir du n° 1000', () => {
    expect(meeshDisplayEdition(1)).toBe('silver');
    expect(meeshDisplayEdition(99)).toBe('silver');
    expect(meeshDisplayEdition(100)).toBe('gold');
    expect(meeshDisplayEdition(999)).toBe('gold');
    expect(meeshDisplayEdition(1000)).toBe('prism');
    expect(meeshDisplayEdition(1001)).toBe('prism');
  });

  it('ne dessine jamais une édition plus basse que sa loi', () => {
    const order = { silver: 0, gold: 1, prism: 2 } as const;
    for (let n = 0; n <= 3000; n += 1) expect(order[meeshDisplayEdition(n)]).toBeGreaterThanOrEqual(order[meeshEdition(n)]);
  });

  it('traite une valeur illisible comme sa loi', () => {
    for (const n of [0, -1, -150, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(meeshDisplayEdition(n)).toBe(meeshEdition(n));
  });
});

describe('l\'aperçu d\'une frappe', () => {
  it('dit le prix, le numéro, l\'édition et les niveaux perdus', () => {
    const preview = previewMint({ score: 12_180, mintedLifetime: 12, debitablePoints: 12_180, levelCap: LEVEL_CAP_BASE, steps: null });
    expect(preview.number).toBe(13);
    expect(preview.price).toBe(1587);
    expect(preview.edition).toBe('silver');
    expect(preview.canMint).toBe(true);
    expect(preview.levelBefore).toBe(11);
    expect(preview.levelAfter).toBe(10);
    expect(preview.levelsLost).toBe(1);
    expect(preview.gloryGained).toBe(1000);
    expect(preview.missingPoints).toBe(0);
  });

  it('refuse sans débiter quand les points débitables manquent', () => {
    const preview = previewMint({ score: 2000, mintedLifetime: 0, debitablePoints: 1000, levelCap: LEVEL_CAP_BASE, steps: null });
    expect(preview.canMint).toBe(false);
    expect(preview.missingPoints).toBe(221);
    expect(preview.levelAfter).toBe(preview.levelBefore);
    expect(preview.levelsLost).toBe(0);
    expect(preview.gloryGained).toBe(0);
  });

  it('coûte un seul niveau au niveau 100', () => {
    const preview = previewMint({ score: 1_000_000, mintedLifetime: 0, debitablePoints: 1_000_000, levelCap: LEVEL_CAP_BASE, steps: null });
    expect(preview.levelBefore).toBe(100);
    expect(preview.levelsLost).toBe(1);
  });

  it('lit les niveaux sous le plafond du rang : un compte bloqué à 499 ne perd que ce qu\'il lit (#9688)', () => {
    const score = levelThreshold(640);
    const capped = previewMint({ score, mintedLifetime: 40, debitablePoints: score, levelCap: LEVEL_CAP_BASE, steps: null });
    expect(capped.levelBefore).toBe(499);
    expect(capped.levelAfter).toBe(499);
    expect(capped.levelsLost).toBe(0);
    const open = previewMint({ score, mintedLifetime: 40, debitablePoints: score, levelCap: LEVEL_CAP_AMBASSADOR, steps: null });
    expect(open.levelBefore).toBe(640);
    expect(open.levelAfter).toBe(639);
    expect(open.levelsLost).toBe(1);
  });

  it('coûte deux niveaux au niveau 5', () => {
    const preview = previewMint({ score: 2500, mintedLifetime: 0, debitablePoints: 2500, levelCap: LEVEL_CAP_BASE, steps: null });
    expect(preview.levelBefore).toBe(5);
    expect(preview.levelsLost).toBe(2);
  });
});

describe('le plan de frappe reçoit le prix', () => {
  const axes = [{ axisKey: 'content.text_message' as const, count: 200, points: 1800 }];

  it('garde le prix de base par défaut', () => {
    expect(computeMeeshMintPlan(axes).canMint).toBe(true);
    expect(computeMeeshMintPlan(axes).debits.reduce((s, d) => s + d.points, 0)).toBe(1221);
  });

  it('débite le prix reçu', () => {
    const plan = computeMeeshMintPlan(axes, { mintCost: 1587 });
    expect(plan.debits.reduce((s, d) => s + d.points, 0)).toBe(1587);
  });

  it('dit ce qu\'il manque pour le prix reçu', () => {
    const plan = computeMeeshMintPlan(axes, { mintCost: 2063 });
    expect(plan.canMint).toBe(false);
    expect(plan.missingPoints).toBe(263);
  });

  it('retombe sur la base si le prix reçu est illisible', () => {
    expect(computeMeeshMintPlan(axes, { mintCost: Number.NaN }).debits.reduce((s, d) => s + d.points, 0)).toBe(1221);
    expect(computeMeeshMintPlan(axes, { mintCost: 0 }).debits.reduce((s, d) => s + d.points, 0)).toBe(1221);
  });
});

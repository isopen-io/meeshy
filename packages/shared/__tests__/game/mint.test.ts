/**
 * La rareté croissante des Meeshes (#9373) : prix, édition, niveaux perdus.
 */

import { describe, it, expect } from 'vitest';
import {
  MEESH_PRICE_CAP,
  meeshEdition,
  meeshPrice,
  previewMint,
} from '../../utils/game/mint.js';
import { MEESH_MINT_COST, computeMeeshMintPlan } from '../../utils/meesh.js';

describe('le prix de la n-ième Meesh', () => {
  it('reste à la base pour les dix premières', () => {
    expect(MEESH_MINT_COST).toBe(1221);
    expect(meeshPrice(1)).toBe(1221);
    expect(meeshPrice(10)).toBe(1221);
  });

  it('monte de 6 % toutes les dix', () => {
    expect(meeshPrice(11)).toBe(1294);
    expect(meeshPrice(21)).toBe(1372);
    expect(meeshPrice(50)).toBe(1541);
    expect(meeshPrice(100)).toBe(2063);
  });

  it('plafonne à 4 884, soit quatre fois la base', () => {
    expect(MEESH_PRICE_CAP).toBe(4884);
    expect(meeshPrice(250)).toBe(4884);
    expect(meeshPrice(100_000)).toBe(4884);
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

describe('l\'aperçu d\'une frappe', () => {
  it('dit le prix, le numéro, l\'édition et les niveaux perdus', () => {
    const preview = previewMint({ score: 12_180, mintedLifetime: 12, debitablePoints: 12_180 });
    expect(preview.number).toBe(13);
    expect(preview.price).toBe(1294);
    expect(preview.edition).toBe('silver');
    expect(preview.canMint).toBe(true);
    expect(preview.levelBefore).toBe(34);
    expect(preview.levelAfter).toBe(32);
    expect(preview.levelsLost).toBe(2);
    expect(preview.gloryGained).toBe(100);
    expect(preview.missingPoints).toBe(0);
  });

  it('refuse sans débiter quand les points débitables manquent', () => {
    const preview = previewMint({ score: 2000, mintedLifetime: 0, debitablePoints: 1000 });
    expect(preview.canMint).toBe(false);
    expect(preview.missingPoints).toBe(221);
    expect(preview.levelAfter).toBe(preview.levelBefore);
    expect(preview.levelsLost).toBe(0);
    expect(preview.gloryGained).toBe(0);
  });

  it('coûte un seul niveau au sommet', () => {
    const preview = previewMint({ score: 100_000, mintedLifetime: 0, debitablePoints: 100_000 });
    expect(preview.levelBefore).toBe(100);
    expect(preview.levelsLost).toBe(1);
  });

  it('coûte cinq niveaux au niveau 15', () => {
    const preview = previewMint({ score: 2250, mintedLifetime: 0, debitablePoints: 2250 });
    expect(preview.levelBefore).toBe(15);
    expect(preview.levelsLost).toBe(5);
  });
});

describe('le plan de frappe reçoit le prix', () => {
  const axes = [{ axisKey: 'content.text_message' as const, count: 200, points: 1800 }];

  it('garde le prix de base par défaut', () => {
    expect(computeMeeshMintPlan(axes).canMint).toBe(true);
    expect(computeMeeshMintPlan(axes).debits.reduce((s, d) => s + d.points, 0)).toBe(1221);
  });

  it('débite le prix reçu', () => {
    const plan = computeMeeshMintPlan(axes, { mintCost: 1294 });
    expect(plan.debits.reduce((s, d) => s + d.points, 0)).toBe(1294);
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

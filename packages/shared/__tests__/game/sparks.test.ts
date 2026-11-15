/**
 * LES ÉTINCELLES (#10846, #10847, #10848, #10892) — la poche, qui fait le niveau ; le cycle et le
 * total à vie, indicatifs ; le coût selon le niveau actuel ; les réserves ouvertes par le rang.
 */

import { describe, it, expect } from 'vitest';
import {
  MINT_COST_FULL_PRICE_LEVEL,
  currentLevelOf,
  levelSparksOf,
  unlockLevelOf,
  effectiveMeeshPrice,
  mintCostFactor,
  mintCostFactorPermille,
  previewSparksMint,
  sparkCount,
  sparksOf,
} from '../../utils/game/sparks.js';
import { meeshPrice } from '../../utils/game/mint.js';
import { GLORY_RANKS, gloryLadder } from '../../utils/game/glory.js';
import { levelFromScore, levelThreshold, LEVEL_CAP_BASE } from '../../utils/game/levels.js';
import {
  TREASURY_RANK_REQUIREMENTS,
  treasuryLockFor,
  treasuryReserveAccess,
} from '../../utils/game/treasury.js';

describe('sparkCount — un nombre sûr, jamais un BigInt sur le fil', () => {
  it('lit un nombre, un BigInt, une chaîne entière', () => {
    expect(sparkCount(1234)).toBe(1234);
    expect(sparkCount(1234n)).toBe(1234);
    expect(sparkCount('1234')).toBe(1234);
  });

  it('prend 0 pour tout ce qui n\'est pas un entier positif lisible', () => {
    for (const v of [null, undefined, -5, Number.NaN, Number.POSITIVE_INFINITY, 'abc', {}, -10n]) {
      expect(sparkCount(v)).toBe(0);
    }
  });

  it('tronque une fraction', () => {
    expect(sparkCount(12.9)).toBe(12);
  });

  it('SATURE au plus grand entier sûr de JavaScript au lieu de perdre des chiffres', () => {
    expect(sparkCount(2n ** 80n)).toBe(Number.MAX_SAFE_INTEGER);
    expect(sparkCount(2 ** 70)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('tient au-delà d\'un Int32 (2 147 483 647)', () => {
    expect(sparkCount(5_000_000_000n)).toBe(5_000_000_000);
  });
});

describe('la DETTE d\'étincelles (porteur 2026-10-16)', () => {
  it('sparksOf lit la dette, 0 si absente, et ne la compte pas dans la poche', () => {
    expect(sparksOf({ engagementScore: 50, sparksDebt: 400n })).toMatchObject({ pocket: 50, debt: 400 });
    expect(sparksOf({ engagementScore: 50 }).debt).toBe(0);
    expect(sparksOf({ engagementScore: 50, sparksDebt: -5 }).debt).toBe(0);
  });

  it('tant qu\'une dette existe, on ne frappe pas — même avec une poche pleine, même sans réserve fermée', () => {
    const preview = previewSparksMint({ sparks: 90_000, mintedLifetime: 0, held: 0, glory: 0, levelCap: LEVEL_CAP_BASE, steps: null, debt: 120 });
    expect(preview.canMint).toBe(false);
    expect(preview.blockedBy).toBe('debt');
    expect(preview.sparksDebt).toBe(120);
    expect(preview.missingPoints).toBe(0);
    expect(preview.gloryGained).toBe(0);
  });

  it('sans dette, rien ne bloque', () => {
    const preview = previewSparksMint({ sparks: 90_000, mintedLifetime: 0, held: 0, glory: 0, levelCap: LEVEL_CAP_BASE, steps: null });
    expect(preview.blockedBy).toBeNull();
    expect(preview.sparksDebt).toBe(0);
    expect(preview.canMint).toBe(true);
  });
});

describe('sparksOf — poche, cycle, total à vie', () => {
  it('lit les trois nombres', () => {
    expect(sparksOf({ engagementScore: 500, sparksSincePrestige: 9000n, sparksEarnedLifetime: 12_000n })).toEqual({
      pocket: 500,
      cycle: 9000,
      lifetime: 12_000,
      debt: 0,
    });
  });

  it('un compte d\'avant le rattrapage (champs absents) se lit sur sa poche : le niveau ne baisse pas', () => {
    expect(sparksOf({ engagementScore: 800 })).toEqual({ pocket: 800, cycle: 800, lifetime: 800, debt: 0 });
    expect(sparksOf({ engagementScore: 800, sparksSincePrestige: null, sparksEarnedLifetime: null })).toEqual({
      pocket: 800,
      cycle: 800,
      lifetime: 800,
      debt: 0,
    });
  });

  it('le cycle n\'est jamais sous la poche, le total à vie jamais sous le cycle', () => {
    expect(sparksOf({ engagementScore: 800, sparksSincePrestige: 100n, sparksEarnedLifetime: 50n })).toEqual({
      pocket: 800,
      cycle: 800,
      lifetime: 800,
      debt: 0,
    });
  });

  it('un compte introuvable vaut zéro partout', () => {
    expect(sparksOf(null)).toEqual({ pocket: 0, cycle: 0, lifetime: 0, debt: 0 });
    expect(sparksOf(undefined)).toEqual({ pocket: 0, cycle: 0, lifetime: 0, debt: 0 });
  });
});

describe('le facteur de coût selon le niveau ACTUEL', () => {
  it('50 % au niveau 0, plein tarif dès le niveau 100', () => {
    expect(MINT_COST_FULL_PRICE_LEVEL).toBe(100);
    expect(mintCostFactor(0)).toBe(0.5);
    expect(mintCostFactor(1)).toBe(0.505);
    expect(mintCostFactor(50)).toBe(0.75);
    expect(mintCostFactor(100)).toBe(1);
    expect(mintCostFactor(100_000)).toBe(1);
  });

  it('vaut 0,5 + niveau ÷ 200, borné à [0,5 ; 1]', () => {
    for (const level of [0, 1, 7, 33, 64, 99, 100, 250]) {
      expect(mintCostFactor(level)).toBeCloseTo(Math.min(1, Math.max(0.5, 0.5 + level / 200)), 10);
    }
  });

  it('se calcule en millièmes entiers (le miroir Swift rejoue sans flottant)', () => {
    expect(mintCostFactorPermille(0)).toBe(500);
    expect(mintCostFactorPermille(1)).toBe(505);
    expect(mintCostFactorPermille(100)).toBe(1000);
  });

  it('FAIL-CLOSED : un niveau illisible paie plein tarif, un niveau négatif le plancher', () => {
    expect(mintCostFactor(Number.NaN)).toBe(1);
    expect(mintCostFactor(Number.POSITIVE_INFINITY)).toBe(1);
    expect(mintCostFactor(-4)).toBe(0.5);
  });

  it('ne baisse jamais quand le niveau monte', () => {
    for (let level = 1; level <= 150; level += 1) {
      expect(mintCostFactorPermille(level)).toBeGreaterThanOrEqual(mintCostFactorPermille(level - 1));
    }
  });
});

describe('effectiveMeeshPrice — le prix de rang × le facteur du niveau actuel', () => {
  it('garde prix(n) selon le numéro de la pièce, et applique le facteur', () => {
    expect(effectiveMeeshPrice(1, 100)).toBe(meeshPrice(1));
    expect(effectiveMeeshPrice(1, 1)).toBe(617); // 1221 × 0,505 = 616,6
    expect(effectiveMeeshPrice(1, 0)).toBe(611); // 1221 × 0,5 = 610,5
    expect(effectiveMeeshPrice(11, 50)).toBe(Math.round((meeshPrice(11) * 750) / 1000));
  });

  it('suit le plafond de prix (16 556) au plein tarif', () => {
    expect(effectiveMeeshPrice(500, 100)).toBe(16_556);
    expect(effectiveMeeshPrice(500, 1)).toBe(Math.round((16_556 * 505) / 1000));
  });

  it('est toujours au moins 1', () => {
    for (const n of [1, 5, 50, 500]) for (const level of [0, 1, 100]) expect(effectiveMeeshPrice(n, level)).toBeGreaterThanOrEqual(1);
  });
});

const NO_STEPS = null;

describe('previewSparksMint — la frappe dépense la poche, et la poche fait le niveau', () => {
  const base = {
    mintedLifetime: 0,
    held: 0,
    glory: 0,
    mythic: false,
    levelCap: LEVEL_CAP_BASE,
    steps: NO_STEPS,
  } as const;

  it('annonce le numéro de la PROCHAINE pièce, le prix effectif et le facteur appliqué', () => {
    const preview = previewSparksMint({ ...base, sparks: levelThreshold(10), mintedLifetime: 4 }); // niveau 10
    expect(preview.number).toBe(5);
    expect(preview.basePrice).toBe(1221);
    expect(preview.costLevel).toBe(10);
    expect(preview.costFactor).toBe(0.55);
    expect(preview.price).toBe(Math.round((1221 * 550) / 1000));
    expect(preview.canMint).toBe(true);
    expect(preview.missingPoints).toBe(0);
  });

  it('la frappe fait BAISSER le niveau du montant dépensé (porteur 2026-10-17, #10892)', () => {
    const preview = previewSparksMint({ ...base, sparks: levelThreshold(20) });
    expect(preview.levelBefore).toBe(20);
    expect(preview.levelAfter).toBe(levelFromScore(levelThreshold(20) - preview.price, LEVEL_CAP_BASE));
    expect(preview.levelAfter).toBeLessThan(20);
    expect(preview.levelsLost).toBe(20 - preview.levelAfter);
  });

  it('une frappe refusée ne change pas le niveau annoncé', () => {
    const preview = previewSparksMint({ ...base, sparks: levelThreshold(20), debt: 10 });
    expect(preview.levelAfter).toBe(20);
    expect(preview.levelsLost).toBe(0);
  });

  it('dit ce qui manque quand la poche ne couvre pas le prix', () => {
    const preview = previewSparksMint({ ...base, sparks: 100 });
    expect(preview.canMint).toBe(false);
    expect(preview.missingPoints).toBe(preview.price - 100);
    expect(preview.gloryGained).toBe(0);
  });

  it('le numéro de la pièce ne dépend NI de la bourse NI des coffres', () => {
    const a = previewSparksMint({ ...base, sparks: 99_999, mintedLifetime: 7, held: 0 });
    const b = previewSparksMint({ ...base, sparks: 99_999, mintedLifetime: 7, held: 3 });
    expect(a.number).toBe(8);
    expect(b.number).toBe(8);
  });

  it('un niveau bas coûte moins qu\'un niveau haut, pour la même pièce', () => {
    const low = previewSparksMint({ ...base, sparks: levelThreshold(5) });
    const high = previewSparksMint({ ...base, sparks: levelThreshold(80) });
    expect(low.price).toBeLessThan(high.price);
  });

  it('une poche basse (niveau ACTUEL bas) paie le tarif réduit, quel que soit le total à vie', () => {
    const afterPrestige = previewSparksMint({ ...base, sparks: 99 });
    expect(afterPrestige.costLevel).toBe(1);
    expect(afterPrestige.costFactor).toBe(0.505);
  });

  it('refuse la pièce qui ferait entrer dans une réserve verrouillée, avec le rang requis', () => {
    // 99 gardées : la 100e est le Coffre — fermé sous Voix I.
    const closed = previewSparksMint({ ...base, sparks: 99_999, held: 99, glory: 0 });
    expect(closed.canMint).toBe(false);
    expect(closed.missingPoints).toBe(0);
    expect(closed.locked).toEqual({
      tier: 'coffre',
      minHeld: 100,
      requires: { rank: 'voix', division: 1, division5: 1 },
    });
  });

  it('laisse frapper quand le rang ouvre la réserve', () => {
    const voixI = gloryLadder().find((step) => step.rank === 'voix' && step.division5 === 1)!;
    const open = previewSparksMint({ ...base, sparks: 99_999, held: 99, glory: voixI.minGlory });
    expect(open.locked).toBeNull();
    expect(open.canMint).toBe(true);
  });
});

describe('les réserves du trésor s\'ouvrent par le rang (#10848)', () => {
  const stepOf = (rank: string, division5: number) => gloryLadder().find((s) => s.rank === rank && s.division5 === division5)!;

  it('dans division5, V est la plus faible et I la plus haute : II est AU-DESSUS de III', () => {
    const ladder = gloryLadder().filter((s) => s.rank === 'voix');
    expect(ladder.map((s) => s.division5)).toEqual([5, 4, 3, 2, 1]);
    expect(stepOf('voix', 2).minGlory).toBeGreaterThan(stepOf('voix', 3).minGlory);
  });

  it('exige : Coffre > Voix II (donc Voix I), Trésor ≥ Polyglotte III, Réserve ≥ Ambassadeur III', () => {
    expect(TREASURY_RANK_REQUIREMENTS.coffre).toEqual({ rank: 'voix', division5: 1 });
    expect(TREASURY_RANK_REQUIREMENTS.tresor).toEqual({ rank: 'polyglotte', division5: 3 });
    expect(TREASURY_RANK_REQUIREMENTS.reserve).toEqual({ rank: 'ambassadeur', division5: 3 });
    expect(TREASURY_RANK_REQUIREMENTS.bourse).toBeUndefined();
  });

  it('STRICTEMENT supérieur à Voix II : Voix II ne suffit pas, Voix I oui, Conteur V oui', () => {
    const at = (glory: number) => treasuryReserveAccess({ glory }).find((a) => a.key === 'coffre')!;
    expect(at(stepOf('voix', 2).minGlory).locked).toBe(true);
    expect(at(stepOf('voix', 1).minGlory - 1).locked).toBe(true);
    expect(at(stepOf('voix', 1).minGlory).locked).toBe(false);
    expect(at(stepOf('conteur', 5).minGlory).locked).toBe(false);
  });

  it('Trésor : Polyglotte III ouvre, Polyglotte IV non', () => {
    const at = (glory: number) => treasuryReserveAccess({ glory }).find((a) => a.key === 'tresor')!;
    expect(at(stepOf('polyglotte', 4).minGlory).locked).toBe(true);
    expect(at(stepOf('polyglotte', 3).minGlory).locked).toBe(false);
  });

  it('Réserve : Ambassadeur III ouvre, Ambassadeur IV non', () => {
    const at = (glory: number) => treasuryReserveAccess({ glory }).find((a) => a.key === 'reserve')!;
    expect(at(stepOf('ambassadeur', 4).minGlory).locked).toBe(true);
    expect(at(stepOf('ambassadeur', 3).minGlory).locked).toBe(false);
  });

  it('la Bourse est ouverte à tous, sans rang requis ; escarcelle et coffret aussi', () => {
    const access = treasuryReserveAccess({ glory: 0 });
    for (const key of ['bourse', 'escarcelle', 'coffret'] as const) {
      const entry = access.find((a) => a.key === key)!;
      expect(entry.locked).toBe(false);
      expect(entry.requires).toBeNull();
    }
  });

  it('sert, pour chaque réserve, son état et le rang requis (division héritée 1-3 ET division5)', () => {
    const access = treasuryReserveAccess({ glory: 0 });
    expect(access.map((a) => a.key)).toEqual(['bourse', 'escarcelle', 'coffret', 'coffre', 'tresor', 'reserve']);
    expect(access.find((a) => a.key === 'reserve')).toEqual({
      key: 'reserve',
      minHeld: 1000,
      locked: true,
      requires: { rank: 'ambassadeur', division: 2, division5: 3 },
    });
  });

  it('un Mythe a tout ouvert', () => {
    expect(treasuryReserveAccess({ glory: 0, mythic: true }).every((a) => !a.locked)).toBe(true);
  });

  it('chaque rang requis existe dans l\'échelle des rangs', () => {
    const ranks = GLORY_RANKS.map((r) => r.key);
    for (const requirement of Object.values(TREASURY_RANK_REQUIREMENTS)) {
      expect(ranks).toContain(requirement.rank);
      expect(gloryLadder().some((s) => s.rank === requirement.rank && s.division5 === requirement.division5)).toBe(true);
    }
  });

  it('treasuryLockFor : la pièce qui franchit un palier verrouillé est refusée, pas celle qui reste dessous', () => {
    expect(treasuryLockFor({ held: 98, glory: 0 })).toBeNull(); // 99e : escarcelle/coffret, ouverts
    expect(treasuryLockFor({ held: 99, glory: 0 })?.tier).toBe('coffre'); // 100e
    expect(treasuryLockFor({ held: 499, glory: stepOf('voix', 1).minGlory })?.tier).toBe('tresor');
    expect(treasuryLockFor({ held: 999, glory: stepOf('polyglotte', 3).minGlory })?.tier).toBe('reserve');
    expect(treasuryLockFor({ held: 999, glory: stepOf('ambassadeur', 3).minGlory })).toBeNull();
  });

  it('un compte DÉJÀ au-dessus de son rang (avant la règle) ne frappe plus tant que le rang ne le rattrape pas', () => {
    expect(treasuryLockFor({ held: 150, glory: 0 })?.tier).toBe('coffre');
  });
});

describe('le niveau d\'un compte se lit sur la POCHE ; cycle et total à vie sont indicatifs (#10892)', () => {
  it('levelSparksOf : la base du niveau est la poche', () => {
    expect(levelSparksOf(sparksOf({ engagementScore: 3, sparksSincePrestige: 9000, sparksEarnedLifetime: 12_000 }))).toBe(3);
  });

  it('currentLevelOf : une poche presque vide fait un niveau bas, quel que soit le cumul', () => {
    const row = { engagementScore: 3, sparksSincePrestige: levelThreshold(34), sparksEarnedLifetime: levelThreshold(34), levelRecord: 34 };
    expect(currentLevelOf(row)).toBe(1);
  });

  it('currentLevelOf : un compte d\'avant le rattrapage se lit sur sa poche', () => {
    expect(currentLevelOf({ engagementScore: levelThreshold(12), levelRecord: 12 })).toBe(12);
  });

  it('currentLevelOf : après un prestige (poche vide) le niveau est 1, quel que soit le max à vie', () => {
    expect(currentLevelOf({ engagementScore: 0, sparksSincePrestige: 0, sparksEarnedLifetime: 3_000_000, levelRecord: 1, levelMaxLifetime: 100 })).toBe(1);
  });

  it('currentLevelOf : les étapes faites (max à vie) ne retiennent pas la poche', () => {
    // Le record du cycle est à 1 (prestige) : sans le max à vie, l\'étape du 10 le retiendrait à 9.
    const row = { engagementScore: levelThreshold(25), levelRecord: 1, levelMaxLifetime: 100 };
    expect(currentLevelOf(row)).toBe(25);
  });

  it('unlockLevelOf : le max à vie ouvre ligues et duo même après un prestige (G-5)', () => {
    expect(unlockLevelOf({ engagementScore: 0, sparksSincePrestige: 0, levelRecord: 1, levelMaxLifetime: 100 })).toBe(100);
    expect(unlockLevelOf({ engagementScore: 0, levelRecord: null, levelMaxLifetime: null })).toBe(1);
  });

  it('unlockLevelOf : jamais sous le record du cycle ni sous le niveau courant', () => {
    expect(unlockLevelOf({ engagementScore: levelThreshold(8), levelRecord: 30 })).toBe(30);
    expect(unlockLevelOf({ engagementScore: levelThreshold(40), levelRecord: 40 })).toBe(40);
  });
});

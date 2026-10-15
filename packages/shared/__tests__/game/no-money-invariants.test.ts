/**
 * L'invariant « jamais d'argent entrant, jamais de transfert ni de conversion monnayable » (conformité F-1,
 * C-1 ; CSI art. L320-1 ; décision du porteur du 2026-10-10, #10011).
 *
 * Le coffre du jour est du hasard GRATUIT : on l'ouvre en faisant ses missions, jamais en payant ; son contenu
 * certain, ses primes possibles et les probabilités de ses tirages sont affichés AVANT l'ouverture. Depuis #10011
 * il donne des points (500 à 10 000, plus une prime en points au cours de la Meesh du compte), de la Gloire, UN
 * fragment d'étoile une fois sur six et un gel : rien de ce qu'il donne, comme rien de ce que la saison ou le duo
 * donnent, ne s'achète, ne se transfère à un autre compte ni ne se convertit — ni en argent, ni en Meesh.
 *
 * Et depuis la décision du porteur du 2026-10-10 : AUCUNE Meesh sans débit de points. La frappe est le seul
 * chemin vers une Meesh, et elle débite toujours son prix en points.
 *
 * Ces témoins gardent la FORME des catalogues : le jour où un prix en argent, une monnaie, un transfert ou un
 * retrait y entrerait, ils tombent, et la décision se prend en connaissance de cause (monétisation précédée du
 * remplacement de NLLB-200 et MMS-TTS, #9227).
 */

import { describe, it, expect } from 'vitest';
import { CHEST_ODDS, dailyChest } from '../../utils/game/chest.js';
import { seasonStepReward } from '../../utils/game/season.js';
import { duoReward } from '../../utils/game/duo.js';

/** Ce qu'un coffre peut donner : des grandeurs du JEU, et elles seules. */
const CHEST_CONTENTS = ['bonus', 'bonusPoints', 'fragment', 'freeze', 'glory', 'points'];

/** Des mots qui trahiraient de l'argent, un achat, un transfert ou un retrait. */
const MONEY_WORDS = /price|cost|cash|money|euro|eur|usd|dollar|currency|coin|pay|purchase|buy|transfer|withdraw|redeem|gift|iap|sku/i;

describe('le coffre du jour', () => {
  it('ne porte dans ses probabilités que des grandeurs du jeu — aucun prix, aucune monnaie, aucun transfert', () => {
    expect(Object.keys(CHEST_ODDS).sort()).toEqual(
      ['bonusFifth', 'bonusWhole', 'fragment', 'freeze', 'maxGlory', 'maxPoints', 'minGlory', 'minPoints'].sort(),
    );
    Object.keys(CHEST_ODDS).forEach((key) => expect(key).not.toMatch(MONEY_WORDS));
  });

  it('ne donne dans aucun tirage autre chose que des points, de la Gloire, un fragment d\'étoile et un gel', () => {
    for (let day = 1; day <= 28; day += 1) {
      for (const effort of [0, 900, 4500]) {
        const chest = dailyChest({ userId: 'u1', dayKey: `2026-10-${String(day).padStart(2, '0')}`, effort, nextMeeshPrice: 1221 });
        expect(Object.keys(chest).sort()).toEqual(CHEST_CONTENTS);
        expect(typeof chest.fragment).toBe('boolean');
        expect(['none', 'fifth', 'whole']).toContain(chest.bonus);
        [chest.points, chest.glory, chest.bonusPoints].forEach((value) => expect(Number.isInteger(value)).toBe(true));
      }
    }
  });

  it('n\'ajoute que des points : la prime n\'excède jamais le prix d\'UNE Meesh, et rien ne se frappe au coffre', () => {
    for (let u = 0; u < 2000; u += 1) {
      const chest = dailyChest({ userId: `u${u}`, dayKey: '2026-10-11', effort: 4500, nextMeeshPrice: 16_556 });
      expect(chest.bonusPoints).toBeLessThanOrEqual(16_556);
      expect(chest.points).toBe(10_000 + chest.bonusPoints);
    }
  });

  it('dit ses probabilités sous forme de fractions affichables, jamais un tirage caché', () => {
    expect(CHEST_ODDS.fragment).toBeGreaterThan(0);
    expect(CHEST_ODDS.fragment).toBeLessThanOrEqual(1);
    expect(CHEST_ODDS.freeze).toBeGreaterThan(0);
    expect(CHEST_ODDS.freeze).toBeLessThanOrEqual(1);
  });
});

describe('la saison et le duo', () => {
  it('ne donnent jamais une Meesh : les 40 étapes sont des points, des fragments d\'étoile, des gels et la coupe', () => {
    const kinds = new Set(Array.from({ length: 40 }, (_, i) => seasonStepReward(i + 1)?.kind));
    expect([...kinds].sort()).toEqual(['fragment', 'freeze', 'points', 'season-cup']);
  });

  it('paient le duo en points seulement', () => {
    expect(Object.keys(duoReward({ level: 30, flameDays: 5, mineDone: true, partnerDone: true })).sort()).toEqual(['doubled', 'points']);
  });
});

describe('aucune Meesh sans débit de points (porteur, 2026-10-10, #10011)', () => {
  it('la loi de la frappe n\'offre aucun autre chemin que les points : ni fragment, ni frappe gratuite', async () => {
    const mintLaw = await import('../../utils/game/mint.js');
    const chestLaw = await import('../../utils/game/chest.js');
    expect(Object.keys(mintLaw).filter((name) => /fragment|free|gratuit/i.test(name))).toEqual([]);
    expect(Object.keys(chestLaw).filter((name) => /meesh/i.test(name))).toEqual([]);
  });

  it('toute frappe possible débite son prix entier, jamais zéro', async () => {
    const { previewMint, meeshPrice } = await import('../../utils/game/mint.js');
    for (const mintedLifetime of [0, 9, 10, 99, 100, 999, 5000]) {
      for (const debitable of [0, 1220, 1221, 16_556, 1_000_000]) {
        const preview = previewMint({ score: debitable, mintedLifetime, debitablePoints: debitable, levelCap: null, steps: null });
        expect(preview.price).toBe(meeshPrice(mintedLifetime + 1));
        expect(preview.price).toBeGreaterThan(0);
        if (preview.canMint) expect(debitable).toBeGreaterThanOrEqual(preview.price);
        else expect(preview.missingPoints).toBe(preview.price - debitable);
      }
    }
  });

  it('la requête de frappe ne se paie qu\'en points : « payWith: fragments » est refusée à la lecture', async () => {
    const { meeshMintRequestSchema } = await import('../../types/game.js');
    const requestId = '01J9ZZZZZZZZZZZZZZZZZZZZZZ';
    expect(meeshMintRequestSchema.safeParse({ requestId, payWith: 'fragments' }).success).toBe(false);
    expect(meeshMintRequestSchema.safeParse({ requestId }).success).toBe(true);
  });
});

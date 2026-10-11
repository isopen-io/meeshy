/**
 * L'invariant « jamais d'argent entrant, jamais de transfert ni de conversion monnayable » (conformité F-1,
 * C-1 ; CSI art. L320-1 ; décision du porteur du 2026-10-10, #10011).
 *
 * Le coffre du jour est du hasard GRATUIT : on l'ouvre en faisant ses missions, jamais en payant ; son contenu
 * certain et les probabilités de ses deux tirages sont affichés AVANT l'ouverture. Depuis #10011 il contient de
 * la Gloire et des fragments de Meesh — cinq fragments paient une frappe gratuite —, ce qui reste
 * dans le jeu : rien de ce qu'il donne, comme rien de ce que la saison ou le duo donnent, ne s'achète, ne se
 * transfère à un autre compte ni ne se convertit en argent.
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
const CHEST_CONTENTS = ['fragment', 'freeze', 'glory', 'meeshFragments', 'points'];

/** Des mots qui trahiraient de l'argent, un achat, un transfert ou un retrait. */
const MONEY_WORDS = /price|cost|cash|money|euro|eur|usd|dollar|currency|coin|pay|purchase|buy|transfer|withdraw|redeem|gift|iap|sku/i;

describe('le coffre du jour', () => {
  it('ne porte dans ses probabilités que des grandeurs du jeu — aucun prix, aucune monnaie, aucun transfert', () => {
    expect(Object.keys(CHEST_ODDS).sort()).toEqual(
      ['fragment', 'freeze', 'maxGlory', 'maxMeeshFragments', 'maxPoints', 'meeshFragmentsPerMeesh', 'minGlory', 'minMeeshFragments', 'minPoints'].sort(),
    );
    Object.keys(CHEST_ODDS).forEach((key) => expect(key).not.toMatch(MONEY_WORDS));
  });

  it('ne donne dans aucun tirage autre chose que des points, de la Gloire, des fragments de Meesh et un gel', () => {
    for (let day = 1; day <= 28; day += 1) {
      for (const effort of [0, 900, 4500]) {
        const chest = dailyChest({ userId: 'u1', dayKey: `2026-10-${String(day).padStart(2, '0')}`, effort });
        expect(Object.keys(chest).sort()).toEqual(CHEST_CONTENTS);
        Object.values(chest).forEach((value) => expect(typeof value === 'number' || typeof value === 'boolean').toBe(true));
      }
    }
  });

  it('ne paie jamais une frappe d\'un seul coffre : seulement des fragments, cinq par frappe', () => {
    for (let day = 1; day <= 28; day += 1) {
      const chest = dailyChest({ userId: 'u2', dayKey: `2026-10-${String(day).padStart(2, '0')}`, effort: 4500 });
      expect(chest.meeshFragments).toBeLessThan(CHEST_ODDS.meeshFragmentsPerMeesh);
      expect(chest.meeshFragments).toBeLessThanOrEqual(CHEST_ODDS.maxMeeshFragments);
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
  it('ne donnent jamais une Meesh : les 40 étapes sont des points, des fragments, des gels et la coupe', () => {
    const kinds = new Set(Array.from({ length: 40 }, (_, i) => seasonStepReward(i + 1)?.kind));
    expect([...kinds].sort()).toEqual(['fragment', 'freeze', 'points', 'season-cup']);
  });

  it('paient le duo en points seulement', () => {
    expect(Object.keys(duoReward({ level: 30, flameDays: 5, mineDone: true, partnerDone: true })).sort()).toEqual(['doubled', 'points']);
  });
});

/**
 * L'invariant « aucun argent n'entre, aucun gain monnayable ne sort »
 * (conformité F-1, C-1 ; CSI art. L320-1). Le coffre du jour est du hasard
 * GRATUIT : ses probabilités sont affichées avant l'ouverture, il ne contient
 * jamais de Meesh, et rien de ce qu'il donne — comme rien de ce que la saison
 * ou le duo donnent — ne se transfère ni ne se convertit.
 *
 * Ces témoins gardent la FORME des catalogues : un jour où une issue « Meesh »
 * y entrerait, ils tombent, et la décision se prend en connaissance de cause
 * (monétisation précédée du remplacement de NLLB-200 et MMS-TTS, #9227).
 */

import { describe, it, expect } from 'vitest';
import { CHEST_ODDS, dailyChest } from '../../utils/game/chest.js';
import { seasonStepReward } from '../../utils/game/season.js';
import { duoReward } from '../../utils/game/duo.js';

describe('le coffre du jour', () => {
  it('ne porte dans ses probabilités que des points, un fragment et un gel — jamais une Meesh', () => {
    expect(Object.keys(CHEST_ODDS).sort()).toEqual(['fragment', 'freeze', 'maxPoints', 'minPoints']);
  });

  it('ne contient dans aucun tirage une Meesh, ni un transfert', () => {
    for (let day = 1; day <= 28; day += 1) {
      const chest = dailyChest({ userId: 'u1', dayKey: `2026-10-${String(day).padStart(2, '0')}` });
      expect(Object.keys(chest).sort()).toEqual(['freeze', 'fragment', 'points'].sort());
    }
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

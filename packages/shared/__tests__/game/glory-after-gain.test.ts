/**
 * Ce qu'un gain de Gloire fait au rang (#19855, tranche de #17394) : la frappe finit sur la gloire gagnée ET le pas
 * vers le rang suivant. Une marche franchie se dit par son nouveau nom ; sinon, la gloire qui manque jusqu'à la
 * suivante. Le Mythe et Légende I n'ont pas de suite : rien à dire.
 */

import { describe, it, expect } from 'vitest';

import { gloryAfterGain, gloryLadder } from '../../utils/game/glory.js';

const stepOf = (rank: string, division5: number) => gloryLadder().find((step) => step.rank === rank && step.division5 === division5)!;

describe('gloryAfterGain', () => {
  it('sans marche franchie : la gloire qui manque jusqu’à la marche suivante, comptée APRÈS le gain', () => {
    expect(gloryAfterGain({ before: 0, gained: 100 })).toEqual({ kind: 'toward', gloryMissing: stepOf('murmure', 4).minGlory - 100, rank: 'murmure', division5: 4 });
  });

  it('une division franchie : le nouveau nom, avec sa division', () => {
    const start = stepOf('conteur', 3).minGlory;
    expect(gloryAfterGain({ before: start - 1, gained: 1000 })).toEqual({ kind: 'risen', rank: 'conteur', division5: 3 });
  });

  it('un rang franchi : le nouveau rang, à sa division V', () => {
    expect(gloryAfterGain({ before: 1500, gained: 1000 })).toEqual({ kind: 'risen', rank: 'echo', division5: 5 });
  });

  it('atteindre la marche pile la franchit', () => {
    expect(gloryAfterGain({ before: 1000, gained: 1000 })).toEqual({ kind: 'risen', rank: 'echo', division5: 5 });
  });

  it('en Légende I, faute de suite, rien à dire', () => {
    expect(gloryAfterGain({ before: stepOf('legende', 1).minGlory + 10, gained: 1000 })).toBeNull();
  });

  it('le Mythe vient du serveur : rien à dire, même sous le seuil', () => {
    expect(gloryAfterGain({ before: 10, gained: 1000, mythic: true })).toBeNull();
  });

  it('un gain nul ou une gloire illisible ne fabrique pas de marche franchie', () => {
    expect(gloryAfterGain({ before: 1500, gained: 0 })).toEqual({ kind: 'toward', gloryMissing: stepOf('murmure', 1).minGlory - 1500, rank: 'murmure', division5: 1 });
    expect(gloryAfterGain({ before: Number.NaN, gained: -5 })).toEqual({ kind: 'toward', gloryMissing: stepOf('murmure', 4).minGlory, rank: 'murmure', division5: 4 });
  });
});

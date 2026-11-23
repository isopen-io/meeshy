import { beforeAll, describe, expect, test } from 'bun:test';

import { GLORY_POINTS, gloryAfterGain } from '@meeshy/shared/utils/game/glory';

import { formatGameNumber, loadGameCatalog, translateGame } from '@/lib/i18n-game-catalog';
import { rankLabel } from '@/lib/view/game-copy';

import { mintGlorySpoken } from './mint-glory-copy';

beforeAll(async () => {
  await Promise.all([loadGameCatalog('fr'), loadGameCatalog('ar')]);
});

const gainedLine = (gained: number): string => translateGame('fr', 'game.frappe.glory', { glory: formatGameNumber('fr', gained) });

/**
 * CE QUE LE LECTEUR D'ÉCRAN ENTEND D'UNE FRAPPE CONFIRMÉE (#20141) : la gloire gagnée, puis le pas vers le rang
 * suivant — ce que la cérémonie montre, avec les mêmes clés (`game.frappe.glory`, `game.frappe.risen`,
 * `game.frappe.glory_toward`).
 */
describe('la gloire d’une frappe, dite', () => {
  test('loin du rang suivant : la gloire gagnée, puis ce qui manque jusqu’au rang suivant', () => {
    const glory = { before: 20_000, gained: 1000, mythic: false };
    const step = gloryAfterGain(glory);
    if (step?.kind !== 'toward') throw new Error('le cas doit être « toward »');
    const toward = translateGame('fr', 'game.frappe.glory_toward', { glory: formatGameNumber('fr', step.gloryMissing), rank: rankLabel(step.rank, step.division5, 'fr') });
    expect(mintGlorySpoken(glory, 'fr')).toBe(`${gainedLine(1000)}. ${toward}.`);
  });

  test('un rang franchi : la gloire gagnée, puis le nouveau nom', () => {
    const glory = { before: 620, gained: 1000, mythic: false };
    const step = gloryAfterGain(glory);
    if (step?.kind !== 'risen') throw new Error('le cas doit être « risen »');
    const risen = translateGame('fr', 'game.frappe.risen', { rank: rankLabel(step.rank, step.division5, 'fr') });
    expect(mintGlorySpoken(glory, 'fr')).toBe(`${gainedLine(1000)}. ${risen}.`);
  });

  test('le Mythe : la gloire gagnée seule, rien de plus', () => {
    expect(mintGlorySpoken({ before: 5_000_000, gained: 1000, mythic: true }, 'fr')).toBe(`${gainedLine(1000)}.`);
  });

  test('sans gloire lue (ancien serveur) : la gloire de base d’une frappe, comme la scène l’écrit', () => {
    expect(mintGlorySpoken(null, 'fr')).toBe(`${gainedLine(GLORY_POINTS.mint)}.`);
  });

  test('une gloire promise nulle retombe sur la gloire de base, comme la scène', () => {
    expect(mintGlorySpoken({ before: 0, gained: 0, mythic: true }, 'fr')).toBe(`${gainedLine(GLORY_POINTS.mint)}.`);
  });

  test('dans la langue de l’interface : en arabe, les mots arabes', () => {
    const glory = { before: 620, gained: 1000, mythic: false };
    expect(mintGlorySpoken(glory, 'ar').startsWith(translateGame('ar', 'game.frappe.glory', { glory: formatGameNumber('ar', 1000) }))).toBe(true);
  });
});

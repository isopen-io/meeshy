import { describe, expect, test } from 'bun:test';

import { GLORY_RANKS } from '@meeshy/shared/utils/game/glory';
import { RANK_CRESTS } from '@meeshy/shared/utils/game/rank-crest';

import { BLASON_RANKS, blasonDesign } from './ranks';
import { servedDivision, shownRank } from '@/lib/view/game-copy';

/**
 * LES ONZE BLASONS (#9380, conception IV.3) : « un écu par rang ; la matière et
 * les pièces héraldiques montent avec lui. À partir d’Ambassadeur, Mee et Meo
 * tiennent l’écu ; à Légende ils sont couronnés ; à Mythe, auréolés. »
 */
describe('BLASON_RANKS — les rangs de la loi partagée, plus le Mythe', () => {
  test('les dix rangs de GLORY_RANKS dans l’ordre, puis mythe — aucun rang réécrit ici', () => {
    expect(BLASON_RANKS).toEqual([...GLORY_RANKS.map((r) => r.key), 'mythe']);
    expect(BLASON_RANKS).toHaveLength(11);
  });
});

describe('blasonDesign — ce que chaque rang ajoute au précédent', () => {
  const at = (rank: (typeof BLASON_RANKS)[number]) => blasonDesign(rank);

  test('la matière monte : cuivre, bronze, argent, or, platine, obsidienne, prisme', () => {
    expect(BLASON_RANKS.map((r) => at(r).material)).toEqual(['copper', 'copper', 'bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'platinum', 'obsidian', 'prism']);
  });

  test('les pièces de l’écu : liseré dès Écho, chef dès Conteur', () => {
    expect(at('murmure')).toMatchObject({ inner: false, band: false });
    expect(at('echo')).toMatchObject({ inner: true, band: false });
    expect(at('conteur')).toMatchObject({ inner: true, band: true });
  });

  test('la décoration de chaque rang est la table partagée par le web et iOS (#9636)', () => {
    for (const rank of BLASON_RANKS) expect(at(rank).crest).toBe(RANK_CRESTS[rank]);
  });

  test('les tenants se posent à partir d’Ambassadeur — jamais avant', () => {
    expect(BLASON_RANKS.filter((r) => at(r).tenants !== null)).toEqual(['ambassadeur', 'orateur', 'oracle', 'legende', 'mythe']);
    expect(at('ambassadeur').tenants).toEqual({ mee: 'meeJoy', meo: 'meoOpen' });
  });

  test('couronnés à Légende, auréolés à Mythe', () => {
    expect(at('oracle').tenants).toEqual({ mee: 'meeJoy', meo: 'meoOpen' });
    expect(at('legende').tenants).toEqual({ mee: 'meeCrown', meo: 'meoCrown' });
    expect(at('mythe').tenants).toEqual({ mee: 'meeHalo', meo: 'meoHalo' });
  });

  test('le ruban au nom du rang dès Ambassadeur', () => {
    expect(BLASON_RANKS.filter((r) => at(r).ribbon)).toEqual(['ambassadeur', 'orateur', 'oracle', 'legende', 'mythe']);
  });

  test('les encoches de division : tous les rangs sauf le Mythe', () => {
    expect(BLASON_RANKS.filter((r) => !at(r).notches)).toEqual(['mythe']);
  });
});

describe('servedDivision — la division que le serveur sert, V..I ou héritée', () => {
  test('division5 servie : elle fait foi', () => {
    expect(servedDivision({ division: 3, division5: 4 })).toBe(4);
    expect(servedDivision({ division: 1, division5: 1 })).toBe(1);
  });

  test('ancien serveur, sans division5 : la division héritée (III, II, I)', () => {
    expect(servedDivision({ division: 2 })).toBe(2);
  });

  test('le Mythe n’a pas de division', () => {
    expect(servedDivision({ division: null, division5: null })).toBeNull();
    expect(servedDivision({ division: null })).toBeNull();
  });
});

describe('shownRank — ce que les écrans montrent du rang servi', () => {
  test('un serveur à jour : la division V..I et la place du Mythe', () => {
    expect(shownRank({ rank: 'voix', division: 3, division5: 4 })).toEqual({ rank: 'voix', division: 4, mythic: null });
    expect(shownRank({ rank: 'mythe', division: null, division5: null, mythic: { number: 9, edition: 12 } })).toEqual({ rank: 'mythe', division: null, mythic: { number: 9, edition: 12 } });
  });

  test('un ancien serveur, sans division5 ni mythic : la division héritée, aucune place', () => {
    expect(shownRank({ rank: 'echo', division: 3 })).toEqual({ rank: 'echo', division: 3, mythic: null });
    expect(shownRank({ rank: 'mythe', division: null })).toEqual({ rank: 'mythe', division: null, mythic: null });
  });
});

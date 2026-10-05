import { describe, expect, test } from 'bun:test';

import { GLORY_RANKS } from '@meeshy/shared/utils/game/glory';

import { BLASON_RANKS, blasonDesign } from './ranks';

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

  test('les pièces héraldiques : liseré dès Écho, chef dès Conteur, deux étoiles à Passeur, trois points à Polyglotte', () => {
    expect(at('murmure')).toMatchObject({ inner: false, band: false, pieces: 'none' });
    expect(at('echo')).toMatchObject({ inner: true, band: false });
    expect(at('conteur')).toMatchObject({ inner: true, band: true });
    expect(at('passeur').pieces).toBe('stars');
    expect(at('polyglotte').pieces).toBe('dots');
    expect(at('voix').pieces).toBe('none');
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

  test('lauriers dès Orateur, étoile au cimier à Oracle, couronne au cimier dès Légende', () => {
    expect(BLASON_RANKS.filter((r) => at(r).laurel)).toEqual(['orateur', 'oracle', 'legende', 'mythe']);
    expect(at('oracle').crest).toBe('star');
    expect(at('legende').crest).toBe('crown');
    expect(at('mythe').crest).toBe('crown');
    expect(at('voix').crest).toBe('none');
  });

  test('le ruban au nom du rang dès Ambassadeur', () => {
    expect(BLASON_RANKS.filter((r) => at(r).ribbon)).toEqual(['ambassadeur', 'orateur', 'oracle', 'legende', 'mythe']);
  });

  test('les chevrons de division : tous les rangs sauf le Mythe', () => {
    expect(BLASON_RANKS.filter((r) => !at(r).chevrons)).toEqual(['mythe']);
  });
});

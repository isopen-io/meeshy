import { describe, expect, test } from 'bun:test';

import { forwardDurationBound, forwardDurationOptions, forwardedDurationFor } from './forward-duration';

/**
 * LA DURÉE D'UNE COPIE TRANSFÉRÉE (#9573) — la copie d'une flamme à durée dure
 * AU PLUS autant que sa source : la feuille présélectionne la durée de la
 * source et ne propose que les paliers inférieurs ou égaux.
 */
const source = (id: string, maxDurationSeconds?: number) => ({ id, content: '', originalLanguage: 'fr', ...(maxDurationSeconds === undefined ? {} : { maxDurationSeconds }) });

describe('forwardDurationBound — la borne d’une sélection', () => {
  test('aucune flamme : aucune borne, donc aucune rangée', () => {
    expect(forwardDurationBound([source('a'), source('b')])).toBeNull();
  });

  test('une flamme : sa durée', () => {
    expect(forwardDurationBound([source('a', 300)])).toBe(300);
  });

  test('plusieurs flammes : la plus COURTE borne le choix commun', () => {
    expect(forwardDurationBound([source('a', 3600), source('b'), source('c', 60)])).toBe(60);
  });
});

describe('forwardDurationOptions — la source en tête, puis les paliers plus courts', () => {
  const seconds = (bound: number) => forwardDurationOptions(bound).map((option) => option.seconds);

  test('une source sur un palier : elle, puis les paliers inférieurs, du plus long au plus court', () => {
    expect(seconds(300)).toEqual([300, 60, 30, 15]);
    expect(seconds(86400)).toEqual([86400, 3600, 300, 60, 30, 15]);
  });

  test('le plus petit palier n’a qu’un choix', () => {
    expect(seconds(15)).toEqual([15]);
  });

  test('une source HORS palier s’affiche telle quelle en tête', () => {
    expect(seconds(45)).toEqual([45, 30, 15]);
    expect(seconds(10)).toEqual([10]);
  });

  test('un palier porte son libellé de catalogue ; une durée hors palier, son écriture', () => {
    const [head, next] = forwardDurationOptions(45);
    expect(head).toEqual({ seconds: 45, label: '45s' });
    expect(next).toEqual({ seconds: 30, label: '30s', displayKey: 'composer.ephemeral.duration.30' });
  });

  test('aucun choix ne dépasse la source, jamais la flamme après lecture (0 s)', () => {
    [10, 15, 45, 60, 300, 4000, 86400, 100000].forEach((bound) => {
      expect(seconds(bound).every((value) => value > 0 && value <= bound)).toBe(true);
      expect(seconds(bound)[0]).toBe(bound);
    });
  });
});

describe('forwardedDurationFor — ce qui part pour CHAQUE message', () => {
  test('un message ordinaire ne reçoit jamais de durée', () => {
    expect(forwardedDurationFor(source('a'), 60)).toBeUndefined();
  });

  test('une flamme reçoit la durée choisie', () => {
    expect(forwardedDurationFor(source('a', 300), 60)).toBe(60);
  });

  test('sans choix, ou avec un choix invalide ou trop long, sa propre durée', () => {
    expect(forwardedDurationFor(source('a', 300), undefined)).toBe(300);
    expect(forwardedDurationFor(source('a', 300), 3600)).toBe(300);
    expect(forwardedDurationFor(source('a', 300), 0)).toBe(300);
    expect(forwardedDurationFor(source('a', 300), Number.NaN)).toBe(300);
  });
});

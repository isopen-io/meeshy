import { describe, expect, test } from 'bun:test';

import { budgetsFromMeasure, verbosityProblems } from './verbosity-budgets.mjs';

const measure = (views: Record<string, { total: number; firstScreen: number }>, uncovered: Record<string, string> = {}) => ({ views, uncovered });

describe('le cliquet des mots visibles', () => {
  test('une vue sous son budget passe', () => {
    const budgets = measure({ settings: { total: 120, firstScreen: 60 } });
    expect(verbosityProblems({ listed: ['settings'], measured: measure({ settings: { total: 110, firstScreen: 60 } }), budgets, previous: budgets })).toEqual([]);
  });

  test('une vue qui redevient bavarde échoue, au total comme au premier écran', () => {
    const budgets = measure({ settings: { total: 120, firstScreen: 60 } });
    const problems = verbosityProblems({ listed: ['settings'], measured: measure({ settings: { total: 121, firstScreen: 61 } }), budgets, previous: budgets });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('settings');
    expect(problems[0]).toContain('121');
  });

  test('un budget qui MONTE par rapport à la base échoue', () => {
    const previous = measure({ settings: { total: 120, firstScreen: 60 } });
    const budgets = measure({ settings: { total: 130, firstScreen: 60 } });
    const problems = verbosityProblems({ listed: ['settings'], measured: measure({ settings: { total: 125, firstScreen: 60 } }), budgets, previous });
    expect(problems).toEqual([expect.stringContaining('ne peut que baisser')]);
  });

  test('une vue nouvelle n’a pas de base et passe', () => {
    const budgets = measure({ links: { total: 80, firstScreen: 40 } });
    expect(verbosityProblems({ listed: ['links'], measured: budgets, budgets, previous: measure({}) })).toEqual([]);
  });

  test('sans base lisible, seul le budget est tenu', () => {
    const budgets = measure({ links: { total: 80, firstScreen: 40 } });
    expect(verbosityProblems({ listed: ['links'], measured: budgets, budgets, previous: null })).toEqual([]);
  });

  test('une vue listée sans budget ni mention « non couverte » échoue', () => {
    expect(verbosityProblems({ listed: ['links'], measured: measure({ links: { total: 1, firstScreen: 1 } }), budgets: measure({}), previous: null })).toEqual([
      expect.stringContaining('links'),
    ]);
  });

  test('une vue couverte qu’on ne peut plus ouvrir échoue, au lieu de passer à vide', () => {
    const budgets = measure({ links: { total: 80, firstScreen: 40 } });
    const problems = verbosityProblems({ listed: ['links'], measured: measure({}, { links: '0 mot après 4 essais' }), budgets, previous: budgets });
    expect(problems).toEqual([expect.stringContaining('ne s’ouvre plus')]);
  });

  test('une vue non couverte et listée comme telle passe', () => {
    const budgets = measure({}, { admin: 'session administrateur absente des fixtures' });
    expect(verbosityProblems({ listed: ['admin'], measured: budgets, budgets, previous: budgets })).toEqual([]);
  });

  test('une vue couverte à la base ne peut pas devenir « non couverte »', () => {
    const previous = measure({ links: { total: 80, firstScreen: 40 } });
    const budgets = measure({}, { links: 'plus mesurable' });
    const problems = verbosityProblems({ listed: ['links'], measured: budgets, budgets, previous });
    expect(problems).toEqual([expect.stringContaining('couverte')]);
  });

  test('le relevé devient le budget, vues triées, non couvertes gardées', () => {
    const budgets = budgetsFromMeasure(measure({ b: { total: 2, firstScreen: 1 }, a: { total: 3, firstScreen: 3 } }, { c: 'raison' }));
    expect(Object.keys(budgets.views)).toEqual(['a', 'b']);
    expect(budgets.uncovered).toEqual({ c: 'raison' });
  });
});

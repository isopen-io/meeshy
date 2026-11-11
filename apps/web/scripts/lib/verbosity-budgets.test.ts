import { describe, expect, test } from 'bun:test';

import { budgetsFromMeasure, socleProblems, verbosityProblems } from './verbosity-budgets.mjs';

const expectOne = (problems: readonly string[], fragment: string): void => {
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain(fragment);
};

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
    expectOne(problems, 'ne peut que baisser');
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
    expectOne(verbosityProblems({ listed: ['links'], measured: measure({ links: { total: 1, firstScreen: 1 } }), budgets: measure({}), previous: null }), 'links');
  });

  test('une vue couverte qu’on ne peut plus ouvrir échoue, au lieu de passer à vide', () => {
    const budgets = measure({ links: { total: 80, firstScreen: 40 } });
    const problems = verbosityProblems({ listed: ['links'], measured: measure({}, { links: '0 mot après 4 essais' }), budgets, previous: budgets });
    expectOne(problems, 'ne s’ouvre plus');
  });

  test('une vue non couverte et listée comme telle passe', () => {
    const budgets = measure({}, { admin: 'session administrateur absente des fixtures' });
    expect(verbosityProblems({ listed: ['admin'], measured: budgets, budgets, previous: budgets })).toEqual([]);
  });

  test('une vue couverte à la base ne peut pas devenir « non couverte »', () => {
    const previous = measure({ links: { total: 80, firstScreen: 40 } });
    const budgets = measure({}, { links: 'plus mesurable' });
    const problems = verbosityProblems({ listed: ['links'], measured: budgets, budgets, previous });
    expectOne(problems, 'couverte');
  });

  test('le relevé devient le budget, vues triées, non couvertes gardées', () => {
    const budgets = budgetsFromMeasure(measure({ b: { total: 2, firstScreen: 1 }, a: { total: 3, firstScreen: 3 } }, { c: 'raison' }));
    expect(Object.keys(budgets.views)).toEqual(['a', 'b']);
    expect(budgets.uncovered).toEqual({ c: 'raison' });
  });
});

describe('le relèvement motivé d’un budget', () => {
  const previous = measure({ links: { total: 39, firstScreen: 39 } });
  const socle = measure({ links: { total: 86, firstScreen: 86 } });
  const raisedTo = (total: number, firstScreen: number) => measure({ links: { total, firstScreen } });
  const releve = { de: { total: 39, firstScreen: 39 }, a: { total: 70, firstScreen: 70 }, motif: 'Les repères des types de lien reviennent', issue: 17641 };
  const problemsOf = (budgets: object, base = socle) => verbosityProblems({ listed: ['links'], measured: raisedTo(70, 70), budgets, previous, socle: base });

  test('un relèvement inscrit pour cette vue et ce couple de valeurs passe', () => {
    expect(problemsOf({ ...raisedTo(70, 70), releves: { links: releve } })).toEqual([]);
  });

  test('sans entrée de relèvement, le budget qui monte échoue toujours', () => {
    const problems = problemsOf(raisedTo(70, 70));
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('ne peut que baisser');
  });

  test('un relèvement sans motif est refusé', () => {
    expectOne(problemsOf({ ...raisedTo(70, 70), releves: { links: { ...releve, motif: '  ' } } }), 'motif');
  });

  test('un relèvement sans issue est refusé', () => {
    expectOne(problemsOf({ ...raisedTo(70, 70), releves: { links: { ...releve, issue: 0 } } }), 'issue');
  });

  test('un relèvement dont le départ n’est pas le budget de la base est refusé', () => {
    expectOne(problemsOf({ ...raisedTo(70, 70), releves: { links: { ...releve, de: { total: 45, firstScreen: 39 } } } }), 'base');
  });

  test('un relèvement dont l’arrivée n’est pas le budget inscrit est refusé', () => {
    expectOne(problemsOf({ ...raisedTo(72, 70), releves: { links: releve } }), 'inscrit');
  });

  test('un relèvement ne dépasse jamais le budget d’avant l’épure', () => {
    const over = { ...releve, a: { total: 90, firstScreen: 70 } };
    expectOne(verbosityProblems({ listed: ['links'], measured: raisedTo(70, 70), budgets: { ...raisedTo(90, 70), releves: { links: over } }, previous, socle }), 'avant l’épure');
  });

  test('sans budget d’avant l’épure connu pour la vue, le relèvement est refusé', () => {
    expectOne(problemsOf({ ...raisedTo(70, 70), releves: { links: releve } }, measure({})), 'avant l’épure');
  });

  test('le relèvement d’une vue ne couvre pas une autre vue', () => {
    const budgets = { ...measure({ links: { total: 70, firstScreen: 70 }, settings: { total: 130, firstScreen: 60 } }), releves: { links: releve } };
    const base = measure({ links: { total: 39, firstScreen: 39 }, settings: { total: 120, firstScreen: 60 } });
    const problems = verbosityProblems({ listed: [], measured: budgets, budgets, previous: base, socle: measure({ links: { total: 86, firstScreen: 86 }, settings: { total: 387, firstScreen: 106 } }) });
    expectOne(problems, 'settings');
  });

  test('une fois fusionné, le relèvement resté inscrit ne gêne plus', () => {
    const budgets = { ...raisedTo(70, 70), releves: { links: releve } };
    expect(verbosityProblems({ listed: ['links'], measured: raisedTo(70, 70), budgets, previous: raisedTo(70, 70), socle })).toEqual([]);
  });

  test('réécrire les budgets depuis le relevé garde les relèvements inscrits', () => {
    const rewritten = budgetsFromMeasure(raisedTo(60, 60), { releves: { links: releve } });
    expect(rewritten.releves).toEqual({ links: releve });
    expect('releves' in budgetsFromMeasure(raisedTo(60, 60))).toBe(false);
  });

  test('un budget d’avant l’épure ne se réécrit pas à la hausse', () => {
    expectOne(socleProblems({ socle: measure({ links: { total: 90, firstScreen: 86 } }), previousSocle: socle }), 'links');
    expect(socleProblems({ socle, previousSocle: socle })).toEqual([]);
    expect(socleProblems({ socle, previousSocle: null })).toEqual([]);
  });
});

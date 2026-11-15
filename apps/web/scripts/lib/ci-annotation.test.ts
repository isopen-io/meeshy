import { describe, expect, test } from 'bun:test';

import { ciErrorAnnotation, reportFailures } from './ci-annotation.mjs';

describe('ciErrorAnnotation', () => {
  test('rend une commande ::error lisible par GitHub Actions, titrée par le gate', () => {
    expect(ciErrorAnnotation('check-thread-states', 'le bandeau hors ligne manque')).toBe(
      '::error title=check-thread-states::le bandeau hors ligne manque',
    );
  });

  test('échappe le pourcentage et les retours à la ligne, qui couperaient la commande', () => {
    expect(ciErrorAnnotation('g', '100% vu\nsur deux lignes\r')).toBe('::error title=g::100%25 vu%0Asur deux lignes%0D');
  });
});

describe('reportFailures', () => {
  test('hors GitHub Actions : chaque constat sur la sortie d’erreur, aucune annotation', () => {
    const errors: string[] = [];
    const logs: string[] = [];
    reportFailures({ gate: 'g', failures: ['a', 'b'], bullet: '-', env: {}, error: (l) => errors.push(l), log: (l) => logs.push(l) });
    expect(errors).toEqual(['    - a', '    - b']);
    expect(logs).toEqual([]);
  });

  test('sous GitHub Actions : chaque constat devient AUSSI une annotation', () => {
    const errors: string[] = [];
    const logs: string[] = [];
    reportFailures({ gate: 'g', failures: ['a'], bullet: '·', env: { GITHUB_ACTIONS: 'true' }, error: (l) => errors.push(l), log: (l) => logs.push(l) });
    expect(errors).toEqual(['    · a']);
    expect(logs).toEqual(['::error title=g::a']);
  });
});

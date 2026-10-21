import { describe, expect, test } from 'bun:test';

import { attempted } from './attempted';

describe('attempted — la panne d’une tâche de marge ne remonte pas', () => {
  test('rend le résultat de la tâche', async () => {
    expect(await attempted(async () => 'fait', 'repli')).toBe('fait');
  });

  test('rend le repli quand la tâche rejette', async () => {
    expect(
      await attempted(async () => {
        throw new Error('panne');
      }, 'repli'),
    ).toBe('repli');
  });

  test('rend le repli quand la tâche lève avant de rendre une promesse', async () => {
    expect(
      await attempted(() => {
        throw new Error('panne');
      }, 'repli'),
    ).toBe('repli');
  });
});

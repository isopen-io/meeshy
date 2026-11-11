import { describe, expect, test } from 'bun:test';

import { meeshyGlassButtonRecipe } from './meeshy-glass-button';

describe('K02 MeeshyGlassButton (squelette)', () => {
  test('la recette existe et rend un disque de 44', () => {
    expect(meeshyGlassButtonRecipe({ kind: 'normal', size: 44 }).diameter).toBe(44);
  });
});

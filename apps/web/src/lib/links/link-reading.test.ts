import { describe, expect, test } from 'bun:test';

import { readableTextOf } from './link-reading';

describe('readableTextOf — ce qu’on lit, les liens lus par la loi d’affichage (#9687)', () => {
  test('« [libellé](url) » se lit le libellé, « [[url]] » l’adresse', () => {
    expect(readableTextOf('puis [notre page](https://meeshy.me/about) et enfin [[https://meeshy.me/brut]]')).toBe('puis notre page et enfin https://meeshy.me/brut');
  });

  test('la notation légère disparaît, une adresse brute reste telle qu’écrite', () => {
    expect(readableTextOf('# Titre\n**gras** et https://meeshy.me')).toBe('Titre\ngras et https://meeshy.me');
  });
});

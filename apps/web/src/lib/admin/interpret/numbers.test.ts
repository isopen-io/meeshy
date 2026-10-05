import { describe, expect, test } from 'bun:test';

import { deltaRatio, formatBytes, formatCompact, formatCount, formatMoney, formatPercent } from './numbers';

const NBSP = /\s/g;
const plain = (value: string): string => value.replace(NBSP, ' ');

describe('formatCount et formatCompact', () => {
  test('groupe les milliers dans la langue d’interface', () => {
    expect(plain(formatCount(12408, 'fr'))).toBe('12 408');
    expect(formatCount(12408, 'en')).toBe('12,408');
  });

  test('le compact tient en quelques caractères', () => {
    expect(plain(formatCompact(12408, 'fr'))).toBe('12,4 k');
    expect(formatCompact(12408, 'en')).toBe('12.4K');
  });

  test('une absence se dit « — », jamais « NaN » ni « null »', () => {
    expect(formatCount(null, 'fr')).toBe('—');
    expect(formatCount(Number.NaN, 'fr')).toBe('—');
    expect(formatCompact(undefined, 'fr')).toBe('—');
  });
});

describe('formatPercent — les DEUX échelles servies', () => {
  test('0–1 (ratio) et 0–100 (hundred) rendent le même pourcentage pour le même taux', () => {
    expect(plain(formatPercent(0.8, 'ratio', 'fr'))).toBe('80 %');
    expect(plain(formatPercent(80, 'hundred', 'fr'))).toBe('80 %');
  });

  test('la mauvaise échelle se voit : 0,8 lu en « hundred » n’est pas 80 %', () => {
    expect(plain(formatPercent(0.8, 'hundred', 'fr'))).toBe('1 %');
  });

  test('les décimales se règlent', () => {
    expect(plain(formatPercent(0.1234, 'ratio', 'fr', 1))).toBe('12,3 %');
    expect(formatPercent(null, 'ratio', 'fr')).toBe('—');
  });
});

describe('formatBytes, formatMoney, deltaRatio', () => {
  test('l’unité se choisit seule, de l’octet au téraoctet', () => {
    expect(plain(formatBytes(12, 'fr'))).toBe('12 o');
    expect(plain(formatBytes(1536, 'fr'))).toBe('1,5 ko');
    expect(plain(formatBytes(3.25 * 1024 * 1024, 'fr'))).toBe('3,3 Mo');
    expect(plain(formatBytes(5 * 1024 ** 3, 'fr'))).toBe('5 Go');
    expect(formatBytes(-1, 'fr')).toBe('—');
  });

  test('le montant est en dollars', () => {
    expect(formatMoney(12.5, 'en')).toBe('$12.50');
    expect(formatMoney(null, 'en')).toBe('—');
  });

  test('deltaRatio : la variation relative, null sans précédent — jamais l’infini', () => {
    expect(deltaRatio(112, 100)).toBeCloseTo(0.12, 10);
    expect(deltaRatio(50, 100)).toBe(-0.5);
    expect(deltaRatio(5, 0)).toBeNull();
    expect(deltaRatio(null, 10)).toBeNull();
  });
});

import { describe, expect, test } from 'bun:test';

import { fileWeightLabel } from './file-weight';

describe('le poids suit la langue de l\u2019interface (#10748)', () => {
  test('anglais : « 32 kB », jamais « 32 Ko »', () => {
    const label = fileWeightLabel(32_768, 'en');
    expect(label).toContain('32');
    expect(label).not.toContain('Ko');
    expect(label).toMatch(/kB/);
  });

  test('français : l\u2019unité française, et jamais moins de 1', () => {
    expect(fileWeightLabel(100, 'fr')).toBe('1 Ko');
    expect(fileWeightLabel(32_768, 'fr')).toBe('32 Ko');
  });

  test('au-delà d\u2019un mébi-octet, le méga-octet à une décimale', () => {
    expect(fileWeightLabel(1_572_864, 'en')).toContain('1.5');
  });

  test('français : la décimale s\u2019écrit avec une virgule (« 1,5 Mo »)', () => {
    expect(fileWeightLabel(1_572_864, 'fr')).toBe('1,5 Mo');
  });
});

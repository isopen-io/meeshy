import { describe, expect, test } from 'bun:test';

import { IMAGER_LENGTH_THRESHOLD_MS, imagerLengthChoices, renderedLengthMs } from './scene-export-length';

describe('« Imager » une longue composition — la longueur rendue depuis le début', () => {
  test('sous une minute, aucun choix : tout est rendu', () => {
    expect(imagerLengthChoices(45_000)).toEqual([]);
    expect(imagerLengthChoices(IMAGER_LENGTH_THRESHOLD_MS)).toEqual([]);
  });

  test('au-delà d’une minute, quatre longueurs, chacune avec sa durée', () => {
    expect(imagerLengthChoices(240_000)).toEqual([
      { quarter: 1, durationMs: 60_000 },
      { quarter: 2, durationMs: 120_000 },
      { quarter: 3, durationMs: 180_000 },
      { quarter: 4, durationMs: 240_000 },
    ]);
  });

  test('un contenu de 4 min « imagé » en 2/4 rend 2 min, depuis le début', () => {
    expect(renderedLengthMs({ totalMs: 240_000, quarter: 2 })).toBe(120_000);
  });

  test('« Enregistrer » et « Partager » ne choisissent rien : la durée complète', () => {
    expect(renderedLengthMs({ totalMs: 240_000, quarter: null })).toBe(240_000);
  });

  test('un quart demandé sous la minute ne coupe rien', () => {
    expect(renderedLengthMs({ totalMs: 30_000, quarter: 1 })).toBe(30_000);
  });

  test('une durée absurde ne propose rien et ne rend rien de négatif', () => {
    expect(imagerLengthChoices(Number.NaN)).toEqual([]);
    expect(renderedLengthMs({ totalMs: -5, quarter: null })).toBe(0);
  });
});

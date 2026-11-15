/**
 * @jest-environment node
 *
 * Décision porteur (#10510, commentaire 6222116672) : le brut de lecture
 * (`PostImpression`, `PostEngagement`) se garde 25 mois par défaut, et cette
 * durée se règle par UNE seule source, `RAW_READING_RETENTION_DAYS`.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import {
  DEFAULT_RAW_READING_RETENTION_DAYS,
  RAW_READING_RETENTION_ENV,
  parseRawReadingRetentionDays,
  rawReadingRetentionMs,
} from '../../../config/raw-reading-retention';

const DAY_MS = 86_400_000;
const original = process.env[RAW_READING_RETENTION_ENV];

afterEach(() => {
  if (original === undefined) delete process.env[RAW_READING_RETENTION_ENV];
  else process.env[RAW_READING_RETENTION_ENV] = original;
});

describe('conservation du brut de lecture', () => {
  it('vaut 25 mois (760 jours) par défaut', () => {
    delete process.env[RAW_READING_RETENTION_ENV];
    expect(DEFAULT_RAW_READING_RETENTION_DAYS).toBe(760);
    expect(rawReadingRetentionMs()).toBe(760 * DAY_MS);
  });

  it('se règle par RAW_READING_RETENTION_DAYS, sans redémarrer', () => {
    process.env[RAW_READING_RETENTION_ENV] = '400';
    expect(rawReadingRetentionMs()).toBe(400 * DAY_MS);
    process.env[RAW_READING_RETENTION_ENV] = '30';
    expect(rawReadingRetentionMs()).toBe(30 * DAY_MS);
  });

  it.each(['', '  ', 'abc', '0', '-5', '12.5', '1e3'])('une valeur vide ou illisible (%p) sert le défaut', (raw) => {
    expect(parseRawReadingRetentionDays(raw)).toBe(DEFAULT_RAW_READING_RETENTION_DAYS);
  });
});

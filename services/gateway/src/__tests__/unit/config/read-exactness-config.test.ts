/**
 * Unit tests for read-exactness-config (config/read-exactness-config.ts)
 *
 * Lit la date d'armement du suivi exact de lecture. La bascule est OPT-IN :
 * livrer le code ne doit rien changer en production, seule la variable
 * d'environnement l'active.
 *
 * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
 * @jest-environment node
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { getExactReadTrackingCutover } from '../../../config/read-exactness-config';

const ENV_KEY = 'EXACT_READ_TRACKING_SINCE';
const original = process.env[ENV_KEY];

afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
});

describe('getExactReadTrackingCutover', () => {
  it('returns null when the variable is absent — legacy behaviour preserved', () => {
    delete process.env[ENV_KEY];
    expect(getExactReadTrackingCutover()).toBeNull();
  });

  it('returns null on an empty value', () => {
    process.env[ENV_KEY] = '';
    expect(getExactReadTrackingCutover()).toBeNull();
  });

  it('parses a valid ISO date', () => {
    process.env[ENV_KEY] = '2026-08-01T00:00:00.000Z';
    expect(getExactReadTrackingCutover()).toEqual(new Date('2026-08-01T00:00:00.000Z'));
  });

  it('falls back to null on an unparsable value rather than arming the cutover', () => {
    // Une date illisible ne doit surtout pas armer la bascule par accident :
    // le repli silencieux vers le comportement historique est le seul choix sûr.
    process.env[ENV_KEY] = 'pas-une-date';
    expect(getExactReadTrackingCutover()).toBeNull();
  });

  it('reflects a change of the variable without a module reload', () => {
    delete process.env[ENV_KEY];
    expect(getExactReadTrackingCutover()).toBeNull();
    process.env[ENV_KEY] = '2026-09-15T12:00:00.000Z';
    expect(getExactReadTrackingCutover()).toEqual(new Date('2026-09-15T12:00:00.000Z'));
  });
});

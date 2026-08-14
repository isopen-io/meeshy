/**
 * Log-level contract for `normalizePhoneWithCountry`.
 *
 * Un numéro illisible venu d'un carnet d'adresses est un cas de DONNÉE, pas un
 * incident : `parsePhoneNumber` lève une `ParseError` que la fonction absorbe
 * déjà en renvoyant `null`. La journaliser en WARN noyait les logs gateway —
 * une ligne par entrée atypique, des centaines par synchronisation de carnet.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const childLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => childLogger) },
}));

// Sentinelle : seul ce numéro déclenche une défaillance INATTENDUE (pas une
// `ParseError`), pour couvrir la branche WARN sans dépendre d'un défaut réel
// de libphonenumber.
const UNEXPECTED_FAILURE_INPUT = '+33600000000';

jest.mock('libphonenumber-js', () => {
  const actual = jest.requireActual<typeof import('libphonenumber-js')>('libphonenumber-js');
  return {
    ...actual,
    parsePhoneNumber: (value: string, country?: string) => {
      if (value === UNEXPECTED_FAILURE_INPUT) throw new TypeError('metadata unavailable');
      return actual.parsePhoneNumber(value, country as never);
    },
  };
});

import { normalizePhoneWithCountry } from '../../../utils/normalize';

describe('normalizePhoneWithCountry — logging', () => {
  beforeEach(() => {
    childLogger.debug.mockClear();
    childLogger.warn.mockClear();
  });

  it('does not warn when libphonenumber rejects the input', () => {
    expect(normalizePhoneWithCountry('+999 000 111 222', 'FR')).toBeNull();
    expect(childLogger.warn).not.toHaveBeenCalled();
  });

  it('records the rejection at debug level with its reason', () => {
    normalizePhoneWithCountry('+999 000 111 222', 'FR');
    expect(childLogger.debug).toHaveBeenCalledWith(
      'normalizePhoneWithCountry parse error',
      expect.objectContaining({ reason: 'INVALID_COUNTRY' })
    );
  });

  it('warns when the failure is not a libphonenumber parse error', () => {
    expect(normalizePhoneWithCountry(UNEXPECTED_FAILURE_INPUT, 'FR')).toBeNull();
    expect(childLogger.warn).toHaveBeenCalledWith(
      'normalizePhoneWithCountry unexpected error',
      expect.objectContaining({ name: 'TypeError' })
    );
  });

  it('returns null for a non-string input instead of throwing', () => {
    // Un carnet d'adresses peut livrer n'importe quoi ; `.trim()` sur un
    // non-string faisait remonter une TypeError HORS du try, donc un 500.
    expect(normalizePhoneWithCountry(42 as unknown as string, 'FR')).toBeNull();
    expect(normalizePhoneWithCountry(null as unknown as string, 'FR')).toBeNull();
  });
});

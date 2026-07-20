/**
 * Unit tests for name-similarity util (name-similarity.ts)
 * Compare l'identité déclarée à l'inscription avec celle du compte dormant
 * détenant le même numéro — 'exact' | 'similar' | 'different'.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { compareFullNames } from '../../../utils/name-similarity';

describe('compareFullNames — exact', () => {
  it('returns exact for identical names', () => {
    expect(compareFullNames(
      { firstName: 'Jean', lastName: 'Dupont' },
      { firstName: 'Jean', lastName: 'Dupont' }
    )).toBe('exact');
  });

  it('ignores case and surrounding whitespace', () => {
    expect(compareFullNames(
      { firstName: '  jean ', lastName: 'DUPONT' },
      { firstName: 'Jean', lastName: 'dupont ' }
    )).toBe('exact');
  });

  it('ignores accents (José ≡ Jose)', () => {
    expect(compareFullNames(
      { firstName: 'José', lastName: 'Nlomé' },
      { firstName: 'Jose', lastName: 'Nlome' }
    )).toBe('exact');
  });

  it('treats swapped first/last name as exact', () => {
    expect(compareFullNames(
      { firstName: 'Dupont', lastName: 'Jean' },
      { firstName: 'Jean', lastName: 'Dupont' }
    )).toBe('exact');
  });
});

describe('compareFullNames — similar', () => {
  it('detects a small typo as similar', () => {
    expect(compareFullNames(
      { firstName: 'Jean', lastName: 'Dupond' },
      { firstName: 'Jean', lastName: 'Dupont' }
    )).toBe('similar');
  });

  it('detects diminutive-like close spellings as similar', () => {
    expect(compareFullNames(
      { firstName: 'Jonathan', lastName: 'Mbiada' },
      { firstName: 'Jonatan', lastName: 'Mbiada' }
    )).toBe('similar');
  });

  it('detects compound first name containing the other as similar', () => {
    expect(compareFullNames(
      { firstName: 'Jean-Pierre', lastName: 'Dupont' },
      { firstName: 'Jean', lastName: 'Dupont' }
    )).toBe('similar');
  });
});

describe('compareFullNames — different', () => {
  it('returns different for unrelated names', () => {
    expect(compareFullNames(
      { firstName: 'Alice', lastName: 'Martin' },
      { firstName: 'Boris', lastName: 'Tchoua' }
    )).toBe('different');
  });

  it('returns different when only the first name matches', () => {
    expect(compareFullNames(
      { firstName: 'Jean', lastName: 'Martin' },
      { firstName: 'Jean', lastName: 'Okonkwo' }
    )).toBe('different');
  });

  it('returns different when one side is empty', () => {
    expect(compareFullNames(
      { firstName: '', lastName: '' },
      { firstName: 'Jean', lastName: 'Dupont' }
    )).toBe('different');
  });
});

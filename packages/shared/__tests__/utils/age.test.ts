import { describe, it, expect } from 'vitest';
import { calculateAge, isAdult } from '../../utils/age.js';

describe('calculateAge', () => {
  it('returns the completed number of years when the birthday has already passed this year', () => {
    expect(calculateAge(new Date(1990, 0, 1), new Date(2026, 5, 15))).toBe(36);
  });

  it('does not count the current year when the birthday has not happened yet', () => {
    expect(calculateAge(new Date(1990, 11, 31), new Date(2026, 0, 1))).toBe(35);
  });

  it('counts the birthday itself as the completed year', () => {
    expect(calculateAge(new Date(1990, 5, 15), new Date(2026, 5, 15))).toBe(36);
  });
});

describe('isAdult — fail-closed sur l\'inconnu (#3637)', () => {
  it('returns true for a birthDate 18 years or more before the reference date', () => {
    expect(isAdult(new Date(2000, 0, 1), new Date(2018, 0, 1))).toBe(true);
  });

  it('returns false for a birthDate less than 18 years before the reference date', () => {
    expect(isAdult(new Date(2010, 0, 1), new Date(2026, 0, 1))).toBe(false);
  });

  it('returns false — never true — when birthDate is null (unverified, not "presumed adult")', () => {
    expect(isAdult(null)).toBe(false);
  });

  it('returns false — never true — when birthDate is undefined', () => {
    expect(isAdult(undefined)).toBe(false);
  });
});

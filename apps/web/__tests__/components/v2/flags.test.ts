import { getFlag, getLanguageName, FLAG_MAP, LANGUAGE_NAMES } from '@/components/v2/flags';

const GLOBE = '\u{1F310}';
const FLAG_NORWAY = '\u{1F1F3}\u{1F1F4}';
const FLAG_INDONESIA = '\u{1F1EE}\u{1F1E9}';
const FLAG_FRANCE = '\u{1F1EB}\u{1F1F7}';

describe('v2/flags getFlag', () => {
  it('returns the France flag for a known 2-letter code', () => {
    expect(getFlag('fr')).toBe(FLAG_FRANCE);
  });

  it('returns the Indonesia flag for "id" (present on image/audio cards)', () => {
    expect(getFlag('id')).toBe(FLAG_INDONESIA);
  });

  it('returns the Norway flag for "no" (was only present on the video card)', () => {
    expect(getFlag('no')).toBe(FLAG_NORWAY);
  });

  it('is case-insensitive', () => {
    expect(getFlag('NO')).toBe(FLAG_NORWAY);
    expect(getFlag('FR')).toBe(FLAG_FRANCE);
  });

  it('extracts the primary subtag from a BCP-47 locale', () => {
    expect(getFlag('fr-FR')).toBe(FLAG_FRANCE);
  });

  it('falls back to the globe for an unknown code', () => {
    expect(getFlag('xx')).toBe(GLOBE);
  });

  it('falls back to the globe for empty/nullish input', () => {
    expect(getFlag('')).toBe(GLOBE);
    expect(getFlag(undefined)).toBe(GLOBE);
    expect(getFlag(null)).toBe(GLOBE);
  });
});

describe('v2/flags maps stay in sync', () => {
  it('exposes the same language keys in FLAG_MAP and LANGUAGE_NAMES', () => {
    expect(Object.keys(FLAG_MAP).sort()).toEqual(Object.keys(LANGUAGE_NAMES).sort());
  });

  it('covers both Indonesian and Norwegian (no media-type divergence)', () => {
    expect(FLAG_MAP).toHaveProperty('id');
    expect(FLAG_MAP).toHaveProperty('no');
  });
});

describe('v2/flags getLanguageName', () => {
  it('returns a romanized name for a known code', () => {
    expect(getLanguageName('no')).toBe('Norsk');
  });

  it('falls back to the uppercased code for an unknown language', () => {
    expect(getLanguageName('xx')).toBe('XX');
  });
});

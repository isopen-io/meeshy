import { getFlag, getLanguageName, FLAG_MAP, LANGUAGE_NAMES } from '@/components/v2/flags';

const GLOBE = '\u{1F310}';
const FLAG_NORWAY = '\u{1F1F3}\u{1F1F4}';
const FLAG_INDONESIA = '\u{1F1EE}\u{1F1E9}';
const FLAG_FRANCE = '\u{1F1EB}\u{1F1F7}';
const FLAG_SWEDEN = '\u{1F1F8}\u{1F1EA}';
const FLAG_SPAIN = '\u{1F1EA}\u{1F1F8}';
const FLAG_JAPAN = '\u{1F1EF}\u{1F1F5}';
const FLAG_PORTUGAL = '\u{1F1E7}\u{1F1F7}';

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

  it('resolves ISO 639-2/639-3 codes to the correct national flag (not the globe)', () => {
    // Blind slice(0, 2) turned these canonical multi-letter codes into a
    // non-matching 2-letter prefix ("swe"->"sw", "spa"->"sp", "jpn"->"jp",
    // "por"->"po") and fell through to the globe. normalizeLanguageCode maps
    // them to their supported ISO 639-1 code.
    expect(getFlag('swe')).toBe(FLAG_SWEDEN);
    expect(getFlag('spa')).toBe(FLAG_SPAIN);
    expect(getFlag('jpn')).toBe(FLAG_JAPAN);
    expect(getFlag('por')).toBe(FLAG_PORTUGAL);
  });

  it('resolves 639-2/B (bibliographic) variants that differ from the 639-1 prefix', () => {
    // "ger"->"de", "dut"->"nl", "chi"->"zh": bibliographic codes whose first
    // two letters never form the target ISO 639-1 code.
    expect(getFlag('ger')).toBe(FLAG_MAP.de);
    expect(getFlag('dut')).toBe(FLAG_MAP.nl);
    expect(getFlag('chi')).toBe(FLAG_MAP.zh);
  });

  it('does not truncate a supported 3-letter code into an unrelated language', () => {
    // "swe" (Swedish) must never resolve as "sw" (Swahili). No Swahili flag
    // exists in the map, but the invariant is enforced regardless.
    expect(getFlag('swe')).not.toBe(GLOBE);
    expect(getFlag('swe')).toBe(FLAG_SWEDEN);
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

  it('resolves an ISO 639-2/639-3 code to its romanized name', () => {
    // slice(0, 2) turned "swe" into "sw" (absent from LANGUAGE_NAMES) and
    // returned the raw "SWE"; normalization resolves it to Swedish.
    expect(getLanguageName('swe')).toBe('Svenska');
    expect(getLanguageName('spa')).toBe('Espanol');
  });

  it('keeps the original code (uppercased) when it cannot be normalized', () => {
    expect(getLanguageName('fil')).toBe('FIL');
  });
});

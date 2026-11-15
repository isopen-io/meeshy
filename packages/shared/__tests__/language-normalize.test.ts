/**
 * Tests for normalizeLanguageCode helper.
 *
 * Source de vérité TS pour le miroir cross-platform :
 * - Swift SDK  : MeeshyUser.normalizeLanguageCode (packages/MeeshySDK)
 * - Swift app  : ConversationLanguagePreferences.normalize (apps/ios)
 */
import { describe, it, expect } from 'vitest';
import { normalizeLanguageCode, normalizeLanguageForDedup, isSameLanguage, makeLanguageFilter } from '../utils/language-normalize';

describe('normalizeLanguageCode', () => {
  it('returns ISO 639-1 for plain code', () => {
    expect(normalizeLanguageCode('fr')).toBe('fr');
  });

  it('strips region tag (dash separator)', () => {
    expect(normalizeLanguageCode('fr-FR')).toBe('fr');
    expect(normalizeLanguageCode('en-US')).toBe('en');
  });

  it('strips region and script tags', () => {
    expect(normalizeLanguageCode('zh-Hant-HK')).toBe('zh');
  });

  it('handles underscore separators (iOS Locale.current.identifier)', () => {
    expect(normalizeLanguageCode('fr_FR')).toBe('fr');
  });

  it('lowercases the language code', () => {
    expect(normalizeLanguageCode('FR-FR')).toBe('fr');
    expect(normalizeLanguageCode('EN')).toBe('en');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeLanguageCode('  fr-FR  ')).toBe('fr');
  });

  it('returns undefined for empty input', () => {
    expect(normalizeLanguageCode('')).toBeUndefined();
    expect(normalizeLanguageCode('   ')).toBeUndefined();
  });

  it('returns undefined for nullish input', () => {
    expect(normalizeLanguageCode(undefined)).toBeUndefined();
    expect(normalizeLanguageCode(null)).toBeUndefined();
  });

  it('returns undefined for non-string input', () => {
    expect(normalizeLanguageCode(42 as unknown as string)).toBeUndefined();
    expect(normalizeLanguageCode({} as unknown as string)).toBeUndefined();
  });

  it('returns undefined for malformed input', () => {
    expect(normalizeLanguageCode('@@@')).toBeUndefined();
    expect(normalizeLanguageCode('1-1')).toBeUndefined();
    expect(normalizeLanguageCode('123')).toBeUndefined();
  });

  it('returns undefined for 1-char codes (ISO 639-1 requires 2 letters)', () => {
    expect(normalizeLanguageCode('a')).toBeUndefined();
    expect(normalizeLanguageCode('z')).toBeUndefined();
  });

  it('reduces ISO 639-3 to its supported 2-letter equivalent when unambiguous', () => {
    // "eng"/"fra" have no Meeshy entry but map to a supported 639-1 code,
    // and the translator pipeline maps 2-letter codes ("en" → "eng_Latn").
    expect(normalizeLanguageCode('eng')).toBe('en');
    expect(normalizeLanguageCode('fra')).toBe('fr');
  });

  it('reduces via the explicit ISO 639-2/3 map, never by blind truncation', () => {
    // 'spa' (Spanish) reduces to the SUPPORTED 'es' — NOT rejected, and NOT
    // truncated to 'sp'. The explicit map knows the real 639-1 target.
    expect(normalizeLanguageCode('spa')).toBe('es');
    // 639-2/B (bibliographic) variants that differ from /T also reduce.
    expect(normalizeLanguageCode('deu')).toBe('de');
    expect(normalizeLanguageCode('ger')).toBe('de');
    expect(normalizeLanguageCode('zho')).toBe('zh');
    expect(normalizeLanguageCode('chi')).toBe('zh');
  });

  it('reduces a 3-letter code whose 2-letter prefix collides with a DIFFERENT supported language', () => {
    // 'swe' (Swedish) MUST map to 'sv' — blind truncation gave 'sw' (Swahili),
    // a completely unrelated supported language. This was the collision bug.
    expect(normalizeLanguageCode('swe')).toBe('sv');
    // The Swahili 639-3 code still maps to its own 'sw'.
    expect(normalizeLanguageCode('swa')).toBe('sw');
  });

  it('rejects Filipino (`fil`/`tgl`) rather than mapping it to Finnish', () => {
    // Apple/CLDR report Filipino as `fil` (Locale.current = "fil_PH"). Blind
    // truncation mapped it to 'fi' (Finnish) — silently serving a Filipino user
    // Finnish translations, violating the Prisme Linguistique. Filipino has no
    // supported Meeshy entry, so the correct answer is `undefined`.
    expect(normalizeLanguageCode('fil')).toBeUndefined();
    expect(normalizeLanguageCode('fil-PH')).toBeUndefined();
    expect(normalizeLanguageCode('tgl')).toBeUndefined();
  });

  it('preserves supported ISO 639-3 codes verbatim (never truncates)', () => {
    // Cameroonian languages have no ISO 639-1 code and are stored/keyed by their
    // 3-letter code everywhere (translations, NLLB, MessageTranslation). Truncating
    // 'bas' → 'ba' would resolve to Bashkir and break the Prisme Linguistique.
    expect(normalizeLanguageCode('bas')).toBe('bas');
    expect(normalizeLanguageCode('ewo')).toBe('ewo');
    expect(normalizeLanguageCode('dua')).toBe('dua');
    expect(normalizeLanguageCode('nnh')).toBe('nnh');
    expect(normalizeLanguageCode('ksf')).toBe('ksf');
  });

  it('strips region tag from a supported 3-letter code', () => {
    // iOS Locale.current for a Basaa device reports "bas_CM".
    expect(normalizeLanguageCode('bas-CM')).toBe('bas');
    expect(normalizeLanguageCode('BAS_CM')).toBe('bas');
  });

  it('rejects unknown ISO 639-3 codes absent from the reduction map', () => {
    // A 3-letter code with no explicit 639-1 target is refused rather than
    // corrupted by truncation (both when its prefix is supported and when not).
    expect(normalizeLanguageCode('xyz')).toBeUndefined();
    expect(normalizeLanguageCode('enx')).toBeUndefined();
  });

  it('rejects primary subtag containing digits or punctuation', () => {
    expect(normalizeLanguageCode('fr2')).toBeUndefined();
    expect(normalizeLanguageCode('fr!')).toBeUndefined();
  });

  it('reduces deprecated ISO 639-1 aliases to their canonical code', () => {
    // `iw`/`in`/`ji` are the DEPRECATED ISO 639-1 codes for Hebrew/Indonesian/
    // Yiddish. The JVM `java.util.Locale.getLanguage()` still normalizes
    // `he→iw`, `id→in`, `yi→ji` for backward compat, so an Android client (a
    // Meeshy mirror platform) reporting a Hebrew device locale emits `iw`.
    // Left verbatim, `iw` matches ZERO `MessageTranslation` rows (keyed `he`)
    // and the reader silently falls back to the untranslated original —
    // a direct Prisme Linguistique violation. Same collision class the 3-letter
    // reduction map already eliminates for `fil`/`swe`.
    expect(normalizeLanguageCode('iw')).toBe('he');
    expect(normalizeLanguageCode('in')).toBe('id');
  });

  it('strips region tag from a deprecated 639-1 alias before reducing', () => {
    // Android `iw_IL` / `in_ID` device locales.
    expect(normalizeLanguageCode('iw-IL')).toBe('he');
    expect(normalizeLanguageCode('IN_ID')).toBe('id');
  });

  it('rejects a deprecated alias whose canonical target is unsupported', () => {
    // `ji` → `yi` (Yiddish), but `yi` is not a supported Meeshy target. The
    // reduced code is re-validated against SUPPORTED_CODES exactly like the
    // 3-letter path, so it resolves to undefined rather than a verbatim `ji`
    // (or a `yi` that matches no translation) — the caller applies its fallback.
    expect(normalizeLanguageCode('ji')).toBeUndefined();
  });

  it('still returns an unknown non-deprecated 2-letter code verbatim', () => {
    // Only the three deprecated aliases are remapped; other unknown 2-letter
    // codes keep their historical verbatim behavior (caller applies fallback).
    expect(normalizeLanguageCode('zz')).toBe('zz');
  });
});

describe('normalizeLanguageForDedup', () => {
  it('collapses casing and region tags to one canonical dedup key', () => {
    // The whole point: 'en', 'EN' and 'en-US' must hash to the same Set entry.
    expect(normalizeLanguageForDedup('en')).toBe('en');
    expect(normalizeLanguageForDedup('EN')).toBe('en');
    expect(normalizeLanguageForDedup('en-US')).toBe('en');
    expect(normalizeLanguageForDedup('fr_FR')).toBe('fr');
    expect(normalizeLanguageForDedup('zh-Hant-HK')).toBe('zh');
  });

  it('keeps irreducible unknown codes lowercased instead of dropping them', () => {
    // normalizeLanguageCode returns undefined here; the dedup helper must NOT
    // lose the datum — it lowercases so a list/counter still reflects it.
    expect(normalizeLanguageForDedup('xyz')).toBe('xyz');
    expect(normalizeLanguageForDedup('QW')).toBe('qw');
  });

  it('strips region/script tags from irreducible unknown codes too', () => {
    // The dedup contract is region-blind for EVERY code, not only the ones
    // normalizeLanguageCode can reduce. An irreducible code carried a region
    // (`yue-HK` Cantonese, `xyz-AB`) must collapse onto its bare primary
    // subtag, otherwise `spokenLanguages` aggregation (anonymous.ts) and
    // preference dedup (conversation-helpers.ts) count `yue` and `yue-HK` as
    // two distinct languages — the exact leak the 'en'/'en-US' case forbids.
    expect(normalizeLanguageForDedup('xyz-AB')).toBe('xyz');
    expect(normalizeLanguageForDedup('xyz_CD')).toBe('xyz');
    expect(normalizeLanguageForDedup('yue-HK')).toBe('yue');
    expect(normalizeLanguageForDedup('YUE-Hant-HK')).toBe('yue');
  });

  it('never drops a datum when the primary subtag is empty or malformed', () => {
    // Guard the "never lose the datum" invariant against inputs whose primary
    // subtag is empty (`-US`) or purely non-alphabetic (`@@@`): stripping must
    // not collapse these to '' — the full lowercased string is preserved.
    expect(normalizeLanguageForDedup('-US')).toBe('-us');
    expect(normalizeLanguageForDedup('@@@')).toBe('@@@');
    expect(normalizeLanguageForDedup('')).toBe('');
  });
});

describe('isSameLanguage', () => {
  it('treats a region-tagged code as the same language as its bare form', () => {
    // The exact MessageActionsBar bug: reader rank-1 'en', message
    // originalLanguage 'en-US' (legacy region-tagged). A raw === says these
    // differ, so the flag toggle mislabels itself and bounces without effect.
    expect(isSameLanguage('en', 'en-US')).toBe(true);
    expect(isSameLanguage('en-US', 'en')).toBe(true);
    expect(isSameLanguage('fr', 'fr-FR')).toBe(true);
    expect(isSameLanguage('pt', 'pt-BR')).toBe(true);
  });

  it('is region- and script-blind', () => {
    expect(isSameLanguage('zh', 'zh-Hant-HK')).toBe(true);
    expect(isSameLanguage('fr_FR', 'fr-FR')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isSameLanguage('EN', 'en')).toBe(true);
    expect(isSameLanguage('FR-FR', 'fr')).toBe(true);
  });

  it('collapses deprecated ISO 639-1 aliases onto their canonical code', () => {
    // Android emits `iw` for Hebrew; it is the same language as `he`.
    expect(isSameLanguage('he', 'iw')).toBe(true);
    expect(isSameLanguage('id', 'in')).toBe(true);
  });

  it('collapses ISO 639-3 forms onto their reduced code', () => {
    expect(isSameLanguage('fr', 'fra')).toBe(true);
    expect(isSameLanguage('es', 'spa')).toBe(true);
  });

  it('distinguishes genuinely different languages', () => {
    expect(isSameLanguage('en', 'fr')).toBe(false);
    expect(isSameLanguage('en-US', 'fr-FR')).toBe(false);
    // Prefix collision must NOT read as equal (Swedish vs Swahili).
    expect(isSameLanguage('swe', 'swa')).toBe(false);
  });

  it('returns false when either code is empty or nullish', () => {
    expect(isSameLanguage(undefined, 'en')).toBe(false);
    expect(isSameLanguage('en', undefined)).toBe(false);
    expect(isSameLanguage('', 'en')).toBe(false);
    expect(isSameLanguage('en', '')).toBe(false);
    expect(isSameLanguage(null, null)).toBe(false);
  });

  it('matches a code against itself', () => {
    expect(isSameLanguage('fr', 'fr')).toBe(true);
  });
});

describe('makeLanguageFilter', () => {
  it('returns null when the requested list is absent or empty (serve every language)', () => {
    expect(makeLanguageFilter(undefined)).toBeNull();
    expect(makeLanguageFilter(null)).toBeNull();
    expect(makeLanguageFilter([])).toBeNull();
    expect(makeLanguageFilter([''])).toBeNull();
  });

  it('matches a stored region-tagged key against a canonical request (untreated half of #5108)', () => {
    const match = makeLanguageFilter(['pt'])!;
    expect(match('pt-BR')).toBe(true);
    expect(match('pt_BR')).toBe(true);
    expect(match('pt')).toBe(true);
    expect(match('es')).toBe(false);
  });

  it('matches a canonical stored key against a region-tagged request (both sides canonicalized)', () => {
    const match = makeLanguageFilter(['pt-BR', 'zh-Hant-HK'])!;
    expect(match('pt')).toBe(true);
    expect(match('zh')).toBe(true);
    expect(match('en')).toBe(false);
  });

  it('matches case-insensitively and across legacy aliases', () => {
    const heMatch = makeLanguageFilter(['he'])!;
    expect(heMatch('iw')).toBe(true);
    expect(makeLanguageFilter(['EN'])!('en-US')).toBe(true);
  });

  it('matches an ISO 639-3 code against its 639-1 canonical form', () => {
    expect(makeLanguageFilter(['es'])!('spa')).toBe(true);
    expect(makeLanguageFilter(['fra'])!('fr')).toBe(true);
  });

  it('returns false for an empty candidate code', () => {
    expect(makeLanguageFilter(['en'])!('')).toBe(false);
  });
});

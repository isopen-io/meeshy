/**
 * Tests for Language Utilities
 */
import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_LANGUAGES,
  getLanguageInfo,
  getLanguageName,
  getLanguageFlag,
  getLanguageColor,
  getLanguageTranslateText,
  isSupportedLanguage,
  getSupportedLanguageCodes,
  filterSupportedLanguages,
  getLanguagesWithTTS,
  getLanguagesWithSTT,
  getLanguagesWithVoiceCloning,
  getLanguagesWithTranslation,
  getLanguagesByRegion,
  getAfricanLanguages,
  getMMSTTSLanguages,
  getLanguageStats,
  MAX_MESSAGE_LENGTH,
  TOAST_SHORT_DURATION,
  TOAST_LONG_DURATION,
  TOAST_ERROR_DURATION,
  TYPING_CANCELATION_DELAY,
} from '../utils/languages';

describe('SUPPORTED_LANGUAGES', () => {
  it('should have at least 30 languages', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(30);
  });

  it('should include common languages', () => {
    const codes = SUPPORTED_LANGUAGES.map(l => l.code);
    expect(codes).toContain('en');
    expect(codes).toContain('fr');
    expect(codes).toContain('de');
    expect(codes).toContain('es');
    expect(codes).toContain('zh');
  });

  it('should have required properties for each language', () => {
    SUPPORTED_LANGUAGES.forEach(lang => {
      expect(lang.code).toBeDefined();
      expect(lang.name).toBeDefined();
      expect(lang.flag).toBeDefined();
    });
  });
});

describe('getLanguageInfo', () => {
  it('should return correct info for supported language', () => {
    const info = getLanguageInfo('fr');
    expect(info.code).toBe('fr');
    expect(info.name).toBe('French');
    expect(info.nativeName).toBe('Français');
    expect(info.flag).toBe('🇫🇷');
    expect(info.color).toBe('bg-blue-500');
  });

  it('should return French as default for undefined', () => {
    const info = getLanguageInfo(undefined);
    expect(info.code).toBe('fr');
    expect(info.name).toBe('French');
  });

  it('should return French as default for empty string', () => {
    const info = getLanguageInfo('');
    expect(info.code).toBe('fr');
  });

  it('should return French as default for "unknown"', () => {
    const info = getLanguageInfo('unknown');
    expect(info.code).toBe('fr');
  });

  it('should handle case insensitivity', () => {
    const info = getLanguageInfo('FR');
    expect(info.code).toBe('fr');
    expect(info.name).toBe('French');
  });

  it('should trim whitespace', () => {
    const info = getLanguageInfo('  en  ');
    expect(info.code).toBe('en');
    expect(info.name).toBe('English');
  });

  it('should return fallback for unsupported language', () => {
    const info = getLanguageInfo('xyz');
    expect(info.code).toBe('xyz');
    expect(info.name).toBe('XYZ');
    expect(info.flag).toBe('🌐');
    expect(info.color).toBe('bg-gray-500');
    expect(info.translateText).toBe('Translate this message to xyz');
  });
});

describe('getLanguageName', () => {
  it('should return language name for supported code', () => {
    expect(getLanguageName('en')).toBe('English');
    expect(getLanguageName('fr')).toBe('French');
    expect(getLanguageName('de')).toBe('German');
  });

  it('should return uppercase code for unsupported language', () => {
    expect(getLanguageName('xyz')).toBe('XYZ');
  });

  it('should return French for undefined', () => {
    expect(getLanguageName(undefined)).toBe('French');
  });
});

describe('getLanguageFlag', () => {
  it('should return flag emoji for supported code', () => {
    expect(getLanguageFlag('en')).toBe('🇬🇧');
    expect(getLanguageFlag('fr')).toBe('🇫🇷');
    expect(getLanguageFlag('de')).toBe('🇩🇪');
    expect(getLanguageFlag('es')).toBe('🇪🇸');
  });

  it('should return globe emoji for unsupported language', () => {
    expect(getLanguageFlag('xyz')).toBe('🌐');
  });

  it('should return French flag for undefined', () => {
    expect(getLanguageFlag(undefined)).toBe('🇫🇷');
  });
});

describe('getLanguageColor', () => {
  it('should return color class for supported code', () => {
    expect(getLanguageColor('fr')).toBe('bg-blue-500');
    expect(getLanguageColor('de')).toBe('bg-gray-800');
  });

  it('should return gray for unsupported language', () => {
    expect(getLanguageColor('xyz')).toBe('bg-gray-500');
  });

  it('should return French color for undefined', () => {
    expect(getLanguageColor(undefined)).toBe('bg-blue-500');
  });
});

describe('getLanguageTranslateText', () => {
  it('should return translate text for supported code', () => {
    expect(getLanguageTranslateText('fr')).toBe('Traduire ce message en français');
    expect(getLanguageTranslateText('en')).toBe('Translate this message to English');
  });

  it('should return generic text for unsupported language', () => {
    // Code uses lowercase for unsupported languages
    expect(getLanguageTranslateText('xyz')).toBe('Translate this message to xyz');
  });

  it('should return French text for undefined', () => {
    expect(getLanguageTranslateText(undefined)).toBe('Traduire ce message en français');
  });
});

describe('isSupportedLanguage', () => {
  it('should return true for supported languages', () => {
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('fr')).toBe(true);
    expect(isSupportedLanguage('zh')).toBe(true);
  });

  it('should return false for unsupported languages', () => {
    expect(isSupportedLanguage('xyz')).toBe(false);
    expect(isSupportedLanguage('abc')).toBe(false);
  });

  it('should return false for undefined/null', () => {
    expect(isSupportedLanguage(undefined)).toBe(false);
  });

  it('should handle case insensitivity', () => {
    expect(isSupportedLanguage('EN')).toBe(true);
    expect(isSupportedLanguage('Fr')).toBe(true);
  });

  it('should trim whitespace', () => {
    expect(isSupportedLanguage('  fr  ')).toBe(true);
  });
});

describe('getSupportedLanguageCodes', () => {
  it('should return array of language codes', () => {
    const codes = getSupportedLanguageCodes();
    expect(Array.isArray(codes)).toBe(true);
    expect(codes).toContain('en');
    expect(codes).toContain('fr');
    expect(codes.length).toBe(SUPPORTED_LANGUAGES.length);
  });
});

describe('filterSupportedLanguages', () => {
  it('should filter languages by predicate', () => {
    const europeanLanguages = filterSupportedLanguages(lang =>
      ['fr', 'de', 'es', 'it', 'nl'].includes(lang.code)
    );
    expect(europeanLanguages.length).toBe(5);
    expect(europeanLanguages.map(l => l.code)).toContain('fr');
    expect(europeanLanguages.map(l => l.code)).toContain('de');
  });

  it('should return empty array if no match', () => {
    const result = filterSupportedLanguages(() => false);
    expect(result).toEqual([]);
  });

  it('should return all languages if predicate always true', () => {
    const result = filterSupportedLanguages(() => true);
    expect(result.length).toBe(SUPPORTED_LANGUAGES.length);
  });
});

describe('Constants', () => {
  it('should have correct values', () => {
    expect(MAX_MESSAGE_LENGTH).toBe(2000);
    expect(TOAST_SHORT_DURATION).toBe(2000);
    expect(TOAST_LONG_DURATION).toBe(3000);
    expect(TOAST_ERROR_DURATION).toBe(5000);
    expect(TYPING_CANCELATION_DELAY).toBe(2000);
  });
});

describe('getLanguagesWithTTS', () => {
  it('returns only languages where supportsTTS is true', () => {
    const langs = getLanguagesWithTTS();
    expect(langs.every(l => l.supportsTTS === true)).toBe(true);
  });

  it('returns a subset of SUPPORTED_LANGUAGES', () => {
    const langs = getLanguagesWithTTS();
    expect(langs.length).toBeGreaterThan(0);
    expect(langs.length).toBeLessThanOrEqual(SUPPORTED_LANGUAGES.length);
  });
});

describe('getLanguagesWithSTT', () => {
  it('returns only languages where supportsSTT is true', () => {
    const langs = getLanguagesWithSTT();
    expect(langs.every(l => l.supportsSTT === true)).toBe(true);
  });

  it('returns a non-empty subset', () => {
    expect(getLanguagesWithSTT().length).toBeGreaterThan(0);
  });
});

describe('getLanguagesWithVoiceCloning', () => {
  it('returns only languages where supportsVoiceCloning is true', () => {
    const langs = getLanguagesWithVoiceCloning();
    expect(langs.every(l => l.supportsVoiceCloning === true)).toBe(true);
  });

  it('returns a subset of SUPPORTED_LANGUAGES', () => {
    expect(getLanguagesWithVoiceCloning().length).toBeLessThanOrEqual(SUPPORTED_LANGUAGES.length);
  });
});

describe('getLanguagesWithTranslation', () => {
  it('returns only languages where supportsTranslation is true', () => {
    const langs = getLanguagesWithTranslation();
    expect(langs.every(l => l.supportsTranslation === true)).toBe(true);
  });

  it('returns a non-empty subset', () => {
    expect(getLanguagesWithTranslation().length).toBeGreaterThan(0);
  });
});

describe('getLanguagesByRegion', () => {
  it('returns languages matching the region (case-insensitive)', () => {
    const european = getLanguagesByRegion('Europe');
    expect(european.length).toBeGreaterThan(0);
    expect(european.every(l => l.region.toLowerCase().includes('europe'))).toBe(true);
  });

  it('is case-insensitive for the query', () => {
    const upper = getLanguagesByRegion('EUROPE');
    const lower = getLanguagesByRegion('europe');
    expect(upper.length).toBe(lower.length);
  });

  it('returns empty array for a region that does not exist', () => {
    expect(getLanguagesByRegion('NonExistentRegion123')).toEqual([]);
  });
});

describe('getAfricanLanguages', () => {
  it('returns only languages whose region includes Africa', () => {
    const langs = getAfricanLanguages();
    expect(langs.every(l => l.region.includes('Africa'))).toBe(true);
  });

  it('returns a non-empty list', () => {
    expect(getAfricanLanguages().length).toBeGreaterThan(0);
  });

  it('matches getLanguagesByRegion("Africa")', () => {
    expect(getAfricanLanguages()).toEqual(getLanguagesByRegion('Africa'));
  });
});

describe('getMMSTTSLanguages', () => {
  it('returns only languages using the mms TTS engine', () => {
    const mmsLangs = getMMSTTSLanguages();
    expect(Array.isArray(mmsLangs)).toBe(true);
    expect(mmsLangs.every(l => l.ttsEngine === 'mms')).toBe(true);
  });

  it('returns a non-empty subset of SUPPORTED_LANGUAGES', () => {
    const mmsLangs = getMMSTTSLanguages();
    expect(mmsLangs.length).toBeGreaterThan(0);
    expect(mmsLangs.length).toBeLessThan(SUPPORTED_LANGUAGES.length);
  });

  it('returned languages are a subset of SUPPORTED_LANGUAGES', () => {
    const allCodes = new Set(SUPPORTED_LANGUAGES.map(l => l.code));
    for (const lang of getMMSTTSLanguages()) {
      expect(allCodes.has(lang.code)).toBe(true);
    }
  });
});

describe('getLanguageStats', () => {
  it('total matches SUPPORTED_LANGUAGES length', () => {
    const stats = getLanguageStats();
    expect(stats.total).toBe(SUPPORTED_LANGUAGES.length);
  });

  it('TTS engine subcounts sum to total', () => {
    const { byTTSEngine, total } = getLanguageStats();
    const sum = byTTSEngine.chatterbox + byTTSEngine.xtts + byTTSEngine.mms + byTTSEngine.none;
    expect(sum).toBe(total);
  });

  it('STT engine subcounts sum to total', () => {
    const { bySTTEngine, total } = getLanguageStats();
    const sum = bySTTEngine.whisper + bySTTEngine.mms_asr + bySTTEngine.none;
    expect(sum).toBe(total);
  });

  it('feature-flag counts are non-negative and bounded by total', () => {
    const stats = getLanguageStats();
    for (const key of ['withTTS', 'withSTT', 'withVoiceCloning', 'withTranslation'] as const) {
      expect(stats[key]).toBeGreaterThanOrEqual(0);
      expect(stats[key]).toBeLessThanOrEqual(stats.total);
    }
  });

  it('mms TTS subcount matches getMMSTTSLanguages length', () => {
    const stats = getLanguageStats();
    expect(stats.byTTSEngine.mms).toBe(getMMSTTSLanguages().length);
  });
});

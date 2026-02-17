/**
 * Tests for languages constants module
 * Tests re-exports from shared module and frontend-specific functions
 */

import {
  // Re-exported from shared
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
  // Frontend-specific
  MAX_MESSAGE_LENGTH_MODERATOR,
  getMaxMessageLength,
} from '../../../lib/constants/languages';

describe('Languages Constants Module', () => {
  describe('Re-exported Constants', () => {
    it('should export SUPPORTED_LANGUAGES array', () => {
      expect(SUPPORTED_LANGUAGES).toBeDefined();
      expect(Array.isArray(SUPPORTED_LANGUAGES)).toBe(true);
      expect(SUPPORTED_LANGUAGES.length).toBeGreaterThan(0);
    });

    it('should export MAX_MESSAGE_LENGTH', () => {
      expect(MAX_MESSAGE_LENGTH).toBe(2000);
    });

    it('should export toast duration constants', () => {
      expect(TOAST_SHORT_DURATION).toBe(2000);
      expect(TOAST_LONG_DURATION).toBe(3000);
      expect(TOAST_ERROR_DURATION).toBe(5000);
    });

    it('should export TYPING_CANCELATION_DELAY', () => {
      expect(TYPING_CANCELATION_DELAY).toBe(2000);
    });
  });

  describe('Frontend-specific Constants', () => {
    it('should export MAX_MESSAGE_LENGTH_MODERATOR', () => {
      expect(MAX_MESSAGE_LENGTH_MODERATOR).toBe(4000);
    });
  });

  describe('getLanguageInfo', () => {
    it('should return info for known language', () => {
      const info = getLanguageInfo('en');

      expect(info).toBeDefined();
      expect(info.code).toBe('en');
      expect(info.name).toBe('English');
      expect(info.flag).toBe('🇬🇧');
    });

    it('should return French as default for undefined', () => {
      const info = getLanguageInfo(undefined);

      expect(info.code).toBe('fr');
    });

    it('should return French as default for empty string', () => {
      const info = getLanguageInfo('');

      expect(info.code).toBe('fr');
    });

    it('should return French as default for "unknown"', () => {
      const info = getLanguageInfo('unknown');

      expect(info.code).toBe('fr');
    });

    it('should handle uppercase language codes', () => {
      const info = getLanguageInfo('EN');

      expect(info.code).toBe('en');
    });

    it('should return fallback for unsupported language', () => {
      const info = getLanguageInfo('xyz');

      expect(info.code).toBe('xyz');
      expect(info.name).toBe('XYZ');
      expect(info.flag).toBe('🌐');
      expect(info.supportsTTS).toBe(false);
    });
  });

  describe('getLanguageName', () => {
    it('should return language name', () => {
      expect(getLanguageName('fr')).toBe('French');
      expect(getLanguageName('es')).toBe('Spanish');
      expect(getLanguageName('de')).toBe('German');
    });

    it('should return uppercase code for unknown language', () => {
      expect(getLanguageName('xyz')).toBe('XYZ');
    });
  });

  describe('getLanguageFlag', () => {
    it('should return flag emoji', () => {
      expect(getLanguageFlag('fr')).toBe('🇫🇷');
      expect(getLanguageFlag('en')).toBe('🇬🇧');
      expect(getLanguageFlag('ja')).toBe('🇯🇵');
    });

    it('should return globe for unknown language', () => {
      expect(getLanguageFlag('xyz')).toBe('🌐');
    });
  });

  describe('getLanguageColor', () => {
    it('should return color class', () => {
      expect(getLanguageColor('fr')).toBe('bg-blue-500');
      expect(getLanguageColor('en')).toBe('bg-red-500');
    });

    it('should return gray for unknown language', () => {
      expect(getLanguageColor('xyz')).toBe('bg-gray-500');
    });
  });

  describe('getLanguageTranslateText', () => {
    it('should return translation prompt text', () => {
      const frText = getLanguageTranslateText('fr');
      expect(frText).toContain('français');
    });

    it('should return English text for unknown language', () => {
      const text = getLanguageTranslateText('xyz');
      expect(text).toContain('Translate');
      expect(text).toContain('xyz');
    });
  });

  describe('isSupportedLanguage', () => {
    it('should return true for supported language', () => {
      expect(isSupportedLanguage('en')).toBe(true);
      expect(isSupportedLanguage('fr')).toBe(true);
      expect(isSupportedLanguage('sw')).toBe(true); // Swahili
    });

    it('should return false for unsupported language', () => {
      expect(isSupportedLanguage('xyz')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isSupportedLanguage(undefined)).toBe(false);
    });

    it('should handle case insensitivity', () => {
      expect(isSupportedLanguage('EN')).toBe(true);
      expect(isSupportedLanguage('Fr')).toBe(true);
    });
  });

  describe('getSupportedLanguageCodes', () => {
    it('should return array of language codes', () => {
      const codes = getSupportedLanguageCodes();

      expect(Array.isArray(codes)).toBe(true);
      expect(codes).toContain('en');
      expect(codes).toContain('fr');
      expect(codes).toContain('es');
    });

    it('should have same length as SUPPORTED_LANGUAGES', () => {
      const codes = getSupportedLanguageCodes();
      expect(codes.length).toBe(SUPPORTED_LANGUAGES.length);
    });
  });

  describe('filterSupportedLanguages', () => {
    it('should filter languages based on predicate', () => {
      const europeanLanguages = filterSupportedLanguages(
        (lang) => lang.region === 'Europe'
      );

      expect(europeanLanguages.length).toBeGreaterThan(0);
      europeanLanguages.forEach((lang) => {
        expect(lang.region).toBe('Europe');
      });
    });

    it('should return empty array when no matches', () => {
      const result = filterSupportedLanguages(() => false);
      expect(result).toHaveLength(0);
    });
  });

  describe('getLanguagesWithTTS', () => {
    it('should return languages that support TTS', () => {
      const ttsLanguages = getLanguagesWithTTS();

      expect(ttsLanguages.length).toBeGreaterThan(0);
      ttsLanguages.forEach((lang) => {
        expect(lang.supportsTTS).toBe(true);
      });
    });

    it('should include major European languages', () => {
      const ttsLanguages = getLanguagesWithTTS();
      const codes = ttsLanguages.map((l) => l.code);

      expect(codes).toContain('en');
      expect(codes).toContain('fr');
      expect(codes).toContain('es');
    });
  });

  describe('getLanguagesWithSTT', () => {
    it('should return languages that support STT', () => {
      const sttLanguages = getLanguagesWithSTT();

      expect(sttLanguages.length).toBeGreaterThan(0);
      sttLanguages.forEach((lang) => {
        expect(lang.supportsSTT).toBe(true);
      });
    });
  });

  describe('getLanguagesWithVoiceCloning', () => {
    it('should return languages that support voice cloning', () => {
      const voiceCloningLanguages = getLanguagesWithVoiceCloning();

      expect(voiceCloningLanguages.length).toBeGreaterThan(0);
      voiceCloningLanguages.forEach((lang) => {
        expect(lang.supportsVoiceCloning).toBe(true);
      });
    });

    it('should only include Chatterbox/XTTS languages', () => {
      const voiceCloningLanguages = getLanguagesWithVoiceCloning();

      voiceCloningLanguages.forEach((lang) => {
        expect(['chatterbox', 'xtts']).toContain(lang.ttsEngine);
      });
    });
  });

  describe('getLanguagesWithTranslation', () => {
    it('should return languages that support translation', () => {
      const translationLanguages = getLanguagesWithTranslation();

      expect(translationLanguages.length).toBeGreaterThan(0);
      translationLanguages.forEach((lang) => {
        expect(lang.supportsTranslation).toBe(true);
      });
    });
  });

  describe('getLanguagesByRegion', () => {
    it('should return European languages', () => {
      const europeanLanguages = getLanguagesByRegion('Europe');

      expect(europeanLanguages.length).toBeGreaterThan(0);
      europeanLanguages.forEach((lang) => {
        expect(lang.region.toLowerCase()).toContain('europe');
      });
    });

    it('should return Asian languages', () => {
      const asianLanguages = getLanguagesByRegion('Asia');

      expect(asianLanguages.length).toBeGreaterThan(0);
      asianLanguages.forEach((lang) => {
        expect(lang.region.toLowerCase()).toContain('asia');
      });
    });

    it('should return African languages', () => {
      const africanLanguages = getLanguagesByRegion('Africa');

      expect(africanLanguages.length).toBeGreaterThan(0);
      africanLanguages.forEach((lang) => {
        expect(lang.region.toLowerCase()).toContain('africa');
      });
    });

    it('should handle case insensitivity', () => {
      const result1 = getLanguagesByRegion('europe');
      const result2 = getLanguagesByRegion('EUROPE');

      expect(result1.length).toBe(result2.length);
    });
  });

  describe('getAfricanLanguages', () => {
    it('should return African languages', () => {
      const africanLanguages = getAfricanLanguages();

      expect(africanLanguages.length).toBeGreaterThan(0);
      africanLanguages.forEach((lang) => {
        expect(lang.region).toContain('Africa');
      });
    });

    it('should include common African languages', () => {
      const africanLanguages = getAfricanLanguages();
      const codes = africanLanguages.map((l) => l.code);

      expect(codes).toContain('sw'); // Swahili
      expect(codes).toContain('am'); // Amharic
      expect(codes).toContain('yo'); // Yoruba
    });
  });

  describe('getMMSTTSLanguages', () => {
    it('should return languages using MMS TTS engine', () => {
      const mmsLanguages = getMMSTTSLanguages();

      expect(mmsLanguages.length).toBeGreaterThan(0);
      mmsLanguages.forEach((lang) => {
        expect(lang.ttsEngine).toBe('mms');
      });
    });
  });

  describe('getLanguageStats', () => {
    it('should return comprehensive statistics', () => {
      const stats = getLanguageStats();

      expect(stats.total).toBe(SUPPORTED_LANGUAGES.length);
      expect(stats.withTTS).toBeGreaterThan(0);
      expect(stats.withSTT).toBeGreaterThan(0);
      expect(stats.withVoiceCloning).toBeGreaterThan(0);
      expect(stats.withTranslation).toBeGreaterThan(0);
    });

    it('should have TTS engine breakdown', () => {
      const stats = getLanguageStats();

      expect(stats.byTTSEngine).toBeDefined();
      expect(stats.byTTSEngine.chatterbox).toBeGreaterThan(0);
      expect(stats.byTTSEngine.mms).toBeGreaterThan(0);
    });

    it('should have STT engine breakdown', () => {
      const stats = getLanguageStats();

      expect(stats.bySTTEngine).toBeDefined();
      expect(stats.bySTTEngine.whisper).toBeGreaterThan(0);
    });

    it('should have region breakdown', () => {
      const stats = getLanguageStats();

      expect(stats.byRegion).toBeDefined();
      expect(stats.byRegion.europe).toBeGreaterThan(0);
      expect(stats.byRegion.asia).toBeGreaterThan(0);
      expect(stats.byRegion.africa).toBeGreaterThan(0);
    });

    it('should have consistent totals', () => {
      const stats = getLanguageStats();

      // TTS engine counts should sum to total (including 'none')
      const ttsSum =
        stats.byTTSEngine.chatterbox +
        stats.byTTSEngine.xtts +
        stats.byTTSEngine.mms +
        stats.byTTSEngine.none;

      expect(ttsSum).toBe(stats.total);
    });
  });

  describe('getMaxMessageLength', () => {
    it('should return 4000 for all roles (unified limit)', () => {
      expect(getMaxMessageLength('USER')).toBe(4000);
      expect(getMaxMessageLength(undefined)).toBe(4000);
      expect(getMaxMessageLength('user')).toBe(4000);
      expect(getMaxMessageLength('UNKNOWN_ROLE')).toBe(4000);
      expect(getMaxMessageLength('MODERATOR')).toBe(4000);
      expect(getMaxMessageLength('MODO')).toBe(4000);
      expect(getMaxMessageLength('ADMIN')).toBe(4000);
    });

    it('should return 4000 for BIGBOSS role', () => {
      expect(getMaxMessageLength('BIGBOSS')).toBe(4000);
    });

    it('should return 4000 for AUDIT role', () => {
      expect(getMaxMessageLength('AUDIT')).toBe(4000);
    });

    it('should return 4000 for ANALYST role', () => {
      expect(getMaxMessageLength('ANALYST')).toBe(4000);
    });

    it('should handle case insensitivity', () => {
      expect(getMaxMessageLength('moderator')).toBe(4000);
      expect(getMaxMessageLength('admin')).toBe(4000);
      expect(getMaxMessageLength('Admin')).toBe(4000);
    });
  });

  describe('Language Structure', () => {
    it('should have required fields for each language', () => {
      SUPPORTED_LANGUAGES.forEach((lang) => {
        expect(lang.code).toBeDefined();
        expect(lang.name).toBeDefined();
        expect(lang.flag).toBeDefined();
        expect(typeof lang.supportsTTS).toBe('boolean');
        expect(typeof lang.supportsSTT).toBe('boolean');
        expect(typeof lang.supportsVoiceCloning).toBe('boolean');
        expect(typeof lang.supportsTranslation).toBe('boolean');
        expect(lang.ttsEngine).toBeDefined();
        expect(lang.sttEngine).toBeDefined();
        expect(lang.region).toBeDefined();
      });
    });

    it('should have valid TTS engine values', () => {
      const validEngines = ['chatterbox', 'xtts', 'mms', 'none'];

      SUPPORTED_LANGUAGES.forEach((lang) => {
        expect(validEngines).toContain(lang.ttsEngine);
      });
    });

    it('should have valid STT engine values', () => {
      const validEngines = ['whisper', 'mms_asr', 'none'];

      SUPPORTED_LANGUAGES.forEach((lang) => {
        expect(validEngines).toContain(lang.sttEngine);
      });
    });
  });
});

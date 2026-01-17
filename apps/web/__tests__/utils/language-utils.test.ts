/**
 * Tests for language-utils utility
 */

import {
  getLanguageDisplayName,
  getLanguageFlag,
  getLanguageInfo,
  isSupportedLanguage,
  getAllSupportedLanguages,
  searchLanguages,
} from '../../utils/language-utils';

describe('language-utils', () => {
  describe('getLanguageDisplayName', () => {
    it('should return French name for fr code', () => {
      expect(getLanguageDisplayName('fr')).toBe('Français');
    });

    it('should return English name for en code', () => {
      expect(getLanguageDisplayName('en')).toBe('English');
    });

    it('should return Spanish name for es code', () => {
      expect(getLanguageDisplayName('es')).toBe('Español');
    });

    it('should return German name for de code', () => {
      expect(getLanguageDisplayName('de')).toBe('Deutsch');
    });

    it('should return Chinese name for zh code', () => {
      expect(getLanguageDisplayName('zh')).toBe('中文');
    });

    it('should return Japanese name for ja code', () => {
      expect(getLanguageDisplayName('ja')).toBe('日本語');
    });

    it('should return Arabic name for ar code', () => {
      expect(getLanguageDisplayName('ar')).toBe('العربية');
    });

    it('should return Francais for null input', () => {
      expect(getLanguageDisplayName(null)).toBe('Français');
    });

    it('should return Francais for undefined input', () => {
      expect(getLanguageDisplayName(undefined)).toBe('Français');
    });

    it('should return uppercase code for unsupported language', () => {
      expect(getLanguageDisplayName('xyz')).toBe('XYZ');
    });
  });

  describe('getLanguageFlag', () => {
    it('should return French flag for fr code', () => {
      const flag = getLanguageFlag('fr');
      expect(flag).toBeDefined();
      expect(flag.length).toBeGreaterThan(0);
    });

    it('should return US flag for en code', () => {
      const flag = getLanguageFlag('en');
      expect(flag).toBeDefined();
      expect(flag.length).toBeGreaterThan(0);
    });

    it('should return Spanish flag for es code', () => {
      const flag = getLanguageFlag('es');
      expect(flag).toBeDefined();
    });

    it('should return Japanese flag for ja code', () => {
      const flag = getLanguageFlag('ja');
      expect(flag).toBeDefined();
    });

    it('should return French flag for null input', () => {
      const flag = getLanguageFlag(null);
      expect(flag).toBeDefined();
      // Default flag is French
      expect(flag).toBe(getLanguageFlag('fr'));
    });

    it('should return French flag for undefined input', () => {
      const flag = getLanguageFlag(undefined);
      expect(flag).toBeDefined();
      expect(flag).toBe(getLanguageFlag('fr'));
    });

    it('should return globe for unsupported language', () => {
      const flag = getLanguageFlag('xyz');
      expect(flag).toBeDefined();
      // Globe emoji for unsupported
      expect(flag.length).toBeGreaterThan(0);
    });
  });

  describe('getLanguageInfo', () => {
    it('should return complete info for fr code', () => {
      const info = getLanguageInfo('fr');
      expect(info.code).toBe('fr');
      expect(info.name).toBe('Français');
      expect(info.flag).toBeDefined();
    });

    it('should return complete info for en code', () => {
      const info = getLanguageInfo('en');
      expect(info.code).toBe('en');
      expect(info.name).toBe('English');
      expect(info.flag).toBeDefined();
    });

    it('should return fallback info for unsupported language', () => {
      const info = getLanguageInfo('xyz');
      expect(info.code).toBe('xyz');
      expect(info.name).toBe('XYZ');
      expect(info.flag).toBeDefined();
    });
  });

  describe('isSupportedLanguage', () => {
    it('should return true for fr', () => {
      expect(isSupportedLanguage('fr')).toBe(true);
    });

    it('should return true for en', () => {
      expect(isSupportedLanguage('en')).toBe(true);
    });

    it('should return true for es', () => {
      expect(isSupportedLanguage('es')).toBe(true);
    });

    it('should return true for de', () => {
      expect(isSupportedLanguage('de')).toBe(true);
    });

    it('should return true for zh', () => {
      expect(isSupportedLanguage('zh')).toBe(true);
    });

    it('should return true for ja', () => {
      expect(isSupportedLanguage('ja')).toBe(true);
    });

    it('should return true for ar', () => {
      expect(isSupportedLanguage('ar')).toBe(true);
    });

    it('should return false for unsupported language', () => {
      expect(isSupportedLanguage('xyz')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isSupportedLanguage('')).toBe(false);
    });
  });

  describe('getAllSupportedLanguages', () => {
    it('should return an array', () => {
      const languages = getAllSupportedLanguages();
      expect(Array.isArray(languages)).toBe(true);
    });

    it('should have at least common languages', () => {
      const languages = getAllSupportedLanguages();
      const codes = languages.map(l => l.code);

      expect(codes).toContain('fr');
      expect(codes).toContain('en');
      expect(codes).toContain('es');
      expect(codes).toContain('de');
    });

    it('should have valid info objects', () => {
      const languages = getAllSupportedLanguages();

      languages.forEach(lang => {
        expect(lang.code).toBeDefined();
        expect(lang.name).toBeDefined();
        expect(lang.flag).toBeDefined();
      });
    });

    it('should have more than 10 languages', () => {
      const languages = getAllSupportedLanguages();
      expect(languages.length).toBeGreaterThan(10);
    });
  });

  describe('searchLanguages', () => {
    it('should find French by code', () => {
      const results = searchLanguages('fr');
      expect(results.some(l => l.code === 'fr')).toBe(true);
    });

    it('should find French by name', () => {
      const results = searchLanguages('fran');
      expect(results.some(l => l.code === 'fr')).toBe(true);
    });

    it('should be case insensitive', () => {
      const results1 = searchLanguages('ENGLISH');
      const results2 = searchLanguages('english');

      expect(results1.length).toBe(results2.length);
    });

    it('should return empty array for no matches', () => {
      const results = searchLanguages('xyznonexistent');
      expect(results).toHaveLength(0);
    });

    it('should return multiple matches', () => {
      const results = searchLanguages('e'); // Many languages contain 'e'
      expect(results.length).toBeGreaterThan(1);
    });

    it('should match partial names', () => {
      const results = searchLanguages('port');
      expect(results.some(l => l.code === 'pt')).toBe(true);
    });

    it('should match partial codes', () => {
      const results = searchLanguages('es');
      expect(results.some(l => l.code === 'es')).toBe(true);
    });
  });
});

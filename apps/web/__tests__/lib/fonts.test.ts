/**
 * Tests for fonts module
 * Tests font configuration and utility functions
 */

import {
  availableFonts,
  defaultFont,
  getFontConfig,
  getFontInstance,
  getFontVariable,
  getFontClassName,
  getAllFontVariables,
  getRecommendedFonts,
  type FontFamily,
  type FontConfig,
} from '../../lib/fonts';

describe('Fonts Module', () => {
  describe('availableFonts constant', () => {
    it('should have at least 8 fonts', () => {
      expect(availableFonts.length).toBeGreaterThanOrEqual(8);
    });

    it('should have required properties for each font', () => {
      availableFonts.forEach((font) => {
        expect(font).toHaveProperty('id');
        expect(font).toHaveProperty('name');
        expect(font).toHaveProperty('description');
        expect(font).toHaveProperty('category');
        expect(font).toHaveProperty('variable');
        expect(font).toHaveProperty('cssClass');
        expect(font).toHaveProperty('recommended');
        expect(font).toHaveProperty('ageGroup');
        expect(font).toHaveProperty('accessibility');
      });
    });

    it('should contain Inter font', () => {
      const inter = availableFonts.find((f) => f.id === 'inter');
      expect(inter).toBeDefined();
      expect(inter?.name).toBe('Inter');
      expect(inter?.variable).toBe('--font-inter');
    });

    it('should contain Nunito font', () => {
      const nunito = availableFonts.find((f) => f.id === 'nunito');
      expect(nunito).toBeDefined();
      expect(nunito?.name).toBe('Nunito');
      expect(nunito?.recommended).toBe(true);
    });

    it('should contain Poppins font', () => {
      const poppins = availableFonts.find((f) => f.id === 'poppins');
      expect(poppins).toBeDefined();
      expect(poppins?.name).toBe('Poppins');
    });

    it('should contain Lexend font', () => {
      const lexend = availableFonts.find((f) => f.id === 'lexend');
      expect(lexend).toBeDefined();
      expect(lexend?.name).toBe('Lexend');
      expect(lexend?.category).toBe('educational');
    });

    it('should have valid category values', () => {
      const validCategories = ['modern', 'friendly', 'professional', 'educational', 'technical'];
      availableFonts.forEach((font) => {
        expect(validCategories).toContain(font.category);
      });
    });

    it('should have valid ageGroup values', () => {
      const validAgeGroups = ['kids', 'teens', 'adults', 'all'];
      availableFonts.forEach((font) => {
        expect(validAgeGroups).toContain(font.ageGroup);
      });
    });

    it('should have valid accessibility values', () => {
      const validAccessibility = ['high', 'medium', 'low'];
      availableFonts.forEach((font) => {
        expect(validAccessibility).toContain(font.accessibility);
      });
    });

    it('should have CSS class matching font id', () => {
      availableFonts.forEach((font) => {
        expect(font.cssClass).toBe(`font-${font.id}`);
      });
    });
  });

  describe('defaultFont', () => {
    it('should be defined', () => {
      expect(defaultFont).toBeDefined();
    });

    it('should have variable property', () => {
      expect(defaultFont).toHaveProperty('variable');
    });

    it('should be Nunito font', () => {
      expect(defaultFont.variable).toBe('--font-nunito');
    });
  });

  describe('getFontConfig', () => {
    it('should return config for valid font id', () => {
      const config = getFontConfig('inter');
      expect(config).toBeDefined();
      expect(config?.id).toBe('inter');
      expect(config?.name).toBe('Inter');
    });

    it('should return config for nunito', () => {
      const config = getFontConfig('nunito');
      expect(config).toBeDefined();
      expect(config?.id).toBe('nunito');
    });

    it('should return undefined for invalid font id', () => {
      const config = getFontConfig('invalid-font' as FontFamily);
      expect(config).toBeUndefined();
    });

    it('should return full FontConfig object', () => {
      const config = getFontConfig('poppins');
      expect(config).toMatchObject({
        id: 'poppins',
        name: 'Poppins',
        category: 'modern',
        recommended: true,
      });
    });
  });

  describe('getFontInstance', () => {
    it('should return font instance for valid font id', () => {
      const instance = getFontInstance('inter');
      expect(instance).toBeDefined();
      expect(instance).toHaveProperty('variable');
    });

    it('should return nunito as fallback for invalid id', () => {
      const instance = getFontInstance('invalid' as FontFamily);
      expect(instance).toBeDefined();
      expect(instance.variable).toBe('--font-nunito');
    });

    it('should return correct instance for each font', () => {
      const fontIds: FontFamily[] = [
        'inter',
        'nunito',
        'poppins',
        'open-sans',
        'lato',
        'comic-neue',
        'lexend',
        'roboto',
        'geist-sans',
        'geist-mono',
      ];

      fontIds.forEach((id) => {
        const instance = getFontInstance(id);
        expect(instance).toBeDefined();
        expect(instance).toHaveProperty('variable');
      });
    });
  });

  describe('getFontVariable', () => {
    it('should return variable for valid font id', () => {
      expect(getFontVariable('inter')).toBe('--font-inter');
    });

    it('should return nunito variable for undefined', () => {
      expect(getFontVariable()).toBe('--font-nunito');
    });

    it('should return nunito variable for undefined (explicit)', () => {
      expect(getFontVariable(undefined)).toBe('--font-nunito');
    });

    it('should return correct variables for all fonts', () => {
      expect(getFontVariable('poppins')).toBe('--font-poppins');
      expect(getFontVariable('lexend')).toBe('--font-lexend');
      expect(getFontVariable('roboto')).toBe('--font-roboto');
    });
  });

  describe('getFontClassName', () => {
    it('should return class name for valid font id', () => {
      expect(getFontClassName('inter')).toBe('font-inter');
    });

    it('should return nunito class for undefined', () => {
      expect(getFontClassName()).toBe('font-nunito');
    });

    it('should return correct class names for all fonts', () => {
      expect(getFontClassName('poppins')).toBe('font-poppins');
      expect(getFontClassName('lexend')).toBe('font-lexend');
      expect(getFontClassName('comic-neue')).toBe('font-comic-neue');
      expect(getFontClassName('open-sans')).toBe('font-open-sans');
    });
  });

  describe('getAllFontVariables', () => {
    it('should return string with all font variables', () => {
      const variables = getAllFontVariables();
      expect(typeof variables).toBe('string');
    });

    it('should contain all font variables', () => {
      const variables = getAllFontVariables();
      expect(variables).toContain('--font-inter');
      expect(variables).toContain('--font-nunito');
      expect(variables).toContain('--font-poppins');
      expect(variables).toContain('--font-lexend');
    });

    it('should have variables separated by spaces', () => {
      const variables = getAllFontVariables();
      expect(variables.split(' ').length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('getRecommendedFonts', () => {
    it('should return recommended fonts when no ageGroup specified', () => {
      const recommended = getRecommendedFonts();
      expect(recommended.length).toBeGreaterThan(0);
      recommended.forEach((font) => {
        expect(font.recommended).toBe(true);
      });
    });

    it('should filter by kids ageGroup', () => {
      const kidsfonts = getRecommendedFonts('kids');
      kidsfonts.forEach((font) => {
        expect(font.recommended).toBe(true);
        expect(['kids', 'all']).toContain(font.ageGroup);
      });
    });

    it('should filter by teens ageGroup', () => {
      const teensfonts = getRecommendedFonts('teens');
      teensfonts.forEach((font) => {
        expect(font.recommended).toBe(true);
        expect(['teens', 'all']).toContain(font.ageGroup);
      });
    });

    it('should filter by adults ageGroup', () => {
      const adultsfonts = getRecommendedFonts('adults');
      adultsfonts.forEach((font) => {
        expect(font.recommended).toBe(true);
        expect(['adults', 'all']).toContain(font.ageGroup);
      });
    });

    it('should filter by all ageGroup', () => {
      const allfonts = getRecommendedFonts('all');
      allfonts.forEach((font) => {
        expect(font.recommended).toBe(true);
        expect(font.ageGroup).toBe('all');
      });
    });

    it('should include Nunito for kids', () => {
      const kidsfonts = getRecommendedFonts('kids');
      const hasNunito = kidsfonts.some((f) => f.id === 'nunito');
      expect(hasNunito).toBe(true);
    });
  });

  describe('Font categories', () => {
    it('should have modern fonts', () => {
      const modernFonts = availableFonts.filter((f) => f.category === 'modern');
      expect(modernFonts.length).toBeGreaterThan(0);
    });

    it('should have friendly fonts', () => {
      const friendlyFonts = availableFonts.filter((f) => f.category === 'friendly');
      expect(friendlyFonts.length).toBeGreaterThan(0);
    });

    it('should have educational fonts', () => {
      const educationalFonts = availableFonts.filter((f) => f.category === 'educational');
      expect(educationalFonts.length).toBeGreaterThan(0);
    });
  });

  describe('Accessibility ratings', () => {
    it('should have high accessibility fonts', () => {
      const highAccessibility = availableFonts.filter((f) => f.accessibility === 'high');
      expect(highAccessibility.length).toBeGreaterThan(0);
    });

    it('should have Inter with high accessibility', () => {
      const inter = getFontConfig('inter');
      expect(inter?.accessibility).toBe('high');
    });

    it('should have Lexend with high accessibility', () => {
      const lexend = getFontConfig('lexend');
      expect(lexend?.accessibility).toBe('high');
    });
  });
});

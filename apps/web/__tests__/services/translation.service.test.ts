/**
 * Tests for TranslationService
 *
 * Tests translation operations, caching, auto-detection,
 * health check, and language support utilities
 */

import axios from 'axios';
import { translationService, translateText, isLanguageSupported, TranslationResult } from '@/services/translation.service';

// Mock axios
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('TranslationService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    translationService.clearCache();
  });

  describe('translateText', () => {
    const mockTranslationResponse = {
      data: {
        translated_text: 'Bonjour le monde',
        model: 'basic',
        confidence: 0.95,
      },
    };

    it('should translate text successfully', async () => {
      mockAxios.post.mockResolvedValueOnce(mockTranslationResponse);

      const result = await translationService.translateText({
        text: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/translate'),
        {
          text: 'Hello world',
          source_language: 'en',
          target_language: 'fr',
          model: 'basic',
        },
        expect.any(Object)
      );
      expect(result.translatedText).toBe('Bonjour le monde');
      expect(result.sourceLanguage).toBe('en');
      expect(result.targetLanguage).toBe('fr');
      expect(result.cached).toBe(false);
    });

    it('should use cache for repeated translations', async () => {
      mockAxios.post.mockResolvedValueOnce(mockTranslationResponse);

      // First call - should hit API
      const result1 = await translationService.translateText({
        text: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      });

      // Second call - should use cache
      const result2 = await translationService.translateText({
        text: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      });

      expect(mockAxios.post).toHaveBeenCalledTimes(1);
      expect(result1.cached).toBe(false);
      expect(result2.cached).toBe(true);
    });

    it('should return original text on error', async () => {
      mockAxios.post.mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await translationService.translateText({
        text: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      });

      expect(result.translatedText).toBe('Hello world');
      expect(result.confidence).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should use custom model when specified', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          translated_text: 'Bonjour le monde',
          model: 'advanced',
          confidence: 0.98,
        },
      });

      await translationService.translateText({
        text: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        model: 'advanced',
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model: 'advanced' }),
        expect.any(Object)
      );
    });

    it('should handle translatedText response format', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          translatedText: 'Bonjour le monde', // Alternative format
          confidence: 0.95,
        },
      });

      const result = await translationService.translateText({
        text: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      });

      expect(result.translatedText).toBe('Bonjour le monde');
    });

    it('should include processing time in result', async () => {
      mockAxios.post.mockResolvedValueOnce(mockTranslationResponse);

      const result = await translationService.translateText({
        text: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      });

      expect(result.processingTime).toBeDefined();
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should differentiate cache keys by model', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { translated_text: 'Basic translation', model: 'basic', confidence: 0.9 },
      });
      mockAxios.post.mockResolvedValueOnce({
        data: { translated_text: 'Advanced translation', model: 'advanced', confidence: 0.99 },
      });

      const result1 = await translationService.translateText({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        model: 'basic',
      });

      const result2 = await translationService.translateText({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        model: 'advanced',
      });

      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      expect(result1.translatedText).toBe('Basic translation');
      expect(result2.translatedText).toBe('Advanced translation');
    });
  });

  describe('translateWithAutoDetect', () => {
    it('should translate with auto language detection', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          translated_text: 'Bonjour le monde',
          detected_language: 'en',
          model: 'basic',
          confidence: 0.95,
          processing_time: 150,
        },
      });

      const result = await translationService.translateWithAutoDetect('Hello world', 'fr');

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/translate/auto'),
        expect.objectContaining({
          text: 'Hello world',
          target_language: 'fr',
        }),
        expect.any(Object)
      );
      expect(result.sourceLanguage).toBe('en');
    });

    it('should fallback to translateText on error', async () => {
      // First call (auto) fails
      mockAxios.post.mockRejectedValueOnce(new Error('Auto-detect unavailable'));
      // Fallback call succeeds
      mockAxios.post.mockResolvedValueOnce({
        data: {
          translated_text: 'Bonjour',
          model: 'basic',
          confidence: 0.9,
        },
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await translationService.translateWithAutoDetect('Hello', 'fr');

      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      expect(result.sourceLanguage).toBe('fr'); // Fallback default

      consoleSpy.mockRestore();
    });

    it('should use specified model', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          translated_text: 'Bonjour',
          detected_language: 'en',
          model: 'advanced',
        },
      });

      await translationService.translateWithAutoDetect('Hello', 'fr', 'advanced');

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model: 'advanced' }),
        expect.any(Object)
      );
    });

    it('should handle missing detected_language', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          translated_text: 'Bonjour',
          model: 'basic',
        },
      });

      const result = await translationService.translateWithAutoDetect('Hello', 'fr');

      expect(result.sourceLanguage).toBe('auto');
    });
  });

  describe('checkHealth', () => {
    it('should return true when service is healthy', async () => {
      mockAxios.get.mockResolvedValueOnce({ status: 200 });

      const isHealthy = await translationService.checkHealth();

      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/health'),
        expect.objectContaining({ timeout: 5000 })
      );
      expect(isHealthy).toBe(true);
    });

    it('should return false when service is unavailable', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Connection refused'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const isHealthy = await translationService.checkHealth();

      expect(isHealthy).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should return false on non-200 status', async () => {
      mockAxios.get.mockResolvedValueOnce({ status: 503 });

      const isHealthy = await translationService.checkHealth();

      expect(isHealthy).toBe(false);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should fetch supported languages', async () => {
      const mockLanguages = ['fr', 'en', 'es', 'de', 'pt', 'zh', 'ja', 'ar', 'it', 'ru'];

      mockAxios.get.mockResolvedValueOnce({
        data: { languages: mockLanguages },
      });

      const languages = await translationService.getSupportedLanguages();

      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/languages'),
        expect.objectContaining({ timeout: 10000 })
      );
      expect(languages).toEqual(mockLanguages);
    });

    it('should return default languages on error', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const languages = await translationService.getSupportedLanguages();

      expect(languages).toEqual(['fr', 'en', 'es', 'de', 'pt', 'zh', 'ja', 'ar']);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should return default languages when response has no languages', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: {},
      });

      const languages = await translationService.getSupportedLanguages();

      expect(languages).toEqual(['fr', 'en', 'es', 'de', 'pt', 'zh', 'ja', 'ar']);
    });
  });

  describe('Cache management', () => {
    it('should clear cache', async () => {
      mockAxios.post.mockResolvedValue({
        data: { translated_text: 'Test', model: 'basic', confidence: 0.9 },
      });

      // Populate cache
      await translationService.translateText({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      });

      expect(translationService.getCacheSize()).toBe(1);

      translationService.clearCache();

      expect(translationService.getCacheSize()).toBe(0);
    });

    it('should return correct cache size', async () => {
      mockAxios.post.mockResolvedValue({
        data: { translated_text: 'Test', model: 'basic', confidence: 0.9 },
      });

      expect(translationService.getCacheSize()).toBe(0);

      await translationService.translateText({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      });

      expect(translationService.getCacheSize()).toBe(1);

      await translationService.translateText({
        text: 'World',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      });

      expect(translationService.getCacheSize()).toBe(2);
    });
  });

  describe('translateText utility function', () => {
    it('should translate and return only the text', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          translated_text: 'Bonjour le monde',
          model: 'basic',
          confidence: 0.95,
        },
      });

      const text = await translateText('Hello world', 'en', 'fr');

      expect(text).toBe('Bonjour le monde');
    });

    it('should use specified model', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { translated_text: 'Advanced result', model: 'advanced' },
      });

      await translateText('Hello', 'en', 'fr', 'advanced');

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model: 'advanced' }),
        expect.any(Object)
      );
    });

    it('should use default model when not specified', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { translated_text: 'Result', model: 'basic' },
      });

      await translateText('Hello', 'en', 'fr');

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model: 'basic' }),
        expect.any(Object)
      );
    });
  });

  describe('isLanguageSupported utility function', () => {
    it('should return true for supported languages', () => {
      expect(isLanguageSupported('fr')).toBe(true);
      expect(isLanguageSupported('en')).toBe(true);
      expect(isLanguageSupported('es')).toBe(true);
      expect(isLanguageSupported('de')).toBe(true);
      expect(isLanguageSupported('pt')).toBe(true);
      expect(isLanguageSupported('zh')).toBe(true);
      expect(isLanguageSupported('ja')).toBe(true);
      expect(isLanguageSupported('ar')).toBe(true);
    });

    it('should return false for unsupported languages', () => {
      expect(isLanguageSupported('xyz')).toBe(false);
      expect(isLanguageSupported('unknown')).toBe(false);
      expect(isLanguageSupported('')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isLanguageSupported('FR')).toBe(true);
      expect(isLanguageSupported('En')).toBe(true);
      expect(isLanguageSupported('ES')).toBe(true);
    });
  });

  describe('Timeout handling', () => {
    it('should use correct timeout for translation', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { translated_text: 'Result', model: 'basic' },
      });

      await translationService.translateText({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ timeout: 30000 })
      );
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('timeout of 30000ms exceeded');
      (timeoutError as any).code = 'ECONNABORTED';
      mockAxios.post.mockRejectedValueOnce(timeoutError);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await translationService.translateText({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      });

      // Should fallback to original text
      expect(result.translatedText).toBe('Hello');
      expect(result.confidence).toBe(0);

      consoleSpy.mockRestore();
    });
  });

  describe('Request headers', () => {
    it('should send correct content-type header', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { translated_text: 'Result', model: 'basic' },
      });

      await translationService.translateText({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });
  });
});

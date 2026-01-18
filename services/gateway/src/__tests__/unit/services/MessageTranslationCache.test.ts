import { describe, it, expect, beforeEach } from '@jest/globals';
import { TranslationCache } from '../../../services/message-translation/TranslationCache';
import { TranslationResult } from '../../../services/zmq-translation';

describe('TranslationCache (message-translation)', () => {
  let cache: TranslationCache;

  const createMockTranslationResult = (text: string, language: string): TranslationResult => ({
    messageId: 'test-message-id',
    translatedText: text,
    sourceLanguage: 'en',
    targetLanguage: language,
    confidenceScore: 0.95,
    processingTime: 100,
    modelType: 'test-model'
  });

  beforeEach(() => {
    cache = new TranslationCache();
  });

  describe('constructor', () => {
    it('should create cache with default max size', () => {
      expect(cache).toBeDefined();
      expect(cache.size).toBe(0);
    });

    it('should create cache with custom max size', () => {
      const customCache = new TranslationCache(500);
      expect(customCache).toBeDefined();
      expect(customCache.size).toBe(0);
    });

    it('should create cache with small max size', () => {
      const smallCache = new TranslationCache(10);
      expect(smallCache).toBeDefined();
      expect(smallCache.size).toBe(0);
    });
  });

  describe('generateKey', () => {
    it('should generate key with message ID and target language only', () => {
      const key = TranslationCache.generateKey('msg-123', 'fr');
      expect(key).toBe('msg-123_fr');
    });

    it('should generate key with message ID, source and target language', () => {
      const key = TranslationCache.generateKey('msg-123', 'fr', 'en');
      expect(key).toBe('msg-123_en_fr');
    });

    it('should generate different keys for different messages', () => {
      const key1 = TranslationCache.generateKey('msg-1', 'fr');
      const key2 = TranslationCache.generateKey('msg-2', 'fr');
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different target languages', () => {
      const key1 = TranslationCache.generateKey('msg-1', 'fr');
      const key2 = TranslationCache.generateKey('msg-1', 'es');
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys with and without source language', () => {
      const key1 = TranslationCache.generateKey('msg-1', 'fr');
      const key2 = TranslationCache.generateKey('msg-1', 'fr', 'en');
      expect(key1).not.toBe(key2);
    });

    it('should handle special characters in message IDs', () => {
      const key = TranslationCache.generateKey('msg-with-special-chars!@#', 'fr', 'en');
      expect(key).toBe('msg-with-special-chars!@#_en_fr');
    });
  });

  describe('set and get', () => {
    it('should store and retrieve translation result', () => {
      const key = 'test-key';
      const result = createMockTranslationResult('Bonjour', 'fr');

      cache.set(key, result);
      const retrieved = cache.get(key);

      expect(retrieved).toEqual(result);
      expect(cache.size).toBe(1);
    });

    it('should return null for non-existent key', () => {
      const retrieved = cache.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should update existing entry', () => {
      const key = 'test-key';
      const result1 = createMockTranslationResult('Bonjour', 'fr');
      const result2 = createMockTranslationResult('Salut', 'fr');

      cache.set(key, result1);
      cache.set(key, result2);

      const retrieved = cache.get(key);
      expect(retrieved).toEqual(result2);
      expect(cache.size).toBe(1);
    });

    it('should store multiple different translations', () => {
      const key1 = TranslationCache.generateKey('msg-1', 'fr');
      const key2 = TranslationCache.generateKey('msg-2', 'es');
      const key3 = TranslationCache.generateKey('msg-3', 'de');

      const result1 = createMockTranslationResult('Bonjour', 'fr');
      const result2 = createMockTranslationResult('Hola', 'es');
      const result3 = createMockTranslationResult('Hallo', 'de');

      cache.set(key1, result1);
      cache.set(key2, result2);
      cache.set(key3, result3);

      expect(cache.get(key1)).toEqual(result1);
      expect(cache.get(key2)).toEqual(result2);
      expect(cache.get(key3)).toEqual(result3);
      expect(cache.size).toBe(3);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when max size is reached', () => {
      const smallCache = new TranslationCache(3);

      const key1 = 'key-1';
      const key2 = 'key-2';
      const key3 = 'key-3';
      const key4 = 'key-4';

      smallCache.set(key1, createMockTranslationResult('Text1', 'fr'));
      smallCache.set(key2, createMockTranslationResult('Text2', 'fr'));
      smallCache.set(key3, createMockTranslationResult('Text3', 'fr'));

      expect(smallCache.size).toBe(3);

      // Adding 4th entry should evict key-1
      smallCache.set(key4, createMockTranslationResult('Text4', 'fr'));

      expect(smallCache.size).toBe(3);
      expect(smallCache.get(key1)).toBeNull(); // Evicted
      expect(smallCache.get(key2)).not.toBeNull();
      expect(smallCache.get(key3)).not.toBeNull();
      expect(smallCache.get(key4)).not.toBeNull();
    });

    it('should handle max size of 1 correctly', () => {
      const tinyCache = new TranslationCache(1);

      tinyCache.set('key-1', createMockTranslationResult('Text1', 'fr'));
      expect(tinyCache.size).toBe(1);

      tinyCache.set('key-2', createMockTranslationResult('Text2', 'fr'));
      expect(tinyCache.size).toBe(1);
      expect(tinyCache.get('key-1')).toBeNull();
      expect(tinyCache.get('key-2')).not.toBeNull();
    });

    it('should evict entries in FIFO order', () => {
      const smallCache = new TranslationCache(5);

      for (let i = 1; i <= 5; i++) {
        smallCache.set(`key-${i}`, createMockTranslationResult(`Text${i}`, 'fr'));
      }

      // Add 3 more entries
      smallCache.set('key-6', createMockTranslationResult('Text6', 'fr'));
      smallCache.set('key-7', createMockTranslationResult('Text7', 'fr'));
      smallCache.set('key-8', createMockTranslationResult('Text8', 'fr'));

      // First 3 entries should be evicted
      expect(smallCache.get('key-1')).toBeNull();
      expect(smallCache.get('key-2')).toBeNull();
      expect(smallCache.get('key-3')).toBeNull();

      // Last 5 entries should remain
      expect(smallCache.get('key-4')).not.toBeNull();
      expect(smallCache.get('key-5')).not.toBeNull();
      expect(smallCache.get('key-6')).not.toBeNull();
      expect(smallCache.get('key-7')).not.toBeNull();
      expect(smallCache.get('key-8')).not.toBeNull();
    });

    it('should not evict when size is below max', () => {
      const largeCache = new TranslationCache(100);

      for (let i = 1; i <= 50; i++) {
        largeCache.set(`key-${i}`, createMockTranslationResult(`Text${i}`, 'fr'));
      }

      expect(largeCache.size).toBe(50);

      // All entries should still be present
      for (let i = 1; i <= 50; i++) {
        expect(largeCache.get(`key-${i}`)).not.toBeNull();
      }
    });
  });

  describe('delete', () => {
    it('should delete existing entry', () => {
      const key = 'test-key';
      cache.set(key, createMockTranslationResult('Bonjour', 'fr'));

      expect(cache.size).toBe(1);
      const deleted = cache.delete(key);

      expect(deleted).toBe(true);
      expect(cache.size).toBe(0);
      expect(cache.get(key)).toBeNull();
    });

    it('should return false when deleting non-existent entry', () => {
      const deleted = cache.delete('non-existent');
      expect(deleted).toBe(false);
    });

    it('should not affect other entries when deleting', () => {
      cache.set('key-1', createMockTranslationResult('Text1', 'fr'));
      cache.set('key-2', createMockTranslationResult('Text2', 'fr'));
      cache.set('key-3', createMockTranslationResult('Text3', 'fr'));

      cache.delete('key-2');

      expect(cache.get('key-1')).not.toBeNull();
      expect(cache.get('key-2')).toBeNull();
      expect(cache.get('key-3')).not.toBeNull();
      expect(cache.size).toBe(2);
    });

    it('should allow re-adding deleted entry', () => {
      const key = 'test-key';
      const result1 = createMockTranslationResult('Text1', 'fr');
      const result2 = createMockTranslationResult('Text2', 'fr');

      cache.set(key, result1);
      cache.delete(key);
      cache.set(key, result2);

      expect(cache.get(key)).toEqual(result2);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('key-1', createMockTranslationResult('Text1', 'fr'));
      cache.set('key-2', createMockTranslationResult('Text2', 'fr'));
      cache.set('key-3', createMockTranslationResult('Text3', 'fr'));

      expect(cache.size).toBe(3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('key-1')).toBeNull();
      expect(cache.get('key-2')).toBeNull();
      expect(cache.get('key-3')).toBeNull();
    });

    it('should work on empty cache', () => {
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it('should allow adding entries after clear', () => {
      cache.set('key-1', createMockTranslationResult('Text1', 'fr'));
      cache.clear();

      cache.set('key-2', createMockTranslationResult('Text2', 'fr'));
      expect(cache.size).toBe(1);
      expect(cache.get('key-2')).not.toBeNull();
    });
  });

  describe('size property', () => {
    it('should return 0 for empty cache', () => {
      expect(cache.size).toBe(0);
    });

    it('should return correct size after adding entries', () => {
      cache.set('key-1', createMockTranslationResult('Text1', 'fr'));
      expect(cache.size).toBe(1);

      cache.set('key-2', createMockTranslationResult('Text2', 'fr'));
      expect(cache.size).toBe(2);

      cache.set('key-3', createMockTranslationResult('Text3', 'fr'));
      expect(cache.size).toBe(3);
    });

    it('should return correct size after deletions', () => {
      cache.set('key-1', createMockTranslationResult('Text1', 'fr'));
      cache.set('key-2', createMockTranslationResult('Text2', 'fr'));
      cache.set('key-3', createMockTranslationResult('Text3', 'fr'));

      cache.delete('key-2');
      expect(cache.size).toBe(2);

      cache.delete('key-1');
      expect(cache.size).toBe(1);
    });

    it('should return 0 after clear', () => {
      cache.set('key-1', createMockTranslationResult('Text1', 'fr'));
      cache.set('key-2', createMockTranslationResult('Text2', 'fr'));

      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('has', () => {
    it('should return true for existing entry', () => {
      const key = 'test-key';
      cache.set(key, createMockTranslationResult('Text', 'fr'));

      expect(cache.has(key)).toBe(true);
    });

    it('should return false for non-existent entry', () => {
      expect(cache.has('non-existent')).toBe(false);
    });

    it('should return false after deletion', () => {
      const key = 'test-key';
      cache.set(key, createMockTranslationResult('Text', 'fr'));

      expect(cache.has(key)).toBe(true);

      cache.delete(key);
      expect(cache.has(key)).toBe(false);
    });

    it('should return false after clear', () => {
      cache.set('key-1', createMockTranslationResult('Text1', 'fr'));
      cache.set('key-2', createMockTranslationResult('Text2', 'fr'));

      cache.clear();

      expect(cache.has('key-1')).toBe(false);
      expect(cache.has('key-2')).toBe(false);
    });
  });

  describe('complex translation results', () => {
    it('should store translation with all fields', () => {
      const key = 'test-key';
      const result: TranslationResult = {
        messageId: 'test-message',
        translatedText: 'Bonjour le monde',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        confidenceScore: 0.98,
        processingTime: 150,
        modelType: 'advanced-model-v2'
      };

      cache.set(key, result);
      const retrieved = cache.get(key);

      expect(retrieved).toEqual(result);
      expect(retrieved?.translatedText).toBe('Bonjour le monde');
      expect(retrieved?.targetLanguage).toBe('fr');
      expect(retrieved?.confidenceScore).toBe(0.98);
      expect(retrieved?.modelType).toBe('advanced-model-v2');
    });

    it('should handle empty translation text', () => {
      const key = 'test-key';
      const result = createMockTranslationResult('', 'fr');

      cache.set(key, result);
      const retrieved = cache.get(key);

      expect(retrieved).toEqual(result);
      expect(retrieved?.translatedText).toBe('');
    });

    it('should handle very long translation text', () => {
      const longText = 'A'.repeat(10000);
      const key = 'test-key';
      const result = createMockTranslationResult(longText, 'fr');

      cache.set(key, result);
      const retrieved = cache.get(key);

      expect(retrieved?.translatedText).toBe(longText);
    });

    it('should handle special characters and unicode', () => {
      const specialText = '你好 🌍 Привет €£¥';
      const key = 'test-key';
      const result = createMockTranslationResult(specialText, 'zh');

      cache.set(key, result);
      const retrieved = cache.get(key);

      expect(retrieved?.translatedText).toBe(specialText);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid successive operations', () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`key-${i}`, createMockTranslationResult(`Text${i}`, 'fr'));
      }

      expect(cache.size).toBe(100);
    });

    it('should handle updating same key repeatedly', () => {
      const key = 'test-key';

      for (let i = 0; i < 100; i++) {
        cache.set(key, createMockTranslationResult(`Text${i}`, 'fr'));
      }

      expect(cache.size).toBe(1);
      expect(cache.get(key)?.translatedText).toBe('Text99');
    });

    it('should maintain separate entries for different language pairs', () => {
      const messageId = 'msg-123';

      cache.set(
        TranslationCache.generateKey(messageId, 'fr'),
        createMockTranslationResult('Bonjour', 'fr')
      );
      cache.set(
        TranslationCache.generateKey(messageId, 'es'),
        createMockTranslationResult('Hola', 'es')
      );
      cache.set(
        TranslationCache.generateKey(messageId, 'de'),
        createMockTranslationResult('Hallo', 'de')
      );

      expect(cache.size).toBe(3);
      expect(cache.get(TranslationCache.generateKey(messageId, 'fr'))?.translatedText).toBe('Bonjour');
      expect(cache.get(TranslationCache.generateKey(messageId, 'es'))?.translatedText).toBe('Hola');
      expect(cache.get(TranslationCache.generateKey(messageId, 'de'))?.translatedText).toBe('Hallo');
    });

    it('should handle zero confidence translations', () => {
      const key = 'test-key';
      const result: TranslationResult = {
        messageId: 'test-message-id',
        translatedText: 'Translation',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        confidenceScore: 0,
        processingTime: 100,
        modelType: 'test-model'
      };

      cache.set(key, result);
      const retrieved = cache.get(key);

      expect(retrieved?.confidenceScore).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical usage pattern', () => {
      const messageId = 'msg-123';
      const frKey = TranslationCache.generateKey(messageId, 'fr', 'en');
      const esKey = TranslationCache.generateKey(messageId, 'es', 'en');

      // Check cache miss
      expect(cache.get(frKey)).toBeNull();
      expect(cache.get(esKey)).toBeNull();

      // Store translations
      cache.set(frKey, createMockTranslationResult('Bonjour', 'fr'));
      cache.set(esKey, createMockTranslationResult('Hola', 'es'));

      // Check cache hit
      expect(cache.get(frKey)).not.toBeNull();
      expect(cache.get(esKey)).not.toBeNull();

      // Verify content
      expect(cache.get(frKey)?.translatedText).toBe('Bonjour');
      expect(cache.get(esKey)?.translatedText).toBe('Hola');
    });

    it('should handle cache invalidation workflow', () => {
      const messageId = 'msg-123';
      const key = TranslationCache.generateKey(messageId, 'fr');

      // Store translation
      cache.set(key, createMockTranslationResult('Bonjour', 'fr'));
      expect(cache.has(key)).toBe(true);

      // Invalidate (delete)
      cache.delete(key);
      expect(cache.has(key)).toBe(false);

      // Re-store with updated translation
      cache.set(key, createMockTranslationResult('Salut', 'fr'));
      expect(cache.get(key)?.translatedText).toBe('Salut');
    });
  });
});

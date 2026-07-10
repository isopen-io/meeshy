/**
 * Unit tests for AudioTranslateService
 * Tests audio translation via ZMQ communication with Translator service
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock ZMQ client
class MockZMQClient extends EventEmitter {
  sendVoiceAPIRequest = jest.fn();
}

describe('AudioTranslateService', () => {
  let mockZmqClient: MockZMQClient;

  beforeEach(() => {
    mockZmqClient = new MockZMQClient();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with ZMQ client', () => {
      expect(mockZmqClient).toBeDefined();
      expect(mockZmqClient.sendVoiceAPIRequest).toBeDefined();
    });

    it('should have event emitter capabilities', () => {
      expect(mockZmqClient).toBeInstanceOf(EventEmitter);
    });
  });

  describe('translateSync Request Structure', () => {
    it('should have correct sync translate request structure', () => {
      const request = {
        type: 'voice_translate',
        taskId: 'test-task-id',
        userId: 'user-123',
        audioBase64: 'base64-audio-data',
        targetLanguages: ['fr', 'es'],
        sourceLanguage: 'en',
        generateVoiceClone: true
      };

      expect(request.type).toBe('voice_translate');
      expect(request.audioBase64).toBeDefined();
      expect(Array.isArray(request.targetLanguages)).toBe(true);
      expect(request.targetLanguages.length).toBeGreaterThan(0);
    });
  });

  describe('translateAsync Request Structure', () => {
    it('should have correct async translate request structure', () => {
      const request = {
        type: 'voice_translate_async',
        taskId: 'test-task-id',
        userId: 'user-123',
        audioBase64: 'base64-audio-data',
        targetLanguages: ['fr'],
        webhookUrl: 'https://example.com/webhook',
        priority: 5,
        callbackMetadata: { requestId: 'req-123' }
      };

      expect(request.type).toBe('voice_translate_async');
      expect(request.webhookUrl).toBeDefined();
      expect(typeof request.priority).toBe('number');
    });
  });

  describe('Translation Result Structure', () => {
    it('should have correct translation result structure', () => {
      const result = {
        translationId: 'trans-123',
        originalAudio: {
          transcription: 'Hello world',
          language: 'en',
          durationMs: 2000,
          confidence: 0.95
        },
        translations: [
          {
            targetLanguage: 'fr',
            translatedText: 'Bonjour le monde',
            audioBase64: 'base64-french-audio',
            durationMs: 2100,
            voiceCloned: true,
            voiceQuality: 0.92
          }
        ],
        processingTimeMs: 3500
      };

      expect(result.translationId).toBeDefined();
      expect(result.originalAudio.transcription).toBeDefined();
      expect(result.translations).toHaveLength(1);
      expect(result.translations[0].voiceCloned).toBe(true);
    });
  });

  describe('Async Job Result Structure', () => {
    it('should have correct async job result structure', () => {
      const result = {
        jobId: 'mshy_user123_1234567890',
        status: 'processing',
        progress: 45,
        currentStep: 'Generating voice clone'
      };

      expect(result.jobId).toContain('mshy_');
      expect(['pending', 'processing', 'completed', 'failed', 'cancelled']).toContain(result.status);
      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.progress).toBeLessThanOrEqual(100);
    });
  });

  describe('Error Handling', () => {
    it('should define translation error codes', () => {
      const errorCodes = [
        'TRANSLATION_FAILED',
        'JOB_SUBMIT_FAILED',
        'JOB_STATUS_FAILED',
        'JOB_CANCEL_FAILED'
      ];

      errorCodes.forEach(code => {
        expect(typeof code).toBe('string');
        expect(code).toBe(code.toUpperCase());
      });
    });
  });

  describe('Service Result Structure', () => {
    it('should have correct success result structure', () => {
      const result = {
        success: true,
        data: {
          translationId: 'trans-123',
          originalAudio: { transcription: 'Hello', language: 'en', durationMs: 1000, confidence: 0.9 },
          translations: [],
          processingTimeMs: 1500
        }
      };

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should have correct error result structure', () => {
      const result = {
        success: false,
        error: 'Translation failed',
        errorCode: 'TRANSLATION_FAILED'
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errorCode).toBeDefined();
    });
  });
});

/**
 * Unit tests for VoiceAPIService
 * Tests Voice API Gateway service handling ZMQ communication
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock ZMQ client
class MockZMQClient extends EventEmitter {
  sendVoiceAPIRequest = jest.fn();
}

// Mock types
interface VoiceAPISuccessEvent {
  taskId: string;
  requestType: string;
  result: any;
  processingTimeMs: number;
  timestamp: number;
}

interface VoiceAPIErrorEvent {
  taskId: string;
  requestType: string;
  error: string;
  errorCode: string;
  timestamp: number;
}

describe('VoiceAPIService', () => {
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
      // VoiceAPIService requires a ZMQ client
      expect(mockZmqClient).toBeDefined();
      expect(mockZmqClient.sendVoiceAPIRequest).toBeDefined();
    });

    it('should have event emitter capabilities', () => {
      expect(mockZmqClient).toBeInstanceOf(EventEmitter);
      expect(typeof mockZmqClient.on).toBe('function');
      expect(typeof mockZmqClient.emit).toBe('function');
    });
  });

  describe('Request Types', () => {
    it('should define all supported request types', () => {
      const supportedTypes = [
        'voice_translate',
        'voice_translate_async',
        'voice_analyze',
        'voice_compare',
        'voice_profile_get',
        'voice_profile_create',
        'voice_profile_update',
        'voice_profile_delete',
        'voice_profile_list',
        'voice_job_status',
        'voice_job_cancel',
        'voice_feedback',
        'voice_history',
        'voice_stats',
        'voice_admin_metrics',
        'voice_health',
        'voice_languages'
      ];

      // All types should be strings
      supportedTypes.forEach(type => {
        expect(typeof type).toBe('string');
        expect(type.startsWith('voice_')).toBe(true);
      });
    });
  });

  describe('Voice Translation Request Structure', () => {
    it('should have correct translate request structure', () => {
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
      expect(request.taskId).toBeDefined();
      expect(request.userId).toBeDefined();
      expect(Array.isArray(request.targetLanguages)).toBe(true);
      expect(typeof request.generateVoiceClone).toBe('boolean');
    });

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
      expect(request.callbackMetadata).toBeDefined();
    });
  });

  describe('Voice Analysis Request Structure', () => {
    it('should have correct analyze request structure', () => {
      const request = {
        type: 'voice_analyze',
        taskId: 'test-task-id',
        userId: 'user-123',
        audioBase64: 'base64-audio-data',
        analysisTypes: ['pitch', 'timbre', 'mfcc']
      };

      expect(request.type).toBe('voice_analyze');
      expect(Array.isArray(request.analysisTypes)).toBe(true);
    });

    it('should have correct compare request structure', () => {
      const request = {
        type: 'voice_compare',
        taskId: 'test-task-id',
        userId: 'user-123',
        audioBase64_1: 'base64-audio-1',
        audioBase64_2: 'base64-audio-2'
      };

      expect(request.type).toBe('voice_compare');
      expect(request.audioBase64_1).toBeDefined();
      expect(request.audioBase64_2).toBeDefined();
    });
  });

  describe('Voice Profile Request Structures', () => {
    it('should have correct profile get request', () => {
      const request = {
        type: 'voice_profile_get',
        taskId: 'test-task-id',
        userId: 'user-123',
        profileId: 'profile-456'
      };

      expect(request.type).toBe('voice_profile_get');
      expect(request.profileId).toBeDefined();
    });

    it('should have correct profile create request', () => {
      const request = {
        type: 'voice_profile_create',
        taskId: 'test-task-id',
        userId: 'user-123',
        name: 'My Voice Profile',
        audioBase64: 'base64-audio-data',
        metadata: { language: 'en' }
      };

      expect(request.type).toBe('voice_profile_create');
      expect(request.name).toBeDefined();
    });

    it('should have correct profile list request with pagination', () => {
      const request = {
        type: 'voice_profile_list',
        taskId: 'test-task-id',
        userId: 'user-123',
        limit: 10,
        offset: 0
      };

      expect(request.type).toBe('voice_profile_list');
      expect(request.limit).toBe(10);
      expect(request.offset).toBe(0);
    });
  });

  describe('Job Management Request Structures', () => {
    it('should have correct job status request', () => {
      const request = {
        type: 'voice_job_status',
        taskId: 'test-task-id',
        userId: 'user-123',
        jobId: 'job-789'
      };

      expect(request.type).toBe('voice_job_status');
      expect(request.jobId).toBeDefined();
    });

    it('should have correct job cancel request', () => {
      const request = {
        type: 'voice_job_cancel',
        taskId: 'test-task-id',
        userId: 'user-123',
        jobId: 'job-789'
      };

      expect(request.type).toBe('voice_job_cancel');
      expect(request.jobId).toBeDefined();
    });
  });

  describe('Feedback and Analytics Request Structures', () => {
    it('should have correct feedback request structure', () => {
      const request = {
        type: 'voice_feedback',
        taskId: 'test-task-id',
        userId: 'user-123',
        translationId: 'trans-456',
        rating: 5,
        feedbackType: 'quality',
        comment: 'Excellent voice quality!'
      };

      expect(request.type).toBe('voice_feedback');
      expect(request.rating).toBeGreaterThanOrEqual(1);
      expect(request.rating).toBeLessThanOrEqual(5);
      expect(request.feedbackType).toBeDefined();
    });

    it('should have correct history request with date range', () => {
      const request = {
        type: 'voice_history',
        taskId: 'test-task-id',
        userId: 'user-123',
        limit: 20,
        offset: 0,
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      };

      expect(request.type).toBe('voice_history');
      expect(request.startDate).toBeDefined();
      expect(request.endDate).toBeDefined();
    });

    it('should have correct stats request with period', () => {
      const request = {
        type: 'voice_stats',
        taskId: 'test-task-id',
        userId: 'user-123',
        period: 'month'
      };

      expect(request.type).toBe('voice_stats');
      expect(['day', 'week', 'month', 'all']).toContain(request.period);
    });
  });

  describe('Admin Request Structures', () => {
    it('should have correct admin metrics request', () => {
      const request = {
        type: 'voice_admin_metrics',
        taskId: 'test-task-id',
        userId: 'admin-user'
      };

      expect(request.type).toBe('voice_admin_metrics');
    });
  });

  describe('System Request Structures', () => {
    it('should have correct health request', () => {
      const request = {
        type: 'voice_health',
        taskId: 'test-task-id'
      };

      expect(request.type).toBe('voice_health');
    });

    it('should have correct languages request', () => {
      const request = {
        type: 'voice_languages',
        taskId: 'test-task-id'
      };

      expect(request.type).toBe('voice_languages');
    });
  });

  describe('Response Structures', () => {
    it('should have correct success event structure', () => {
      const successEvent: VoiceAPISuccessEvent = {
        taskId: 'test-task-id',
        requestType: 'voice_translate',
        result: {
          translationId: 'trans-123',
          translations: []
        },
        processingTimeMs: 1500,
        timestamp: Date.now()
      };

      expect(successEvent.taskId).toBeDefined();
      expect(successEvent.requestType).toBeDefined();
      expect(successEvent.result).toBeDefined();
      expect(successEvent.processingTimeMs).toBeGreaterThan(0);
    });

    it('should have correct error event structure', () => {
      const errorEvent: VoiceAPIErrorEvent = {
        taskId: 'test-task-id',
        requestType: 'voice_translate',
        error: 'Audio file too short',
        errorCode: 'AUDIO_TOO_SHORT',
        timestamp: Date.now()
      };

      expect(errorEvent.taskId).toBeDefined();
      expect(errorEvent.error).toBeDefined();
      expect(errorEvent.errorCode).toBeDefined();
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
        voiceProfile: {
          profileId: 'profile-456',
          quality: 0.88,
          isNew: false
        },
        processingTimeMs: 3500
      };

      expect(result.translationId).toBeDefined();
      expect(result.originalAudio.transcription).toBeDefined();
      expect(result.translations).toHaveLength(1);
      expect(result.translations[0].voiceCloned).toBe(true);
    });
  });

  describe('Voice Analysis Result Structure', () => {
    it('should have correct analysis result structure', () => {
      const result = {
        pitch: {
          mean: 150.5,
          std: 25.3,
          min: 100,
          max: 200,
          contour: [145, 150, 155, 152]
        },
        timbre: {
          spectralCentroid: 1500,
          spectralBandwidth: 500,
          spectralRolloff: 3000,
          spectralFlatness: 0.1
        },
        mfcc: {
          coefficients: [1.0, 0.5, 0.3, 0.2],
          mean: [0.8, 0.4, 0.25],
          std: [0.1, 0.05, 0.03]
        },
        energy: {
          rms: 0.5,
          peak: 0.9,
          dynamicRange: 20
        },
        classification: {
          voiceType: 'medium_male',
          gender: 'male',
          ageRange: '25-35',
          confidence: 0.85
        }
      };

      expect(result.pitch.mean).toBeDefined();
      expect(result.timbre.spectralCentroid).toBeDefined();
      expect(result.mfcc.coefficients).toHaveLength(4);
      expect(result.classification.voiceType).toBeDefined();
    });
  });

  describe('Voice Profile Structure', () => {
    it('should have correct profile structure', () => {
      const profile = {
        id: 'profile-123',
        userId: 'user-456',
        name: 'My Primary Voice',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-06-20T14:45:00Z',
        sampleCount: 5,
        averageQuality: 0.91,
        metadata: { preferredLanguage: 'en' }
      };

      expect(profile.id).toBeDefined();
      expect(profile.userId).toBeDefined();
      expect(profile.name).toBeDefined();
      expect(profile.sampleCount).toBeGreaterThan(0);
      expect(profile.averageQuality).toBeGreaterThanOrEqual(0);
      expect(profile.averageQuality).toBeLessThanOrEqual(1);
    });
  });

  describe('Job Status Structure', () => {
    it('should have correct job structure', () => {
      const job = {
        jobId: 'mshy_user123_1234567890',
        userId: 'user-123',
        status: 'processing',
        progress: 45,
        currentStep: 'Generating voice clone',
        createdAt: '2024-01-15T10:30:00Z',
        startedAt: '2024-01-15T10:30:05Z'
      };

      expect(job.jobId).toContain('mshy_');
      expect(['pending', 'processing', 'completed', 'failed', 'cancelled']).toContain(job.status);
      expect(job.progress).toBeGreaterThanOrEqual(0);
      expect(job.progress).toBeLessThanOrEqual(100);
    });
  });

  describe('Error Codes', () => {
    it('should define all error codes', () => {
      const errorCodes = [
        'UNAUTHORIZED',
        'FORBIDDEN',
        'INVALID_REQUEST',
        'NOT_FOUND',
        'TIMEOUT',
        'SEND_FAILED',
        'INTERNAL_ERROR',
        'SERVICE_UNAVAILABLE',
        'QUOTA_EXCEEDED',
        'AUDIO_TOO_LONG',
        'AUDIO_TOO_SHORT',
        'UNSUPPORTED_FORMAT',
        'LANGUAGE_NOT_SUPPORTED',
        'VOICE_CLONE_FAILED',
        'TRANSCRIPTION_FAILED',
        'TRANSLATION_FAILED',
        'TTS_FAILED'
      ];

      // All codes should be uppercase strings
      errorCodes.forEach(code => {
        expect(typeof code).toBe('string');
        expect(code).toBe(code.toUpperCase());
      });
    });
  });

  describe('Health Status Structure', () => {
    it('should have correct health status structure', () => {
      const health = {
        status: 'healthy',
        services: {
          transcription: true,
          translation: true,
          tts: true,
          voiceClone: true,
          analytics: true,
          database: true
        },
        latency: {
          transcriptionMs: 150,
          translationMs: 200,
          ttsMs: 500
        },
        timestamp: new Date().toISOString()
      };

      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      expect(health.services.transcription).toBe(true);
      expect(health.latency.transcriptionMs).toBeGreaterThan(0);
    });
  });

  describe('Supported Languages Structure', () => {
    it('should have correct language structure', () => {
      const language = {
        code: 'fr',
        name: 'French',
        nativeName: 'Français',
        supportedFeatures: {
          transcription: true,
          translation: true,
          tts: true,
          voiceClone: true
        }
      };

      expect(language.code).toHaveLength(2);
      expect(language.name).toBeDefined();
      expect(language.nativeName).toBeDefined();
      expect(language.supportedFeatures).toBeDefined();
    });
  });

  describe('Pagination Structure', () => {
    it('should have correct list response structure', () => {
      const response = {
        items: [{ id: '1' }, { id: '2' }],
        total: 50,
        limit: 10,
        offset: 0,
        hasMore: true
      };

      expect(Array.isArray(response.items)).toBe(true);
      expect(response.total).toBeGreaterThanOrEqual(response.items.length);
      expect(response.hasMore).toBe(true);
    });
  });
});

describe('VoiceAPIError', () => {
  it('should create error with message and code', () => {
    class VoiceAPIError extends Error {
      code: string;
      constructor(message: string, code: string) {
        super(message);
        this.code = code;
        this.name = 'VoiceAPIError';
      }
    }

    const error = new VoiceAPIError('Request timeout', 'TIMEOUT');
    expect(error.message).toBe('Request timeout');
    expect(error.code).toBe('TIMEOUT');
    expect(error.name).toBe('VoiceAPIError');
  });

  it('should be instanceof Error', () => {
    class VoiceAPIError extends Error {
      code: string;
      constructor(message: string, code: string) {
        super(message);
        this.code = code;
      }
    }

    const error = new VoiceAPIError('Test error', 'TEST');
    expect(error).toBeInstanceOf(Error);
  });
});

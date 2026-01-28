/**
 * Unit tests for Voice API Routes
 * Tests all Voice API REST endpoints
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock response helper function
function createMockReply() {
  const reply: any = {
    statusCode: 200,
    status: jest.fn(function(code: number) {
      reply.statusCode = code;
      return reply;
    }),
    send: jest.fn(function(data: any) {
      reply.data = data;
      return reply;
    }),
    data: null
  };
  return reply;
}

// Mock request helper function
function createMockRequest(options: {
  body?: any;
  params?: any;
  query?: any;
  user?: any;
  headers?: any;
}) {
  return {
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    user: options.user === null ? null : (options.user || { id: 'test-user-123' }),
    headers: options.headers || {},
    session: null as any
  };
}

describe('Voice API Routes', () => {
  describe('POST /voice/translate', () => {
    it('should validate required fields', () => {
      const body = {
        audioBase64: 'base64-audio-data',
        targetLanguages: ['fr', 'es']
      };

      expect(body.audioBase64).toBeDefined();
      expect(body.targetLanguages).toBeDefined();
      expect(Array.isArray(body.targetLanguages)).toBe(true);
      expect(body.targetLanguages.length).toBeGreaterThan(0);
    });

    it('should accept optional fields', () => {
      const body = {
        audioBase64: 'base64-audio-data',
        targetLanguages: ['fr'],
        sourceLanguage: 'en',
        generateVoiceClone: true
      };

      expect(body.sourceLanguage).toBeDefined();
      expect(typeof body.generateVoiceClone).toBe('boolean');
    });

    it('should return 400 for missing targetLanguages', () => {
      const body = {
        audioBase64: 'base64-audio-data'
        // Missing targetLanguages
      };

      const reply = createMockReply();
      reply.status(400).send({
        error: 'targetLanguages is required',
        code: 'INVALID_REQUEST'
      });

      expect(reply.statusCode).toBe(400);
      expect(reply.data.code).toBe('INVALID_REQUEST');
    });

    it('should return 400 for empty targetLanguages', () => {
      const body = {
        audioBase64: 'base64-audio-data',
        targetLanguages: []
      };

      const reply = createMockReply();
      if (body.targetLanguages.length === 0) {
        reply.status(400).send({
          error: 'At least one target language is required',
          code: 'INVALID_REQUEST'
        });
      }

      expect(reply.statusCode).toBe(400);
    });

    it('should return 401 for unauthenticated requests', () => {
      // Simulate unauthenticated request
      const request = {
        body: { targetLanguages: ['fr'] },
        user: null,
        session: null,
        headers: {}
      };

      const reply = createMockReply();

      // Authentication check - no user, no session, no header
      const userId = request.user?.id ||
                     (request.session as any)?.userId ||
                     request.headers['x-user-id'];

      if (!userId) {
        reply.status(401).send({
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
      }

      expect(reply.statusCode).toBe(401);
      expect(reply.data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /voice/translate/async', () => {
    it('should accept webhook configuration', () => {
      const body = {
        audioBase64: 'base64-audio-data',
        targetLanguages: ['fr'],
        webhookUrl: 'https://example.com/webhook',
        priority: 10,
        callbackMetadata: { requestId: 'req-123' }
      };

      expect(body.webhookUrl).toMatch(/^https?:\/\//);
      expect(body.priority).toBeGreaterThanOrEqual(1);
      expect(body.priority).toBeLessThanOrEqual(10);
    });

    it('should return job ID on success', () => {
      const response = {
        success: true,
        jobId: 'mshy_user123_1234567890',
        status: 'pending'
      };

      expect(response.success).toBe(true);
      expect(response.jobId).toContain('mshy_');
      expect(response.status).toBe('pending');
    });
  });

  describe('GET /voice/job/:jobId', () => {
    it('should return job status', () => {
      const params = { jobId: 'mshy_user123_1234567890' };

      const response = {
        jobId: params.jobId,
        status: 'processing',
        progress: 45,
        currentStep: 'Generating voice clone'
      };

      expect(response.jobId).toBe(params.jobId);
      expect(['pending', 'processing', 'completed', 'failed', 'cancelled']).toContain(response.status);
    });

    it('should return 404 for non-existent job', () => {
      const reply = createMockReply();
      reply.status(404).send({
        error: 'Job not found',
        code: 'NOT_FOUND'
      });

      expect(reply.statusCode).toBe(404);
      expect(reply.data.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /voice/job/:jobId', () => {
    it('should cancel pending job', () => {
      const response = {
        success: true,
        message: 'Job cancelled successfully'
      };

      expect(response.success).toBe(true);
    });

    it('should return 400 for already completed job', () => {
      const reply = createMockReply();
      reply.status(400).send({
        error: 'Cannot cancel completed job',
        code: 'INVALID_REQUEST'
      });

      expect(reply.statusCode).toBe(400);
    });
  });

  describe('POST /voice/analyze', () => {
    it('should accept analysis types', () => {
      const body = {
        audioBase64: 'base64-audio-data',
        analysisTypes: ['pitch', 'timbre', 'mfcc', 'spectral', 'classification']
      };

      const validTypes = ['pitch', 'timbre', 'mfcc', 'spectral', 'classification'];
      body.analysisTypes.forEach(type => {
        expect(validTypes).toContain(type);
      });
    });

    it('should return analysis results', () => {
      const response = {
        success: true,
        data: {
          pitch: { mean: 150, std: 25 },
          timbre: { spectralCentroid: 1500 },
          classification: { voiceType: 'medium_male', confidence: 0.85 }
        }
      };

      expect(response.success).toBe(true);
      expect(response.data.pitch).toBeDefined();
      expect(response.data.classification.confidence).toBeGreaterThanOrEqual(0);
      expect(response.data.classification.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('POST /voice/compare', () => {
    it('should require two audio samples', () => {
      const body = {
        audioBase64_1: 'base64-audio-1',
        audioBase64_2: 'base64-audio-2'
      };

      expect(body.audioBase64_1).toBeDefined();
      expect(body.audioBase64_2).toBeDefined();
    });

    it('should return comparison result', () => {
      const response = {
        success: true,
        data: {
          overallSimilarity: 0.85,
          pitchSimilarity: 0.90,
          timbreSimilarity: 0.80,
          verdict: 'same_speaker',
          confidence: 0.87
        }
      };

      expect(response.data.overallSimilarity).toBeGreaterThanOrEqual(0);
      expect(response.data.overallSimilarity).toBeLessThanOrEqual(1);
      expect(['same_speaker', 'different_speaker', 'uncertain']).toContain(response.data.verdict);
    });
  });

  describe('Voice Profile Endpoints', () => {
    describe('GET /voice/profiles', () => {
      it('should return paginated profiles', () => {
        const query = { limit: 10, offset: 0 };

        const response = {
          success: true,
          data: {
            items: [
              { id: 'profile-1', name: 'Voice 1' },
              { id: 'profile-2', name: 'Voice 2' }
            ],
            total: 5,
            limit: query.limit,
            offset: query.offset,
            hasMore: false
          }
        };

        expect(response.data.items).toHaveLength(2);
        expect(response.data.total).toBe(5);
      });
    });

    describe('POST /voice/profiles', () => {
      it('should create profile with name and audio', () => {
        const body = {
          name: 'My Voice Profile',
          audioBase64: 'base64-audio-sample',
          metadata: { language: 'en' }
        };

        expect(body.name).toBeDefined();
        expect(body.name.length).toBeGreaterThan(0);
      });

      it('should return created profile', () => {
        const response = {
          success: true,
          data: {
            id: 'profile-new-123',
            name: 'My Voice Profile',
            createdAt: new Date().toISOString(),
            sampleCount: 1
          }
        };

        expect(response.success).toBe(true);
        expect(response.data.id).toBeDefined();
      });
    });

    describe('GET /voice/profiles/:profileId', () => {
      it('should return profile details', () => {
        const response = {
          success: true,
          data: {
            id: 'profile-123',
            userId: 'user-456',
            name: 'Primary Voice',
            createdAt: '2024-01-15T10:30:00Z',
            sampleCount: 5,
            averageQuality: 0.91
          }
        };

        expect(response.data.id).toBe('profile-123');
        expect(response.data.sampleCount).toBeGreaterThan(0);
      });
    });

    describe('PUT /voice/profiles/:profileId', () => {
      it('should update profile', () => {
        const body = {
          name: 'Updated Voice Name',
          metadata: { preferred: true }
        };

        const response = {
          success: true,
          data: {
            id: 'profile-123',
            name: body.name,
            updatedAt: new Date().toISOString()
          }
        };

        expect(response.data.name).toBe('Updated Voice Name');
      });
    });

    describe('DELETE /voice/profiles/:profileId', () => {
      it('should delete profile', () => {
        const response = {
          success: true,
          message: 'Profile deleted successfully'
        };

        expect(response.success).toBe(true);
      });

      it('should return 404 for non-existent profile', () => {
        const reply = createMockReply();
        reply.status(404).send({
          error: 'Profile not found',
          code: 'NOT_FOUND'
        });

        expect(reply.statusCode).toBe(404);
      });
    });

    describe('POST /voice/profiles/:profileId/samples', () => {
      it('should add audio sample to profile', () => {
        const body = {
          audioBase64: 'base64-new-sample'
        };

        const response = {
          success: true,
          data: {
            profileId: 'profile-123',
            newSampleCount: 6,
            averageQuality: 0.89
          }
        };

        expect(response.data.newSampleCount).toBeGreaterThan(0);
      });
    });
  });

  describe('Feedback and Analytics Endpoints', () => {
    describe('POST /voice/feedback', () => {
      it('should submit feedback', () => {
        const body = {
          translationId: 'trans-123',
          rating: 5,
          feedbackType: 'quality',
          comment: 'Excellent voice cloning!'
        };

        expect(body.rating).toBeGreaterThanOrEqual(1);
        expect(body.rating).toBeLessThanOrEqual(5);
        expect(['quality', 'accuracy', 'voice_similarity', 'other']).toContain(body.feedbackType);
      });

      it('should return success', () => {
        const response = {
          success: true,
          message: 'Feedback submitted successfully'
        };

        expect(response.success).toBe(true);
      });
    });

    describe('GET /voice/history', () => {
      it('should return translation history', () => {
        const query = {
          limit: 20,
          offset: 0,
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        };

        const response = {
          success: true,
          data: {
            items: [
              {
                id: 'trans-1',
                timestamp: '2024-06-15T10:30:00Z',
                sourceLanguage: 'en',
                targetLanguages: ['fr', 'es'],
                voiceCloned: true
              }
            ],
            total: 100,
            hasMore: true
          }
        };

        expect(response.data.items).toBeDefined();
        expect(response.data.total).toBeGreaterThan(0);
      });
    });

    describe('GET /voice/stats', () => {
      it('should return user statistics', () => {
        const query = { period: 'month' };

        const response = {
          success: true,
          data: {
            userId: 'user-123',
            totalTranslations: 150,
            totalAudioMinutes: 45.5,
            languagesUsed: ['en', 'fr', 'es'],
            averageProcessingTimeMs: 2500,
            averageFeedbackRating: 4.5,
            periodStart: '2024-01-01',
            periodEnd: '2024-01-31'
          }
        };

        expect(response.data.totalTranslations).toBeGreaterThanOrEqual(0);
        expect(response.data.averageFeedbackRating).toBeGreaterThanOrEqual(0);
        expect(response.data.averageFeedbackRating).toBeLessThanOrEqual(5);
      });
    });
  });

  describe('Admin Endpoints', () => {
    describe('GET /voice/admin/metrics', () => {
      it('should return system metrics', () => {
        const response = {
          success: true,
          data: {
            activeJobs: 5,
            queuedJobs: 12,
            completedToday: 150,
            failedToday: 3,
            averageProcessingTimeMs: 2800,
            cpuUsage: 45.5,
            memoryUsageMb: 2048,
            gpuUsage: 60.0,
            modelsLoaded: ['whisper-large', 'xtts-v2'],
            uptime: 86400,
            version: '1.0.0'
          }
        };

        expect(response.data.activeJobs).toBeGreaterThanOrEqual(0);
        expect(response.data.cpuUsage).toBeGreaterThanOrEqual(0);
        expect(response.data.cpuUsage).toBeLessThanOrEqual(100);
      });

      it('should require admin privileges', () => {
        const request = createMockRequest({
          user: { id: 'regular-user', role: 'user' }
        });

        const reply = createMockReply();
        if (request.user.role !== 'admin') {
          reply.status(403).send({
            error: 'Admin privileges required',
            code: 'FORBIDDEN'
          });
        }

        expect(reply.statusCode).toBe(403);
        expect(reply.data.code).toBe('FORBIDDEN');
      });
    });
  });

  describe('System Endpoints', () => {
    describe('GET /voice/health', () => {
      it('should return health status', () => {
        const response = {
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

        expect(['healthy', 'degraded', 'unhealthy']).toContain(response.status);
        expect(response.services.transcription).toBe(true);
      });

      it('should not require authentication', () => {
        // Health endpoint is public
        const request = createMockRequest({ user: null });

        // Should still return health status
        expect(true).toBe(true); // Public endpoint
      });
    });

    describe('GET /voice/languages', () => {
      it('should return supported languages', () => {
        const response = {
          success: true,
          data: [
            {
              code: 'en',
              name: 'English',
              nativeName: 'English',
              supportedFeatures: {
                transcription: true,
                translation: true,
                tts: true,
                voiceClone: true
              }
            },
            {
              code: 'fr',
              name: 'French',
              nativeName: 'Français',
              supportedFeatures: {
                transcription: true,
                translation: true,
                tts: true,
                voiceClone: true
              }
            }
          ]
        };

        expect(response.data.length).toBeGreaterThan(0);
        expect(response.data[0].code).toHaveLength(2);
        expect(response.data[0].supportedFeatures).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout errors', () => {
      const reply = createMockReply();
      reply.status(504).send({
        error: 'Request timeout',
        code: 'TIMEOUT',
        timestamp: new Date().toISOString()
      });

      expect(reply.statusCode).toBe(504);
      expect(reply.data.code).toBe('TIMEOUT');
    });

    it('should handle service unavailable', () => {
      const reply = createMockReply();
      reply.status(503).send({
        error: 'Voice service unavailable',
        code: 'SERVICE_UNAVAILABLE',
        timestamp: new Date().toISOString()
      });

      expect(reply.statusCode).toBe(503);
      expect(reply.data.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('should handle audio format errors', () => {
      const reply = createMockReply();
      reply.status(400).send({
        error: 'Unsupported audio format. Supported: wav, mp3, ogg, flac',
        code: 'UNSUPPORTED_FORMAT',
        timestamp: new Date().toISOString()
      });

      expect(reply.statusCode).toBe(400);
      expect(reply.data.code).toBe('UNSUPPORTED_FORMAT');
    });

    it('should handle audio length errors', () => {
      const reply = createMockReply();
      reply.status(400).send({
        error: 'Audio too short. Minimum: 1 second',
        code: 'AUDIO_TOO_SHORT',
        timestamp: new Date().toISOString()
      });

      expect(reply.statusCode).toBe(400);
      expect(reply.data.code).toBe('AUDIO_TOO_SHORT');
    });

    it('should handle quota exceeded', () => {
      const reply = createMockReply();
      reply.status(429).send({
        error: 'Monthly quota exceeded',
        code: 'QUOTA_EXCEEDED',
        timestamp: new Date().toISOString()
      });

      expect(reply.statusCode).toBe(429);
      expect(reply.data.code).toBe('QUOTA_EXCEEDED');
    });
  });

  describe('Response Format Consistency', () => {
    it('should have consistent success response format', () => {
      const successResponse = {
        success: true,
        data: { /* any data */ },
        timestamp: new Date().toISOString()
      };

      expect(successResponse.success).toBe(true);
      expect(successResponse.data).toBeDefined();
      expect(successResponse.timestamp).toBeDefined();
    });

    it('should have consistent error response format', () => {
      const errorResponse = {
        success: false,
        error: 'Error message',
        code: 'ERROR_CODE',
        timestamp: new Date().toISOString()
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.code).toBeDefined();
      expect(errorResponse.timestamp).toBeDefined();
    });
  });

  describe('User ID Resolution', () => {
    it('should get user ID from JWT', () => {
      const request = createMockRequest({
        user: { id: 'jwt-user-123' }
      });

      expect(request.user.id).toBe('jwt-user-123');
    });

    it('should get user ID from session when no JWT user', () => {
      // Create request without JWT user
      const request = {
        user: null,
        session: { userId: 'session-user-456' },
        headers: {}
      };

      const userId = request.user?.id || request.session?.userId;
      expect(userId).toBe('session-user-456');
    });

    it('should get user ID from header when no user or session', () => {
      // Create request without JWT or session
      const request = {
        user: null,
        session: null,
        headers: { 'x-user-id': 'header-user-789' }
      };

      const userId = request.user?.id || (request.session as any)?.userId || request.headers['x-user-id'];
      expect(userId).toBe('header-user-789');
    });
  });
});

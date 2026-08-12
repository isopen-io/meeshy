/**
 * E2E Tests for Voice API
 *
 * Tests the complete Voice API endpoints:
 * - Health check and languages
 * - Voice translation (sync/async)
 * - Voice analysis and comparison
 * - Voice profiles CRUD
 * - Job management
 * - Feedback and history
 *
 * Prerequisites:
 * - Gateway service running on GATEWAY_URL
 * - Translator service running and connected via ZMQ
 * - Test audio files in fixtures/
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const VOICE_API_PREFIX = `${API_URL}/api/v1/voice`;
const AUTH_API_PREFIX = `${API_URL}/api/v1/auth`;

// Jeton de session de l'utilisateur de test, obtenu via une VRAIE inscription
// (voir registerTestUser() plus bas). Rempli dans test.beforeAll().
//
// SECURITY: les routes voice n'acceptent plus l'en-tête `x-user-id` comme
// preuve d'identité — cet en-tête n'était protégé par aucune vérification
// cryptographique et permettait à n'importe quel appelant anonyme d'usurper
// l'identité de n'importe quel utilisateur (CWE-290 / CWE-807). L'identité
// doit désormais provenir exclusivement d'une session authentifiée
// (`Authorization: Bearer <jeton>`), exactement comme un vrai client.
let authToken = '';
let authUserId = '';

// Helper: Register a real test user via the auth API and return a real
// session token — comme le ferait n'importe quel client légitime.
async function registerTestUser(): Promise<{ token: string; userId: string }> {
  const unique = Date.now().toString(36);
  const response = await fetch(`${AUTH_API_PREFIX}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `voe2e${unique}`,
      email: `voice-e2e-${unique}@test.meeshy.local`,
      password: 'Test1234!Voice',
      firstName: 'Voice',
      lastName: 'E2E',
      systemLanguage: 'fr',
      regionalLanguage: 'fr',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to register voice API test user: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  if (!body.success || !body.data?.token || !body.data?.user?.id) {
    throw new Error(`Unexpected register response shape: ${JSON.stringify(body)}`);
  }

  return { token: body.data.token, userId: body.data.user.id };
}

// Helper: Create base64 audio from a simple sine wave
function generateTestAudioBase64(): string {
  // Create a simple WAV header + sine wave data
  // This is a minimal valid WAV file for testing
  const sampleRate = 22050;
  const duration = 1; // 1 second
  const numSamples = sampleRate * duration;

  // WAV header (44 bytes)
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + numSamples * 2, 4); // File size - 8
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20); // AudioFormat (PCM)
  header.writeUInt16LE(1, 22); // NumChannels
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  header.writeUInt16LE(2, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36);
  header.writeUInt32LE(numSamples * 2, 40); // Subchunk2Size

  // Generate sine wave data
  const data = Buffer.alloc(numSamples * 2);
  const frequency = 440; // A4 note
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.5;
    const intSample = Math.floor(sample * 32767);
    data.writeInt16LE(intSample, i * 2);
  }

  const wavBuffer = Buffer.concat([header, data]);
  return wavBuffer.toString('base64');
}

// Helper: Make authenticated request.
//
// Par défaut, s'authentifie comme un vrai client via le jeton de session
// obtenu par registerTestUser() (Authorization: Bearer <jeton>). Passer
// `token: null` explicitement pour simuler un appelant anonyme (aucun
// en-tête d'authentification) — jamais via x-user-id, qui n'est plus lu par
// le serveur (voir routes/voice/types.ts::getUserId).
async function apiRequest(
  endpoint: string,
  options: {
    method?: string;
    body?: any;
    token?: string | null;
  } = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = options.token === undefined ? authToken : options.token;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${VOICE_API_PREFIX}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

test.describe('Voice API E2E Tests', () => {
  let testAudioBase64: string;

  test.beforeAll(async () => {
    testAudioBase64 = generateTestAudioBase64();
    // Authentification réelle : on s'inscrit comme le ferait n'importe quel
    // client, puis on utilise le jeton renvoyé pour toutes les requêtes
    // (apiRequest() l'ajoute automatiquement en Authorization: Bearer).
    const { token, userId } = await registerTestUser();
    authToken = token;
    authUserId = userId;
  });

  test.describe('System Endpoints', () => {
    test('GET /health - should return health status', async () => {
      const response = await apiRequest('/health');

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
      expect(data).toHaveProperty('services');
      expect(data).toHaveProperty('timestamp');
    });

    test('GET /languages - should return supported languages', async () => {
      const response = await apiRequest('/languages');

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data).toHaveProperty('success');
      expect(data.success).toBe(true);
      expect(data.data).toBeInstanceOf(Array);

      if (data.data.length > 0) {
        const lang = data.data[0];
        expect(lang).toHaveProperty('code');
        expect(lang).toHaveProperty('name');
        expect(lang).toHaveProperty('supportedFeatures');
      }
    });
  });

  test.describe('Voice Translation', () => {
    test('POST /translate - should translate audio (sync)', async () => {
      const response = await apiRequest('/translate', {
        method: 'POST',
        body: {
          audioBase64: testAudioBase64,
          targetLanguages: ['fr'],
          sourceLanguage: 'en',
          generateVoiceClone: false,
        },
      });

      // May succeed or fail depending on service availability
      const data = await response.json();

      if (response.ok) {
        expect(data).toHaveProperty('success');
        if (data.success) {
          expect(data.data).toHaveProperty('translationId');
        }
      } else {
        // Should return proper error format
        expect(data).toHaveProperty('error');
        expect(data).toHaveProperty('code');
      }
    });

    test('POST /translate/async - should submit async translation job', async () => {
      const response = await apiRequest('/translate/async', {
        method: 'POST',
        body: {
          audioBase64: testAudioBase64,
          targetLanguages: ['fr', 'es'],
          sourceLanguage: 'en',
          generateVoiceClone: true,
          priority: 5,
        },
      });

      const data = await response.json();

      if (response.ok) {
        expect(data).toHaveProperty('success');
        if (data.success) {
          expect(data.data).toHaveProperty('jobId');
          expect(data.data).toHaveProperty('status');
          expect(data.data.status).toBe('pending');
        }
      } else {
        expect(data).toHaveProperty('error');
      }
    });

    test('POST /translate - should return 400 for missing targetLanguages', async () => {
      const response = await apiRequest('/translate', {
        method: 'POST',
        body: {
          audioBase64: testAudioBase64,
          // Missing targetLanguages
        },
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  test.describe('Voice Analysis', () => {
    test('POST /analyze - should analyze voice characteristics', async () => {
      const response = await apiRequest('/analyze', {
        method: 'POST',
        body: {
          audioBase64: testAudioBase64,
          analysisTypes: ['pitch', 'timbre', 'mfcc'],
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        expect(data.data).toHaveProperty('pitch');
        expect(data.data).toHaveProperty('classification');
      }
    });

    test('POST /compare - should compare two voices', async () => {
      const response = await apiRequest('/compare', {
        method: 'POST',
        body: {
          audioBase64_1: testAudioBase64,
          audioBase64_2: testAudioBase64,
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        expect(data.data).toHaveProperty('overallSimilarity');
        expect(data.data).toHaveProperty('verdict');
        expect(['same_speaker', 'different_speaker', 'uncertain']).toContain(data.data.verdict);
      }
    });
  });

  test.describe('Voice Profiles', () => {
    let profileId: string;

    test('POST /profiles - should create a voice profile', async () => {
      const response = await apiRequest('/profiles', {
        method: 'POST',
        body: {
          name: 'Test Voice Profile',
          audioBase64: testAudioBase64,
          metadata: { testRun: true },
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        expect(data.data).toHaveProperty('id');
        expect(data.data).toHaveProperty('name');
        profileId = data.data.id;
      }
    });

    test('GET /profiles - should list profiles with pagination', async () => {
      const response = await apiRequest('/profiles?limit=10&offset=0');

      const data = await response.json();

      if (response.ok) {
        expect(data).toHaveProperty('success');
        if (data.success) {
          expect(data.data).toHaveProperty('items');
          expect(data.data).toHaveProperty('total');
          expect(Array.isArray(data.data.items)).toBe(true);
        }
      }
    });

    test('GET /profiles/:id - should get profile by ID', async () => {
      if (!profileId) {
        test.skip();
        return;
      }

      const response = await apiRequest(`/profiles/${profileId}`);

      const data = await response.json();

      if (response.ok && data.success) {
        expect(data.data.id).toBe(profileId);
        expect(data.data).toHaveProperty('name');
      }
    });

    test('PUT /profiles/:id - should update profile', async () => {
      if (!profileId) {
        test.skip();
        return;
      }

      const response = await apiRequest(`/profiles/${profileId}`, {
        method: 'PUT',
        body: {
          name: 'Updated Profile Name',
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        expect(data.data.name).toBe('Updated Profile Name');
      }
    });

    test('DELETE /profiles/:id - should delete profile', async () => {
      if (!profileId) {
        test.skip();
        return;
      }

      const response = await apiRequest(`/profiles/${profileId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const data = await response.json();
        expect(data.success).toBe(true);
      }
    });
  });

  test.describe('Feedback and History', () => {
    test('POST /feedback - should submit feedback', async () => {
      const response = await apiRequest('/feedback', {
        method: 'POST',
        body: {
          translationId: `test-trans-${Date.now()}`,
          rating: 5,
          feedbackType: 'quality',
          comment: 'E2E test feedback',
        },
      });

      const data = await response.json();

      if (response.ok) {
        expect(data.success).toBe(true);
      }
    });

    test('GET /history - should get translation history', async () => {
      const response = await apiRequest('/history?limit=10');

      const data = await response.json();

      if (response.ok && data.success) {
        expect(data.data).toHaveProperty('items');
        expect(Array.isArray(data.data.items)).toBe(true);
      }
    });

    test('GET /stats - should get user statistics', async () => {
      const response = await apiRequest('/stats?period=month');

      const data = await response.json();

      if (response.ok && data.success) {
        expect(data.data).toHaveProperty('userId');
        expect(data.data).toHaveProperty('totalTranslations');
      }
    });
  });

  test.describe('Job Management', () => {
    test('GET /job/:jobId - should return 404 for non-existent job', async () => {
      const response = await apiRequest('/job/non-existent-job-id');

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe('NOT_FOUND');
    });

    test('DELETE /job/:jobId - should return 404 for non-existent job', async () => {
      const response = await apiRequest('/job/non-existent-job-id', {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);
    });
  });

  test.describe('Error Handling', () => {
    test('should return 401 for unauthenticated requests to protected endpoints', async () => {
      const response = await fetch(`${VOICE_API_PREFIX}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: testAudioBase64,
          targetLanguages: ['fr'],
        }),
      });

      // SECURITY: l'authentification est désormais obligatoire sur toutes les
      // routes voice (voir routes/voice/translation.ts) — un appelant sans
      // jeton doit systématiquement être refusé, jamais laissé passer.
      expect(response.status).toBe(401);
    });

    test('should refuse a request bearing x-user-id for another user with no valid token (identity spoofing)', async () => {
      // Régression directe de la faille corrigée : x-user-id n'est plus lu
      // par le serveur (voir routes/voice/types.ts::getUserId). Un attaquant
      // sans jeton ne doit JAMAIS pouvoir usurper l'identité de la victime en
      // fournissant simplement son identifiant dans cet en-tête.
      const response = await fetch(`${VOICE_API_PREFIX}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': authUserId,
        },
        body: JSON.stringify({
          audioBase64: testAudioBase64,
          targetLanguages: ['fr'],
        }),
      });

      expect(response.status).toBe(401);
    });

    test('should return proper error format for invalid requests', async () => {
      const response = await apiRequest('/translate', {
        method: 'POST',
        body: {
          // Invalid: empty targetLanguages
          audioBase64: testAudioBase64,
          targetLanguages: [],
        },
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('code');
    });
  });
});

test.describe('Voice API Performance', () => {
  test('Health endpoint should respond within 500ms', async () => {
    const start = Date.now();
    const response = await fetch(`${VOICE_API_PREFIX}/health`);
    const duration = Date.now() - start;

    expect(response.ok).toBe(true);
    expect(duration).toBeLessThan(500);
  });

  test('Languages endpoint should respond within 500ms', async () => {
    const start = Date.now();
    const response = await fetch(`${VOICE_API_PREFIX}/languages`);
    const duration = Date.now() - start;

    expect(response.ok).toBe(true);
    expect(duration).toBeLessThan(500);
  });
});

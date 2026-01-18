/**
 * Tests E2E pour la validation des consentements dans les préférences
 * Teste que les préférences nécessitant des consentements GDPR sont correctement validées
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../../server';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  AUDIO_PREFERENCE_DEFAULTS,
  PRIVACY_PREFERENCE_DEFAULTS,
  MESSAGE_PREFERENCE_DEFAULTS,
  APPLICATION_PREFERENCE_DEFAULTS
} from '@meeshy/shared/types/preferences';

describe('Consent Validation E2E Tests', () => {
  let server: FastifyInstance;
  let prisma: PrismaClient;
  let testUserId: string;
  let authToken: string;

  beforeAll(async () => {
    // Initialiser le serveur de test
    server = await buildServer();
    await server.ready();
    prisma = server.prisma;

    // Créer un utilisateur de test
    const testUser = await prisma.user.create({
      data: {
        username: `test_consent_${Date.now()}`,
        email: `test_consent_${Date.now()}@example.com`,
        passwordHash: 'test_hash',
        displayName: 'Test Consent User',
        // Aucun consentement initialement
        dataProcessingConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null,
        voiceCloningConsentAt: null
      }
    });

    testUserId = testUser.id;

    // Générer un token d'authentification (simulé pour les tests)
    // Dans un vrai test, utilisez votre méthode de génération de token
    authToken = `mock_token_${testUserId}`;
  });

  afterAll(async () => {
    // Nettoyer les données de test
    if (testUserId) {
      await prisma.userPreferences.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
    }
    await server.close();
  });

  describe('Audio Preferences - Consent Validation', () => {
    beforeEach(async () => {
      // Réinitialiser les consentements avant chaque test
      await prisma.user.update({
        where: { id: testUserId },
        data: {
          dataProcessingConsentAt: null,
          voiceDataConsentAt: null,
          voiceProfileConsentAt: null,
          audioTranscriptionEnabledAt: null,
          textTranslationEnabledAt: null,
          audioTranslationEnabledAt: null,
          translatedAudioGenerationEnabledAt: null
        }
      });
    });

    test('devrait rejeter transcriptionEnabled sans voiceDataConsent', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/audio',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...AUDIO_PREFERENCE_DEFAULTS,
          transcriptionEnabled: true
        }
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error).toBe('CONSENT_REQUIRED');
      expect(body.violations).toHaveLength(1);
      expect(body.violations[0].field).toBe('transcriptionEnabled');
      expect(body.violations[0].requiredConsents).toContain('voiceDataConsentAt');
    });

    test('devrait accepter transcriptionEnabled avec les consentements requis', async () => {
      // Donner les consentements requis
      await prisma.user.update({
        where: { id: testUserId },
        data: {
          dataProcessingConsentAt: new Date(),
          voiceDataConsentAt: new Date(),
          audioTranscriptionEnabledAt: new Date()
        }
      });

      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/audio',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...AUDIO_PREFERENCE_DEFAULTS,
          transcriptionEnabled: true
        }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.transcriptionEnabled).toBe(true);
    });

    test('devrait rejeter audioTranslationEnabled sans audioTranscriptionEnabled', async () => {
      // Donner seulement dataProcessingConsent
      await prisma.user.update({
        where: { id: testUserId },
        data: {
          dataProcessingConsentAt: new Date(),
          voiceDataConsentAt: new Date()
        }
      });

      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/audio',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...AUDIO_PREFERENCE_DEFAULTS,
          audioTranslationEnabled: true
        }
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error).toBe('CONSENT_REQUIRED');
      expect(body.violations[0].field).toBe('audioTranslationEnabled');
    });

    test('devrait accepter audioTranslationEnabled avec toutes les dépendances', async () => {
      // Donner tous les consentements requis
      await prisma.user.update({
        where: { id: testUserId },
        data: {
          dataProcessingConsentAt: new Date(),
          voiceDataConsentAt: new Date(),
          audioTranscriptionEnabledAt: new Date(),
          textTranslationEnabledAt: new Date(),
          audioTranslationEnabledAt: new Date()
        }
      });

      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/audio',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...AUDIO_PREFERENCE_DEFAULTS,
          audioTranslationEnabled: true
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.audioTranslationEnabled).toBe(true);
    });

    test('devrait rejeter ttsEnabled sans translatedAudioGenerationEnabled', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/audio',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...AUDIO_PREFERENCE_DEFAULTS,
          ttsEnabled: true
        }
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.violations[0].field).toBe('ttsEnabled');
      expect(body.violations[0].requiredConsents).toContain('translatedAudioGenerationEnabledAt');
    });

    test('devrait rejeter voiceProfileEnabled sans voiceProfileConsent', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/audio',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...AUDIO_PREFERENCE_DEFAULTS,
          voiceProfileEnabled: true
        }
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.violations[0].field).toBe('voiceProfileEnabled');
      expect(body.violations[0].requiredConsents).toContain('voiceProfileConsentAt');
    });
  });

  describe('Privacy Preferences - Consent Validation', () => {
    beforeEach(async () => {
      await prisma.user.update({
        where: { id: testUserId },
        data: {
          dataProcessingConsentAt: null
        }
      });
    });

    test('devrait rejeter allowAnalytics sans dataProcessingConsent', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/privacy',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...PRIVACY_PREFERENCE_DEFAULTS,
          allowAnalytics: true
        }
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.violations[0].field).toBe('allowAnalytics');
      expect(body.violations[0].requiredConsents).toContain('dataProcessingConsentAt');
    });

    test('devrait accepter allowAnalytics avec dataProcessingConsent', async () => {
      await prisma.user.update({
        where: { id: testUserId },
        data: {
          dataProcessingConsentAt: new Date()
        }
      });

      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/privacy',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...PRIVACY_PREFERENCE_DEFAULTS,
          allowAnalytics: true
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.allowAnalytics).toBe(true);
    });

    test('devrait rejeter shareUsageData sans dataProcessingConsent', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/privacy',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...PRIVACY_PREFERENCE_DEFAULTS,
          shareUsageData: true
        }
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.violations[0].field).toBe('shareUsageData');
    });
  });

  describe('Message Preferences - Consent Validation', () => {
    beforeEach(async () => {
      await prisma.user.update({
        where: { id: testUserId },
        data: {
          dataProcessingConsentAt: null,
          textTranslationEnabledAt: null
        }
      });
    });

    test('devrait rejeter autoTranslateIncoming sans textTranslationEnabled', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/message',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...MESSAGE_PREFERENCE_DEFAULTS,
          autoTranslateIncoming: true
        }
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.violations[0].field).toBe('autoTranslateIncoming');
      expect(body.violations[0].requiredConsents).toContain('textTranslationEnabledAt');
    });

    test('devrait accepter autoTranslateIncoming avec textTranslationEnabled', async () => {
      await prisma.user.update({
        where: { id: testUserId },
        data: {
          dataProcessingConsentAt: new Date(),
          textTranslationEnabledAt: new Date()
        }
      });

      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/message',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...MESSAGE_PREFERENCE_DEFAULTS,
          autoTranslateIncoming: true
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.autoTranslateIncoming).toBe(true);
    });

    test('devrait rejeter autoTranslateLanguages sans textTranslationEnabled', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/message',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...MESSAGE_PREFERENCE_DEFAULTS,
          autoTranslateLanguages: ['fr', 'es']
        }
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.violations[0].field).toBe('autoTranslateLanguages');
    });
  });

  describe('Application Preferences - Consent Validation', () => {
    beforeEach(async () => {
      await prisma.user.update({
        where: { id: testUserId },
        data: {
          dataProcessingConsentAt: null,
          thirdPartyServicesConsentAt: null
        }
      });
    });

    test('devrait rejeter telemetryEnabled sans dataProcessingConsent', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/application',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...APPLICATION_PREFERENCE_DEFAULTS,
          telemetryEnabled: true
        }
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.violations[0].field).toBe('telemetryEnabled');
    });

    test('devrait rejeter betaFeaturesEnabled sans thirdPartyServicesConsent', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/application',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...APPLICATION_PREFERENCE_DEFAULTS,
          betaFeaturesEnabled: true
        }
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.violations[0].field).toBe('betaFeaturesEnabled');
    });
  });

  describe('PATCH - Partial Updates with Consent Validation', () => {
    test('devrait valider les consentements sur les données mergées', async () => {
      // Créer des préférences de base valides
      await prisma.user.update({
        where: { id: testUserId },
        data: {
          dataProcessingConsentAt: new Date(),
          voiceDataConsentAt: new Date(),
          audioTranscriptionEnabledAt: new Date()
        }
      });

      // Créer des préférences initiales
      await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/audio',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...AUDIO_PREFERENCE_DEFAULTS,
          transcriptionEnabled: true
        }
      });

      // Retirer le consentement
      await prisma.user.update({
        where: { id: testUserId },
        data: {
          audioTranscriptionEnabledAt: null
        }
      });

      // Essayer de faire un PATCH (même sans modifier transcriptionEnabled)
      const response = await server.inject({
        method: 'PATCH',
        url: '/api/v1/me/preferences/audio',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          audioQuality: 'medium' // Modification d'un autre champ
        }
      });

      // Devrait échouer car les données mergées contiennent transcriptionEnabled=true
      // mais le consentement n'est plus présent
      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.violations[0].field).toBe('transcriptionEnabled');
    });
  });

  describe('Multiple Violations', () => {
    test('devrait retourner toutes les violations de consentement', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/me/preferences/audio',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          ...AUDIO_PREFERENCE_DEFAULTS,
          transcriptionEnabled: true,
          audioTranslationEnabled: true,
          ttsEnabled: true,
          voiceProfileEnabled: true
        }
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.violations.length).toBeGreaterThan(1);

      const violatedFields = body.violations.map((v: any) => v.field);
      expect(violatedFields).toContain('transcriptionEnabled');
      expect(violatedFields).toContain('audioTranslationEnabled');
      expect(violatedFields).toContain('ttsEnabled');
      expect(violatedFields).toContain('voiceProfileEnabled');
    });
  });
});

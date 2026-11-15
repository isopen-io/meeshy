/**
 * #3735 — `MessageTranslationService.processAudioAttachment()` lit les cinq
 * réglages fins `voiceCloning*` de `UserPreferences.audio` et les transmet au
 * Translator via `AudioProcessRequest.voiceCloneParams`.
 *
 * `voiceCloneParams` existe de bout en bout sur le fil ZMQ depuis toujours
 * (`services/zmq-translation/types.ts`) mais n'était JAMAIS rempli par ce
 * site — les réglages persistés par `VoiceProfileService` restaient inertes.
 *
 * Les suites `MessageTranslationService.*.test.ts` existantes sont gelées à
 * leur taille exacte (DETTE_HERITEE) : ce fichier reprend le harnais minimal
 * nécessaire à `processAudioAttachment()` plutôt que d'y ajouter une ligne.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';

type MockFn = jest.Mock<any>;

class MockZMQClient extends EventEmitter {
  sendTranslationRequest: MockFn = jest.fn();
  sendAudioProcessRequest: MockFn = jest.fn();
  sendTranscriptionOnlyRequest: MockFn = jest.fn();
  healthCheck: MockFn = jest.fn();
  close: MockFn = jest.fn();
  testReception: MockFn = jest.fn();
}

const mockZmqClient = new MockZMQClient();

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstance: jest.fn().mockResolvedValue(mockZmqClient) }
}));

jest.mock('../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    getConsentStatus: (jest.fn() as MockFn).mockResolvedValue({
      canTranscribeAudio: true,
      canTranslateAudio: true,
      canGenerateTranslatedAudio: true,
      canUseVoiceCloning: true,
      hasVoiceDataConsent: true
    })
  }))
}));

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: { shared: { handleAudioTranslationsReady: jest.fn().mockResolvedValue(undefined) } }
}));

jest.mock('../../../services/MultiLevelJobMappingCache', () => ({
  MultiLevelJobMappingCache: jest.fn().mockImplementation(() => ({
    getAndDeleteJobMapping: jest.fn().mockResolvedValue(null)
  }))
}));

import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';

const createMockPrisma = () => ({
  conversation: { findUnique: jest.fn() as MockFn },
  participant: { findMany: jest.fn() as MockFn },
  user: { findUnique: jest.fn() as MockFn },
  userVoiceModel: { findUnique: jest.fn() as MockFn },
  userPreferences: { findUnique: jest.fn() as MockFn }
});

describe('MessageTranslationService.processAudioAttachment — lecture des réglages de clonage vocal (#3735)', () => {
  let svc: MessageTranslationService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const baseRequest = {
    messageId: 'msg-1',
    attachmentId: 'att-1',
    conversationId: 'conv-1',
    senderId: 'user-1',
    audioUrl: '/url/audio.mp3',
    audioPath: '/app/uploads/audio.mp3',
    audioDurationMs: 5000
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();
    mockZmqClient.sendAudioProcessRequest.mockReset().mockResolvedValue('task-1');

    prisma = createMockPrisma();
    prisma.conversation.findUnique.mockResolvedValue({ autoTranslateEnabled: true });
    prisma.participant.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ systemLanguage: 'en' });
    prisma.userVoiceModel.findUnique.mockResolvedValue(null);
    prisma.userPreferences.findUnique.mockResolvedValue(null);

    svc = new MessageTranslationService(prisma as any);
    await svc.initialize();
  });

  const lastZmqCall = () => mockZmqClient.sendAudioProcessRequest.mock.calls[0]?.[0] as any;

  it("n'envoie aucun voiceCloneParams quand UserPreferences.audio est vide", async () => {
    await svc.processAudioAttachment(baseRequest);

    expect(prisma.userPreferences.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { audio: true }
    });
    expect(lastZmqCall()?.voiceCloneParams).toBeUndefined();
  });

  it('transmet les quatre réglages Chatterbox explicites, sans preset', async () => {
    prisma.userPreferences.findUnique.mockResolvedValue({
      audio: {
        voiceCloningExaggeration: 0.7,
        voiceCloningCfgWeight: 0.2,
        voiceCloningTemperature: 1.3,
        voiceCloningTopP: 0.95
      }
    });

    await svc.processAudioAttachment(baseRequest);

    // #3735 — `voiceCloneParams` est à PLAT sur le fil ZMQ (`zmq_audio_handler.py`
    // lit `raw_cloning.get('exaggeration')` directement, jamais sous `.chatterbox`).
    expect(lastZmqCall()?.voiceCloneParams).toEqual(
      expect.objectContaining({
        exaggeration: 0.7,
        cfgWeight: 0.2,
        temperature: 1.3,
        topP: 0.95
      })
    );
  });

  it('applique le preset "high_quality" comme base quand fourni', async () => {
    prisma.userPreferences.findUnique.mockResolvedValue({
      audio: { voiceCloningQualityPreset: 'high_quality' }
    });

    await svc.processAudioAttachment(baseRequest);

    const cloneParams = lastZmqCall()?.voiceCloneParams;
    expect(cloneParams).toBeDefined();
    // Preset "high_quality" (VOICE_CLONE_PRESET_HIGH_QUALITY) : exaggeration 0.6
    expect(cloneParams.exaggeration).toBe(0.6);
    expect(cloneParams.qualityPreset).toBe('high_quality');
  });

  it('un réglage fin explicite surcharge la base du preset', async () => {
    prisma.userPreferences.findUnique.mockResolvedValue({
      audio: { voiceCloningQualityPreset: 'high_quality', voiceCloningExaggeration: 0.99 }
    });

    await svc.processAudioAttachment(baseRequest);

    expect(lastZmqCall()?.voiceCloneParams?.exaggeration).toBe(0.99);
  });

  it('ne lit pas les préférences quand le clonage vocal est désactivé pour cet appel', async () => {
    await svc.processAudioAttachment({ ...baseRequest, generateVoiceClone: false });

    expect(prisma.userPreferences.findUnique).not.toHaveBeenCalled();
    expect(lastZmqCall()?.voiceCloneParams).toBeUndefined();
  });

  it('ignore un preset inconnu et retombe sur les seuls réglages fins fournis', async () => {
    prisma.userPreferences.findUnique.mockResolvedValue({
      audio: { voiceCloningQualityPreset: 'ultra', voiceCloningTopP: 0.42 }
    });

    await svc.processAudioAttachment(baseRequest);

    expect(lastZmqCall()?.voiceCloneParams?.topP).toBe(0.42);
    expect(lastZmqCall()?.voiceCloneParams?.qualityPreset).toBeUndefined();
  });
});

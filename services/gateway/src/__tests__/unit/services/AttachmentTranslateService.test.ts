/**
 * Unit tests for AttachmentTranslateService
 * Tests the dispatcher that routes translation requests based on attachment type
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock fs.promises FIRST before imports
jest.mock('fs', () => ({
  promises: {
    readFile: (jest.fn() as any).mockResolvedValue(Buffer.from('mock-audio-data'))
  }
}));

// Mock AudioTranslateService
const mockAudioTranslateService: any = {
  translateSync: jest.fn(),
  translateAsync: jest.fn(),
  getJobStatus: jest.fn(),
  cancelJob: jest.fn()
};

jest.mock('../../../services/AudioTranslateService', () => ({
  AudioTranslateService: jest.fn().mockImplementation(() => mockAudioTranslateService)
}));

// Mock Prisma
jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    messageAttachment: {
      findUnique: jest.fn(),
      update: jest.fn()
    },
    conversationMember: {
      findFirst: jest.fn()
    },
    userVoiceModel: {
      findUnique: jest.fn()
    }
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma)
  };
});

import { AttachmentTranslateService } from '../../../services/AttachmentTranslateService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

// ═══════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const createMockAttachment = (overrides: Record<string, any> = {}) => ({
  id: 'att-123',
  mimeType: 'audio/webm',
  filePath: 'audio/test.webm',
  uploadedBy: 'user-123',
  isForwarded: false,
  forwardedFromAttachmentId: null,
  duration: 3000,
  transcription: null,
  translations: null,
  message: {
    id: 'msg-123',
    conversationId: 'conv-123',
    senderId: 'user-123'
  },
  ...overrides
});

// Helper to create a JSON transcription object (stored in attachment.transcription)
const createMockTranscriptionJSON = (overrides: Record<string, any> = {}) => ({
  text: 'Hello world',
  language: 'en',
  confidence: 0.95,
  source: 'whisper',
  segments: [],
  durationMs: 3000,
  speakerCount: 1,
  primarySpeakerId: null,
  speakerAnalysis: null,
  ...overrides
});

// Helper to create JSON translations object (stored in attachment.translations)
const createMockTranslationsJSON = (languages: string[] = ['fr']) => {
  const translations: Record<string, any> = {};
  languages.forEach(lang => {
    translations[lang] = {
      type: 'audio',
      transcription: lang === 'fr' ? 'Bonjour le monde' : 'Hola mundo',
      path: `/audio/translated-${lang}.webm`,
      url: `https://cdn.example.com/audio/translated-${lang}.webm`,
      durationMs: 3100,
      cloned: true,
      quality: 0.92,
      voiceModelId: 'vfp_user123',
      createdAt: new Date().toISOString()
    };
  });
  return translations;
};

const createMockVoiceModel = (overrides: Record<string, any> = {}) => ({
  profileId: 'vfp_user123',
  userId: 'user123',
  embedding: Buffer.from('mock-embedding'),
  qualityScore: 0.9,
  fingerprint: {},
  voiceCharacteristics: {},
  version: 1,
  audioCount: 5,
  totalDurationMs: 15000,
  ...overrides
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('AttachmentTranslateService', () => {
  let service: AttachmentTranslateService;
  let prisma: any;
  const mockZmqClient = {} as any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
    service = new AttachmentTranslateService(prisma, mockZmqClient);
  });

  // =========================================================================
  // ATTACHMENT TYPE DETECTION (existing tests)
  // =========================================================================

  describe('Attachment Type Detection', () => {
    const getAttachmentType = (mimeType: string): string => {
      if (mimeType.startsWith('audio/')) return 'audio';
      if (mimeType.startsWith('image/')) return 'image';
      if (mimeType.startsWith('video/')) return 'video';
      if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return 'document';
      return 'unknown';
    };

    it('should detect audio types', () => {
      expect(getAttachmentType('audio/webm')).toBe('audio');
      expect(getAttachmentType('audio/mp3')).toBe('audio');
      expect(getAttachmentType('audio/wav')).toBe('audio');
      expect(getAttachmentType('audio/ogg')).toBe('audio');
      expect(getAttachmentType('audio/mpeg')).toBe('audio');
    });

    it('should detect image types', () => {
      expect(getAttachmentType('image/png')).toBe('image');
      expect(getAttachmentType('image/jpeg')).toBe('image');
      expect(getAttachmentType('image/gif')).toBe('image');
      expect(getAttachmentType('image/webp')).toBe('image');
    });

    it('should detect video types', () => {
      expect(getAttachmentType('video/mp4')).toBe('video');
      expect(getAttachmentType('video/webm')).toBe('video');
      expect(getAttachmentType('video/quicktime')).toBe('video');
    });

    it('should detect document types', () => {
      expect(getAttachmentType('application/pdf')).toBe('document');
      expect(getAttachmentType('text/plain')).toBe('document');
      expect(getAttachmentType('text/html')).toBe('document');
    });

    it('should return unknown for unsupported types', () => {
      expect(getAttachmentType('application/octet-stream')).toBe('unknown');
      expect(getAttachmentType('application/json')).toBe('unknown');
    });
  });

  // =========================================================================
  // translate() - MAIN METHOD
  // =========================================================================

  describe('translate()', () => {
    describe('Error Handling', () => {
      it('should return ATTACHMENT_NOT_FOUND when attachment does not exist', async () => {
        prisma.messageAttachment.findUnique.mockResolvedValue(null);

        const result = await service.translate('user-123', 'non-existent-att', {
          targetLanguages: ['fr']
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('ATTACHMENT_NOT_FOUND');
        expect(result.error).toBe('Attachment not found');
      });

      it('should return ACCESS_DENIED when user has no access', async () => {
        const attachment = createMockAttachment({
          uploadedBy: 'other-user',
          message: { id: 'msg-123', conversationId: 'conv-123', senderId: 'other-user' }
        });
        prisma.messageAttachment.findUnique.mockResolvedValue(attachment);
        prisma.conversationMember.findFirst.mockResolvedValue(null);

        const result = await service.translate('unauthorized-user', 'att-123', {
          targetLanguages: ['fr']
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('ACCESS_DENIED');
        expect(result.error).toBe('Access denied to this attachment');
      });

      it('should return UNSUPPORTED_TYPE for unknown mime types', async () => {
        const attachment = createMockAttachment({
          mimeType: 'application/octet-stream'
        });
        prisma.messageAttachment.findUnique.mockResolvedValue(attachment);

        const result = await service.translate('user-123', 'att-123', {
          targetLanguages: ['fr']
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('UNSUPPORTED_TYPE');
        expect(result.error).toContain('Unsupported attachment type');
      });
    });

    describe('Supported Types Routing', () => {
      it('should route audio/* to translateAudio', async () => {
        const attachment = createMockAttachment({ mimeType: 'audio/webm' });
        prisma.messageAttachment.findUnique
          .mockResolvedValueOnce(attachment)
          .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-123' } })
          .mockResolvedValueOnce({ transcription: null })
          .mockResolvedValueOnce({ translations: null });
        prisma.userVoiceModel.findUnique.mockResolvedValue(null);
        mockAudioTranslateService.translateSync.mockResolvedValue({
          translationId: 'trans-123',
          originalAudio: { transcription: 'Hello', language: 'en', durationMs: 3000, confidence: 0.95 },
          translations: [{ targetLanguage: 'fr', translatedText: 'Bonjour', audioUrl: '/audio.webm', durationMs: 3100 }],
          processingTimeMs: 1500
        });

        const result = await service.translate('user-123', 'att-123', {
          targetLanguages: ['fr']
        });

        expect(result.success).toBe(true);
        expect(result.data?.type).toBe('audio');
      });

      it('should return NOT_IMPLEMENTED for image/*', async () => {
        const attachment = createMockAttachment({ mimeType: 'image/png' });
        prisma.messageAttachment.findUnique.mockResolvedValue(attachment);

        const result = await service.translate('user-123', 'att-123', {
          targetLanguages: ['fr']
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('NOT_IMPLEMENTED');
      });

      it('should return NOT_IMPLEMENTED for video/*', async () => {
        const attachment = createMockAttachment({ mimeType: 'video/mp4' });
        prisma.messageAttachment.findUnique.mockResolvedValue(attachment);

        const result = await service.translate('user-123', 'att-123', {
          targetLanguages: ['fr']
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('NOT_IMPLEMENTED');
      });

      it('should return NOT_IMPLEMENTED for document types', async () => {
        const attachment = createMockAttachment({ mimeType: 'application/pdf' });
        prisma.messageAttachment.findUnique.mockResolvedValue(attachment);

        const result = await service.translate('user-123', 'att-123', {
          targetLanguages: ['fr']
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('NOT_IMPLEMENTED');
      });
    });

    describe('Access Verification', () => {
      it('should allow access for attachment owner', async () => {
        const attachment = createMockAttachment({
          uploadedBy: 'user-123',
          mimeType: 'image/png'
        });
        prisma.messageAttachment.findUnique.mockResolvedValue(attachment);

        const result = await service.translate('user-123', 'att-123', {
          targetLanguages: ['fr']
        });

        // Access granted, but image translation not implemented
        expect(result.errorCode).toBe('NOT_IMPLEMENTED');
        expect(result.errorCode).not.toBe('ACCESS_DENIED');
      });

      it('should allow access for conversation member', async () => {
        const attachment = createMockAttachment({
          uploadedBy: 'other-user',
          mimeType: 'image/png',
          message: { id: 'msg-123', conversationId: 'conv-123', senderId: 'other-user' }
        });
        prisma.messageAttachment.findUnique.mockResolvedValue(attachment);
        prisma.conversationMember.findFirst.mockResolvedValue({
          userId: 'user-123',
          conversationId: 'conv-123',
          isActive: true
        });

        const result = await service.translate('user-123', 'att-123', {
          targetLanguages: ['fr']
        });

        expect(result.errorCode).not.toBe('ACCESS_DENIED');
      });
    });
  });

  // =========================================================================
  // translateAudio() - AUDIO TRANSLATION
  // =========================================================================

  describe('translateAudio()', () => {
    beforeEach(() => {
      prisma.userVoiceModel.findUnique.mockResolvedValue(null);
    });

    describe('Cache Hit (all languages already translated)', () => {
      it('should return cached translations without calling AudioTranslateService', async () => {
        const cachedTranslationsJSON = createMockTranslationsJSON(['fr', 'es']);
        const attachment = createMockAttachment({
          translations: cachedTranslationsJSON
        });

        // Call sequence:
        // 1. Get attachment for translate()
        // 2. Get attachment for _findOriginalAttachmentAndSender (not forwarded, returns immediately)
        // 3. Get attachment with transcription for existingTranscription check
        // 4. Get attachment with translations for cache check
        prisma.messageAttachment.findUnique
          .mockResolvedValueOnce(attachment)                                    // 1. Initial attachment
          .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-123' } }) // 2. _findOriginalAttachmentAndSender
          .mockResolvedValueOnce({ transcription: null })                       // 3. Transcription check
          .mockResolvedValueOnce({ translations: cachedTranslationsJSON });     // 4. Cache check

        const result = await service.translate('user-123', 'att-123', {
          targetLanguages: ['fr', 'es']
        });

        expect(result.success).toBe(true);
        expect(result.data?.type).toBe('audio');
        expect(mockAudioTranslateService.translateSync).not.toHaveBeenCalled();
        expect(mockAudioTranslateService.translateAsync).not.toHaveBeenCalled();

        const audioResult = result.data?.result as any;
        expect(audioResult.translationId).toContain('cached_');
        expect(audioResult.translations).toHaveLength(2);
      });

      it('should copy translations for forwarded attachments on cache hit', async () => {
        const transcriptionJSON = createMockTranscriptionJSON();
        const cachedTranslationsJSON = createMockTranslationsJSON(['fr']);
        const originalAttachment = createMockAttachment({
          id: 'att-original',
          translations: cachedTranslationsJSON,
          transcription: transcriptionJSON
        });

        const forwardedAttachment = createMockAttachment({
          id: 'att-forwarded',
          isForwarded: true,
          forwardedFromAttachmentId: 'att-original',
          translations: null, // No translations yet
          message: { id: 'msg-forwarded', conversationId: 'conv-456', senderId: 'user-forwarder' }
        });

        // Call sequence:
        // 1. Get forwarded attachment for translate()
        // 2. Get forwarded attachment for _findOriginalAttachmentAndSender (has parent)
        // 3. Get original attachment in _findOriginalAttachmentAndSender chain (no parent)
        // 4. Get original attachment with transcription
        // 5. Get original attachment with translations (for cache check) - CACHE HIT
        // 6. Get original attachment for _copyTranslationsForForward
        prisma.messageAttachment.findUnique
          .mockResolvedValueOnce(forwardedAttachment)                           // 1
          .mockResolvedValueOnce({ forwardedFromAttachmentId: 'att-original', message: { senderId: 'user-forwarder' } }) // 2
          .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-original' } })  // 3
          .mockResolvedValueOnce({ transcription: transcriptionJSON })          // 4
          .mockResolvedValueOnce({ translations: cachedTranslationsJSON })      // 5 - CACHE HIT
          .mockResolvedValueOnce({ transcription: transcriptionJSON, translations: cachedTranslationsJSON }); // 6

        prisma.messageAttachment.update.mockResolvedValue({});

        const result = await service.translate('user-forwarder', 'att-forwarded', {
          targetLanguages: ['fr']
        });

        expect(result.success).toBe(true);
        expect(prisma.messageAttachment.update).toHaveBeenCalled();
      });
    });

    describe('Partial Cache (some languages in cache)', () => {
      it('should only translate missing languages', async () => {
        const cachedTranslationsJSON = createMockTranslationsJSON(['fr']);
        const attachment = createMockAttachment({
          translations: cachedTranslationsJSON
        });

        // Call sequence:
        // 1. Get attachment for translate()
        // 2. Get attachment for _findOriginalAttachmentAndSender (not forwarded)
        // 3. Get attachment with transcription
        // 4. Get attachment with translations for cache check (has 'fr')
        prisma.messageAttachment.findUnique
          .mockResolvedValueOnce(attachment)                                    // 1
          .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-123' } }) // 2
          .mockResolvedValueOnce({ transcription: null })                       // 3
          .mockResolvedValueOnce({ translations: cachedTranslationsJSON });     // 4

        mockAudioTranslateService.translateSync.mockResolvedValue({
          translationId: 'trans-new',
          originalAudio: { transcription: 'Hello', language: 'en', durationMs: 3000, confidence: 0.95 },
          translations: [{ targetLanguage: 'es', translatedText: 'Hola', audioUrl: '/audio-es.webm', durationMs: 3000 }],
          processingTimeMs: 1000
        });

        const result = await service.translate('user-123', 'att-123', {
          targetLanguages: ['fr', 'es']
        });

        expect(result.success).toBe(true);
        expect(mockAudioTranslateService.translateSync).toHaveBeenCalledWith(
          'user-123',
          expect.objectContaining({
            targetLanguages: ['es'] // Only Spanish, French was cached
          })
        );

        const audioResult = result.data?.result as any;
        expect(audioResult.translations).toHaveLength(2); // Both fr (cached) and es (new)
      });
    });

    describe('Sync vs Async Mode', () => {
      it('should call translateSync when async is false', async () => {
        const attachment = createMockAttachment();
        prisma.messageAttachment.findUnique
          .mockResolvedValueOnce(attachment)
          .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-123' } })
          .mockResolvedValueOnce({ transcription: null })
          .mockResolvedValueOnce({ translations: null });
        mockAudioTranslateService.translateSync.mockResolvedValue({
          translationId: 'trans-sync',
          originalAudio: { transcription: 'Hello', language: 'en', durationMs: 3000, confidence: 0.95 },
          translations: [],
          processingTimeMs: 1000
        });

        await service.translate('user-123', 'att-123', {
          targetLanguages: ['fr'],
          async: false
        });

        expect(mockAudioTranslateService.translateSync).toHaveBeenCalled();
        expect(mockAudioTranslateService.translateAsync).not.toHaveBeenCalled();
      });

      it('should call translateAsync when async is true', async () => {
        const attachment = createMockAttachment();
        prisma.messageAttachment.findUnique
          .mockResolvedValueOnce(attachment)
          .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-123' } })
          .mockResolvedValueOnce({ transcription: null })
          .mockResolvedValueOnce({ translations: null });
        mockAudioTranslateService.translateAsync.mockResolvedValue({
          jobId: 'job-123',
          status: 'queued'
        });

        const result = await service.translate('user-123', 'att-123', {
          targetLanguages: ['fr'],
          async: true,
          webhookUrl: 'https://example.com/webhook',
          priority: 5
        });

        expect(mockAudioTranslateService.translateAsync).toHaveBeenCalled();
        expect(mockAudioTranslateService.translateSync).not.toHaveBeenCalled();
        expect(result.success).toBe(true);

        const asyncResult = result.data?.result as any;
        expect(asyncResult.jobId).toBe('job-123');
        expect(asyncResult.status).toBe('queued');
      });
    });

    describe('Forwarded Attachments Support', () => {
      it('should use original sender voice for forwarded attachments', async () => {
        const forwardedAttachment = createMockAttachment({
          id: 'att-forwarded',
          isForwarded: true,
          forwardedFromAttachmentId: 'att-original',
          uploadedBy: 'user-forwarder',
          message: { id: 'msg-fwd', conversationId: 'conv-123', senderId: 'user-forwarder' }
        });

        const voiceModel = createMockVoiceModel({ userId: 'user-original' });

        // Call sequence:
        // 1. Get forwarded attachment for translate()
        // 2. Get forwarded attachment for _findOriginalAttachmentAndSender (has parent)
        // 3. Get original attachment in chain (no parent) - gets senderId 'user-original'
        // 4. Get original attachment with transcription
        // 5. Get original attachment with translations for cache check (no translations)
        prisma.messageAttachment.findUnique
          .mockResolvedValueOnce(forwardedAttachment)                           // 1
          .mockResolvedValueOnce({ forwardedFromAttachmentId: 'att-original', message: { senderId: 'user-forwarder' } }) // 2
          .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-original' } }) // 3
          .mockResolvedValueOnce({ transcription: null })                       // 4
          .mockResolvedValueOnce({ translations: null });                       // 5

        // Voice profile lookup is for 'user-original' (because useOriginalVoice=true and originalSenderId='user-original')
        prisma.userVoiceModel.findUnique.mockResolvedValue(voiceModel);
        mockAudioTranslateService.translateSync.mockResolvedValue({
          translationId: 'trans-123',
          originalAudio: { transcription: 'Hello', language: 'en', durationMs: 3000, confidence: 0.95 },
          translations: [],
          processingTimeMs: 1000
        });

        await service.translate('user-forwarder', 'att-forwarded', {
          targetLanguages: ['fr'],
          useOriginalVoice: true
        });

        expect(mockAudioTranslateService.translateSync).toHaveBeenCalledWith(
          'user-forwarder',
          expect.objectContaining({
            originalSenderId: 'user-original',
            useOriginalVoice: true
          })
        );
      });
    });

    describe('Translation Error Handling', () => {
      it('should return TRANSLATION_ERROR when AudioTranslateService throws', async () => {
        const attachment = createMockAttachment();
        prisma.messageAttachment.findUnique
          .mockResolvedValueOnce(attachment)
          .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-123' } })
          .mockResolvedValueOnce({ transcription: null })
          .mockResolvedValueOnce({ translations: null });
        mockAudioTranslateService.translateSync.mockRejectedValue(new Error('Translation service unavailable'));

        const result = await service.translate('user-123', 'att-123', {
          targetLanguages: ['fr']
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('TRANSLATION_ERROR');
        expect(result.error).toBe('Translation service unavailable');
      });
    });
  });

  // =========================================================================
  // _findOriginalAttachmentAndSender() - FORWARD CHAIN RESOLUTION
  // =========================================================================

  describe('_findOriginalAttachmentAndSender()', () => {
    it('should return current attachment ID when not forwarded', async () => {
      const attachment = createMockAttachment({
        id: 'att-123',
        forwardedFromAttachmentId: null,
        message: { id: 'msg-123', conversationId: 'conv-123', senderId: 'user-sender' }
      });

      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce(attachment)
        .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-sender' } })
        .mockResolvedValueOnce({ transcription: null })
        .mockResolvedValueOnce({ translations: null });

      mockAudioTranslateService.translateSync.mockResolvedValue({
        translationId: 'trans-123',
        originalAudio: { transcription: 'Hello', language: 'en', durationMs: 3000, confidence: 0.95 },
        translations: [],
        processingTimeMs: 1000
      });

      await service.translate('user-sender', 'att-123', {
        targetLanguages: ['fr']
      });

      // Should use the attachment's own sender
      expect(mockAudioTranslateService.translateSync).toHaveBeenCalledWith(
        'user-sender',
        expect.objectContaining({
          originalSenderId: 'user-sender'
        })
      );
    });

    it('should traverse one level of forwarding (A -> B)', async () => {
      const attachmentB = createMockAttachment({
        id: 'att-B',
        forwardedFromAttachmentId: 'att-A',
        message: { id: 'msg-B', conversationId: 'conv-123', senderId: 'user-B' }
      });

      // Call sequence:
      // 1. Get attachmentB for translate()
      // 2. Get attachmentB for _findOriginalAttachmentAndSender (has parent att-A)
      // 3. Get attachmentA in chain (no parent) - returns senderId 'user-A'
      // 4. Get attachmentA (original) with transcription
      // 5. Get attachmentA (original) with translations for cache check
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce(attachmentB)                                       // 1
        .mockResolvedValueOnce({ forwardedFromAttachmentId: 'att-A', message: { senderId: 'user-B' } }) // 2
        .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-A' } })    // 3
        .mockResolvedValueOnce({ transcription: null })                           // 4
        .mockResolvedValueOnce({ translations: null });                           // 5

      prisma.userVoiceModel.findUnique.mockResolvedValue(null);
      mockAudioTranslateService.translateSync.mockResolvedValue({
        translationId: 'trans-123',
        originalAudio: { transcription: 'Hello', language: 'en', durationMs: 3000, confidence: 0.95 },
        translations: [],
        processingTimeMs: 1000
      });

      await service.translate('user-B', 'att-B', {
        targetLanguages: ['fr']
      });

      expect(mockAudioTranslateService.translateSync).toHaveBeenCalledWith(
        'user-B',
        expect.objectContaining({
          originalSenderId: 'user-A'
        })
      );
    });

    it('should traverse multiple levels of forwarding (A -> B -> C -> D)', async () => {
      const attachmentD = createMockAttachment({
        id: 'att-D',
        forwardedFromAttachmentId: 'att-C',
        message: { id: 'msg-D', conversationId: 'conv-123', senderId: 'user-D' }
      });

      // Call sequence:
      // 1. Get attachmentD for translate()
      // 2-5. Traverse chain: D -> C -> B -> A (finding originalSenderId)
      // 6. Get attachmentA (original) with transcription
      // 7. Get attachmentA (original) with translations for cache check
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce(attachmentD)                                       // 1
        .mockResolvedValueOnce({ forwardedFromAttachmentId: 'att-C', message: { senderId: 'user-D' } }) // 2
        .mockResolvedValueOnce({ forwardedFromAttachmentId: 'att-B', message: { senderId: 'user-C' } }) // 3
        .mockResolvedValueOnce({ forwardedFromAttachmentId: 'att-A', message: { senderId: 'user-B' } }) // 4
        .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-A' } })    // 5
        .mockResolvedValueOnce({ transcription: null })                           // 6
        .mockResolvedValueOnce({ translations: null });                           // 7

      prisma.userVoiceModel.findUnique.mockResolvedValue(null);
      mockAudioTranslateService.translateSync.mockResolvedValue({
        translationId: 'trans-123',
        originalAudio: { transcription: 'Hello', language: 'en', durationMs: 3000, confidence: 0.95 },
        translations: [],
        processingTimeMs: 1000
      });

      await service.translate('user-D', 'att-D', {
        targetLanguages: ['fr']
      });

      expect(mockAudioTranslateService.translateSync).toHaveBeenCalledWith(
        'user-D',
        expect.objectContaining({
          originalSenderId: 'user-A'
        })
      );
    });

    it('should protect against infinite loops (MAX_CHAIN_DEPTH = 10)', async () => {
      const attachmentStart = createMockAttachment({
        id: 'att-start',
        forwardedFromAttachmentId: 'att-prev',
        message: { id: 'msg-start', conversationId: 'conv-123', senderId: 'user-start' }
      });

      // Create a chain of 15 forwards (exceeds MAX_CHAIN_DEPTH of 10)
      // Sequence: initial attachment, then traverse chain (max 10 levels), then transcription, then translations
      let callCount = 0;
      prisma.messageAttachment.findUnique.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Initial attachment retrieval
          return Promise.resolve(attachmentStart);
        }
        if (callCount <= 11) {
          // Chain traversal (up to MAX_CHAIN_DEPTH=10)
          return Promise.resolve({
            forwardedFromAttachmentId: `att-${callCount}`,
            message: { senderId: `user-${callCount}` }
          });
        }
        if (callCount === 12) {
          // After MAX_CHAIN_DEPTH reached, check last attachment
          return Promise.resolve({
            message: { senderId: 'user-end' }
          });
        }
        if (callCount === 13) {
          // Transcription check on the final attachment
          return Promise.resolve({ transcription: null });
        }
        if (callCount === 14) {
          // Translations check on the final attachment
          return Promise.resolve({ translations: null });
        }
        return Promise.resolve({ forwardedFromAttachmentId: null, message: { senderId: 'user-end' } });
      });

      prisma.userVoiceModel.findUnique.mockResolvedValue(null);
      mockAudioTranslateService.translateSync.mockResolvedValue({
        translationId: 'trans-123',
        originalAudio: { transcription: 'Hello', language: 'en', durationMs: 3000, confidence: 0.95 },
        translations: [],
        processingTimeMs: 1000
      });

      // Should not hang or crash
      const result = await service.translate('user-start', 'att-start', {
        targetLanguages: ['fr']
      });

      expect(result.success).toBe(true);
      // The chain should be cut off at MAX_CHAIN_DEPTH
    });
  });

  // =========================================================================
  // _getVoiceProfile() - VOICE PROFILE RETRIEVAL
  // =========================================================================

  describe('_getVoiceProfile()', () => {
    it('should return voice profile data when it exists', async () => {
      const voiceModel = createMockVoiceModel({
        userId: 'user-123',
        profileId: 'vfp_user123',
        embedding: Buffer.from('voice-embedding-data'),
        qualityScore: 0.92,
        fingerprint: { pitch: 150, tempo: 1.0 },
        voiceCharacteristics: { gender: 'male', age: 30 },
        version: 2,
        audioCount: 10,
        totalDurationMs: 30000
      });

      const attachment = createMockAttachment();
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce(attachment)
        .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-123' } })
        .mockResolvedValueOnce({ transcription: null })
        .mockResolvedValueOnce({ translations: null });
      prisma.userVoiceModel.findUnique.mockResolvedValue(voiceModel);
      mockAudioTranslateService.translateSync.mockResolvedValue({
        translationId: 'trans-123',
        originalAudio: { transcription: 'Hello', language: 'en', durationMs: 3000, confidence: 0.95 },
        translations: [],
        processingTimeMs: 1000
      });

      await service.translate('user-123', 'att-123', {
        targetLanguages: ['fr']
      });

      expect(mockAudioTranslateService.translateSync).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          existingVoiceProfile: expect.objectContaining({
            profileId: 'vfp_user123',
            userId: 'user-123',
            qualityScore: 0.92
          })
        })
      );
    });

    it('should return null when voice profile does not exist', async () => {
      const attachment = createMockAttachment();
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce(attachment)
        .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-123' } })
        .mockResolvedValueOnce({ transcription: null })
        .mockResolvedValueOnce({ translations: null });
      prisma.userVoiceModel.findUnique.mockResolvedValue(null);
      mockAudioTranslateService.translateSync.mockResolvedValue({
        translationId: 'trans-123',
        originalAudio: { transcription: 'Hello', language: 'en', durationMs: 3000, confidence: 0.95 },
        translations: [],
        processingTimeMs: 1000
      });

      await service.translate('user-123', 'att-123', {
        targetLanguages: ['fr']
      });

      expect(mockAudioTranslateService.translateSync).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          existingVoiceProfile: undefined
        })
      );
    });

    it('should return null when voice model has no embedding', async () => {
      const voiceModel = createMockVoiceModel({
        embedding: null
      });

      const attachment = createMockAttachment();
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce(attachment)
        .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-123' } })
        .mockResolvedValueOnce({ transcription: null })
        .mockResolvedValueOnce({ translations: null });
      prisma.userVoiceModel.findUnique.mockResolvedValue(voiceModel);
      mockAudioTranslateService.translateSync.mockResolvedValue({
        translationId: 'trans-123',
        originalAudio: { transcription: 'Hello', language: 'en', durationMs: 3000, confidence: 0.95 },
        translations: [],
        processingTimeMs: 1000
      });

      await service.translate('user-123', 'att-123', {
        targetLanguages: ['fr']
      });

      expect(mockAudioTranslateService.translateSync).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          existingVoiceProfile: undefined
        })
      );
    });

    it('should return null on DB error', async () => {
      const attachment = createMockAttachment();
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce(attachment)
        .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-123' } })
        .mockResolvedValueOnce({ transcription: null })
        .mockResolvedValueOnce({ translations: null });
      prisma.userVoiceModel.findUnique.mockRejectedValue(new Error('DB connection failed'));
      mockAudioTranslateService.translateSync.mockResolvedValue({
        translationId: 'trans-123',
        originalAudio: { transcription: 'Hello', language: 'en', durationMs: 3000, confidence: 0.95 },
        translations: [],
        processingTimeMs: 1000
      });

      // Should not throw, should gracefully handle
      const result = await service.translate('user-123', 'att-123', {
        targetLanguages: ['fr']
      });

      expect(result.success).toBe(true);
      expect(mockAudioTranslateService.translateSync).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          existingVoiceProfile: undefined
        })
      );
    });
  });

  // =========================================================================
  // _copyTranslationsForForward() - FORWARD TRANSLATION COPY
  // =========================================================================

  describe('_copyTranslationsForForward()', () => {
    it('should copy transcription and translations using JSON fields', async () => {
      const transcriptionJSON = createMockTranscriptionJSON({
        text: 'Hello world',
        durationMs: 3000
      });
      const cachedTranslationsJSON = createMockTranslationsJSON(['fr']);

      const originalAttachment = createMockAttachment({
        id: 'att-original',
        transcription: transcriptionJSON,
        translations: cachedTranslationsJSON
      });

      const forwardedAttachment = createMockAttachment({
        id: 'att-forwarded',
        isForwarded: true,
        forwardedFromAttachmentId: 'att-original',
        transcription: null,
        translations: null,
        message: { id: 'msg-forwarded', conversationId: 'conv-123', senderId: 'user-forwarder' }
      });

      // Call sequence:
      // 1. Get forwarded attachment (for translate())
      // 2. Get forwarded attachment (for _findOriginalAttachmentAndSender)
      // 3. Get original attachment in chain (no parent)
      // 4. Get original attachment with transcription
      // 5. Get original attachment with translations for cache check - CACHE HIT
      // 6. Get original attachment (for _copyTranslationsForForward)
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce(forwardedAttachment)                           // 1
        .mockResolvedValueOnce({ forwardedFromAttachmentId: 'att-original', message: { senderId: 'user-forwarder' } }) // 2
        .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-original' } })  // 3
        .mockResolvedValueOnce({ transcription: transcriptionJSON })          // 4
        .mockResolvedValueOnce({ translations: cachedTranslationsJSON })      // 5 - CACHE HIT
        .mockResolvedValueOnce(originalAttachment);                           // 6

      prisma.messageAttachment.update.mockResolvedValue({});

      await service.translate('user-forwarder', 'att-forwarded', {
        targetLanguages: ['fr']
      });

      // Should have updated the forwarded attachment with transcription
      expect(prisma.messageAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att-forwarded' },
          data: expect.objectContaining({
            transcription: expect.objectContaining({
              text: 'Hello world',
              durationMs: 3000
            })
          })
        })
      );

      // Should have updated the forwarded attachment with translations
      expect(prisma.messageAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att-forwarded' },
          data: expect.objectContaining({
            translations: cachedTranslationsJSON
          })
        })
      );
    });

    it('should copy multiple translations', async () => {
      const cachedTranslationsJSON = createMockTranslationsJSON(['fr', 'es']);

      const originalAttachment = createMockAttachment({
        id: 'att-original',
        translations: cachedTranslationsJSON
      });

      const forwardedAttachment = createMockAttachment({
        id: 'att-forwarded',
        isForwarded: true,
        forwardedFromAttachmentId: 'att-original',
        translations: null,
        message: { id: 'msg-forwarded', conversationId: 'conv-123', senderId: 'user-forwarder' }
      });

      // Call sequence:
      // 1. Get forwarded attachment
      // 2. Get forwarded attachment for _findOriginalAttachmentAndSender
      // 3. Get original attachment in chain
      // 4. Get original attachment with transcription
      // 5. Get original attachment with translations for cache check - CACHE HIT
      // 6. Get original attachment for _copyTranslationsForForward
      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce(forwardedAttachment)
        .mockResolvedValueOnce({ forwardedFromAttachmentId: 'att-original', message: { senderId: 'user-forwarder' } })
        .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-original' } })
        .mockResolvedValueOnce({ transcription: null })
        .mockResolvedValueOnce({ translations: cachedTranslationsJSON })
        .mockResolvedValueOnce({ transcription: null, translations: cachedTranslationsJSON });

      prisma.messageAttachment.update.mockResolvedValue({});

      await service.translate('user-forwarder', 'att-forwarded', {
        targetLanguages: ['fr', 'es']
      });

      // Should copy both translations in one update
      expect(prisma.messageAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att-forwarded' },
          data: expect.objectContaining({
            translations: expect.objectContaining({
              fr: expect.any(Object),
              es: expect.any(Object)
            })
          })
        })
      );
    });

    it('should handle errors gracefully during copy', async () => {
      const cachedTranslationsJSON = createMockTranslationsJSON(['fr']);

      const forwardedAttachment = createMockAttachment({
        id: 'att-forwarded',
        isForwarded: true,
        forwardedFromAttachmentId: 'att-original',
        message: { id: 'msg-forwarded', conversationId: 'conv-123', senderId: 'user-forwarder' }
      });

      prisma.messageAttachment.findUnique
        .mockResolvedValueOnce(forwardedAttachment)
        .mockResolvedValueOnce({ translations: cachedTranslationsJSON })
        .mockResolvedValueOnce({ forwardedFromAttachmentId: 'att-original', message: { senderId: 'user-forwarder' } })
        .mockResolvedValueOnce({ forwardedFromAttachmentId: null, message: { senderId: 'user-original' } })
        .mockRejectedValueOnce(new Error('DB error during copy')); // Error on _copyTranslationsForForward

      // Should not throw, should complete gracefully
      const result = await service.translate('user-forwarder', 'att-forwarded', {
        targetLanguages: ['fr']
      });

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // getTranslationStatus() - ASYNC JOB STATUS
  // =========================================================================

  describe('getTranslationStatus()', () => {
    it('should return job status from AudioTranslateService', async () => {
      mockAudioTranslateService.getJobStatus.mockResolvedValue({
        status: 'processing',
        progress: 45,
        result: null
      });

      const result = await service.getTranslationStatus('user-123', 'job-456');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        status: 'processing',
        progress: 45,
        result: null
      });
      expect(mockAudioTranslateService.getJobStatus).toHaveBeenCalledWith('user-123', 'job-456');
    });

    it('should return completed status with result', async () => {
      mockAudioTranslateService.getJobStatus.mockResolvedValue({
        status: 'completed',
        progress: 100,
        result: {
          translationId: 'trans-123',
          translations: [{ targetLanguage: 'fr', translatedText: 'Bonjour' }]
        }
      });

      const result = await service.getTranslationStatus('user-123', 'job-456');

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('completed');
      expect(result.data?.progress).toBe(100);
      expect(result.data?.result).toBeDefined();
    });

    it('should return error on job status failure', async () => {
      mockAudioTranslateService.getJobStatus.mockRejectedValue(new Error('Job not found'));

      const result = await service.getTranslationStatus('user-123', 'invalid-job');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('JOB_STATUS_ERROR');
      expect(result.error).toBe('Job not found');
    });
  });

  // =========================================================================
  // cancelTranslation() - ASYNC JOB CANCELLATION
  // =========================================================================

  describe('cancelTranslation()', () => {
    it('should cancel job successfully', async () => {
      mockAudioTranslateService.cancelJob.mockResolvedValue({ success: true });

      const result = await service.cancelTranslation('user-123', 'job-456');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ cancelled: true });
      expect(mockAudioTranslateService.cancelJob).toHaveBeenCalledWith('user-123', 'job-456');
    });

    it('should return cancelled: false when cancellation fails', async () => {
      mockAudioTranslateService.cancelJob.mockResolvedValue({ success: false });

      const result = await service.cancelTranslation('user-123', 'job-456');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ cancelled: false });
    });

    it('should return error when cancellation throws', async () => {
      mockAudioTranslateService.cancelJob.mockRejectedValue(new Error('Cannot cancel completed job'));

      const result = await service.cancelTranslation('user-123', 'job-456');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('JOB_CANCEL_ERROR');
      expect(result.error).toBe('Cannot cancel completed job');
    });
  });

  // =========================================================================
  // EXISTING TESTS (Structure tests)
  // =========================================================================

  describe('TranslateOptions Structure', () => {
    it('should have correct translate options structure', () => {
      const options = {
        targetLanguages: ['fr', 'es', 'de'],
        sourceLanguage: 'en',
        generateVoiceClone: true,
        async: false,
        webhookUrl: undefined,
        priority: 5
      };

      expect(Array.isArray(options.targetLanguages)).toBe(true);
      expect(options.targetLanguages.length).toBeGreaterThan(0);
      expect(typeof options.generateVoiceClone).toBe('boolean');
    });

    it('should support async options', () => {
      const options = {
        targetLanguages: ['fr'],
        async: true,
        webhookUrl: 'https://example.com/webhook',
        priority: 10
      };

      expect(options.async).toBe(true);
      expect(options.webhookUrl).toMatch(/^https?:\/\//);
      expect(options.priority).toBeGreaterThanOrEqual(1);
      expect(options.priority).toBeLessThanOrEqual(10);
    });

    it('should support useOriginalVoice option', () => {
      const options = {
        targetLanguages: ['fr'],
        useOriginalVoice: true
      };

      expect(options.useOriginalVoice).toBe(true);
    });
  });

  describe('TranslationResult Structure', () => {
    it('should have correct audio translation result', () => {
      const result = {
        type: 'audio',
        attachmentId: 'att-123',
        result: {
          translationId: 'trans-456',
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
              audioBase64: 'base64-data',
              durationMs: 2100,
              voiceCloned: true
            }
          ],
          processingTimeMs: 3500
        }
      };

      expect(result.type).toBe('audio');
      expect(result.attachmentId).toBeDefined();
      expect(result.result.translationId).toBeDefined();
    });

    it('should have correct image translation result structure', () => {
      const result = {
        type: 'image',
        attachmentId: 'att-789',
        result: {
          translationId: 'trans-101',
          originalText: 'Stop',
          translations: [
            {
              targetLanguage: 'fr',
              translatedText: 'Arretez',
              overlayImageUrl: '/attachments/overlay-123.png'
            }
          ]
        }
      };

      expect(result.type).toBe('image');
      expect(result.result.originalText).toBeDefined();
    });

    it('should have correct document translation result structure', () => {
      const result = {
        type: 'document',
        attachmentId: 'att-doc',
        result: {
          translationId: 'trans-doc',
          originalText: 'Document content here',
          translations: [
            {
              targetLanguage: 'es',
              translatedText: 'Contenido del documento aqui',
              translatedDocumentUrl: '/attachments/translated-doc.pdf'
            }
          ]
        }
      };

      expect(result.type).toBe('document');
      expect(result.result.translations[0].translatedDocumentUrl).toBeDefined();
    });
  });

  describe('Service Result Structure', () => {
    it('should have correct success result', () => {
      const result = {
        success: true,
        data: {
          type: 'audio',
          attachmentId: 'att-123',
          result: { translationId: 'trans-123' }
        }
      };

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.type).toBe('audio');
    });

    it('should have correct error result for not found', () => {
      const result = {
        success: false,
        error: 'Attachment not found',
        errorCode: 'ATTACHMENT_NOT_FOUND'
      };

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ATTACHMENT_NOT_FOUND');
    });

    it('should have correct error result for access denied', () => {
      const result = {
        success: false,
        error: 'Access denied to this attachment',
        errorCode: 'ACCESS_DENIED'
      };

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ACCESS_DENIED');
    });

    it('should have correct error result for unsupported type', () => {
      const result = {
        success: false,
        error: 'Unsupported attachment type: application/octet-stream',
        errorCode: 'UNSUPPORTED_TYPE'
      };

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('UNSUPPORTED_TYPE');
    });

    it('should have correct error result for not implemented', () => {
      const result = {
        success: false,
        error: 'Image translation not yet implemented',
        errorCode: 'NOT_IMPLEMENTED'
      };

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NOT_IMPLEMENTED');
    });
  });

  describe('User Access Verification', () => {
    it('should allow access for attachment owner', () => {
      const attachment = {
        uploadedBy: 'user-123',
        message: null
      };
      const userId = 'user-123';

      const isOwner = attachment.uploadedBy === userId;
      expect(isOwner).toBe(true);
    });

    it('should allow access for conversation member', () => {
      const attachment = {
        uploadedBy: 'user-456',
        message: {
          conversationId: 'conv-789'
        }
      };

      // Simulating conversation member check
      const isMember = true; // Would be checked via prisma
      expect(isMember).toBe(true);
    });

    it('should deny access for non-member', () => {
      const attachment = {
        uploadedBy: 'user-456',
        message: {
          conversationId: 'conv-789'
        }
      };
      const userId = 'user-other';

      const isOwner = attachment.uploadedBy === userId;
      expect(isOwner).toBe(false);
    });
  });
});

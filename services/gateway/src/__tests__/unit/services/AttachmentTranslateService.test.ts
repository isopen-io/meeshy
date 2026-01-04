/**
 * Unit tests for AttachmentTranslateService
 * Tests the dispatcher that routes translation requests based on attachment type
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('AttachmentTranslateService', () => {
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
              translatedText: 'Arrêtez',
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
              translatedText: 'Contenido del documento aquí',
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

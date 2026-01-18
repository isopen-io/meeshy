/**
 * Test Rétrocompatibilité - Legacy Base64 Format
 *
 * Vérifie que le système fonctionne toujours avec :
 * - L'ancien format base64 JSON (sans multipart)
 * - Le nouveau format multipart
 * - Mix des deux formats
 *
 * Garantit qu'une mise à jour progressive est possible
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

const prisma = new PrismaClient();

// Mock MessageTranslationService (implémente fallback base64)
class BackwardCompatibleService extends EventEmitter {
  constructor(private prisma: PrismaClient) {
    super();
  }

  async handleAudioProcessCompleted(data: any) {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: data.attachmentId },
      select: { id: true, messageId: true, duration: true }
    });

    if (!attachment) {
      throw new Error(`Attachment non trouvé: ${data.attachmentId}`);
    }

    // Sauvegarder transcription
    await this.prisma.messageAudioTranscription.upsert({
      where: { attachmentId: data.attachmentId },
      update: {
        transcribedText: data.transcription.text,
        language: data.transcription.language,
        confidence: data.transcription.confidence,
        source: data.transcription.source,
        segments: data.transcription.segments || null,
        audioDurationMs: attachment.duration || 0
      },
      create: {
        attachmentId: data.attachmentId,
        messageId: data.messageId,
        transcribedText: data.transcription.text,
        language: data.transcription.language,
        confidence: data.transcription.confidence,
        source: data.transcription.source,
        segments: data.transcription.segments || null,
        audioDurationMs: attachment.duration || 0
      }
    });

    // Sauvegarder audios traduits avec FALLBACK BASE64
    for (const translatedAudio of data.translatedAudios) {
      let localAudioPath = translatedAudio.audioPath;
      let localAudioUrl = translatedAudio.audioUrl;

      // MULTIPART (nouveau) > BASE64 (legacy)
      const audioBinary = translatedAudio._audioBinary;
      const audioBase64 = translatedAudio.audioDataBase64;

      if (audioBinary || audioBase64) {
        const translatedDir = path.resolve(process.cwd(), 'uploads/attachments/translated');
        await fs.mkdir(translatedDir, { recursive: true });

        const ext = translatedAudio.audioMimeType?.replace('audio/', '') || 'mp3';
        const filename = `${data.attachmentId}_${translatedAudio.targetLanguage}.${ext}`;
        localAudioPath = path.resolve(translatedDir, filename);

        // FALLBACK: utiliser base64 si pas de binaire
        const audioBuffer = audioBinary || Buffer.from(audioBase64!, 'base64');
        await fs.writeFile(localAudioPath, audioBuffer);

        localAudioUrl = `/api/v1/attachments/file/translated/${filename}`;
      }

      await this.prisma.messageTranslatedAudio.upsert({
        where: {
          attachmentId_targetLanguage: {
            attachmentId: data.attachmentId,
            targetLanguage: translatedAudio.targetLanguage
          }
        },
        update: {
          translatedText: translatedAudio.translatedText,
          audioPath: localAudioPath,
          audioUrl: localAudioUrl,
          durationMs: translatedAudio.durationMs,
          voiceCloned: translatedAudio.voiceCloned,
          voiceQuality: translatedAudio.voiceQuality,
          voiceModelId: data.voiceModelUserId || null
        },
        create: {
          attachmentId: data.attachmentId,
          messageId: data.messageId,
          targetLanguage: translatedAudio.targetLanguage,
          translatedText: translatedAudio.translatedText,
          audioPath: localAudioPath,
          audioUrl: localAudioUrl,
          durationMs: translatedAudio.durationMs,
          voiceCloned: translatedAudio.voiceCloned,
          voiceQuality: translatedAudio.voiceQuality,
          voiceModelId: data.voiceModelUserId || null
        }
      });
    }

    // Sauvegarder profil vocal avec FALLBACK BASE64
    if (data.newVoiceProfile) {
      const nvp = data.newVoiceProfile;

      // FALLBACK: binaire multipart > base64 legacy
      const embeddingBuffer = nvp._embeddingBinary || (nvp.embedding ? Buffer.from(nvp.embedding, 'base64') : null);

      if (!embeddingBuffer) {
        throw new Error('Missing embedding data');
      }

      await this.prisma.userVoiceModel.upsert({
        where: { userId: nvp.userId },
        update: {
          profileId: nvp.profileId,
          embedding: embeddingBuffer,
          qualityScore: nvp.qualityScore,
          audioCount: nvp.audioCount,
          totalDurationMs: nvp.totalDurationMs,
          version: nvp.version,
          fingerprint: nvp.fingerprint || null,
          voiceCharacteristics: nvp.voiceCharacteristics || null,
          updatedAt: new Date()
        },
        create: {
          userId: nvp.userId,
          profileId: nvp.profileId,
          embedding: embeddingBuffer,
          qualityScore: nvp.qualityScore,
          audioCount: nvp.audioCount,
          totalDurationMs: nvp.totalDurationMs,
          version: nvp.version,
          fingerprint: nvp.fingerprint || null,
          voiceCharacteristics: nvp.voiceCharacteristics || null
        }
      });
    }
  }
}

describe('Backward Compatibility - Legacy Base64 Format', () => {
  let service: BackwardCompatibleService;
  let testUserId: string;
  let testConversationId: string;
  let testMessageId: string;
  let testAttachmentId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    service = new BackwardCompatibleService(prisma);

    testUserId = `test_compat_${Date.now()}`;

    const user = await prisma.user.create({
      data: {
        id: testUserId,
        username: `testcompat_${Date.now()}`,
        email: `compat_${Date.now()}@example.com`,
        passwordHash: 'fake_hash',
        displayName: 'Test Compat User'
      }
    });

    testConversationId = `test_conv_compat_${Date.now()}`;
    await prisma.conversation.create({
      data: {
        id: testConversationId,
        conversationType: 'DIRECT',
        participants: {
          create: {
            userId: user.id,
            role: 'MEMBER'
          }
        }
      }
    });

    testMessageId = `test_msg_compat_${Date.now()}`;
    const message = await prisma.message.create({
      data: {
        id: testMessageId,
        conversationId: testConversationId,
        senderId: user.id,
        content: 'Test compat',
        messageType: 'AUDIO',
        originalLanguage: 'en'
      }
    });

    testAttachmentId = `test_att_compat_${Date.now()}`;
    await prisma.messageAttachment.create({
      data: {
        id: testAttachmentId,
        messageId: message.id,
        attachmentType: 'AUDIO',
        fileUrl: '/fake/audio.mp3',
        filePath: '/fake/audio.mp3',
        duration: 5000
      }
    });
  });

  afterEach(async () => {
    // Nettoyer fichiers
    try {
      const translatedDir = path.resolve(process.cwd(), 'uploads/attachments/translated');
      const files = await fs.readdir(translatedDir);
      for (const file of files) {
        if (file.startsWith(testAttachmentId)) {
          await fs.unlink(path.resolve(translatedDir, file));
        }
      }
    } catch (error) {
      // Ignorer
    }

    // Nettoyer DB
    await prisma.messageTranslatedAudio.deleteMany({ where: { attachmentId: testAttachmentId } });
    await prisma.messageAudioTranscription.deleteMany({ where: { attachmentId: testAttachmentId } });
    await prisma.userVoiceModel.deleteMany({ where: { userId: testUserId } });
    await prisma.messageAttachment.deleteMany({ where: { id: testAttachmentId } });
    await prisma.message.deleteMany({ where: { id: testMessageId } });
    await prisma.conversationParticipant.deleteMany({ where: { conversationId: testConversationId } });
    await prisma.conversation.deleteMany({ where: { id: testConversationId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  describe('Legacy Base64 Format (Ancien Translator)', () => {
    it('devrait fonctionner avec audioDataBase64 sans _audioBinary', async () => {
      // ARRANGE - Format LEGACY base64
      const audioEnData = Buffer.from('LEGACY_ENGLISH_AUDIO', 'utf-8');
      const audioEnBase64 = audioEnData.toString('base64');

      const data = {
        taskId: 'task_legacy_001',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Legacy base64 test',
          language: 'en',
          confidence: 0.9,
          source: 'whisper'
        },
        translatedAudios: [
          {
            targetLanguage: 'en',
            translatedText: 'Legacy base64 test',
            audioPath: '/tmp/legacy_en.mp3',
            audioUrl: '/tmp/legacy_en.mp3',
            durationMs: 2000,
            voiceCloned: false,
            voiceQuality: 0.8,
            audioMimeType: 'audio/mp3',
            // FORMAT LEGACY: base64 uniquement
            audioDataBase64: audioEnBase64
            // Pas de _audioBinary
          }
        ],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.8,
        processingTimeMs: 1500
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT - DB
      const translatedAudio = await prisma.messageTranslatedAudio.findUnique({
        where: {
          attachmentId_targetLanguage: {
            attachmentId: testAttachmentId,
            targetLanguage: 'en'
          }
        }
      });

      expect(translatedAudio).not.toBeNull();
      expect(translatedAudio!.translatedText).toBe('Legacy base64 test');

      // ASSERT - Fichier
      const fileContent = await fs.readFile(translatedAudio!.audioPath);
      expect(fileContent).toEqual(audioEnData);
    });

    it('devrait fonctionner avec embedding base64 legacy', async () => {
      // ARRANGE
      const embeddingData = Buffer.alloc(1024, 0xAA);
      const embeddingBase64 = embeddingData.toString('base64');

      const data = {
        taskId: 'task_legacy_002',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Embedding legacy test',
          language: 'en',
          confidence: 0.92,
          source: 'whisper'
        },
        translatedAudios: [],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.9,
        processingTimeMs: 2000,
        newVoiceProfile: {
          userId: testUserId,
          profileId: 'profile_legacy_123',
          // FORMAT LEGACY: base64 uniquement
          embedding: embeddingBase64,
          // Pas de _embeddingBinary
          qualityScore: 0.9,
          audioCount: 1,
          totalDurationMs: 5000,
          version: 1
        }
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT
      const voiceProfile = await prisma.userVoiceModel.findUnique({
        where: { userId: testUserId }
      });

      expect(voiceProfile).not.toBeNull();
      expect(voiceProfile!.embedding).toEqual(embeddingData);
      expect(voiceProfile!.profileId).toBe('profile_legacy_123');
    });
  });

  describe('Nouveau Format Multipart', () => {
    it('devrait fonctionner avec _audioBinary (nouveau format)', async () => {
      // ARRANGE - Format NOUVEAU multipart
      const audioFrBinary = Buffer.from('NEW_FRENCH_AUDIO_BINARY', 'utf-8');

      const data = {
        taskId: 'task_new_001',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'New multipart test',
          language: 'en',
          confidence: 0.95,
          source: 'whisper'
        },
        translatedAudios: [
          {
            targetLanguage: 'fr',
            translatedText: 'Nouveau test multipart',
            audioPath: '/tmp/new_fr.mp3',
            audioUrl: '/tmp/new_fr.mp3',
            durationMs: 2200,
            voiceCloned: true,
            voiceQuality: 0.92,
            audioMimeType: 'audio/mp3',
            // FORMAT NOUVEAU: binaire multipart
            _audioBinary: audioFrBinary
            // Pas de audioDataBase64 (optionnel)
          }
        ],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.92,
        processingTimeMs: 1800
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT
      const translatedAudio = await prisma.messageTranslatedAudio.findUnique({
        where: {
          attachmentId_targetLanguage: {
            attachmentId: testAttachmentId,
            targetLanguage: 'fr'
          }
        }
      });

      expect(translatedAudio).not.toBeNull();

      // ASSERT - Fichier créé directement depuis binaire (pas de décodage)
      const fileContent = await fs.readFile(translatedAudio!.audioPath);
      expect(fileContent).toEqual(audioFrBinary);
    });

    it('devrait fonctionner avec _embeddingBinary (nouveau format)', async () => {
      // ARRANGE
      const embeddingBinary = Buffer.alloc(2048, 0xBB);

      const data = {
        taskId: 'task_new_002',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Embedding multipart test',
          language: 'en',
          confidence: 0.96,
          source: 'whisper'
        },
        translatedAudios: [],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.96,
        processingTimeMs: 2500,
        newVoiceProfile: {
          userId: testUserId,
          profileId: 'profile_new_456',
          // FORMAT NOUVEAU: binaire multipart
          _embeddingBinary: embeddingBinary,
          // Pas de embedding base64
          qualityScore: 0.96,
          audioCount: 1,
          totalDurationMs: 5000,
          version: 1
        }
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT
      const voiceProfile = await prisma.userVoiceModel.findUnique({
        where: { userId: testUserId }
      });

      expect(voiceProfile).not.toBeNull();
      expect(voiceProfile!.embedding).toEqual(embeddingBinary);
    });
  });

  describe('Format Mixte (Transition)', () => {
    it('devrait accepter un mix de base64 et multipart (transition)', async () => {
      // ARRANGE - Certains audios en multipart, d'autres en base64
      const audioEnBinary = Buffer.from('MULTIPART_EN', 'utf-8');
      const audioFrData = Buffer.from('BASE64_FR', 'utf-8');
      const audioFrBase64 = audioFrData.toString('base64');

      const data = {
        taskId: 'task_mix_001',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Mixed format test',
          language: 'en',
          confidence: 0.93,
          source: 'whisper'
        },
        translatedAudios: [
          {
            targetLanguage: 'en',
            translatedText: 'Mixed format test',
            audioPath: '/tmp/mix_en.mp3',
            audioUrl: '/tmp/mix_en.mp3',
            durationMs: 1800,
            voiceCloned: true,
            voiceQuality: 0.9,
            audioMimeType: 'audio/mp3',
            _audioBinary: audioEnBinary // NOUVEAU
          },
          {
            targetLanguage: 'fr',
            translatedText: 'Test de format mixte',
            audioPath: '/tmp/mix_fr.mp3',
            audioUrl: '/tmp/mix_fr.mp3',
            durationMs: 2000,
            voiceCloned: true,
            voiceQuality: 0.88,
            audioMimeType: 'audio/mp3',
            audioDataBase64: audioFrBase64 // LEGACY
          }
        ],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.9,
        processingTimeMs: 2200
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT
      const translatedAudios = await prisma.messageTranslatedAudio.findMany({
        where: { attachmentId: testAttachmentId },
        orderBy: { targetLanguage: 'asc' }
      });

      expect(translatedAudios).toHaveLength(2);

      // Audio EN (multipart)
      const audioEnContent = await fs.readFile(translatedAudios[0].audioPath);
      expect(audioEnContent).toEqual(audioEnBinary);

      // Audio FR (base64)
      const audioFrContent = await fs.readFile(translatedAudios[1].audioPath);
      expect(audioFrContent).toEqual(audioFrData);
    });
  });

  describe('Priorité Format', () => {
    it('devrait prioriser _audioBinary si les deux formats sont présents', async () => {
      // ARRANGE - Les deux formats présents (ne devrait pas arriver en pratique)
      const correctBinary = Buffer.from('CORRECT_BINARY', 'utf-8');
      const wrongBase64Data = Buffer.from('WRONG_BASE64', 'utf-8');
      const wrongBase64 = wrongBase64Data.toString('base64');

      const data = {
        taskId: 'task_priority_001',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Priority test',
          language: 'en',
          confidence: 0.9,
          source: 'whisper'
        },
        translatedAudios: [
          {
            targetLanguage: 'en',
            translatedText: 'Priority test',
            audioPath: '/tmp/priority_en.mp3',
            audioUrl: '/tmp/priority_en.mp3',
            durationMs: 1500,
            voiceCloned: true,
            voiceQuality: 0.9,
            audioMimeType: 'audio/mp3',
            _audioBinary: correctBinary, // PRIORITAIRE
            audioDataBase64: wrongBase64  // IGNORÉ
          }
        ],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.9,
        processingTimeMs: 1200
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT - Doit utiliser le binaire, pas base64
      const translatedAudio = await prisma.messageTranslatedAudio.findUnique({
        where: {
          attachmentId_targetLanguage: {
            attachmentId: testAttachmentId,
            targetLanguage: 'en'
          }
        }
      });

      const fileContent = await fs.readFile(translatedAudio!.audioPath);
      expect(fileContent).toEqual(correctBinary); // Pas wrongBase64Data
    });
  });

  describe('Gestion Erreurs Gracieuse', () => {
    it('devrait gérer l\'absence complète de données audio', async () => {
      // ARRANGE - Ni binaire ni base64
      const data = {
        taskId: 'task_error_001',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'No audio data',
          language: 'en',
          confidence: 0.9,
          source: 'whisper'
        },
        translatedAudios: [
          {
            targetLanguage: 'en',
            translatedText: 'No audio data',
            audioPath: '/some/path.mp3',
            audioUrl: '/some/url.mp3',
            durationMs: 1000,
            voiceCloned: false,
            voiceQuality: 0.5,
            audioMimeType: 'audio/mp3'
            // Ni _audioBinary ni audioDataBase64
          }
        ],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.5,
        processingTimeMs: 500
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT - Doit quand même créer l'entrée DB (avec paths du Translator)
      const translatedAudio = await prisma.messageTranslatedAudio.findUnique({
        where: {
          attachmentId_targetLanguage: {
            attachmentId: testAttachmentId,
            targetLanguage: 'en'
          }
        }
      });

      expect(translatedAudio).not.toBeNull();
      expect(translatedAudio!.audioPath).toBe('/some/path.mp3');
      expect(translatedAudio!.audioUrl).toBe('/some/url.mp3');
    });
  });
});

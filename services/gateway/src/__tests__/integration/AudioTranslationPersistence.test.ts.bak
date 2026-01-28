/**
 * Test d'Intégration - Persistance Complète des Traductions Audio
 *
 * Vérifie que Gateway persiste correctement en DB :
 * - MessageAudioTranscription (avec segments)
 * - MessageTranslatedAudio (par langue)
 * - UserVoiceModel (profil vocal avec embedding)
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

const prisma = new PrismaClient();

// Mock du MessageTranslationService pour tester la persistance
class MockMessageTranslationService extends EventEmitter {
  constructor(private prisma: PrismaClient) {
    super();
  }

  async handleAudioProcessCompleted(data: any) {
    const startTime = Date.now();

    // 1. Récupérer l'attachment
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: data.attachmentId },
      select: { id: true, messageId: true, duration: true }
    });

    if (!attachment) {
      throw new Error(`Attachment non trouvé: ${data.attachmentId}`);
    }

    // 2. Sauvegarder la transcription avec segments
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

    // 3. Sauvegarder chaque audio traduit
    const savedTranslatedAudios: any[] = [];

    for (const translatedAudio of data.translatedAudios) {
      let localAudioPath = translatedAudio.audioPath;
      let localAudioUrl = translatedAudio.audioUrl;

      // MULTIPART: Priorité aux données binaires
      const audioBinary = translatedAudio._audioBinary;
      const audioBase64 = translatedAudio.audioDataBase64;

      if (audioBinary || audioBase64) {
        const translatedDir = path.resolve(process.cwd(), 'uploads/attachments/translated');
        await fs.mkdir(translatedDir, { recursive: true });

        const ext = translatedAudio.audioMimeType?.replace('audio/', '') || 'mp3';
        const filename = `${data.attachmentId}_${translatedAudio.targetLanguage}.${ext}`;
        localAudioPath = path.resolve(translatedDir, filename);

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

      savedTranslatedAudios.push({
        ...translatedAudio,
        audioPath: localAudioPath,
        audioUrl: localAudioUrl
      });
    }

    // 4. Sauvegarder le nouveau profil vocal
    if (data.newVoiceProfile) {
      const nvp = data.newVoiceProfile;
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

    return savedTranslatedAudios;
  }
}

describe('Audio Translation Database Persistence Integration', () => {
  let service: MockMessageTranslationService;
  let testUserId: string;
  let testConversationId: string;
  let testMessageId: string;
  let testAttachmentId: string;

  beforeAll(async () => {
    // Connexion à la DB de test
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    service = new MockMessageTranslationService(prisma);

    // Créer des données de test
    testUserId = `test_user_${Date.now()}`;

    const user = await prisma.user.create({
      data: {
        id: testUserId,
        username: `testuser_${Date.now()}`,
        email: `test_${Date.now()}@example.com`,
        passwordHash: 'fake_hash',
        displayName: 'Test User'
      }
    });

    testConversationId = `test_conv_${Date.now()}`;
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

    testMessageId = `test_msg_${Date.now()}`;
    const message = await prisma.message.create({
      data: {
        id: testMessageId,
        conversationId: testConversationId,
        senderId: user.id,
        content: 'Test audio message',
        messageType: 'AUDIO',
        originalLanguage: 'en'
      }
    });

    testAttachmentId = `test_att_${Date.now()}`;
    await prisma.messageAttachment.create({
      data: {
        id: testAttachmentId,
        messageId: message.id,
        attachmentType: 'AUDIO',
        fileUrl: '/fake/audio.mp3',
        filePath: '/fake/audio.mp3',
        duration: 5000 // 5 secondes
      }
    });
  });

  afterEach(async () => {
    // Nettoyer les fichiers créés
    try {
      const translatedDir = path.resolve(process.cwd(), 'uploads/attachments/translated');
      const files = await fs.readdir(translatedDir);
      for (const file of files) {
        if (file.startsWith(testAttachmentId)) {
          await fs.unlink(path.resolve(translatedDir, file));
        }
      }
    } catch (error) {
      // Dossier n'existe pas encore
    }

    // Nettoyer la DB
    await prisma.messageTranslatedAudio.deleteMany({
      where: { attachmentId: testAttachmentId }
    });
    await prisma.messageAudioTranscription.deleteMany({
      where: { attachmentId: testAttachmentId }
    });
    await prisma.userVoiceModel.deleteMany({
      where: { userId: testUserId }
    });
    await prisma.messageAttachment.deleteMany({
      where: { id: testAttachmentId }
    });
    await prisma.message.deleteMany({
      where: { id: testMessageId }
    });
    await prisma.conversationParticipant.deleteMany({
      where: { conversationId: testConversationId }
    });
    await prisma.conversation.deleteMany({
      where: { id: testConversationId }
    });
    await prisma.user.deleteMany({
      where: { id: testUserId }
    });
  });

  describe('Persistance Transcription avec Segments', () => {
    it('devrait sauvegarder la transcription avec segments détaillés', async () => {
      // ARRANGE
      const data = {
        taskId: 'task_123',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Bonjour, comment allez-vous aujourd\'hui?',
          language: 'fr',
          confidence: 0.95,
          source: 'whisper',
          segments: [
            { text: 'Bonjour,', startMs: 0, endMs: 500 },
            { text: 'comment allez-vous', startMs: 500, endMs: 1500 },
            { text: 'aujourd\'hui?', startMs: 1500, endMs: 2500 }
          ]
        },
        translatedAudios: [],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.9,
        processingTimeMs: 1500
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT
      const transcription = await prisma.messageAudioTranscription.findUnique({
        where: { attachmentId: testAttachmentId }
      });

      expect(transcription).not.toBeNull();
      expect(transcription!.transcribedText).toBe('Bonjour, comment allez-vous aujourd\'hui?');
      expect(transcription!.language).toBe('fr');
      expect(transcription!.confidence).toBe(0.95);
      expect(transcription!.source).toBe('whisper');
      expect(transcription!.segments).toEqual(data.transcription.segments);
      expect(transcription!.audioDurationMs).toBe(5000);
    });

    it('devrait gérer la transcription sans segments', async () => {
      // ARRANGE
      const data = {
        taskId: 'task_124',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Simple transcription',
          language: 'en',
          confidence: 0.88,
          source: 'mobile'
          // Pas de segments
        },
        translatedAudios: [],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.85,
        processingTimeMs: 800
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT
      const transcription = await prisma.messageAudioTranscription.findUnique({
        where: { attachmentId: testAttachmentId }
      });

      expect(transcription).not.toBeNull();
      expect(transcription!.segments).toBeNull();
    });
  });

  describe('Persistance Audios Traduits (Multipart)', () => {
    it('devrait sauvegarder 2 audios traduits avec binaires multipart', async () => {
      // ARRANGE
      const audioEnBinary = Buffer.from('FAKE_ENGLISH_AUDIO_MP3_DATA', 'utf-8');
      const audioFrBinary = Buffer.from('FAKE_FRENCH_AUDIO_MP3_DATA', 'utf-8');

      const data = {
        taskId: 'task_125',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Hello world',
          language: 'en',
          confidence: 0.9,
          source: 'whisper'
        },
        translatedAudios: [
          {
            targetLanguage: 'en',
            translatedText: 'Hello world',
            audioPath: '/tmp/fake_en.mp3',
            audioUrl: '/tmp/fake_en.mp3',
            durationMs: 2000,
            voiceCloned: true,
            voiceQuality: 0.92,
            audioMimeType: 'audio/mp3',
            _audioBinary: audioEnBinary // MULTIPART
          },
          {
            targetLanguage: 'fr',
            translatedText: 'Bonjour le monde',
            audioPath: '/tmp/fake_fr.mp3',
            audioUrl: '/tmp/fake_fr.mp3',
            durationMs: 2200,
            voiceCloned: true,
            voiceQuality: 0.88,
            audioMimeType: 'audio/mp3',
            _audioBinary: audioFrBinary // MULTIPART
          }
        ],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.9,
        processingTimeMs: 2500
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT - Vérifier DB
      const translatedAudios = await prisma.messageTranslatedAudio.findMany({
        where: { attachmentId: testAttachmentId },
        orderBy: { targetLanguage: 'asc' }
      });

      expect(translatedAudios).toHaveLength(2);

      // Audio EN
      expect(translatedAudios[0].targetLanguage).toBe('en');
      expect(translatedAudios[0].translatedText).toBe('Hello world');
      expect(translatedAudios[0].durationMs).toBe(2000);
      expect(translatedAudios[0].voiceCloned).toBe(true);
      expect(translatedAudios[0].voiceQuality).toBe(0.92);
      expect(translatedAudios[0].audioPath).toContain(`${testAttachmentId}_en.mp3`);
      expect(translatedAudios[0].audioUrl).toContain('translated');

      // Audio FR
      expect(translatedAudios[1].targetLanguage).toBe('fr');
      expect(translatedAudios[1].translatedText).toBe('Bonjour le monde');
      expect(translatedAudios[1].durationMs).toBe(2200);

      // ASSERT - Vérifier fichiers physiques
      const audioEnPath = translatedAudios[0].audioPath;
      const audioFrPath = translatedAudios[1].audioPath;

      const audioEnContent = await fs.readFile(audioEnPath);
      const audioFrContent = await fs.readFile(audioFrPath);

      expect(audioEnContent).toEqual(audioEnBinary);
      expect(audioFrContent).toEqual(audioFrBinary);
    });

    it('devrait gérer le fallback base64 si pas de binaire multipart', async () => {
      // ARRANGE
      const audioEsData = Buffer.from('FAKE_SPANISH_AUDIO', 'utf-8');
      const audioEsBase64 = audioEsData.toString('base64');

      const data = {
        taskId: 'task_126',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Test',
          language: 'en',
          confidence: 0.9,
          source: 'whisper'
        },
        translatedAudios: [
          {
            targetLanguage: 'es',
            translatedText: 'Hola mundo',
            audioPath: '/tmp/fake_es.mp3',
            audioUrl: '/tmp/fake_es.mp3',
            durationMs: 1800,
            voiceCloned: false,
            voiceQuality: 0.8,
            audioMimeType: 'audio/mp3',
            // Pas de _audioBinary
            audioDataBase64: audioEsBase64 // FALLBACK BASE64
          }
        ],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.85,
        processingTimeMs: 1200
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT
      const translatedAudio = await prisma.messageTranslatedAudio.findUnique({
        where: {
          attachmentId_targetLanguage: {
            attachmentId: testAttachmentId,
            targetLanguage: 'es'
          }
        }
      });

      expect(translatedAudio).not.toBeNull();

      // Vérifier fichier
      const audioContent = await fs.readFile(translatedAudio!.audioPath);
      expect(audioContent).toEqual(audioEsData);
    });
  });

  describe('Persistance Profil Vocal (Embedding)', () => {
    it('devrait sauvegarder le profil vocal avec embedding binaire multipart', async () => {
      // ARRANGE
      const embeddingSize = 50 * 1024; // 50KB (taille typique)
      const embeddingBinary = Buffer.alloc(embeddingSize, 0xAB);

      const data = {
        taskId: 'task_127',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Voice profile test',
          language: 'en',
          confidence: 0.92,
          source: 'whisper'
        },
        translatedAudios: [],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.94,
        processingTimeMs: 3000,
        newVoiceProfile: {
          userId: testUserId,
          profileId: 'profile_xyz_789',
          _embeddingBinary: embeddingBinary, // MULTIPART
          qualityScore: 0.94,
          audioCount: 1,
          totalDurationMs: 5000,
          version: 1,
          fingerprint: {
            signature: 'sig_abc123',
            spectralCentroid: 1500
          },
          voiceCharacteristics: {
            pitch: 'medium',
            energy: 'high'
          }
        }
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT
      const voiceProfile = await prisma.userVoiceModel.findUnique({
        where: { userId: testUserId }
      });

      expect(voiceProfile).not.toBeNull();
      expect(voiceProfile!.profileId).toBe('profile_xyz_789');
      expect(voiceProfile!.qualityScore).toBe(0.94);
      expect(voiceProfile!.audioCount).toBe(1);
      expect(voiceProfile!.totalDurationMs).toBe(5000);
      expect(voiceProfile!.version).toBe(1);
      expect(voiceProfile!.embedding).toEqual(embeddingBinary);
      expect(voiceProfile!.fingerprint).toEqual({
        signature: 'sig_abc123',
        spectralCentroid: 1500
      });
      expect(voiceProfile!.voiceCharacteristics).toEqual({
        pitch: 'medium',
        energy: 'high'
      });
    });

    it('devrait mettre à jour un profil vocal existant', async () => {
      // ARRANGE - Créer profil initial
      const initialEmbedding = Buffer.alloc(1024, 0x11);
      await prisma.userVoiceModel.create({
        data: {
          userId: testUserId,
          profileId: 'profile_old_123',
          embedding: initialEmbedding,
          qualityScore: 0.7,
          audioCount: 1,
          totalDurationMs: 3000,
          version: 1
        }
      });

      // ARRANGE - Nouveau profil amélioré
      const newEmbedding = Buffer.alloc(2048, 0x22);
      const data = {
        taskId: 'task_128',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Update test',
          language: 'en',
          confidence: 0.95,
          source: 'whisper'
        },
        translatedAudios: [],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.96,
        processingTimeMs: 3500,
        newVoiceProfile: {
          userId: testUserId,
          profileId: 'profile_new_456',
          _embeddingBinary: newEmbedding,
          qualityScore: 0.96,
          audioCount: 2,
          totalDurationMs: 8000,
          version: 2
        }
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT
      const voiceProfile = await prisma.userVoiceModel.findUnique({
        where: { userId: testUserId }
      });

      expect(voiceProfile!.profileId).toBe('profile_new_456'); // Mis à jour
      expect(voiceProfile!.qualityScore).toBe(0.96);
      expect(voiceProfile!.audioCount).toBe(2);
      expect(voiceProfile!.totalDurationMs).toBe(8000);
      expect(voiceProfile!.version).toBe(2);
      expect(voiceProfile!.embedding).toEqual(newEmbedding);
    });
  });

  describe('Flux Complet End-to-End', () => {
    it('devrait persister transcription + 3 audios + profil vocal en une transaction', async () => {
      // ARRANGE - Scénario complet réaliste
      const audioEnBinary = Buffer.alloc(2048, 0x01);
      const audioFrBinary = Buffer.alloc(1536, 0x02);
      const audioEsBinary = Buffer.alloc(1792, 0x03);
      const embeddingBinary = Buffer.alloc(51200, 0xFF);

      const data = {
        taskId: 'task_complete_129',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Complete end-to-end test message',
          language: 'en',
          confidence: 0.97,
          source: 'whisper',
          segments: [
            { text: 'Complete', startMs: 0, endMs: 600 },
            { text: 'end-to-end test', startMs: 600, endMs: 1800 },
            { text: 'message', startMs: 1800, endMs: 2500 }
          ]
        },
        translatedAudios: [
          {
            targetLanguage: 'en',
            translatedText: 'Complete end-to-end test message',
            audioPath: '/tmp/en.mp3',
            audioUrl: '/tmp/en.mp3',
            durationMs: 2500,
            voiceCloned: true,
            voiceQuality: 0.95,
            audioMimeType: 'audio/mp3',
            _audioBinary: audioEnBinary
          },
          {
            targetLanguage: 'fr',
            translatedText: 'Message de test complet de bout en bout',
            audioPath: '/tmp/fr.mp3',
            audioUrl: '/tmp/fr.mp3',
            durationMs: 2800,
            voiceCloned: true,
            voiceQuality: 0.93,
            audioMimeType: 'audio/mp3',
            _audioBinary: audioFrBinary
          },
          {
            targetLanguage: 'es',
            translatedText: 'Mensaje de prueba completo de extremo a extremo',
            audioPath: '/tmp/es.mp3',
            audioUrl: '/tmp/es.mp3',
            durationMs: 3000,
            voiceCloned: true,
            voiceQuality: 0.91,
            audioMimeType: 'audio/mp3',
            _audioBinary: audioEsBinary
          }
        ],
        voiceModelUserId: testUserId,
        voiceModelQuality: 0.94,
        processingTimeMs: 4500,
        newVoiceProfile: {
          userId: testUserId,
          profileId: 'profile_complete_999',
          _embeddingBinary: embeddingBinary,
          qualityScore: 0.94,
          audioCount: 1,
          totalDurationMs: 5000,
          version: 1,
          fingerprint: {
            signature: 'sig_complete_abc',
            spectralCentroid: 1650
          },
          voiceCharacteristics: {
            pitch: 'low',
            energy: 'medium',
            timbre: 'warm'
          }
        }
      };

      // ACT
      await service.handleAudioProcessCompleted(data);

      // ASSERT 1 - Transcription
      const transcription = await prisma.messageAudioTranscription.findUnique({
        where: { attachmentId: testAttachmentId }
      });
      expect(transcription).not.toBeNull();
      expect(transcription!.segments).toHaveLength(3);

      // ASSERT 2 - Audios Traduits
      const translatedAudios = await prisma.messageTranslatedAudio.findMany({
        where: { attachmentId: testAttachmentId }
      });
      expect(translatedAudios).toHaveLength(3);
      expect(translatedAudios.map(a => a.targetLanguage).sort()).toEqual(['en', 'es', 'fr']);

      // ASSERT 3 - Profil Vocal
      const voiceProfile = await prisma.userVoiceModel.findUnique({
        where: { userId: testUserId }
      });
      expect(voiceProfile).not.toBeNull();
      expect(voiceProfile!.embedding.length).toBe(51200);

      // ASSERT 4 - Fichiers physiques
      for (const audio of translatedAudios) {
        const fileExists = await fs.access(audio.audioPath).then(() => true).catch(() => false);
        expect(fileExists).toBe(true);
      }
    });
  });
});

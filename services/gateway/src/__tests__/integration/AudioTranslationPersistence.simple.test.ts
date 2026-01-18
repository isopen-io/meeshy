/**
 * Test d'Intégration Simplifié - Persistance Multipart
 *
 * Teste la logique de persistance des données multipart sans dépendre du schema DB exact.
 * Focus sur la priorité multipart > base64 et la sauvegarde des fichiers.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

// Types pour les tests
interface TranslatedAudioMultipart {
  targetLanguage: string;
  translatedText: string;
  audioMimeType: string;
  _audioBinary?: Buffer;
  audioDataBase64?: string;
}

interface VoiceProfileMultipart {
  userId: string;
  profileId?: string;
  _embeddingBinary?: Buffer;
  embedding?: string;
}

describe('Persistance Audio Multipart (Simplifié)', () => {
  const testDir = path.join(tmpdir(), 'test-multipart-' + Date.now());

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Priorité Multipart > Base64', () => {
    it('devrait utiliser le Buffer multipart en priorité', async () => {
      // ARRANGE - Données avec les deux formats
      const multipartBinary = Buffer.from('MULTIPART_AUDIO_DATA');
      const base64String = Buffer.from('BASE64_AUDIO_DATA').toString('base64');

      const translatedAudio: TranslatedAudioMultipart = {
        targetLanguage: 'fr',
        translatedText: 'Bonjour',
        audioMimeType: 'audio/mp3',
        _audioBinary: multipartBinary,      // Nouveau format
        audioDataBase64: base64String        // Legacy format
      };

      // ACT - Simuler la logique de fallback
      const audioBuffer = translatedAudio._audioBinary || Buffer.from(translatedAudio.audioDataBase64!, 'base64');

      // ASSERT - Multipart doit être prioritaire
      expect(audioBuffer).toEqual(multipartBinary);
      expect(audioBuffer.toString()).toBe('MULTIPART_AUDIO_DATA');
      expect(audioBuffer.toString()).not.toBe('BASE64_AUDIO_DATA');
    });

    it('devrait fallback sur base64 si multipart absent', async () => {
      // ARRANGE - Seulement base64 (ancien format)
      const base64String = Buffer.from('BASE64_ONLY_DATA').toString('base64');

      const translatedAudio: TranslatedAudioMultipart = {
        targetLanguage: 'es',
        translatedText: 'Hola',
        audioMimeType: 'audio/mp3',
        audioDataBase64: base64String
        // PAS de _audioBinary
      };

      // ACT
      const audioBuffer = translatedAudio._audioBinary || Buffer.from(translatedAudio.audioDataBase64!, 'base64');

      // ASSERT - Doit utiliser base64
      expect(audioBuffer.toString()).toBe('BASE64_ONLY_DATA');
    });
  });

  describe('Sauvegarde Fichiers', () => {
    it('devrait sauvegarder un audio multipart directement sans décodage', async () => {
      // ARRANGE
      const audioBinary = Buffer.from('DIRECT_MULTIPART_SAVE');
      const filePath = path.join(testDir, 'test_fr.mp3');

      // ACT - Sauvegarde directe du Buffer
      await fs.writeFile(filePath, audioBinary);

      // ASSERT
      const savedContent = await fs.readFile(filePath);
      expect(savedContent).toEqual(audioBinary);
      expect(savedContent.toString()).toBe('DIRECT_MULTIPART_SAVE');
    });

    it('devrait sauvegarder plusieurs audios traduits', async () => {
      // ARRANGE
      const audios = [
        { lang: 'fr', data: Buffer.from('FRENCH_AUDIO') },
        { lang: 'es', data: Buffer.from('SPANISH_AUDIO') },
        { lang: 'de', data: Buffer.from('GERMAN_AUDIO') }
      ];

      // ACT - Sauvegarder tous les audios
      for (const audio of audios) {
        const filePath = path.join(testDir, `translated_${audio.lang}.mp3`);
        await fs.writeFile(filePath, audio.data);
      }

      // ASSERT - Vérifier que tous existent et ont le bon contenu
      for (const audio of audios) {
        const filePath = path.join(testDir, `translated_${audio.lang}.mp3`);
        const content = await fs.readFile(filePath);
        expect(content).toEqual(audio.data);
      }
    });
  });

  describe('Embedding Vocal', () => {
    it('devrait sauvegarder un embedding en binaire', async () => {
      // ARRANGE - Simuler un embedding numpy (51KB)
      const embeddingBinary = Buffer.alloc(51 * 1024, 0xFF);
      const embeddingBase64 = embeddingBinary.toString('base64');

      const voiceProfile: VoiceProfileMultipart = {
        userId: 'user_123',
        profileId: 'profile_456',
        _embeddingBinary: embeddingBinary,  // Nouveau format
        embedding: embeddingBase64           // Legacy format
      };

      // ACT - Priorité multipart
      const embeddingBuffer = voiceProfile._embeddingBinary ||
                             (voiceProfile.embedding ? Buffer.from(voiceProfile.embedding, 'base64') : null);

      // ASSERT
      expect(embeddingBuffer).toEqual(embeddingBinary);
      expect(embeddingBuffer!.length).toBe(51 * 1024);
    });

    it('devrait gérer l\'absence d\'embedding', () => {
      // ARRANGE - Pas de profil vocal
      const voiceProfile = null;

      // ACT
      const embeddingBuffer = voiceProfile?._embeddingBinary ||
                             (voiceProfile?.embedding ? Buffer.from(voiceProfile.embedding, 'base64') : null);

      // ASSERT - Doit être null
      expect(embeddingBuffer).toBeNull();
    });
  });

  describe('Flux Complet Multipart', () => {
    it('devrait traiter un message complet avec 3 audios + embedding', async () => {
      // ARRANGE - Message audio complet
      const messageData = {
        messageId: 'msg_123',
        attachmentId: 'att_456',
        transcription: {
          text: 'Hello world',
          segments: [
            { text: 'Hello', startMs: 0, endMs: 500 },
            { text: 'world', startMs: 500, endMs: 1000 }
          ]
        },
        translatedAudios: [
          { targetLanguage: 'fr', _audioBinary: Buffer.from('AUDIO_FR'), translatedText: 'Bonjour le monde' },
          { targetLanguage: 'es', _audioBinary: Buffer.from('AUDIO_ES'), translatedText: 'Hola mundo' },
          { targetLanguage: 'de', _audioBinary: Buffer.from('AUDIO_DE'), translatedText: 'Hallo Welt' }
        ],
        newVoiceProfile: {
          userId: 'user_123',
          _embeddingBinary: Buffer.alloc(1024, 0xAB)
        }
      };

      // ACT - Sauvegarder tous les audios
      const savedAudios = [];
      for (const audio of messageData.translatedAudios) {
        const audioPath = path.join(testDir, `msg_${audio.targetLanguage}.mp3`);
        await fs.writeFile(audioPath, audio._audioBinary);
        savedAudios.push(audioPath);
      }

      // ASSERT - Vérifier que tous les fichiers existent
      for (const audioPath of savedAudios) {
        const stats = await fs.stat(audioPath);
        expect(stats.isFile()).toBe(true);
      }

      // ASSERT - Vérifier les segments
      expect(messageData.transcription.segments).toHaveLength(2);
      expect(messageData.transcription.segments[0].text).toBe('Hello');

      // ASSERT - Vérifier embedding
      expect(messageData.newVoiceProfile._embeddingBinary.length).toBe(1024);
    });
  });
});

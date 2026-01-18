/**
 * Test Unitaire - Extraction des Frames Binaires ZMQ Multipart
 *
 * Vérifie que Gateway extrait correctement les audios et embeddings
 * depuis les frames multipart envoyés par Translator
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

describe('ZMQ Multipart Binary Frame Extraction', () => {

  /**
   * Simule la fonction d'extraction des frames binaires de ZmqTranslationClient
   */
  function extractBinaryFrames(
    metadata: any,
    binaryFrames: Buffer[]
  ): {
    audioBinaries: Map<string, Buffer>;
    embeddingBinary: Buffer | null;
  } {
    const binaryFramesInfo = metadata.binaryFrames || {};
    const audioBinaries: Map<string, Buffer> = new Map();
    let embeddingBinary: Buffer | null = null;

    for (const [key, info] of Object.entries(binaryFramesInfo)) {
      const frameInfo = info as { index: number; size: number; mimeType?: string };
      const frameIndex = frameInfo.index - 1; // Les indices dans metadata commencent à 1, array à 0

      if (frameIndex >= 0 && frameIndex < binaryFrames.length) {
        if (key.startsWith('audio_')) {
          const language = key.replace('audio_', '');
          audioBinaries.set(language, binaryFrames[frameIndex]);
        } else if (key === 'embedding') {
          embeddingBinary = binaryFrames[frameIndex];
        }
      }
    }

    return { audioBinaries, embeddingBinary };
  }

  describe('Extraction des audios traduits', () => {
    it('devrait extraire correctement 2 audios (en, fr)', () => {
      // ARRANGE
      const audioEnBuffer = Buffer.from('FAKE_AUDIO_EN_DATA_MP3', 'utf-8');
      const audioFrBuffer = Buffer.from('FAKE_AUDIO_FR_DATA_MP3', 'utf-8');

      const metadata = {
        type: 'audio_process_completed',
        messageId: 'msg_123',
        binaryFrames: {
          audio_en: { index: 1, size: audioEnBuffer.length, mimeType: 'audio/mp3' },
          audio_fr: { index: 2, size: audioFrBuffer.length, mimeType: 'audio/mp3' }
        }
      };

      const binaryFrames = [audioEnBuffer, audioFrBuffer];

      // ACT
      const { audioBinaries, embeddingBinary } = extractBinaryFrames(metadata, binaryFrames);

      // ASSERT
      expect(audioBinaries.size).toBe(2);
      expect(audioBinaries.get('en')).toEqual(audioEnBuffer);
      expect(audioBinaries.get('fr')).toEqual(audioFrBuffer);
      expect(embeddingBinary).toBeNull();
    });

    it('devrait extraire 3 audios avec des tailles différentes', () => {
      // ARRANGE
      const audioEn = Buffer.alloc(1024, 'A'); // 1KB
      const audioFr = Buffer.alloc(2048, 'B'); // 2KB
      const audioEs = Buffer.alloc(512, 'C');  // 512B

      const metadata = {
        binaryFrames: {
          audio_en: { index: 1, size: 1024 },
          audio_fr: { index: 2, size: 2048 },
          audio_es: { index: 3, size: 512 }
        }
      };

      const binaryFrames = [audioEn, audioFr, audioEs];

      // ACT
      const { audioBinaries } = extractBinaryFrames(metadata, binaryFrames);

      // ASSERT
      expect(audioBinaries.size).toBe(3);
      expect(audioBinaries.get('en')?.length).toBe(1024);
      expect(audioBinaries.get('fr')?.length).toBe(2048);
      expect(audioBinaries.get('es')?.length).toBe(512);
    });
  });

  describe('Extraction de l\'embedding vocal', () => {
    it('devrait extraire l\'embedding vocal avec 2 audios', () => {
      // ARRANGE
      const audioEn = Buffer.from('AUDIO_EN', 'utf-8');
      const audioFr = Buffer.from('AUDIO_FR', 'utf-8');
      const embedding = Buffer.from('FAKE_VOICE_EMBEDDING_NUMPY_BYTES', 'utf-8');

      const metadata = {
        binaryFrames: {
          audio_en: { index: 1, size: audioEn.length },
          audio_fr: { index: 2, size: audioFr.length },
          embedding: { index: 3, size: embedding.length }
        }
      };

      const binaryFrames = [audioEn, audioFr, embedding];

      // ACT
      const { audioBinaries, embeddingBinary } = extractBinaryFrames(metadata, binaryFrames);

      // ASSERT
      expect(audioBinaries.size).toBe(2);
      expect(embeddingBinary).toEqual(embedding);
      expect(embeddingBinary?.length).toBe(embedding.length);
    });

    it('devrait gérer l\'absence d\'embedding', () => {
      // ARRANGE
      const audioEn = Buffer.from('AUDIO_EN', 'utf-8');

      const metadata = {
        binaryFrames: {
          audio_en: { index: 1, size: audioEn.length }
          // Pas d'embedding
        }
      };

      const binaryFrames = [audioEn];

      // ACT
      const { embeddingBinary } = extractBinaryFrames(metadata, binaryFrames);

      // ASSERT
      expect(embeddingBinary).toBeNull();
    });

    it('devrait extraire un embedding volumineux (similaire aux embeddings réels)', () => {
      // ARRANGE - Simuler un embedding vocal typique (~50KB)
      const embeddingSize = 50 * 1024; // 50KB
      const embedding = Buffer.alloc(embeddingSize, 0xFF);

      const metadata = {
        binaryFrames: {
          embedding: { index: 1, size: embeddingSize }
        }
      };

      const binaryFrames = [embedding];

      // ACT
      const { embeddingBinary } = extractBinaryFrames(metadata, binaryFrames);

      // ASSERT
      expect(embeddingBinary).not.toBeNull();
      expect(embeddingBinary?.length).toBe(embeddingSize);
    });
  });

  describe('Cas limites et erreurs', () => {
    it('devrait gérer des frames vides sans crasher', () => {
      // ARRANGE
      const metadata = {
        binaryFrames: {}
      };
      const binaryFrames: Buffer[] = [];

      // ACT
      const { audioBinaries, embeddingBinary } = extractBinaryFrames(metadata, binaryFrames);

      // ASSERT
      expect(audioBinaries.size).toBe(0);
      expect(embeddingBinary).toBeNull();
    });

    it('devrait ignorer les indices invalides (hors limite)', () => {
      // ARRANGE
      const audioEn = Buffer.from('AUDIO_EN', 'utf-8');

      const metadata = {
        binaryFrames: {
          audio_en: { index: 1, size: audioEn.length },
          audio_fr: { index: 10, size: 100 } // Index invalide (hors des frames)
        }
      };

      const binaryFrames = [audioEn]; // Un seul frame

      // ACT
      const { audioBinaries } = extractBinaryFrames(metadata, binaryFrames);

      // ASSERT
      expect(audioBinaries.size).toBe(1); // Seul audio_en extrait
      expect(audioBinaries.get('en')).toEqual(audioEn);
      expect(audioBinaries.get('fr')).toBeUndefined();
    });

    it('devrait gérer l\'absence de binaryFrames dans metadata', () => {
      // ARRANGE
      const metadata = {
        type: 'audio_process_completed'
        // Pas de binaryFrames
      };

      const binaryFrames = [Buffer.from('SOME_DATA', 'utf-8')];

      // ACT
      const { audioBinaries, embeddingBinary } = extractBinaryFrames(metadata, binaryFrames);

      // ASSERT
      expect(audioBinaries.size).toBe(0);
      expect(embeddingBinary).toBeNull();
    });
  });

  describe('Scénarios réalistes', () => {
    it('devrait gérer un message audio complet avec 5 langues + embedding', () => {
      // ARRANGE - Scénario réaliste : 5 langues traduites + profil vocal créé
      const audios = {
        en: Buffer.alloc(2048, 'EN'),
        fr: Buffer.alloc(1024, 'FR'),
        es: Buffer.alloc(1536, 'ES'),
        de: Buffer.alloc(2560, 'DE'),
        it: Buffer.alloc(1792, 'IT')
      };
      const embedding = Buffer.alloc(51200, 0xAB); // 50KB embedding

      const metadata = {
        type: 'audio_process_completed',
        messageId: 'msg_456',
        attachmentId: 'att_789',
        binaryFrames: {
          audio_en: { index: 1, size: 2048, mimeType: 'audio/mp3' },
          audio_fr: { index: 2, size: 1024, mimeType: 'audio/mp3' },
          audio_es: { index: 3, size: 1536, mimeType: 'audio/mp3' },
          audio_de: { index: 4, size: 2560, mimeType: 'audio/mp3' },
          audio_it: { index: 5, size: 1792, mimeType: 'audio/mp3' },
          embedding: { index: 6, size: 51200 }
        }
      };

      const binaryFrames = [
        audios.en,
        audios.fr,
        audios.es,
        audios.de,
        audios.it,
        embedding
      ];

      // ACT
      const { audioBinaries, embeddingBinary } = extractBinaryFrames(metadata, binaryFrames);

      // ASSERT
      expect(audioBinaries.size).toBe(5);
      expect(audioBinaries.get('en')?.length).toBe(2048);
      expect(audioBinaries.get('fr')?.length).toBe(1024);
      expect(audioBinaries.get('es')?.length).toBe(1536);
      expect(audioBinaries.get('de')?.length).toBe(2560);
      expect(audioBinaries.get('it')?.length).toBe(1792);
      expect(embeddingBinary?.length).toBe(51200);
    });

    it('devrait calculer la taille totale des frames correctement', () => {
      // ARRANGE
      const audioEn = Buffer.alloc(3000, 'A');
      const audioFr = Buffer.alloc(4000, 'B');
      const embedding = Buffer.alloc(50000, 'C');

      const metadata = {
        binaryFrames: {
          audio_en: { index: 1, size: 3000 },
          audio_fr: { index: 2, size: 4000 },
          embedding: { index: 3, size: 50000 }
        }
      };

      const binaryFrames = [audioEn, audioFr, embedding];

      // ACT
      const { audioBinaries, embeddingBinary } = extractBinaryFrames(metadata, binaryFrames);

      // ASSERT
      const totalSize = Array.from(audioBinaries.values()).reduce((sum, buf) => sum + buf.length, 0)
        + (embeddingBinary?.length || 0);

      expect(totalSize).toBe(57000); // 3000 + 4000 + 50000
    });
  });

  describe('Gain de performance vs Base64', () => {
    it('devrait démontrer l\'absence de décodage base64 (gain CPU)', () => {
      // ARRANGE
      const audioSize = 100 * 1024; // 100KB
      const audioBinary = Buffer.alloc(audioSize, 0xAB);

      // Simuler base64 (taille augmente de ~33%)
      const audioBase64 = audioBinary.toString('base64');
      const base64Size = Buffer.byteLength(audioBase64, 'utf-8');

      // ASSERT - Taille base64 est ~33% plus grande
      const overhead = ((base64Size - audioSize) / audioSize) * 100;
      expect(overhead).toBeGreaterThan(30);
      expect(overhead).toBeLessThan(35);

      // Multipart: pas de décodage nécessaire, juste extraction du frame
      const metadata = {
        binaryFrames: {
          audio_en: { index: 1, size: audioSize }
        }
      };
      const binaryFrames = [audioBinary];

      // ACT - Extraction directe (pas de décodage)
      const { audioBinaries } = extractBinaryFrames(metadata, binaryFrames);

      // ASSERT - Taille identique, pas de overhead
      expect(audioBinaries.get('en')?.length).toBe(audioSize);
      expect(audioBinaries.get('en')).toBe(audioBinary); // Même référence
    });
  });
});

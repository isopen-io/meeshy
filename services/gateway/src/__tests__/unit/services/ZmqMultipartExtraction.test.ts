/**
 * Test Unitaire - Extraction des Frames Binaires ZMQ Multipart
 *
 * Vérifie que Gateway extrait correctement les audios et embeddings
 * depuis les frames multipart envoyés par Translator.
 *
 * IMPORTANT: ce test importe le helper de PRODUCTION `extractAudioBinaryFrames`
 * (utilisé par `ZmqMessageHandler.handleAudioProcessCompleted`) plutôt que d'en
 * ré-implémenter une copie locale. Le mapping index 1-based (metadata) → 0-based
 * (array) est un point fragile : une dérive off-by-one dans le code réel doit
 * casser ce test, pas passer silencieusement.
 */

import { describe, it, expect } from '@jest/globals';
import { extractAudioBinaryFrames } from '../../../services/zmq-translation/utils/binary-frames';

describe('ZMQ Multipart Binary Frame Extraction', () => {

  describe('Extraction des audios traduits', () => {
    it('devrait extraire correctement 2 audios (en, fr)', () => {
      // ARRANGE
      const audioEnBuffer = Buffer.from('FAKE_AUDIO_EN_DATA_MP3', 'utf-8');
      const audioFrBuffer = Buffer.from('FAKE_AUDIO_FR_DATA_MP3', 'utf-8');

      const binaryFramesInfo = {
        audio_en: { index: 1, size: audioEnBuffer.length, mimeType: 'audio/mp3' },
        audio_fr: { index: 2, size: audioFrBuffer.length, mimeType: 'audio/mp3' }
      };

      const binaryFrames = [audioEnBuffer, audioFrBuffer];

      // ACT
      const { audioBinaries, embeddingBinary, invalidFrameKeys } =
        extractAudioBinaryFrames(binaryFramesInfo, binaryFrames);

      // ASSERT
      expect(audioBinaries.size).toBe(2);
      expect(audioBinaries.get('en')).toEqual(audioEnBuffer);
      expect(audioBinaries.get('fr')).toEqual(audioFrBuffer);
      expect(embeddingBinary).toBeNull();
      expect(invalidFrameKeys).toEqual([]);
    });

    it('devrait extraire 3 audios avec des tailles différentes', () => {
      // ARRANGE
      const audioEn = Buffer.alloc(1024, 'A'); // 1KB
      const audioFr = Buffer.alloc(2048, 'B'); // 2KB
      const audioEs = Buffer.alloc(512, 'C');  // 512B

      const binaryFramesInfo = {
        audio_en: { index: 1, size: 1024 },
        audio_fr: { index: 2, size: 2048 },
        audio_es: { index: 3, size: 512 }
      };

      const binaryFrames = [audioEn, audioFr, audioEs];

      // ACT
      const { audioBinaries } = extractAudioBinaryFrames(binaryFramesInfo, binaryFrames);

      // ASSERT
      expect(audioBinaries.size).toBe(3);
      expect(audioBinaries.get('en')?.length).toBe(1024);
      expect(audioBinaries.get('fr')?.length).toBe(2048);
      expect(audioBinaries.get('es')?.length).toBe(512);
    });
  });

  describe('Mapping index 1-based → 0-based (garde off-by-one)', () => {
    it('devrait mapper index N vers binaryFrames[N-1]', () => {
      // ARRANGE - chaque frame porte sa position 1-based comme contenu
      const frames = [
        Buffer.from('slot-0'),
        Buffer.from('slot-1'),
        Buffer.from('slot-2')
      ];
      const binaryFramesInfo = {
        audio_en: { index: 1, size: 6 }, // → frames[0]
        audio_fr: { index: 2, size: 6 }, // → frames[1]
        audio_es: { index: 3, size: 6 }  // → frames[2]
      };

      // ACT
      const { audioBinaries } = extractAudioBinaryFrames(binaryFramesInfo, frames);

      // ASSERT
      expect(audioBinaries.get('en')?.toString()).toBe('slot-0');
      expect(audioBinaries.get('fr')?.toString()).toBe('slot-1');
      expect(audioBinaries.get('es')?.toString()).toBe('slot-2');
    });

    it('devrait rejeter index 0 (→ -1, borne inférieure invalide)', () => {
      // ARRANGE
      const frames = [Buffer.from('only-frame')];
      const binaryFramesInfo = {
        audio_en: { index: 0, size: 10 } // 0 - 1 = -1 → hors borne
      };

      // ACT
      const { audioBinaries, invalidFrameKeys } =
        extractAudioBinaryFrames(binaryFramesInfo, frames);

      // ASSERT
      expect(audioBinaries.size).toBe(0);
      expect(invalidFrameKeys).toEqual(['audio_en']);
    });
  });

  describe('Extraction de l\'embedding vocal', () => {
    it('devrait extraire l\'embedding vocal avec 2 audios', () => {
      // ARRANGE
      const audioEn = Buffer.from('AUDIO_EN', 'utf-8');
      const audioFr = Buffer.from('AUDIO_FR', 'utf-8');
      const embedding = Buffer.from('FAKE_VOICE_EMBEDDING_NUMPY_BYTES', 'utf-8');

      const binaryFramesInfo = {
        audio_en: { index: 1, size: audioEn.length },
        audio_fr: { index: 2, size: audioFr.length },
        embedding: { index: 3, size: embedding.length }
      };

      const binaryFrames = [audioEn, audioFr, embedding];

      // ACT
      const { audioBinaries, embeddingBinary } =
        extractAudioBinaryFrames(binaryFramesInfo, binaryFrames);

      // ASSERT
      expect(audioBinaries.size).toBe(2);
      expect(embeddingBinary).toEqual(embedding);
      expect(embeddingBinary?.length).toBe(embedding.length);
    });

    it('devrait gérer l\'absence d\'embedding', () => {
      // ARRANGE
      const audioEn = Buffer.from('AUDIO_EN', 'utf-8');

      const binaryFramesInfo = {
        audio_en: { index: 1, size: audioEn.length }
        // Pas d'embedding
      };

      const binaryFrames = [audioEn];

      // ACT
      const { embeddingBinary } = extractAudioBinaryFrames(binaryFramesInfo, binaryFrames);

      // ASSERT
      expect(embeddingBinary).toBeNull();
    });

    it('devrait extraire un embedding volumineux (similaire aux embeddings réels)', () => {
      // ARRANGE - Simuler un embedding vocal typique (~50KB)
      const embeddingSize = 50 * 1024; // 50KB
      const embedding = Buffer.alloc(embeddingSize, 0xFF);

      const binaryFramesInfo = {
        embedding: { index: 1, size: embeddingSize }
      };

      const binaryFrames = [embedding];

      // ACT
      const { embeddingBinary } = extractAudioBinaryFrames(binaryFramesInfo, binaryFrames);

      // ASSERT
      expect(embeddingBinary).not.toBeNull();
      expect(embeddingBinary?.length).toBe(embeddingSize);
    });
  });

  describe('Cas limites et erreurs', () => {
    it('devrait gérer des frames vides sans crasher', () => {
      // ACT
      const { audioBinaries, embeddingBinary, invalidFrameKeys } =
        extractAudioBinaryFrames({}, []);

      // ASSERT
      expect(audioBinaries.size).toBe(0);
      expect(embeddingBinary).toBeNull();
      expect(invalidFrameKeys).toEqual([]);
    });

    it('devrait ignorer les indices invalides (hors limite) et les signaler', () => {
      // ARRANGE
      const audioEn = Buffer.from('AUDIO_EN', 'utf-8');

      const binaryFramesInfo = {
        audio_en: { index: 1, size: audioEn.length },
        audio_fr: { index: 10, size: 100 } // Index invalide (hors des frames)
      };

      const binaryFrames = [audioEn]; // Un seul frame

      // ACT
      const { audioBinaries, invalidFrameKeys } =
        extractAudioBinaryFrames(binaryFramesInfo, binaryFrames);

      // ASSERT
      expect(audioBinaries.size).toBe(1); // Seul audio_en extrait
      expect(audioBinaries.get('en')).toEqual(audioEn);
      expect(audioBinaries.get('fr')).toBeUndefined();
      expect(invalidFrameKeys).toEqual(['audio_fr']);
    });

    it('devrait gérer l\'absence de binaryFrames (undefined) dans metadata', () => {
      // ARRANGE
      const binaryFrames = [Buffer.from('SOME_DATA', 'utf-8')];

      // ACT
      const { audioBinaries, embeddingBinary } =
        extractAudioBinaryFrames(undefined, binaryFrames);

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

      const binaryFramesInfo = {
        audio_en: { index: 1, size: 2048, mimeType: 'audio/mp3' },
        audio_fr: { index: 2, size: 1024, mimeType: 'audio/mp3' },
        audio_es: { index: 3, size: 1536, mimeType: 'audio/mp3' },
        audio_de: { index: 4, size: 2560, mimeType: 'audio/mp3' },
        audio_it: { index: 5, size: 1792, mimeType: 'audio/mp3' },
        embedding: { index: 6, size: 51200 }
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
      const { audioBinaries, embeddingBinary } =
        extractAudioBinaryFrames(binaryFramesInfo, binaryFrames);

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

      const binaryFramesInfo = {
        audio_en: { index: 1, size: 3000 },
        audio_fr: { index: 2, size: 4000 },
        embedding: { index: 3, size: 50000 }
      };

      const binaryFrames = [audioEn, audioFr, embedding];

      // ACT
      const { audioBinaries, embeddingBinary } =
        extractAudioBinaryFrames(binaryFramesInfo, binaryFrames);

      // ASSERT
      const totalSize = Array.from(audioBinaries.values()).reduce((sum, buf) => sum + buf.length, 0)
        + (embeddingBinary?.length || 0);

      expect(totalSize).toBe(57000); // 3000 + 4000 + 50000
    });
  });

  describe('Gain de performance vs Base64 (zéro-copie)', () => {
    it('devrait extraire sans décodage base64 ni copie (même référence)', () => {
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

      const binaryFramesInfo = {
        audio_en: { index: 1, size: audioSize }
      };
      const binaryFrames = [audioBinary];

      // ACT - Extraction directe (pas de décodage)
      const { audioBinaries } = extractAudioBinaryFrames(binaryFramesInfo, binaryFrames);

      // ASSERT - Taille identique, même référence (pas de copie)
      expect(audioBinaries.get('en')?.length).toBe(audioSize);
      expect(audioBinaries.get('en')).toBe(audioBinary);
    });
  });
});

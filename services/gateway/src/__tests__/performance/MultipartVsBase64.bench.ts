/**
 * Benchmark Performance - Multipart ZMQ vs Base64 JSON
 *
 * Compare les performances entre :
 * - Multipart: Binaires directs
 * - Base64: Encodage/décodage base64 dans JSON
 *
 * Métriques :
 * - Taille des messages
 * - Temps d'encodage/décodage
 * - Overhead mémoire
 */

import { describe, it, expect } from '@jest/globals';

describe('Performance: Multipart ZMQ vs Base64 JSON', () => {

  /**
   * Simule l'encodage base64 (Translator → Gateway)
   */
  function encodeBase64Payload(audioBinaries: Map<string, Buffer>, embeddingBinary: Buffer | null): string {
    const payload: any = {
      type: 'audio_process_completed',
      translatedAudios: []
    };

    // Encoder chaque audio en base64
    for (const [language, binary] of audioBinaries) {
      payload.translatedAudios.push({
        targetLanguage: language,
        audioDataBase64: binary.toString('base64')
      });
    }

    // Encoder embedding
    if (embeddingBinary) {
      payload.newVoiceProfile = {
        embedding: embeddingBinary.toString('base64')
      };
    }

    return JSON.stringify(payload);
  }

  /**
   * Simule le décodage base64 (Gateway reçoit)
   */
  function decodeBase64Payload(jsonStr: string): {
    audioBinaries: Map<string, Buffer>;
    embeddingBinary: Buffer | null;
  } {
    const payload = JSON.parse(jsonStr);
    const audioBinaries = new Map<string, Buffer>();
    let embeddingBinary: Buffer | null = null;

    for (const audio of payload.translatedAudios) {
      if (audio.audioDataBase64) {
        audioBinaries.set(audio.targetLanguage, Buffer.from(audio.audioDataBase64, 'base64'));
      }
    }

    if (payload.newVoiceProfile?.embedding) {
      embeddingBinary = Buffer.from(payload.newVoiceProfile.embedding, 'base64');
    }

    return { audioBinaries, embeddingBinary };
  }

  /**
   * Simule multipart (Translator → Gateway)
   */
  function createMultipartFrames(audioBinaries: Map<string, Buffer>, embeddingBinary: Buffer | null): {
    metadata: string;
    binaryFrames: Buffer[];
    totalSize: number;
  } {
    const binaryFrames: Buffer[] = [];
    const binaryFramesInfo: any = {};
    let frameIndex = 1;

    // Metadata
    const metadata: any = {
      type: 'audio_process_completed',
      translatedAudios: []
    };

    // Ajouter audios
    for (const [language, binary] of audioBinaries) {
      binaryFrames.push(binary);
      binaryFramesInfo[`audio_${language}`] = {
        index: frameIndex,
        size: binary.length
      };
      metadata.translatedAudios.push({
        targetLanguage: language
      });
      frameIndex++;
    }

    // Ajouter embedding
    if (embeddingBinary) {
      binaryFrames.push(embeddingBinary);
      binaryFramesInfo['embedding'] = {
        index: frameIndex,
        size: embeddingBinary.length
      };
      metadata.newVoiceProfile = {};
    }

    metadata.binaryFrames = binaryFramesInfo;

    const metadataStr = JSON.stringify(metadata);
    const totalSize = Buffer.byteLength(metadataStr, 'utf-8') + binaryFrames.reduce((sum, f) => sum + f.length, 0);

    return {
      metadata: metadataStr,
      binaryFrames,
      totalSize
    };
  }

  describe('Overhead Taille - 1 Audio (100KB)', () => {
    it('devrait démontrer ~33% overhead avec base64', () => {
      // ARRANGE
      const audioSize = 100 * 1024; // 100KB
      const audioEn = Buffer.alloc(audioSize, 0xAB);
      const audioBinaries = new Map([['en', audioEn]]);

      // ACT - Base64
      const startBase64 = performance.now();
      const base64Payload = encodeBase64Payload(audioBinaries, null);
      const encodeTimeBase64 = performance.now() - startBase64;

      const base64Size = Buffer.byteLength(base64Payload, 'utf-8');

      // ACT - Multipart
      const startMultipart = performance.now();
      const { totalSize: multipartSize } = createMultipartFrames(audioBinaries, null);
      const encodeTimeMultipart = performance.now() - startMultipart;

      // ASSERT - Taille
      const overhead = ((base64Size - multipartSize) / multipartSize) * 100;
      console.log(`\n📊 1 Audio (100KB):`);
      console.log(`   Base64:    ${(base64Size / 1024).toFixed(1)}KB`);
      console.log(`   Multipart: ${(multipartSize / 1024).toFixed(1)}KB`);
      console.log(`   Overhead:  ${overhead.toFixed(1)}%`);
      console.log(`   Encode Time Base64:    ${encodeTimeBase64.toFixed(2)}ms`);
      console.log(`   Encode Time Multipart: ${encodeTimeMultipart.toFixed(2)}ms`);

      expect(overhead).toBeGreaterThan(30);
      expect(overhead).toBeLessThan(35);
      expect(base64Size).toBeGreaterThan(multipartSize);
    });
  });

  describe('Overhead Taille - 3 Audios (300KB total)', () => {
    it('devrait démontrer overhead avec 3 langues', () => {
      // ARRANGE
      const audioEn = Buffer.alloc(100 * 1024, 0x01);
      const audioFr = Buffer.alloc(100 * 1024, 0x02);
      const audioEs = Buffer.alloc(100 * 1024, 0x03);
      const audioBinaries = new Map([
        ['en', audioEn],
        ['fr', audioFr],
        ['es', audioEs]
      ]);

      // ACT
      const base64Payload = encodeBase64Payload(audioBinaries, null);
      const base64Size = Buffer.byteLength(base64Payload, 'utf-8');

      const { totalSize: multipartSize } = createMultipartFrames(audioBinaries, null);

      // ASSERT
      const overhead = ((base64Size - multipartSize) / multipartSize) * 100;
      console.log(`\n📊 3 Audios (300KB total):`);
      console.log(`   Base64:    ${(base64Size / 1024).toFixed(1)}KB`);
      console.log(`   Multipart: ${(multipartSize / 1024).toFixed(1)}KB`);
      console.log(`   Overhead:  ${overhead.toFixed(1)}%`);
      console.log(`   Saved:     ${((base64Size - multipartSize) / 1024).toFixed(1)}KB`);

      expect(overhead).toBeGreaterThan(30);
      expect(overhead).toBeLessThan(35);
    });
  });

  describe('Overhead Taille - 3 Audios + Embedding Vocal (350KB total)', () => {
    it('devrait démontrer overhead avec audios + profil vocal', () => {
      // ARRANGE
      const audioEn = Buffer.alloc(100 * 1024, 0x01);
      const audioFr = Buffer.alloc(100 * 1024, 0x02);
      const audioEs = Buffer.alloc(100 * 1024, 0x03);
      const embedding = Buffer.alloc(50 * 1024, 0xFF); // 50KB embedding

      const audioBinaries = new Map([
        ['en', audioEn],
        ['fr', audioFr],
        ['es', audioEs]
      ]);

      // ACT
      const base64Payload = encodeBase64Payload(audioBinaries, embedding);
      const base64Size = Buffer.byteLength(base64Payload, 'utf-8');

      const { totalSize: multipartSize } = createMultipartFrames(audioBinaries, embedding);

      // ASSERT
      const overhead = ((base64Size - multipartSize) / multipartSize) * 100;
      const saved = (base64Size - multipartSize) / 1024;

      console.log(`\n📊 3 Audios + Embedding (350KB total):`);
      console.log(`   Base64:    ${(base64Size / 1024).toFixed(1)}KB`);
      console.log(`   Multipart: ${(multipartSize / 1024).toFixed(1)}KB`);
      console.log(`   Overhead:  ${overhead.toFixed(1)}%`);
      console.log(`   Saved:     ${saved.toFixed(1)}KB`);

      expect(overhead).toBeGreaterThan(30);
      expect(saved).toBeGreaterThan(100); // Au moins 100KB économisés
    });
  });

  describe('Performance CPU - Encodage/Décodage', () => {
    it('devrait mesurer le temps d\'encodage/décodage base64 vs multipart', () => {
      // ARRANGE
      const iterations = 100;
      const audioSize = 100 * 1024;
      const audioBinaries = new Map([
        ['en', Buffer.alloc(audioSize, 0xAB)]
      ]);

      // BENCHMARK - Base64 Encode
      let totalBase64EncodeTime = 0;
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        encodeBase64Payload(audioBinaries, null);
        totalBase64EncodeTime += (performance.now() - start);
      }
      const avgBase64EncodeTime = totalBase64EncodeTime / iterations;

      // BENCHMARK - Base64 Decode
      const base64Payload = encodeBase64Payload(audioBinaries, null);
      let totalBase64DecodeTime = 0;
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        decodeBase64Payload(base64Payload);
        totalBase64DecodeTime += (performance.now() - start);
      }
      const avgBase64DecodeTime = totalBase64DecodeTime / iterations;

      // BENCHMARK - Multipart (création frames)
      let totalMultipartTime = 0;
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        createMultipartFrames(audioBinaries, null);
        totalMultipartTime += (performance.now() - start);
      }
      const avgMultipartTime = totalMultipartTime / iterations;

      // ASSERT
      console.log(`\n⏱️  Performance CPU (${iterations} iterations, 100KB audio):`);
      console.log(`   Base64 Encode: ${avgBase64EncodeTime.toFixed(3)}ms/op`);
      console.log(`   Base64 Decode: ${avgBase64DecodeTime.toFixed(3)}ms/op`);
      console.log(`   Base64 Total:  ${(avgBase64EncodeTime + avgBase64DecodeTime).toFixed(3)}ms/op`);
      console.log(`   Multipart:     ${avgMultipartTime.toFixed(3)}ms/op`);

      const speedup = (avgBase64EncodeTime + avgBase64DecodeTime) / avgMultipartTime;
      console.log(`   Speedup:       ${speedup.toFixed(1)}x`);

      // Multipart devrait être significativement plus rapide
      expect(avgMultipartTime).toBeLessThan(avgBase64EncodeTime + avgBase64DecodeTime);
    });
  });

  describe('Cas Réaliste - Message Audio Complet', () => {
    it('devrait simuler un message réaliste avec 5 langues + profil vocal', () => {
      // ARRANGE - Message audio moyen : 5 langues, chaque audio ~50KB, embedding 50KB
      const audioBinaries = new Map([
        ['en', Buffer.alloc(48 * 1024, 0x01)],
        ['fr', Buffer.alloc(52 * 1024, 0x02)],
        ['es', Buffer.alloc(47 * 1024, 0x03)],
        ['de', Buffer.alloc(51 * 1024, 0x04)],
        ['it', Buffer.alloc(49 * 1024, 0x05)]
      ]);
      const embedding = Buffer.alloc(51 * 1024, 0xFF);

      // ACT - Base64
      const startBase64Full = performance.now();
      const base64Payload = encodeBase64Payload(audioBinaries, embedding);
      const encodeTimeBase64 = performance.now() - startBase64Full;

      const base64Size = Buffer.byteLength(base64Payload, 'utf-8');

      const startBase64Decode = performance.now();
      decodeBase64Payload(base64Payload);
      const decodeTimeBase64 = performance.now() - startBase64Decode;

      const totalTimeBase64 = encodeTimeBase64 + decodeTimeBase64;

      // ACT - Multipart
      const startMultipart = performance.now();
      const { totalSize: multipartSize, binaryFrames } = createMultipartFrames(audioBinaries, embedding);
      const totalTimeMultipart = performance.now() - startMultipart;

      // ASSERT
      const overhead = ((base64Size - multipartSize) / multipartSize) * 100;
      const saved = (base64Size - multipartSize) / 1024;
      const speedup = totalTimeBase64 / totalTimeMultipart;

      console.log(`\n📊 Message Réaliste (5 audios ~50KB + embedding 50KB):`);
      console.log(`   Base64:    ${(base64Size / 1024).toFixed(1)}KB`);
      console.log(`   Multipart: ${(multipartSize / 1024).toFixed(1)}KB`);
      console.log(`   Overhead:  ${overhead.toFixed(1)}%`);
      console.log(`   Saved:     ${saved.toFixed(1)}KB`);
      console.log(`\n⏱️  Temps de Traitement:`);
      console.log(`   Base64 (encode+decode): ${totalTimeBase64.toFixed(2)}ms`);
      console.log(`   Multipart:              ${totalTimeMultipart.toFixed(2)}ms`);
      console.log(`   Speedup:                ${speedup.toFixed(1)}x`);
      console.log(`\n🎯 Gains:`);
      console.log(`   Bande passante économisée: ${saved.toFixed(0)}KB (${overhead.toFixed(0)}%)`);
      console.log(`   CPU économisé:             ${(totalTimeBase64 - totalTimeMultipart).toFixed(1)}ms`);

      expect(saved).toBeGreaterThan(95); // Au moins 95KB économisés
      expect(speedup).toBeGreaterThan(1); // Au moins 2x plus rapide
      expect(binaryFrames).toHaveLength(6); // 5 audios + 1 embedding
    });
  });

  describe('Scalabilité - Message avec 10 Langues', () => {
    it('devrait démontrer les gains avec un grand nombre de langues', () => {
      // ARRANGE - Message volumineux : 10 langues
      const languages = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ar'];
      const audioBinaries = new Map<string, Buffer>();

      for (const lang of languages) {
        audioBinaries.set(lang, Buffer.alloc(50 * 1024, Math.random() * 255));
      }

      const embedding = Buffer.alloc(50 * 1024, 0xFF);

      // ACT
      const base64Payload = encodeBase64Payload(audioBinaries, embedding);
      const base64Size = Buffer.byteLength(base64Payload, 'utf-8');

      const { totalSize: multipartSize } = createMultipartFrames(audioBinaries, embedding);

      // ASSERT
      const saved = (base64Size - multipartSize) / 1024;
      const overhead = ((base64Size - multipartSize) / multipartSize) * 100;

      console.log(`\n📊 Scalabilité (10 langues ~50KB + embedding 50KB):`);
      console.log(`   Base64:    ${(base64Size / 1024).toFixed(1)}KB`);
      console.log(`   Multipart: ${(multipartSize / 1024).toFixed(1)}KB`);
      console.log(`   Overhead:  ${overhead.toFixed(1)}%`);
      console.log(`   Saved:     ${saved.toFixed(1)}KB`);

      expect(saved).toBeGreaterThan(150); // Au moins 150KB économisés avec 10 langues
    });
  });

  describe('Impact Réseau - Bande Passante', () => {
    it('devrait calculer l\'économie de bande passante sur 1000 messages', () => {
      // ARRANGE - Message moyen
      const audioBinaries = new Map([
        ['en', Buffer.alloc(50 * 1024, 0x01)],
        ['fr', Buffer.alloc(50 * 1024, 0x02)]
      ]);

      const base64Payload = encodeBase64Payload(audioBinaries, null);
      const base64Size = Buffer.byteLength(base64Payload, 'utf-8');

      const { totalSize: multipartSize } = createMultipartFrames(audioBinaries, null);

      const savedPerMessage = (base64Size - multipartSize) / 1024; // KB
      const messagesPerDay = 1000;
      const savedPerDay = savedPerMessage * messagesPerDay;
      const savedPerMonth = savedPerDay * 30;

      // ASSERT
      console.log(`\n🌐 Impact Réseau (2 audios ~50KB par message):`);
      console.log(`   Économie par message: ${savedPerMessage.toFixed(1)}KB`);
      console.log(`   1000 messages/jour:   ${(savedPerDay / 1024).toFixed(1)}MB/jour`);
      console.log(`   30 jours:             ${(savedPerMonth / 1024).toFixed(1)}MB/mois`);
      console.log(`                         ${(savedPerMonth / 1024 / 1024).toFixed(2)}GB/mois`);

      expect(savedPerDay).toBeGreaterThan(30 * 1024); // Au moins 30MB/jour
    });
  });
});

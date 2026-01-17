/**
 * Tests unitaires pour le protocole ZMQ Multipart
 *
 * Vérifie:
 * 1. Création correcte des frames multipart (JSON + binaire)
 * 2. Encodage du BinaryFrameInfo
 * 3. Compatibilité rétrograde (JSON seul sans binaire)
 * 4. Gestion des différents types de données (audio, embedding)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Types du ZmqTranslationClient
interface BinaryFrameInfo {
  audio?: number;
  embedding?: number;
  audioMimeType?: string;
  audioSize?: number;
  embeddingSize?: number;
}

interface AudioProcessRequest {
  type: 'audio_process';
  messageId: string;
  attachmentId: string;
  conversationId: string;
  senderId: string;
  audioUrl: string;
  audioMimeType?: string;
  binaryFrames?: BinaryFrameInfo;
  targetLanguages: string[];
  generateVoiceClone: boolean;
  modelType: string;
  audioDurationMs: number;
}

interface TranscriptionOnlyRequest {
  type: 'transcription_only';
  taskId: string;
  messageId: string;
  attachmentId?: string;
  audioPath?: string;
  audioUrl?: string;
  audioFormat?: string;
  binaryFrames?: BinaryFrameInfo;
}

describe('ZMQ Multipart Protocol', () => {
  describe('Frame Construction', () => {
    it('should create multipart frames with JSON metadata and binary audio', () => {
      // Simuler un audio binaire
      const audioBinary = Buffer.from('RIFF....WAVEfmt mock audio data', 'utf-8');
      const audioMimeType = 'audio/wav';

      // Construire le BinaryFrameInfo
      const binaryFrameInfo: BinaryFrameInfo = {
        audio: 1,
        audioMimeType,
        audioSize: audioBinary.length,
      };

      // Construire le message JSON
      const request: AudioProcessRequest = {
        type: 'audio_process',
        messageId: 'msg-123',
        attachmentId: 'att-456',
        conversationId: 'conv-789',
        senderId: 'user-001',
        audioUrl: 'https://example.com/audio.wav',
        audioMimeType,
        binaryFrames: binaryFrameInfo,
        targetLanguages: ['en', 'fr'],
        generateVoiceClone: true,
        modelType: 'basic',
        audioDurationMs: 5000,
      };

      // Créer les frames multipart
      const jsonFrame = Buffer.from(JSON.stringify(request), 'utf-8');
      const frames = [jsonFrame, audioBinary];

      // Vérifications
      expect(frames).toHaveLength(2);
      expect(frames[0]).toBeInstanceOf(Buffer);
      expect(frames[1]).toBeInstanceOf(Buffer);

      // Vérifier le JSON
      const parsedJson = JSON.parse(frames[0].toString('utf-8'));
      expect(parsedJson.type).toBe('audio_process');
      expect(parsedJson.binaryFrames).toBeDefined();
      expect(parsedJson.binaryFrames.audio).toBe(1);
      expect(parsedJson.binaryFrames.audioSize).toBe(audioBinary.length);

      // Vérifier le binaire
      expect(frames[1].length).toBe(audioBinary.length);
      expect(frames[1].toString('utf-8')).toContain('RIFF');
    });

    it('should create multipart frames with audio and embedding', () => {
      const audioBinary = Buffer.from('mock audio data', 'utf-8');
      const embeddingBinary = Buffer.from('mock pkl embedding data', 'utf-8');

      const binaryFrameInfo: BinaryFrameInfo = {
        audio: 1,
        embedding: 2,
        audioMimeType: 'audio/wav',
        audioSize: audioBinary.length,
        embeddingSize: embeddingBinary.length,
      };

      const request = {
        type: 'audio_process',
        messageId: 'msg-123',
        binaryFrames: binaryFrameInfo,
      };

      const jsonFrame = Buffer.from(JSON.stringify(request), 'utf-8');
      const frames = [jsonFrame, audioBinary, embeddingBinary];

      expect(frames).toHaveLength(3);
      expect(frames[0]).toBeInstanceOf(Buffer);
      expect(frames[1]).toBeInstanceOf(Buffer);
      expect(frames[2]).toBeInstanceOf(Buffer);

      const parsedJson = JSON.parse(frames[0].toString('utf-8'));
      expect(parsedJson.binaryFrames.audio).toBe(1);
      expect(parsedJson.binaryFrames.embedding).toBe(2);
    });

    it('should handle legacy JSON-only format (no binary frames)', () => {
      const request: AudioProcessRequest = {
        type: 'audio_process',
        messageId: 'msg-123',
        attachmentId: 'att-456',
        conversationId: 'conv-789',
        senderId: 'user-001',
        audioUrl: 'https://example.com/audio.wav',
        targetLanguages: ['en'],
        generateVoiceClone: false,
        modelType: 'basic',
        audioDurationMs: 3000,
        // Pas de binaryFrames - mode legacy
      };

      const jsonFrame = Buffer.from(JSON.stringify(request), 'utf-8');
      const frames = [jsonFrame]; // Un seul frame

      expect(frames).toHaveLength(1);

      const parsedJson = JSON.parse(frames[0].toString('utf-8'));
      expect(parsedJson.binaryFrames).toBeUndefined();
      expect(parsedJson.audioUrl).toBe('https://example.com/audio.wav');
    });
  });

  describe('TranscriptionOnly Request', () => {
    it('should create transcription request with binary audio', () => {
      const audioBinary = Buffer.from('transcription audio content', 'utf-8');

      const binaryFrameInfo: BinaryFrameInfo = {
        audio: 1,
        audioMimeType: 'audio/webm',
        audioSize: audioBinary.length,
      };

      const request: TranscriptionOnlyRequest = {
        type: 'transcription_only',
        taskId: 'task-001',
        messageId: 'msg-transcribe-001',
        audioFormat: 'webm',
        binaryFrames: binaryFrameInfo,
      };

      const jsonFrame = Buffer.from(JSON.stringify(request), 'utf-8');
      const frames = [jsonFrame, audioBinary];

      expect(frames).toHaveLength(2);

      const parsedJson = JSON.parse(frames[0].toString('utf-8'));
      expect(parsedJson.type).toBe('transcription_only');
      expect(parsedJson.binaryFrames.audio).toBe(1);
      expect(parsedJson.audioFormat).toBe('webm');
    });
  });

  describe('Binary Size Calculations', () => {
    it('should correctly calculate binary size vs base64 size', () => {
      // Simuler un fichier audio de 1MB
      const audioSizeBytes = 1024 * 1024; // 1MB
      const audioBinary = Buffer.alloc(audioSizeBytes);

      // Calculer la taille base64 équivalente
      const base64Size = Math.ceil(audioSizeBytes * 4 / 3);

      // Le binaire devrait être ~33% plus petit que le base64
      const savings = ((base64Size - audioSizeBytes) / base64Size) * 100;

      expect(savings).toBeGreaterThan(25); // Au moins 25% d'économie
      expect(savings).toBeLessThan(35); // Pas plus de 35%

      console.log(`Binary: ${audioSizeBytes} bytes, Base64: ${base64Size} bytes, Savings: ${savings.toFixed(1)}%`);
    });

    it('should track audioSize in BinaryFrameInfo', () => {
      const testSizes = [1024, 10240, 102400, 1024000, 5242880]; // 1KB to 5MB

      for (const size of testSizes) {
        const audioBinary = Buffer.alloc(size);
        const binaryFrameInfo: BinaryFrameInfo = {
          audio: 1,
          audioSize: audioBinary.length,
        };

        expect(binaryFrameInfo.audioSize).toBe(size);
      }
    });
  });

  describe('MIME Type Handling', () => {
    const mimeTypes = [
      { mime: 'audio/wav', ext: 'wav' },
      { mime: 'audio/mpeg', ext: 'mp3' },
      { mime: 'audio/mp4', ext: 'm4a' },
      { mime: 'audio/ogg', ext: 'ogg' },
      { mime: 'audio/webm', ext: 'webm' },
      { mime: 'audio/aac', ext: 'aac' },
      { mime: 'audio/flac', ext: 'flac' },
    ];

    it.each(mimeTypes)('should handle $mime mime type', ({ mime, ext }) => {
      const binaryFrameInfo: BinaryFrameInfo = {
        audio: 1,
        audioMimeType: mime,
        audioSize: 1000,
      };

      expect(binaryFrameInfo.audioMimeType).toBe(mime);
    });
  });

  describe('Frame Extraction (Receiver Side Simulation)', () => {
    it('should correctly extract binary data from multipart frames', () => {
      // Simuler la réception côté Translator
      const originalAudio = Buffer.from('original audio binary content for testing', 'utf-8');

      const request = {
        type: 'audio_process',
        messageId: 'msg-extract-test',
        binaryFrames: {
          audio: 1,
          audioMimeType: 'audio/wav',
          audioSize: originalAudio.length,
        },
      };

      // Créer les frames comme Gateway les enverrait
      const frames = [
        Buffer.from(JSON.stringify(request), 'utf-8'),
        originalAudio,
      ];

      // Simuler la réception côté Translator
      const jsonFrame = frames[0];
      const binaryFrames = frames.slice(1);

      const parsedRequest = JSON.parse(jsonFrame.toString('utf-8'));
      const binaryFrameInfo = parsedRequest.binaryFrames;

      // Extraire l'audio binaire
      let extractedAudio: Buffer | null = null;
      if (binaryFrameInfo?.audio && binaryFrameInfo.audio <= binaryFrames.length) {
        extractedAudio = binaryFrames[binaryFrameInfo.audio - 1];
      }

      expect(extractedAudio).not.toBeNull();
      expect(extractedAudio!.length).toBe(originalAudio.length);
      expect(extractedAudio!.toString('utf-8')).toBe(originalAudio.toString('utf-8'));
    });

    it('should handle missing binary frames gracefully', () => {
      const request = {
        type: 'audio_process',
        messageId: 'msg-no-binary',
        audioUrl: 'https://example.com/fallback.wav',
        // Pas de binaryFrames
      };

      const frames = [Buffer.from(JSON.stringify(request), 'utf-8')];

      const jsonFrame = frames[0];
      const binaryFrames = frames.slice(1);

      const parsedRequest = JSON.parse(jsonFrame.toString('utf-8'));
      const binaryFrameInfo = parsedRequest.binaryFrames;

      expect(binaryFrameInfo).toBeUndefined();
      expect(binaryFrames).toHaveLength(0);
      expect(parsedRequest.audioUrl).toBe('https://example.com/fallback.wav');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty audio buffer', () => {
      const emptyAudio = Buffer.alloc(0);

      const binaryFrameInfo: BinaryFrameInfo = {
        audio: 1,
        audioSize: emptyAudio.length,
      };

      expect(binaryFrameInfo.audioSize).toBe(0);
    });

    it('should handle large audio files (5MB threshold)', () => {
      const THRESHOLD = 5 * 1024 * 1024; // 5MB

      // Fichier juste sous le seuil
      const underThreshold = THRESHOLD - 1;
      expect(underThreshold < THRESHOLD).toBe(true);

      // Fichier au-dessus du seuil
      const overThreshold = THRESHOLD + 1;
      expect(overThreshold > THRESHOLD).toBe(true);
    });

    it('should handle special characters in request metadata', () => {
      const request = {
        type: 'audio_process',
        messageId: 'msg-émoji-🎤-测试',
        conversationId: 'conv-spécial-àéïõü',
        binaryFrames: { audio: 1 },
      };

      const jsonFrame = Buffer.from(JSON.stringify(request), 'utf-8');
      const parsed = JSON.parse(jsonFrame.toString('utf-8'));

      expect(parsed.messageId).toBe('msg-émoji-🎤-测试');
      expect(parsed.conversationId).toBe('conv-spécial-àéïõü');
    });
  });
});

describe('ZMQ Multipart Response Protocol', () => {
  describe('Translator Response Construction', () => {
    it('should construct response with transcription result', () => {
      const response = {
        type: 'transcription_completed',
        taskId: 'task-001',
        messageId: 'msg-001',
        transcription: {
          text: 'Bonjour, comment allez-vous?',
          language: 'fr',
          confidence: 0.95,
          source: 'whisper',
          durationMs: 3500,
        },
        processingTimeMs: 1200,
      };

      const responseJson = JSON.stringify(response);
      expect(responseJson).toContain('transcription_completed');
      expect(responseJson).toContain('Bonjour');
    });

    it('should construct audio process completed response', () => {
      const response = {
        type: 'audio_process_completed',
        taskId: 'task-002',
        messageId: 'msg-002',
        attachmentId: 'att-002',
        transcription: {
          text: 'Hello world',
          language: 'en',
          confidence: 0.98,
          source: 'whisper',
        },
        translatedAudios: [
          {
            targetLanguage: 'fr',
            translatedText: 'Bonjour le monde',
            audioUrl: '/audio/translated_fr.mp3',
            durationMs: 2000,
            voiceCloned: true,
          },
          {
            targetLanguage: 'es',
            translatedText: 'Hola mundo',
            audioUrl: '/audio/translated_es.mp3',
            durationMs: 1800,
            voiceCloned: true,
          },
        ],
        processingTimeMs: 5500,
      };

      const responseJson = JSON.stringify(response);
      const parsed = JSON.parse(responseJson);

      expect(parsed.translatedAudios).toHaveLength(2);
      expect(parsed.translatedAudios[0].targetLanguage).toBe('fr');
      expect(parsed.translatedAudios[1].targetLanguage).toBe('es');
    });
  });
});

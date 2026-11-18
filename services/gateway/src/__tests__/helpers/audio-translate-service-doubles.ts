import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = jest.Mock<any>;

export class MockZmqClient extends EventEmitter {
  sendVoiceAPIRequest: MockFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  sendTranscriptionOnlyRequest: MockFn = jest.fn<() => Promise<string>>();
}

export function createMockPrisma() {
  return {
    messageAttachment: {
      findUnique: jest.fn() as MockFn,
      update: jest.fn<() => Promise<any>>().mockResolvedValue({}) as MockFn,
    },
    userVoiceModel: {
      findUnique: jest.fn() as MockFn,
      upsert: jest.fn() as MockFn,
    },
  };
}

export const VOICE_TRANSLATE_SYNC_TIMEOUT = 16 * 60_000;
export const ASYNC_SUBMIT_TIMEOUT = 5_000;
export const DEFAULT_TIMEOUT = 60_000;

export const mockTranslationResult = {
  translationId: 'trans-001',
  originalAudio: {
    transcription: 'Hello world',
    language: 'en',
    durationMs: 2000,
    confidence: 0.95,
  },
  translations: [
    {
      targetLanguage: 'fr',
      translatedText: 'Bonjour le monde',
      audioUrl: 'https://cdn.meeshy.me/audio/fr.mp3',
      durationMs: 2100,
      voiceCloned: true,
      voiceQuality: 0.92,
    },
  ],
  processingTimeMs: 3500,
};

export const mockTranscriptionResult = {
  taskId: 'task-transcribe-111',
  messageId: 'msg-111',
  attachmentId: 'att-111',
  transcription: {
    text: 'Hello from audio',
    language: 'en',
    confidence: 0.97,
    durationMs: 1500,
    source: 'whisper',
    segments: [{ text: 'Hello from audio', startMs: 0, endMs: 1500 }],
  },
  processingTimeMs: 800,
};

export function emitVoiceSuccess(zmq: MockZmqClient, result: any): void {
  const calls = zmq.sendVoiceAPIRequest.mock.calls;
  const req = calls[calls.length - 1][0] as { taskId: string };
  zmq.emit('voiceAPISuccess', { taskId: req.taskId, result, processingTimeMs: 100 });
}

export function emitVoiceError(zmq: MockZmqClient, error: string, errorCode: string): void {
  const calls = zmq.sendVoiceAPIRequest.mock.calls;
  const req = calls[calls.length - 1][0] as { taskId: string };
  zmq.emit('voiceAPIError', { taskId: req.taskId, error, errorCode });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests

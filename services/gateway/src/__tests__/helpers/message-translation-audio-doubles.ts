import { jest } from '@jest/globals';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = jest.Mock<any>;

export const createMockPrisma = () => ({
  conversation: {
    findFirst: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn,
    create: jest.fn() as MockFn,
    update: jest.fn() as MockFn,
    updateMany: jest.fn() as MockFn
  },
  message: {
    findFirst: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn,
    create: jest.fn() as MockFn,
    update: jest.fn() as MockFn
  },
  messageTranslation: {
    findFirst: jest.fn() as MockFn,
    findMany: jest.fn() as MockFn,
    create: jest.fn() as MockFn,
    update: jest.fn() as MockFn,
    upsert: jest.fn() as MockFn,
    deleteMany: jest.fn() as MockFn
  },
  participant: {
    findMany: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn
  },
  userStats: {
    upsert: jest.fn() as MockFn
  },
  messageAttachment: {
    findUnique: jest.fn() as MockFn,
    update: jest.fn() as MockFn
  },
  user: {
    findUnique: jest.fn() as MockFn
  },
  serverEncryptionKey: {
    findUnique: jest.fn() as MockFn
  },
  userVoiceModel: {
    upsert: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn
  }
});

export async function flushAsync(count = 3) {
  for (let i = 0; i < count; i++) {
    await new Promise<void>(r => setImmediate(r));
  }
}

export function makeTranslatedAudio(overrides: Record<string, unknown> = {}) {
  return {
    targetLanguage: 'fr',
    translatedText: 'Bonjour',
    audioUrl: '',
    audioPath: '',
    durationMs: 1000,
    voiceCloned: false,
    voiceQuality: 0.8,
    audioMimeType: 'audio/mp3',
    ...overrides
  };
}

export function makeAudioProcessCompletedData(overrides: Record<string, unknown> = {}) {
  return {
    taskId: 'task-audio-1',
    messageId: 'msg-1',
    attachmentId: 'att-1',
    transcription: {
      text: 'Hello world',
      language: 'en',
      confidence: 0.95,
      source: 'whisper',
      durationMs: 2000
    },
    translatedAudios: [makeTranslatedAudio()],
    voiceModelUserId: 'user-1',
    voiceModelQuality: 0.9,
    processingTimeMs: 500,
    ...overrides
  };
}

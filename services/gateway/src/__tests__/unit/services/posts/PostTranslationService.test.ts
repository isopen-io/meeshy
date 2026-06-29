/**
 * PostTranslationService Unit Tests
 *
 * @jest-environment node
 */

// Mock logger BEFORE all imports — called at module load time
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// Mock url-content to control isUrlOnly behaviour
jest.mock('../../../../utils/url-content', () => ({
  isUrlOnly: jest.fn().mockReturnValue(false),
}));

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PostTranslationService } from '../../../../services/posts/PostTranslationService';
import { isUrlOnly } from '../../../../utils/url-content';
import type { TranslationCompletedEvent } from '../../../../services/zmq-translation/types';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isUrlOnlyMock = isUrlOnly as jest.Mock;

function makeTranslationEvent(overrides: Partial<TranslationCompletedEvent> = {}): TranslationCompletedEvent {
  return {
    type: 'translation_completed',
    taskId: 'task-1',
    targetLanguage: 'en',
    timestamp: Date.now(),
    result: {
      messageId: 'post:post-abc',
      translatedText: 'Hello world',
      sourceLanguage: 'fr',
      targetLanguage: 'en',
      confidenceScore: 0.95,
      processingTime: 100,
      modelType: 'nllb',
      translatorModel: 'nllb-200',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockTranslateToMultipleLanguages: jest.Mock;
let mockZmqOn: jest.Mock;
let mockBroadcastPostTranslationUpdated: jest.Mock;
let mockBroadcastCommentTranslationUpdated: jest.Mock;
let mockPostFindUnique: jest.Mock;
let mockPostCommentFindUnique: jest.Mock;
let mockRunCommandRaw: jest.Mock;

function makeMocks() {
  mockTranslateToMultipleLanguages = jest.fn().mockResolvedValue(undefined);
  mockZmqOn = jest.fn();
  mockBroadcastPostTranslationUpdated = jest.fn().mockResolvedValue(undefined);
  mockBroadcastCommentTranslationUpdated = jest.fn().mockResolvedValue(undefined);
  mockPostFindUnique = jest.fn().mockResolvedValue(null);
  mockPostCommentFindUnique = jest.fn().mockResolvedValue(null);
  mockRunCommandRaw = jest.fn().mockResolvedValue({ ok: 1 });
}

function makeZmqClient() {
  return {
    translateToMultipleLanguages: mockTranslateToMultipleLanguages,
    on: mockZmqOn,
  };
}

function makeSocialEvents() {
  return {
    broadcastPostTranslationUpdated: mockBroadcastPostTranslationUpdated,
    broadcastCommentTranslationUpdated: mockBroadcastCommentTranslationUpdated,
  };
}

function makePrisma(): PrismaClient {
  return {
    post: {
      findUnique: mockPostFindUnique,
    },
    postComment: {
      findUnique: mockPostCommentFindUnique,
    },
    $runCommandRaw: mockRunCommandRaw,
  } as unknown as PrismaClient;
}

function initService() {
  return PostTranslationService.init(
    makePrisma(),
    makeZmqClient() as never,
    makeSocialEvents() as never,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  makeMocks();
  isUrlOnlyMock.mockReturnValue(false);
  // Reset singleton
  (PostTranslationService as unknown as { _shared: null })._shared = null;
});

// ---------------------------------------------------------------------------
// translatePost
// ---------------------------------------------------------------------------

describe('PostTranslationService.translatePost', () => {
  it('skips ZMQ when content is URL-only', async () => {
    isUrlOnlyMock.mockReturnValue(true);
    const service = initService();

    await service.translatePost('post-1', 'https://example.com');

    expect(mockTranslateToMultipleLanguages).not.toHaveBeenCalled();
  });

  it('sends ZMQ request with correct messageId and context', async () => {
    const service = initService();

    await service.translatePost('post-1', 'Bonjour le monde', 'fr');

    expect(mockTranslateToMultipleLanguages).toHaveBeenCalledWith(
      'Bonjour le monde',
      'fr',
      expect.not.arrayContaining(['fr']),
      'post:post-1',
      'post_context:post-1',
    );
  });

  it('filters source language from target languages', async () => {
    const service = initService();

    await service.translatePost('post-2', 'Hello world', 'en');

    const [, , targetLanguages] = mockTranslateToMultipleLanguages.mock.calls[0] as [string, string, string[]];
    expect(targetLanguages).not.toContain('en');
    expect(targetLanguages.length).toBeGreaterThan(0);
  });

  it('auto-detects source language when not provided', async () => {
    const service = initService();

    // French text — detectLanguage should identify it as 'fr'
    await service.translatePost('post-3', 'Je suis un message en français');

    const [, sourceLang] = mockTranslateToMultipleLanguages.mock.calls[0] as [string, string];
    expect(sourceLang).toBe('fr');
  });

  it('auto-detects Spanish source language', async () => {
    const service = initService();

    // Spanish-distinctive words: "pero", "más", "del" — none appear in French regex
    await service.translatePost('post-4', 'Pero más del tiempo libre');

    const [, sourceLang] = mockTranslateToMultipleLanguages.mock.calls[0] as [string, string];
    expect(sourceLang).toBe('es');
  });

  it('catches and silently swallows ZMQ errors', async () => {
    mockTranslateToMultipleLanguages.mockRejectedValue(new Error('ZMQ connection refused'));
    const service = initService();

    await expect(service.translatePost('post-5', 'Hello world', 'en')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// translateComment
// ---------------------------------------------------------------------------

describe('PostTranslationService.translateComment', () => {
  it('sends ZMQ with comment messageId prefix', async () => {
    const service = initService();

    await service.translateComment('comment-99', 'post-1', 'Bonjour', 'fr');

    expect(mockTranslateToMultipleLanguages).toHaveBeenCalledWith(
      'Bonjour',
      'fr',
      expect.any(Array),
      'comment:comment-99',
      'comment_context:post-1',
    );
  });

  it('filters source language from comment target languages', async () => {
    const service = initService();

    await service.translateComment('comment-1', 'post-1', 'Hello', 'en');

    const [, , targetLanguages] = mockTranslateToMultipleLanguages.mock.calls[0] as [string, string, string[]];
    expect(targetLanguages).not.toContain('en');
  });

  it('catches and silently swallows ZMQ errors for comments', async () => {
    mockTranslateToMultipleLanguages.mockRejectedValue(new Error('ZMQ error'));
    const service = initService();

    await expect(
      service.translateComment('comment-2', 'post-1', 'Test', 'en'),
    ).resolves.toBeUndefined();
  });

  it('auto-detects source language for comments', async () => {
    const service = initService();

    await service.translateComment('comment-3', 'post-1', 'Je suis heureux');

    const [, sourceLang] = mockTranslateToMultipleLanguages.mock.calls[0] as [string, string];
    expect(sourceLang).toBe('fr');
  });
});

// ---------------------------------------------------------------------------
// translateOnDemand
// ---------------------------------------------------------------------------

describe('PostTranslationService.translateOnDemand', () => {
  it('returns early when post not found', async () => {
    mockPostFindUnique.mockResolvedValue(null);
    const service = initService();

    await service.translateOnDemand('missing-post', 'en');

    expect(mockTranslateToMultipleLanguages).not.toHaveBeenCalled();
  });

  it('returns early when post has no content', async () => {
    mockPostFindUnique.mockResolvedValue({ content: null, originalLanguage: 'fr', translations: null });
    const service = initService();

    await service.translateOnDemand('post-1', 'en');

    expect(mockTranslateToMultipleLanguages).not.toHaveBeenCalled();
  });

  it('skips when target language equals source language', async () => {
    mockPostFindUnique.mockResolvedValue({
      content: 'Hello',
      originalLanguage: 'en',
      translations: null,
    });
    const service = initService();

    await service.translateOnDemand('post-1', 'en');

    expect(mockTranslateToMultipleLanguages).not.toHaveBeenCalled();
  });

  it('skips when translation already cached for target language', async () => {
    mockPostFindUnique.mockResolvedValue({
      content: 'Bonjour',
      originalLanguage: 'fr',
      translations: { en: { text: 'Hello', translationModel: 'nllb', confidenceScore: 0.9 } },
    });
    const service = initService();

    await service.translateOnDemand('post-1', 'en');

    expect(mockTranslateToMultipleLanguages).not.toHaveBeenCalled();
  });

  it('sends ZMQ for on-demand translation when not cached', async () => {
    mockPostFindUnique.mockResolvedValue({
      content: 'Bonjour',
      originalLanguage: 'fr',
      translations: {},
    });
    const service = initService();

    await service.translateOnDemand('post-1', 'en');

    expect(mockTranslateToMultipleLanguages).toHaveBeenCalledWith(
      'Bonjour',
      'fr',
      ['en'],
      'post:post-1',
      'post_context:post-1',
    );
  });

  it('catches ZMQ errors silently in on-demand path', async () => {
    mockPostFindUnique.mockResolvedValue({
      content: 'Bonjour',
      originalLanguage: 'fr',
      translations: null,
    });
    mockTranslateToMultipleLanguages.mockRejectedValue(new Error('ZMQ down'));
    const service = initService();

    await expect(service.translateOnDemand('post-1', 'en')).resolves.toBeUndefined();
  });

  it('auto-detects language when originalLanguage is null', async () => {
    mockPostFindUnique.mockResolvedValue({
      content: 'Je suis content',
      originalLanguage: null,
      translations: null,
    });
    const service = initService();

    await service.translateOnDemand('post-1', 'en');

    const [, sourceLang] = mockTranslateToMultipleLanguages.mock.calls[0] as [string, string];
    expect(sourceLang).toBe('fr');
  });
});

// ---------------------------------------------------------------------------
// ZMQ listener — handlePostTranslationCompleted
// ---------------------------------------------------------------------------

describe('PostTranslationService ZMQ listener: post translation', () => {
  function captureListener(): (event: TranslationCompletedEvent) => void {
    initService();
    expect(mockZmqOn).toHaveBeenCalledWith('translationCompleted', expect.any(Function));
    return mockZmqOn.mock.calls[0][1] as (event: TranslationCompletedEvent) => void;
  }

  it('persists translation to MongoDB for post messageId', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const listener = captureListener();
    const event = makeTranslationEvent({
      targetLanguage: 'en',
      result: {
        messageId: 'post:post-abc',
        translatedText: 'Hello',
        sourceLanguage: 'fr',
        targetLanguage: 'en',
        confidenceScore: 0.9,
        processingTime: 50,
        modelType: 'nllb',
        translatorModel: 'nllb-200',
      },
    });

    listener(event);
    // Allow async handlers to run
    await new Promise((r) => setTimeout(r, 20));

    expect(mockRunCommandRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        update: 'Post',
        updates: expect.arrayContaining([
          expect.objectContaining({
            q: { _id: { $oid: 'post-abc' } },
            u: { $set: { 'translations.en': expect.objectContaining({ text: 'Hello' }) } },
          }),
        ]),
      }),
    );
  });

  it('broadcasts post translation after persist', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const listener = captureListener();

    listener(makeTranslationEvent());
    await new Promise((r) => setTimeout(r, 20));

    expect(mockBroadcastPostTranslationUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'post-abc', language: 'en' }),
      'author-1',
      'PUBLIC',
      [],
    );
  });

  it('does not broadcast when post not found after persist', async () => {
    mockPostFindUnique.mockResolvedValue(null);
    const listener = captureListener();

    listener(makeTranslationEvent());
    await new Promise((r) => setTimeout(r, 20));

    expect(mockBroadcastPostTranslationUpdated).not.toHaveBeenCalled();
  });

  it('ignores events with no messageId', async () => {
    const listener = captureListener();
    const event = makeTranslationEvent({
      result: {
        messageId: '',
        translatedText: 'Hello',
        sourceLanguage: 'fr',
        targetLanguage: 'en',
        confidenceScore: 0.9,
        processingTime: 50,
        modelType: 'nllb',
      },
    });

    listener(event);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockRunCommandRaw).not.toHaveBeenCalled();
  });

  it('handles $runCommandRaw failure without throwing', async () => {
    mockRunCommandRaw.mockRejectedValue(new Error('MongoDB error'));
    const listener = captureListener();

    listener(makeTranslationEvent());
    await new Promise((r) => setTimeout(r, 20));

    // No uncaught promise rejections — test passes if we reach here
    expect(mockBroadcastPostTranslationUpdated).not.toHaveBeenCalled();
  });

  it('uses nllb as default model when translatorModel is absent', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const listener = captureListener();
    const event = makeTranslationEvent({
      result: {
        messageId: 'post:post-abc',
        translatedText: 'Hello',
        sourceLanguage: 'fr',
        targetLanguage: 'en',
        confidenceScore: 0.9,
        processingTime: 50,
        modelType: 'nllb',
        translatorModel: undefined,
      },
    });

    listener(event);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockRunCommandRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.arrayContaining([
          expect.objectContaining({
            u: { $set: { 'translations.en': expect.objectContaining({ translationModel: 'nllb' }) } },
          }),
        ]),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// ZMQ listener — handleCommentTranslationCompleted
// ---------------------------------------------------------------------------

describe('PostTranslationService ZMQ listener: comment translation', () => {
  function captureListener(): (event: TranslationCompletedEvent) => void {
    initService();
    return mockZmqOn.mock.calls[0][1] as (event: TranslationCompletedEvent) => void;
  }

  it('persists translation to MongoDB for comment messageId', async () => {
    mockPostCommentFindUnique.mockResolvedValue({ postId: 'post-xyz' });
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const listener = captureListener();
    const event = makeTranslationEvent({
      targetLanguage: 'es',
      result: {
        messageId: 'comment:comment-42',
        translatedText: 'Hola mundo',
        sourceLanguage: 'en',
        targetLanguage: 'es',
        confidenceScore: 0.88,
        processingTime: 60,
        modelType: 'nllb',
        translatorModel: 'nllb-200',
      },
    });

    listener(event);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockRunCommandRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        update: 'PostComment',
        updates: expect.arrayContaining([
          expect.objectContaining({
            q: { _id: { $oid: 'comment-42' } },
            u: { $set: { 'translations.es': expect.objectContaining({ text: 'Hola mundo' }) } },
          }),
        ]),
      }),
    );
  });

  it('broadcasts comment translation after persist', async () => {
    mockPostCommentFindUnique.mockResolvedValue({ postId: 'post-xyz' });
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'FRIENDS',
      visibilityUserIds: [],
    });
    const listener = captureListener();
    const event = makeTranslationEvent({
      targetLanguage: 'es',
      result: {
        messageId: 'comment:comment-42',
        translatedText: 'Hola',
        sourceLanguage: 'en',
        targetLanguage: 'es',
        confidenceScore: 0.88,
        processingTime: 60,
        modelType: 'nllb',
      },
    });

    listener(event);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockBroadcastCommentTranslationUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'post-xyz', commentId: 'comment-42', language: 'es' }),
      'author-1',
      'FRIENDS',
      [],
    );
  });

  it('does not broadcast when comment not found after persist', async () => {
    mockPostCommentFindUnique.mockResolvedValue(null);
    const listener = captureListener();
    const event = makeTranslationEvent({
      result: {
        messageId: 'comment:comment-missing',
        translatedText: 'Hello',
        sourceLanguage: 'fr',
        targetLanguage: 'en',
        confidenceScore: 0.9,
        processingTime: 50,
        modelType: 'nllb',
      },
    });

    listener(event);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockBroadcastCommentTranslationUpdated).not.toHaveBeenCalled();
  });

  it('handles MongoDB failure silently for comment', async () => {
    mockRunCommandRaw.mockRejectedValue(new Error('DB error'));
    const listener = captureListener();
    const event = makeTranslationEvent({
      result: {
        messageId: 'comment:comment-err',
        translatedText: 'Hi',
        sourceLanguage: 'fr',
        targetLanguage: 'en',
        confidenceScore: 0.9,
        processingTime: 50,
        modelType: 'nllb',
      },
    });

    listener(event);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockBroadcastCommentTranslationUpdated).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

describe('PostTranslationService singleton', () => {
  it('throws when accessing shared before init', () => {
    (PostTranslationService as unknown as { _shared: null })._shared = null;
    expect(() => PostTranslationService.shared).toThrow(
      'PostTranslationService not initialized',
    );
  });

  it('returns the same instance after init', () => {
    const a = initService();
    const b = PostTranslationService.shared;
    expect(a).toBe(b);
  });
});

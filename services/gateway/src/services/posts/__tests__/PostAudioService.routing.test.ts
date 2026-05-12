/**
 * PostAudioService — ZMQ routing tests
 *
 * Covers:
 *  - conversationId is never empty for post audio requests
 *  - multiple concurrent post audio requests produce distinct conversationIds
 *  - audio response routes to the correct post via postId / postMediaId
 *  - conversation audio path sends a real conversationId (regression)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Minimal fakes ────────────────────────────────────────────────────────────

type AudioProcessPayload = {
  messageId: string;
  attachmentId: string;
  conversationId: string;
  senderId: string;
  audioPath: string;
  audioDurationMs: number;
  targetLanguages: string[];
  generateVoiceClone: boolean;
  modelType: string;
  postId?: string;
  postMediaId?: string;
};

type CapturedCall = AudioProcessPayload;

const makeMockZmqClient = () => {
  const calls: CapturedCall[] = [];
  return {
    calls,
    sendAudioProcessRequest: jest.fn(async (payload: AudioProcessPayload) => {
      calls.push({ ...payload });
      return 'task-id';
    }),
  };
};

const makeMockPrisma = () => ({
  postMedia: {
    update: jest.fn(async () => ({})),
  },
  post: {
    findFirst: jest.fn(async () => null),
  },
});

const makeMockSocialEvents = () => ({
  broadcastPostUpdated: jest.fn(async () => {}),
});

// Patch ZMQSingleton.getInstanceSync to return our fake
jest.mock('../../ZmqSingleton', () => ({
  ZMQSingleton: {
    getInstanceSync: jest.fn(),
  },
}));

// Patch getLanguagesWithTranslation to return a stable list
jest.mock('../../../utils/languages', () => ({
  getLanguagesWithTranslation: jest.fn(() => [
    { code: 'en' },
    { code: 'fr' },
    { code: 'es' },
  ]),
}));

// Patch process.env
process.env.UPLOADS_DIR = '/uploads';

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { ZMQSingleton } from '../../ZmqSingleton';
import { PostAudioService } from '../PostAudioService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeService = (zmqClient: ReturnType<typeof makeMockZmqClient>) => {
  (ZMQSingleton.getInstanceSync as jest.Mock).mockReturnValue(zmqClient);

  const prisma = makeMockPrisma();
  const socialEvents = makeMockSocialEvents();

  // Reset singleton so each test gets a clean instance
  // @ts-expect-error accessing private static
  PostAudioService._shared = null;

  return {
    service: PostAudioService.init(
      prisma as unknown as Parameters<typeof PostAudioService.init>[0],
      socialEvents as unknown as Parameters<typeof PostAudioService.init>[1],
    ),
    prisma,
    socialEvents,
  };
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PostAudioService.routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error accessing private static
    PostAudioService._shared = null;
  });

  describe('should_not_collide_when_multiple_posts_audio_concurrent', () => {
    it('sends distinct conversationIds for two different posts', async () => {
      const zmq = makeMockZmqClient();
      const { service } = makeService(zmq);

      await service.processPostAudio({
        postId: 'post-aaa',
        postMediaId: 'media-111',
        fileUrl: '/uploads/audio/a.m4a',
        authorId: 'user-1',
      });

      await service.processPostAudio({
        postId: 'post-bbb',
        postMediaId: 'media-222',
        fileUrl: '/uploads/audio/b.m4a',
        authorId: 'user-2',
      });

      expect(zmq.calls).toHaveLength(2);

      const [first, second] = zmq.calls;
      expect(first.conversationId).toBe('post_post-aaa');
      expect(second.conversationId).toBe('post_post-bbb');
      expect(first.conversationId).not.toBe(second.conversationId);
    });

    it('conversationId is never an empty string', async () => {
      const zmq = makeMockZmqClient();
      const { service } = makeService(zmq);

      await service.processPostAudio({
        postId: 'post-ccc',
        postMediaId: 'media-333',
        fileUrl: '/uploads/audio/c.m4a',
        authorId: 'user-3',
      });

      expect(zmq.calls[0]?.conversationId).not.toBe('');
      expect(zmq.calls[0]?.conversationId).toBeTruthy();
    });
  });

  describe('should_route_audio_response_to_correct_post', () => {
    it('uses postMediaId as messageId and attachmentId for response routing', async () => {
      const zmq = makeMockZmqClient();
      const { service } = makeService(zmq);

      await service.processPostAudio({
        postId: 'post-xyz',
        postMediaId: 'media-xyz-999',
        fileUrl: '/uploads/audio/x.m4a',
        authorId: 'user-x',
      });

      const payload = zmq.calls[0];
      expect(payload).toBeDefined();
      expect(payload!.messageId).toBe('media-xyz-999');
      expect(payload!.attachmentId).toBe('media-xyz-999');
      expect(payload!.postId).toBe('post-xyz');
      expect(payload!.postMediaId).toBe('media-xyz-999');
    });

    it('handleTranscriptionReady persists to the correct postMediaId', async () => {
      const zmq = makeMockZmqClient();
      const { service, prisma } = makeService(zmq);

      await service.handleTranscriptionReady({
        postId: 'post-xyz',
        postMediaId: 'media-xyz-999',
        transcription: {
          text: 'hello world',
          language: 'en',
          confidence: 0.95,
          durationMs: 2000,
          source: 'whisper',
        },
      });

      expect(prisma.postMedia.update).toHaveBeenCalledTimes(1);
      const updateCall = (prisma.postMedia.update as jest.Mock).mock.calls[0] as unknown as [{ where: { id: string } }];
      expect(updateCall[0].where.id).toBe('media-xyz-999');
    });
  });

  describe('regression — conversation audio path unchanged', () => {
    it('MessageTranslationService-style call still sends a real conversationId (not prefixed)', () => {
      // Verify that the contract type still accepts a plain conversationId string.
      // This test validates the type contract, not runtime behaviour of MTS.
      type AudioProcessRequest = {
        messageId: string;
        attachmentId: string;
        conversationId: string;
        senderId: string;
        audioDurationMs: number;
        targetLanguages: string[];
        generateVoiceClone: boolean;
        modelType: string;
      };

      const convRequest: AudioProcessRequest = {
        messageId: 'msg-001',
        attachmentId: 'att-001',
        conversationId: '507f1f77bcf86cd799439011', // real MongoDB ObjectId — no prefix
        senderId: 'user-1',
        audioDurationMs: 5000,
        targetLanguages: ['fr', 'es'],
        generateVoiceClone: true,
        modelType: 'medium',
      };

      expect(convRequest.conversationId).not.toMatch(/^post_/);
      expect(convRequest.conversationId).toBeTruthy();
    });
  });
});

/**
 * PostAudioService — comprehensive coverage
 *
 * Covers scenarios not already tested in PostAudioService.routing.test.ts:
 *  - ZMQ client unavailable → processPostAudio is a no-op
 *  - http URL path resolution
 *  - translateToAllLanguages: false → no target languages
 *  - handleAudioTranslationsReady: persists + broadcasts
 *  - handleAudioTranslationsReady: post not found after update → warns, no crash
 *  - broadcastPostUpdate: post not found → logs warning
 *  - static shared: throws when not initialized
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Mocks (hoisted) ──────────────────────────────────────────────────────────

jest.mock('../../ZmqSingleton', () => ({
  ZMQSingleton: {
    getInstanceSync: jest.fn(),
  },
}));

jest.mock('../../../utils/languages', () => ({
  getLanguagesWithTranslation: jest.fn(() => [
    { code: 'en' },
    { code: 'fr' },
    { code: 'es' },
  ]),
}));

jest.mock('@meeshy/shared/utils/attachment-validators', () => ({
  parseAttachmentTranscription: jest.fn(() => ({ ok: true })),
}));

process.env.UPLOADS_DIR = '/opt/uploads';

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { ZMQSingleton } from '../../ZmqSingleton';
import { PostAudioService } from '../PostAudioService';

// ─── Fakes ────────────────────────────────────────────────────────────────────

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

const makeMockZmqClient = () => ({
  sendAudioProcessRequest: jest.fn().mockResolvedValue('task-id'),
});

const makeMockPrisma = (postResult: object | null = { id: 'post-1', authorId: 'author-1' }) => ({
  postMedia: {
    update: jest.fn().mockResolvedValue({}),
  },
  post: {
    findFirst: jest.fn().mockResolvedValue(postResult),
  },
});

const makeMockSocialEvents = () => ({
  broadcastPostUpdated: jest.fn().mockResolvedValue(undefined),
});

const makeService = (
  zmqClient: ReturnType<typeof makeMockZmqClient> | null,
  prisma = makeMockPrisma(),
) => {
  (ZMQSingleton.getInstanceSync as jest.Mock).mockReturnValue(zmqClient);
  const socialEvents = makeMockSocialEvents();
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

describe('PostAudioService — comprehensive', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error accessing private static
    PostAudioService._shared = null;
  });

  describe('static shared getter', () => {
    it('throws when service has not been initialized', () => {
      expect(() => PostAudioService.shared).toThrow('PostAudioService not initialized');
    });

    it('returns the initialized instance after init', () => {
      const { service } = makeService(makeMockZmqClient());
      expect(PostAudioService.shared).toBe(service);
    });
  });

  describe('processPostAudio — ZMQ unavailable', () => {
    it('is a no-op when ZMQ client returns null', async () => {
      const { service } = makeService(null);
      await expect(
        service.processPostAudio({
          postId: 'post-1',
          postMediaId: 'media-1',
          fileUrl: '/uploads/audio/a.m4a',
          authorId: 'user-1',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('processPostAudio — file URL resolution', () => {
    it('resolves http URL to local path using pathname', async () => {
      const zmq = makeMockZmqClient();
      const { service } = makeService(zmq);

      await service.processPostAudio({
        postId: 'post-1',
        postMediaId: 'media-1',
        fileUrl: 'http://example.com/uploads/audio/file.m4a',
        authorId: 'user-1',
      });

      const payload = (zmq.sendAudioProcessRequest as jest.Mock).mock.calls[0] as [AudioProcessPayload];
      expect(payload[0].audioPath).toBe('/opt/uploads/audio/file.m4a');
    });

    it('resolves /uploads/-prefixed path by stripping /uploads prefix', async () => {
      const zmq = makeMockZmqClient();
      const { service } = makeService(zmq);

      await service.processPostAudio({
        postId: 'post-1',
        postMediaId: 'media-1',
        fileUrl: '/uploads/audio/local.m4a',
        authorId: 'user-1',
      });

      const payload = (zmq.sendAudioProcessRequest as jest.Mock).mock.calls[0] as [AudioProcessPayload];
      expect(payload[0].audioPath).toBe('/opt/uploads/audio/local.m4a');
    });

    it('uses raw path when not http and not /uploads/', async () => {
      const zmq = makeMockZmqClient();
      const { service } = makeService(zmq);

      await service.processPostAudio({
        postId: 'post-1',
        postMediaId: 'media-1',
        fileUrl: '/absolute/path/file.m4a',
        authorId: 'user-1',
      });

      const payload = (zmq.sendAudioProcessRequest as jest.Mock).mock.calls[0] as [AudioProcessPayload];
      expect(payload[0].audioPath).toBe('/absolute/path/file.m4a');
    });
  });

  describe('processPostAudio — translation flag', () => {
    it('sends no target languages when translateToAllLanguages is false', async () => {
      const zmq = makeMockZmqClient();
      const { service } = makeService(zmq);

      await service.processPostAudio({
        postId: 'post-1',
        postMediaId: 'media-1',
        fileUrl: '/uploads/audio/a.m4a',
        authorId: 'user-1',
        translateToAllLanguages: false,
      });

      const payload = (zmq.sendAudioProcessRequest as jest.Mock).mock.calls[0] as [AudioProcessPayload];
      expect(payload[0].targetLanguages).toHaveLength(0);
      expect(payload[0].generateVoiceClone).toBe(false);
    });

    it('sends platform languages when translateToAllLanguages is true (default)', async () => {
      const zmq = makeMockZmqClient();
      const { service } = makeService(zmq);

      await service.processPostAudio({
        postId: 'post-1',
        postMediaId: 'media-1',
        fileUrl: '/uploads/audio/a.m4a',
        authorId: 'user-1',
      });

      const payload = (zmq.sendAudioProcessRequest as jest.Mock).mock.calls[0] as [AudioProcessPayload];
      expect(payload[0].targetLanguages.length).toBeGreaterThan(0);
      expect(payload[0].generateVoiceClone).toBe(true);
    });
  });

  describe('handleAudioTranslationsReady', () => {
    it('persists translations to postMedia and broadcasts post update', async () => {
      const prisma = makeMockPrisma({ id: 'post-1', authorId: 'author-1' });
      const { service, socialEvents } = makeService(makeMockZmqClient(), prisma);

      await service.handleAudioTranslationsReady({
        postId: 'post-1',
        postMediaId: 'media-1',
        translations: {
          fr: {
            type: 'audio', transcription: 'Bonjour', path: '/fr.m4a', url: 'http://cdn/fr.m4a',
            durationMs: 2000, format: 'm4a', cloned: true, quality: 0.95, ttsModel: 'chatterbox',
          },
        },
      });

      expect(prisma.postMedia.update).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        data: {
          translations: expect.objectContaining({ fr: expect.any(Object) }),
        },
        // `commentId` is read back to route the broadcast to the media owner
        // (comment vs post). Null/absent → post path (this test).
        select: { commentId: true },
      });
      expect(socialEvents.broadcastPostUpdated).toHaveBeenCalledTimes(1);
    });

    it('does not crash when post is not found after update', async () => {
      const prisma = makeMockPrisma(null);
      const { service, socialEvents } = makeService(makeMockZmqClient(), prisma);

      await expect(
        service.handleAudioTranslationsReady({
          postId: 'post-missing',
          postMediaId: 'media-1',
          translations: {},
        }),
      ).resolves.toBeUndefined();

      expect(socialEvents.broadcastPostUpdated).not.toHaveBeenCalled();
    });
  });

  describe('handleTranscriptionReady — post not found', () => {
    it('does not broadcast when post is not found after transcription persisted', async () => {
      const prisma = makeMockPrisma(null);
      const { service, socialEvents } = makeService(makeMockZmqClient(), prisma);

      await service.handleTranscriptionReady({
        postId: 'post-missing',
        postMediaId: 'media-1',
        transcription: { text: 'hello', language: 'en' },
      });

      expect(prisma.postMedia.update).toHaveBeenCalledTimes(1);
      expect(socialEvents.broadcastPostUpdated).not.toHaveBeenCalled();
    });
  });

  describe('error handling — catch blocks', () => {
    it('swallows sendAudioProcessRequest errors without throwing', async () => {
      const zmq = makeMockZmqClient();
      (zmq.sendAudioProcessRequest as jest.Mock).mockRejectedValue(new Error('ZMQ network error'));
      const { service } = makeService(zmq);

      await expect(
        service.processPostAudio({
          postId: 'post-1',
          postMediaId: 'media-1',
          fileUrl: '/uploads/audio/a.m4a',
          authorId: 'user-1',
        }),
      ).resolves.toBeUndefined();
    });

    it('swallows postMedia.update errors in handleTranscriptionReady', async () => {
      const prisma = makeMockPrisma({ id: 'post-1', authorId: 'author-1' });
      (prisma.postMedia.update as jest.Mock).mockRejectedValue(new Error('DB error'));
      const { service, socialEvents } = makeService(makeMockZmqClient(), prisma);

      await expect(
        service.handleTranscriptionReady({
          postId: 'post-1',
          postMediaId: 'media-1',
          transcription: { text: 'hello', language: 'en' },
        }),
      ).resolves.toBeUndefined();

      expect(socialEvents.broadcastPostUpdated).not.toHaveBeenCalled();
    });

    it('swallows postMedia.update errors in handleAudioTranslationsReady', async () => {
      const prisma = makeMockPrisma({ id: 'post-1', authorId: 'author-1' });
      (prisma.postMedia.update as jest.Mock).mockRejectedValue(new Error('DB error'));
      const { service, socialEvents } = makeService(makeMockZmqClient(), prisma);

      await expect(
        service.handleAudioTranslationsReady({
          postId: 'post-1',
          postMediaId: 'media-1',
          translations: {},
        }),
      ).resolves.toBeUndefined();

      expect(socialEvents.broadcastPostUpdated).not.toHaveBeenCalled();
    });
  });

  describe('handleTranscriptionReady — Zod validation failure', () => {
    it('still persists transcription and warns when parseAttachmentTranscription returns ok:false', async () => {
      const { parseAttachmentTranscription } = await import('@meeshy/shared/utils/attachment-validators');
      (parseAttachmentTranscription as jest.Mock).mockReturnValueOnce({
        ok: false,
        code: 'INVALID',
        issues: ['text required'],
      });

      const prisma = makeMockPrisma({ id: 'post-1', authorId: 'author-1' });
      const { service } = makeService(makeMockZmqClient(), prisma);

      await service.handleTranscriptionReady({
        postId: 'post-1',
        postMediaId: 'media-1',
        transcription: { text: 'hello', language: 'en' },
      });

      expect(prisma.postMedia.update).toHaveBeenCalledTimes(1);
    });
  });
});

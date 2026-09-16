/**
 * MediaAltTranslationService — unit tests
 *
 * Jumelle exacte de `MediaCaptionTranslationService.test.ts` (#6737), sur le
 * champ `alt` plutôt que `caption`. Mêmes gardes, même routage par préfixe de
 * `messageId` (`media-alt:<mediaId>`), même persistance `$runCommandRaw` +
 * diffusion filtrée par visibilité.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';

const makeMockZmqClient = () => {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    translateToMultipleLanguages: jest.fn<any>(async () => {}),
  });
};

type MakePrismaOpts = {
  postMedia?: object | null;
  postComment?: object | null;
  post?: object | null;
};

const makeMockPrisma = ({
  postMedia = {
    id: 'media-1', postId: 'post-1', commentId: null,
    alt: 'Bonjour le monde', altLanguage: 'fr', altTranslations: null,
  },
  postComment = { postId: 'post-1' },
  post = { authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] },
}: MakePrismaOpts = {}) => ({
  postMedia: {
    findUnique: jest.fn<any>(async () => postMedia),
    update: jest.fn<any>(async () => ({})),
  },
  postComment: {
    findUnique: jest.fn<any>(async () => postComment),
  },
  post: {
    findUnique: jest.fn<any>(async () => post),
  },
  $runCommandRaw: jest.fn<any>(async () => ({ ok: 1, n: 1, nModified: 1 })),
});

const makeMockSocialEvents = () => ({
  broadcastMediaAltTranslationUpdated: jest.fn<any>(async () => {}),
});

const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0));

import { MediaAltTranslationService } from '../MediaAltTranslationService';

const makeService = (opts: MakePrismaOpts = {}) => {
  const prisma = makeMockPrisma(opts);
  const zmqClient = makeMockZmqClient();
  const socialEvents = makeMockSocialEvents();
  // @ts-expect-error accessing private static
  MediaAltTranslationService._shared = null;
  const service = MediaAltTranslationService.init(
    prisma as unknown as Parameters<typeof MediaAltTranslationService.init>[0],
    zmqClient as unknown as Parameters<typeof MediaAltTranslationService.init>[1],
    socialEvents as unknown as Parameters<typeof MediaAltTranslationService.init>[2],
  );
  return { service, prisma, zmqClient, socialEvents };
};

describe('MediaAltTranslationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error accessing private static
    MediaAltTranslationService._shared = null;
  });

  describe('static shared getter', () => {
    it('throws when not initialized', () => {
      expect(() => MediaAltTranslationService.shared).toThrow('MediaAltTranslationService not initialized');
    });

    it('returns the initialized instance', () => {
      const { service } = makeService();
      expect(MediaAltTranslationService.shared).toBe(service);
    });
  });

  describe('triggerMediaAltTranslation', () => {
    it('invalidates the previous translations before sending the new request', async () => {
      const { service, prisma, zmqClient } = makeService();
      await service.triggerMediaAltTranslation('media-1', 'Bonjour le monde');
      expect(prisma.postMedia.update).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        data: { altLanguage: 'fr', altTranslations: null },
      });
      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalled();
    });

    it('sends every TOP_LANGUAGES entry except the detected source', async () => {
      const { service, zmqClient } = makeService();
      await service.triggerMediaAltTranslation('media-1', 'Bonjour le monde');
      const [, sourceLang, targetLanguages, messageId] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [
        string, string, string[], string, string,
      ];
      expect(sourceLang).toBe('fr');
      expect(targetLanguages).not.toContain('fr');
      expect(targetLanguages.length).toBeGreaterThan(0);
      expect(messageId).toBe('media-alt:media-1');
    });

    it('clears both fields and sends nothing when the alt text is removed', async () => {
      const { service, prisma, zmqClient } = makeService();
      await service.triggerMediaAltTranslation('media-1', null);
      expect(prisma.postMedia.update).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        data: { altLanguage: null, altTranslations: null },
      });
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('does not throw when the ZMQ send fails', async () => {
      const { service, zmqClient } = makeService();
      (zmqClient.translateToMultipleLanguages as jest.Mock<any>).mockRejectedValueOnce(new Error('zmq down'));
      await expect(service.triggerMediaAltTranslation('media-1', 'Bonjour le monde')).resolves.toBeUndefined();
    });
  });

  describe('translateOnDemand', () => {
    it('does nothing when the media is not found', async () => {
      const { service, zmqClient } = makeService({ postMedia: null });
      await service.translateOnDemand('media-1', 'en');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('does nothing when the media has no alt text', async () => {
      const { service, zmqClient } = makeService({
        postMedia: { id: 'media-1', postId: 'post-1', commentId: null, alt: null, altLanguage: null, altTranslations: null },
      });
      await service.translateOnDemand('media-1', 'en');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('skips when the target language is the source language', async () => {
      const { service, zmqClient } = makeService();
      await service.translateOnDemand('media-1', 'fr');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('skips an already-cached translation unless forced', async () => {
      const { service, zmqClient } = makeService({
        postMedia: {
          id: 'media-1', postId: 'post-1', commentId: null, alt: 'Bonjour le monde',
          altLanguage: 'fr', altTranslations: { en: { text: 'Hello world', translationModel: 'nllb', createdAt: '2026-09-14T00:00:00.000Z' } },
        },
      });
      await service.translateOnDemand('media-1', 'en');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();

      await service.translateOnDemand('media-1', 'en', { force: true });
      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalledWith(
        'Bonjour le monde', 'fr', ['en'], 'media-alt:media-1', expect.any(String),
      );
    });

    it('sends the on-demand request for a fresh target language', async () => {
      const { service, zmqClient } = makeService();
      await service.translateOnDemand('media-1', 'es');
      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalledWith(
        'Bonjour le monde', 'fr', ['es'], 'media-alt:media-1', expect.any(String),
      );
    });
  });

  describe('ZMQ listener — routing by messageId prefix', () => {
    it('ignores completions for other namespaces', async () => {
      const { zmqClient, prisma } = makeService();
      zmqClient.emit('translationCompleted', {
        targetLanguage: 'en',
        result: { messageId: 'post:post-1', translatedText: 'Hello', confidenceScore: 0.9, translatorModel: 'nllb' },
      });
      await flushPromises();
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('ignores completions for the sibling media-caption namespace', async () => {
      const { zmqClient, prisma } = makeService();
      zmqClient.emit('translationCompleted', {
        targetLanguage: 'en',
        result: { messageId: 'media-caption:media-1', translatedText: 'Hello', confidenceScore: 0.9, translatorModel: 'nllb' },
      });
      await flushPromises();
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('persists and broadcasts a media-alt completion', async () => {
      const { zmqClient, prisma, socialEvents } = makeService();
      zmqClient.emit('translationCompleted', {
        targetLanguage: 'en',
        result: { messageId: 'media-alt:media-1', translatedText: 'Hello world', confidenceScore: 0.95, translatorModel: 'nllb' },
      });
      await flushPromises();

      expect(prisma.$runCommandRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          update: 'PostMedia',
          updates: [expect.objectContaining({
            q: { _id: { $oid: 'media-1' } },
            u: [{
              $set: {
                altTranslations: {
                  $mergeObjects: [
                    { $ifNull: ['$altTranslations', {}] },
                    { en: { $literal: expect.objectContaining({ text: 'Hello world' }) } },
                  ],
                },
              },
            }],
          })],
        }),
      );
      expect(socialEvents.broadcastMediaAltTranslationUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ mediaId: 'media-1', postId: 'post-1', language: 'en' }),
        'author-1', 'PUBLIC', [],
      );
    });

    it('does not broadcast when Mongo reports a write error for the update', async () => {
      const { zmqClient, prisma, socialEvents } = makeService();
      prisma.$runCommandRaw.mockResolvedValueOnce({
        ok: 1, n: 0, nModified: 0,
        writeErrors: [{ index: 0, code: 28, errmsg: 'Cannot create field \'en\' in element {altTranslations: null}' }],
      });
      zmqClient.emit('translationCompleted', {
        targetLanguage: 'en',
        result: { messageId: 'media-alt:media-1', translatedText: 'Hello world', confidenceScore: 0.95, translatorModel: 'nllb' },
      });
      await flushPromises();

      expect(socialEvents.broadcastMediaAltTranslationUpdated).not.toHaveBeenCalled();
    });

    it('does not broadcast when the update matched no media', async () => {
      const { zmqClient, prisma, socialEvents } = makeService();
      prisma.$runCommandRaw.mockResolvedValueOnce({ ok: 1, n: 0, nModified: 0 });
      zmqClient.emit('translationCompleted', {
        targetLanguage: 'en',
        result: { messageId: 'media-alt:media-1', translatedText: 'Hello world', confidenceScore: 0.95, translatorModel: 'nllb' },
      });
      await flushPromises();

      expect(socialEvents.broadcastMediaAltTranslationUpdated).not.toHaveBeenCalled();
    });

    it('resolves the owning post through the comment when the media belongs to a comment', async () => {
      const { zmqClient, prisma, socialEvents } = makeService({
        postMedia: { id: 'media-1', postId: null, commentId: 'comment-1', alt: 'Bonjour', altLanguage: 'fr', altTranslations: null },
        postComment: { postId: 'post-9' },
      });
      zmqClient.emit('translationCompleted', {
        targetLanguage: 'en',
        result: { messageId: 'media-alt:media-1', translatedText: 'Hello', confidenceScore: 1, translatorModel: 'nllb' },
      });
      await flushPromises();

      expect(prisma.postComment.findUnique).toHaveBeenCalledWith({ where: { id: 'comment-1' }, select: { postId: true } });
      expect(socialEvents.broadcastMediaAltTranslationUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ mediaId: 'media-1', postId: 'post-9', commentId: 'comment-1', language: 'en' }),
        'author-1', 'PUBLIC', [],
      );
    });
  });
});

/**
 * MediaCaptionTranslationService — unit tests
 *
 * Calqué sur PostTranslationService (post/comment) : mêmes gardes, même
 * routage par préfixe de `messageId` (`media-caption:<mediaId>`), même
 * persistance `$runCommandRaw` + diffusion filtrée par visibilité.
 *
 * Couvre :
 *  - triggerMediaCaptionTranslation : invalidation avant relance, détection de
 *    langue, pas de langues cibles, appel ZMQ, échec ZMQ, caption vide (retrait)
 *  - translateOnDemand : média introuvable, caption vide, même langue,
 *    traduction déjà en cache, `force`, appel ZMQ, échec ZMQ
 *  - l'écoute ZMQ : ignore les autres namespaces, persiste + diffuse sur
 *    `media-caption:`
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
    caption: 'Bonjour le monde', captionLanguage: 'fr', captionTranslations: null,
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
  broadcastMediaCaptionTranslationUpdated: jest.fn<any>(async () => {}),
});

const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0));

import { MediaCaptionTranslationService } from '../MediaCaptionTranslationService';

const makeService = (opts: MakePrismaOpts = {}) => {
  const prisma = makeMockPrisma(opts);
  const zmqClient = makeMockZmqClient();
  const socialEvents = makeMockSocialEvents();
  // @ts-expect-error accessing private static
  MediaCaptionTranslationService._shared = null;
  const service = MediaCaptionTranslationService.init(
    prisma as unknown as Parameters<typeof MediaCaptionTranslationService.init>[0],
    zmqClient as unknown as Parameters<typeof MediaCaptionTranslationService.init>[1],
    socialEvents as unknown as Parameters<typeof MediaCaptionTranslationService.init>[2],
  );
  return { service, prisma, zmqClient, socialEvents };
};

describe('MediaCaptionTranslationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error accessing private static
    MediaCaptionTranslationService._shared = null;
  });

  describe('static shared getter', () => {
    it('throws when not initialized', () => {
      expect(() => MediaCaptionTranslationService.shared).toThrow('MediaCaptionTranslationService not initialized');
    });

    it('returns the initialized instance', () => {
      const { service } = makeService();
      expect(MediaCaptionTranslationService.shared).toBe(service);
    });
  });

  describe('triggerMediaCaptionTranslation', () => {
    it('invalidates the previous translations before sending the new request', async () => {
      const { service, prisma, zmqClient } = makeService();
      await service.triggerMediaCaptionTranslation('media-1', 'Bonjour le monde');
      expect(prisma.postMedia.update).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        data: { captionLanguage: 'fr', captionTranslations: null },
      });
      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalled();
    });

    it('sends every TOP_LANGUAGES entry except the detected source', async () => {
      const { service, zmqClient } = makeService();
      await service.triggerMediaCaptionTranslation('media-1', 'Bonjour le monde');
      const [, sourceLang, targetLanguages, messageId] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [
        string, string, string[], string, string,
      ];
      expect(sourceLang).toBe('fr');
      expect(targetLanguages).not.toContain('fr');
      expect(targetLanguages.length).toBeGreaterThan(0);
      expect(messageId).toBe('media-caption:media-1');
    });

    it('clears both fields and sends nothing when the caption is removed', async () => {
      const { service, prisma, zmqClient } = makeService();
      await service.triggerMediaCaptionTranslation('media-1', null);
      expect(prisma.postMedia.update).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        data: { captionLanguage: null, captionTranslations: null },
      });
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('does not throw when the ZMQ send fails', async () => {
      const { service, zmqClient } = makeService();
      (zmqClient.translateToMultipleLanguages as jest.Mock<any>).mockRejectedValueOnce(new Error('zmq down'));
      await expect(service.triggerMediaCaptionTranslation('media-1', 'Bonjour le monde')).resolves.toBeUndefined();
    });
  });

  describe('translateOnDemand', () => {
    it('does nothing when the media is not found', async () => {
      const { service, zmqClient } = makeService({ postMedia: null });
      await service.translateOnDemand('media-1', 'en');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('does nothing when the media has no caption', async () => {
      const { service, zmqClient } = makeService({
        postMedia: { id: 'media-1', postId: 'post-1', commentId: null, caption: null, captionLanguage: null, captionTranslations: null },
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
          id: 'media-1', postId: 'post-1', commentId: null, caption: 'Bonjour le monde',
          captionLanguage: 'fr', captionTranslations: { en: { text: 'Hello world', translationModel: 'nllb', createdAt: '2026-09-14T00:00:00.000Z' } },
        },
      });
      await service.translateOnDemand('media-1', 'en');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();

      await service.translateOnDemand('media-1', 'en', { force: true });
      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalledWith(
        'Bonjour le monde', 'fr', ['en'], 'media-caption:media-1', expect.any(String),
      );
    });

    it('sends the on-demand request for a fresh target language', async () => {
      const { service, zmqClient } = makeService();
      await service.translateOnDemand('media-1', 'es');
      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalledWith(
        'Bonjour le monde', 'fr', ['es'], 'media-caption:media-1', expect.any(String),
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

    it('persists and broadcasts a media-caption completion', async () => {
      const { zmqClient, prisma, socialEvents } = makeService();
      zmqClient.emit('translationCompleted', {
        targetLanguage: 'en',
        result: { messageId: 'media-caption:media-1', translatedText: 'Hello world', confidenceScore: 0.95, translatorModel: 'nllb' },
      });
      await flushPromises();

      expect(prisma.$runCommandRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          update: 'PostMedia',
          updates: [expect.objectContaining({
            q: { _id: { $oid: 'media-1' } },
            // Pipeline (#6558) : `$set` pointé sur un `captionTranslations` null
            // échouait en silence ; la fusion part d'une carte vide si le champ
            // est null ou absent, et la valeur voyage en `$literal` (un texte
            // traduit qui commence par `$` serait sinon lu comme un chemin).
            u: [{
              $set: {
                captionTranslations: {
                  $mergeObjects: [
                    { $ifNull: ['$captionTranslations', {}] },
                    { en: { $literal: expect.objectContaining({ text: 'Hello world' }) } },
                  ],
                },
              },
            }],
          })],
        }),
      );
      expect(socialEvents.broadcastMediaCaptionTranslationUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ mediaId: 'media-1', postId: 'post-1', language: 'en' }),
        'author-1', 'PUBLIC', [],
      );
    });

    it('does not broadcast when Mongo reports a write error for the update (#6558)', async () => {
      const { zmqClient, prisma, socialEvents } = makeService();
      prisma.$runCommandRaw.mockResolvedValueOnce({
        ok: 1, n: 0, nModified: 0,
        writeErrors: [{ index: 0, code: 28, errmsg: 'Cannot create field \'en\' in element {captionTranslations: null}' }],
      });
      zmqClient.emit('translationCompleted', {
        targetLanguage: 'en',
        result: { messageId: 'media-caption:media-1', translatedText: 'Hello world', confidenceScore: 0.95, translatorModel: 'nllb' },
      });
      await flushPromises();

      expect(socialEvents.broadcastMediaCaptionTranslationUpdated).not.toHaveBeenCalled();
    });

    it('does not broadcast when the update matched no media (#6558)', async () => {
      const { zmqClient, prisma, socialEvents } = makeService();
      prisma.$runCommandRaw.mockResolvedValueOnce({ ok: 1, n: 0, nModified: 0 });
      zmqClient.emit('translationCompleted', {
        targetLanguage: 'en',
        result: { messageId: 'media-caption:media-1', translatedText: 'Hello world', confidenceScore: 0.95, translatorModel: 'nllb' },
      });
      await flushPromises();

      expect(socialEvents.broadcastMediaCaptionTranslationUpdated).not.toHaveBeenCalled();
    });

    it('resolves the owning post through the comment when the media belongs to a comment', async () => {
      const { zmqClient, prisma, socialEvents } = makeService({
        postMedia: { id: 'media-1', postId: null, commentId: 'comment-1', caption: 'Bonjour', captionLanguage: 'fr', captionTranslations: null },
        postComment: { postId: 'post-9' },
      });
      zmqClient.emit('translationCompleted', {
        targetLanguage: 'en',
        result: { messageId: 'media-caption:media-1', translatedText: 'Hello', confidenceScore: 1, translatorModel: 'nllb' },
      });
      await flushPromises();

      expect(prisma.postComment.findUnique).toHaveBeenCalledWith({ where: { id: 'comment-1' }, select: { postId: true } });
      expect(socialEvents.broadcastMediaCaptionTranslationUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ mediaId: 'media-1', postId: 'post-9', commentId: 'comment-1', language: 'en' }),
        'author-1', 'PUBLIC', [],
      );
    });
  });
});

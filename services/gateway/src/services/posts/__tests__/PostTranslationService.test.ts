/**
 * PostTranslationService — unit tests
 *
 * Covers:
 *  - translatePost: URL-only skip, language detection, ZMQ call, failure
 *  - translateOnDemand: post not found, same language, cached, ZMQ call, failure
 *  - translateComment: basic, ZMQ failure
 *  - ZMQ event listener: no messageId, post: prefix, comment: prefix
 *  - handlePostTranslationCompleted: persist, broadcast, post not found
 *  - handleCommentTranslationCompleted: persist, broadcast, comment/post not found
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';

// ─── Fakes ────────────────────────────────────────────────────────────────────

const makeMockZmqClient = () => {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    translateToMultipleLanguages: jest.fn(async () => {}),
    translateTextObject: jest.fn((_params: Record<string, unknown>) => {}),
  });
};

type MakePrismaOpts = {
  post?: object | null;
  postComment?: object | null;
};

const makeMockPrisma = ({
  post = { content: 'Hello world', originalLanguage: 'en', translations: null, authorId: 'author-1', storyEffects: null },
  postComment = { postId: 'post-1' },
}: MakePrismaOpts = {}) => ({
  post: {
    findUnique: jest.fn(async () => post),
  },
  postComment: {
    findUnique: jest.fn(async () => postComment),
  },
  $runCommandRaw: jest.fn(async () => ({ ok: 1 })),
});

const makeMockSocialEvents = () => ({
  broadcastPostTranslationUpdated: jest.fn(async () => {}),
  broadcastCommentTranslationUpdated: jest.fn(async () => {}),
});

const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0));

// ─── Import (after fakes, no jest.mock needed — no module-level singletons) ──

import { PostTranslationService } from '../PostTranslationService';

// ─── Factory ─────────────────────────────────────────────────────────────────

const makeService = (opts: MakePrismaOpts = {}) => {
  const prisma = makeMockPrisma(opts);
  const zmqClient = makeMockZmqClient();
  const socialEvents = makeMockSocialEvents();
  // @ts-expect-error accessing private static
  PostTranslationService._shared = null;
  const service = PostTranslationService.init(
    prisma as unknown as Parameters<typeof PostTranslationService.init>[0],
    zmqClient as unknown as Parameters<typeof PostTranslationService.init>[1],
    socialEvents as unknown as Parameters<typeof PostTranslationService.init>[2],
  );
  return { service, prisma, zmqClient, socialEvents };
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PostTranslationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error accessing private static
    PostTranslationService._shared = null;
  });

  describe('static shared getter', () => {
    it('throws when not initialized', () => {
      expect(() => PostTranslationService.shared).toThrow('PostTranslationService not initialized');
    });

    it('returns the initialized instance', () => {
      const { service } = makeService();
      expect(PostTranslationService.shared).toBe(service);
    });
  });

  describe('translatePost', () => {
    it('skips URL-only content', async () => {
      const { service, zmqClient } = makeService();
      await service.translatePost('post-1', 'https://example.com/link');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('uses provided originalLanguage and filters it from targets', async () => {
      const { service, zmqClient } = makeService();
      await service.translatePost('post-1', 'Hello world', 'en');
      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalledTimes(1);
      const [, sourceLang, targets] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(sourceLang).toBe('en');
      expect(targets).not.toContain('en');
    });

    it('detects French content via keywords', async () => {
      const { service, zmqClient } = makeService();
      await service.translatePost('post-1', 'Bonjour, comment est le chat?');
      const [, sourceLang] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(sourceLang).toBe('fr');
    });

    it('detects Arabic content via Unicode range', async () => {
      const { service, zmqClient } = makeService();
      await service.translatePost('post-1', 'مرحباً بالعالم');
      const [, sourceLang] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(sourceLang).toBe('ar');
    });

    it('defaults to English for unknown content', async () => {
      const { service, zmqClient } = makeService();
      await service.translatePost('post-1', 'zzz qqq xxx yyy'); // no pattern matches
      const [, sourceLang] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(sourceLang).toBe('en');
    });

    it('detects Spanish content via keywords', async () => {
      const { service, zmqClient } = makeService();
      // Content uses distinctly Spanish words (el, con, los, del, pero, más) without any French words
      await service.translatePost('post-1', 'El cielo azul con los amigos del barrio pero más');
      const [, sourceLang] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(sourceLang).toBe('es');
    });

    it('detects German content via keywords', async () => {
      const { service, zmqClient } = makeService();
      await service.translatePost('post-1', 'Der Hund nicht auf dem Feld mit den Freunden');
      const [, sourceLang] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(sourceLang).toBe('de');
    });

    it('detects Portuguese content via keywords', async () => {
      const { service, zmqClient } = makeService();
      // Avoid accented words: "está" matches French \best\b since á is non-word-char
      await service.translatePost('post-1', 'O cachorro não vai com os amigos do bairro');
      const [, sourceLang] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(sourceLang).toBe('pt');
    });

    it('defaults to English for empty content (not URL-only)', async () => {
      const { service, zmqClient } = makeService();
      await service.translatePost('post-1', '');
      const [, sourceLang] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(sourceLang).toBe('en');
    });

    it('uses post:<postId> as the messageId', async () => {
      const { service, zmqClient } = makeService();
      await service.translatePost('post-abc', 'Hello world', 'en');
      const [, , , messageId] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(messageId).toBe('post:post-abc');
    });

    it('logs and swallows ZMQ errors', async () => {
      const { service, zmqClient } = makeService();
      (zmqClient.translateToMultipleLanguages as jest.Mock).mockRejectedValue(new Error('ZMQ down'));
      await expect(service.translatePost('post-1', 'Hello world', 'en')).resolves.toBeUndefined();
    });
  });

  describe('translateOnDemand', () => {
    it('returns early when post is not found', async () => {
      const { service, prisma, zmqClient } = makeService({ post: null });
      await service.translateOnDemand('post-missing', 'fr');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('returns early when post content is null', async () => {
      const { service, zmqClient } = makeService({
        post: { content: null, originalLanguage: 'en', translations: null },
      });
      await service.translateOnDemand('post-1', 'fr');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('skips URL-only post content (links preserved verbatim, never sent to NLLB)', async () => {
      const { service, zmqClient } = makeService({
        post: { content: 'https://example.com/shared-link', originalLanguage: 'en', translations: {} },
      });
      await service.translateOnDemand('post-1', 'fr');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('returns early when source and target languages are the same', async () => {
      const { service, zmqClient } = makeService({
        post: { content: 'Hello', originalLanguage: 'en', translations: null },
      });
      await service.translateOnDemand('post-1', 'en');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('returns early when translation already cached', async () => {
      const { service, zmqClient } = makeService({
        post: { content: 'Hello', originalLanguage: 'en', translations: { fr: { text: 'Bonjour' } } },
      });
      await service.translateOnDemand('post-1', 'fr');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('calls ZMQ when translation is missing', async () => {
      const { service, zmqClient } = makeService({
        post: { content: 'Hello', originalLanguage: 'en', translations: {} },
      });
      await service.translateOnDemand('post-1', 'fr');
      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalledTimes(1);
      const [, , targets] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(targets).toEqual(['fr']);
    });

    // ─── Textes du CANVAS (feuille « Traductions » du lecteur story) ────────
    //
    // Une story est très souvent faite ENTIÈREMENT de texte posé sur le
    // canvas, sans la moindre légende. Choisir une langue dans la feuille
    // « Traductions » appelait bien cette méthode, mais elle ne regardait
    // que `post.content` : sur une story canvas-only elle sortait dès la
    // première ligne. Aucun job n'était émis, aucune traduction n'arrivait,
    // et le lecteur restait sur l'original sans le moindre signal.

    const storyWithCanvasText = (overrides: Record<string, unknown> = {}) => ({
      content: '',
      originalLanguage: 'en',
      translations: {},
      storyEffects: {
        textObjects: [
          { text: 'Good morning', sourceLanguage: 'en' },
          { text: 'See you soon', sourceLanguage: 'en' },
        ],
      },
      ...overrides,
    });

    it('translates the canvas text objects of a caption-less story', async () => {
      const { service, zmqClient } = makeService({ post: storyWithCanvasText() });

      await service.translateOnDemand('post-1', 'fr');

      expect(zmqClient.translateTextObject).toHaveBeenCalledTimes(2);
      expect(zmqClient.translateTextObject).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: 'post-1', textObjectIndex: 0, text: 'Good morning',
          sourceLanguage: 'en', targetLanguages: ['fr'],
        }),
      );
      expect(zmqClient.translateTextObject).toHaveBeenCalledWith(
        expect.objectContaining({ textObjectIndex: 1, text: 'See you soon' }),
      );
    });

    it('asks only for the language the reader picked, not the whole audience', async () => {
      const { service, zmqClient } = makeService({ post: storyWithCanvasText() });
      await service.translateOnDemand('post-1', 'de');
      const calls = (zmqClient.translateTextObject as jest.Mock).mock.calls as Array<[{ targetLanguages: string[] }]>;
      expect(calls.every(([params]) => params.targetLanguages.length === 1)).toBe(true);
      expect(calls.every(([params]) => params.targetLanguages[0] === 'de')).toBe(true);
    });

    it('translates BOTH the caption and the canvas texts when a story has both', async () => {
      const { service, zmqClient } = makeService({
        post: storyWithCanvasText({ content: 'Hello world' }),
      });
      await service.translateOnDemand('post-1', 'fr');
      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalledTimes(1);
      expect(zmqClient.translateTextObject).toHaveBeenCalledTimes(2);
    });

    // ─── Retraduire ────────────────────────────────────────────────────────
    //
    // La feuille des langues du lecteur affiche un bouton « Retraduire » à côté
    // de chaque langue DÉJÀ traduite. Il appelait la même route que « Traduire »,
    // qui sortait aussitôt sur « translation already cached » côté légende et
    // sautait chaque overlay déjà couvert : le bouton ne faisait donc
    // strictement rien, sans le moindre signal à l'utilisateur.

    it('refait la traduction des overlays déjà couverts quand on force', async () => {
      const { service, zmqClient } = makeService({
        post: storyWithCanvasText({
          storyEffects: {
            textObjects: [
              { text: 'Good morning', sourceLanguage: 'en', translations: { fr: 'Bonjour' } },
              { text: 'See you soon', sourceLanguage: 'en', translations: { fr: 'À bientôt' } },
            ],
          },
        }),
      });

      await service.translateOnDemand('post-1', 'fr', { force: true });

      expect(zmqClient.translateTextObject).toHaveBeenCalledTimes(2);
    });

    it('refait la traduction de la légende déjà en cache quand on force', async () => {
      const { service, zmqClient } = makeService({
        post: {
          content: 'Hello world',
          originalLanguage: 'en',
          translations: { fr: { text: 'Bonjour le monde' } },
          storyEffects: null,
        },
      });

      await service.translateOnDemand('post-1', 'fr', { force: true });

      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalledTimes(1);
    });

    it('sans force, la légende déjà en cache reste intouchée', async () => {
      const { service, zmqClient } = makeService({
        post: {
          content: 'Hello world',
          originalLanguage: 'en',
          translations: { fr: { text: 'Bonjour le monde' } },
          storyEffects: null,
        },
      });

      await service.translateOnDemand('post-1', 'fr');

      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('forcer ne réveille pas le pipeline de l\'index dérivé', async () => {
      // Même sous `force`, l'index reste un dérivé : le refaire traduire pour
      // lui-même recréerait la seconde source qu'on vient de supprimer.
      const { service, zmqClient } = makeService({
        post: storyWithCanvasText({ content: 'Good morning See you soon' }),
      });

      await service.translateOnDemand('post-1', 'fr', { force: true });

      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
      expect(zmqClient.translateTextObject).toHaveBeenCalledTimes(2);
    });

    it('forcer respecte encore la langue source d\'un overlay', async () => {
      // Retraduire du français VERS le français n'a pas de sens : le forçage
      // rejoue ce qui peut l'être, il ne fabrique pas de travail absurde.
      const { service, zmqClient } = makeService({
        post: storyWithCanvasText({
          storyEffects: { textObjects: [{ text: 'Bonjour', sourceLanguage: 'fr' }] },
        }),
      });

      await service.translateOnDemand('post-1', 'fr', { force: true });

      expect(zmqClient.translateTextObject).not.toHaveBeenCalled();
    });

    it('n\'envoie PAS le content à traduire quand il n\'est que l\'index des overlays', async () => {
      // `PostService.createPost` remplit `content` avec la concaténation des
      // overlays quand la story n'a pas de légende. Le renvoyer au traducteur
      // en faisait une seconde source, traduite indépendamment des overlays :
      // les deux divergeaient dès qu'un pipeline bronchait (six langues sur le
      // content, zéro sur les overlays — production, 2026-07-27). L'index se
      // recompose maintenant depuis les traductions des overlays.
      const { service, zmqClient } = makeService({
        post: storyWithCanvasText({ content: 'Good morning See you soon' }),
      });

      await service.translateOnDemand('post-1', 'fr');

      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
      expect(zmqClient.translateTextObject).toHaveBeenCalledTimes(2);
    });

    it('skips a text object already translated into the target language', async () => {
      const { service, zmqClient } = makeService({
        post: storyWithCanvasText({
          storyEffects: {
            textObjects: [
              { text: 'Good morning', sourceLanguage: 'en', translations: { fr: 'Bonjour' } },
              { text: 'See you soon', sourceLanguage: 'en' },
            ],
          },
        }),
      });
      await service.translateOnDemand('post-1', 'fr');
      expect(zmqClient.translateTextObject).toHaveBeenCalledTimes(1);
      expect(zmqClient.translateTextObject).toHaveBeenCalledWith(
        expect.objectContaining({ textObjectIndex: 1 }),
      );
    });

    it('skips a text object already written in the target language', async () => {
      const { service, zmqClient } = makeService({
        post: storyWithCanvasText({
          storyEffects: { textObjects: [{ text: 'Bonjour', sourceLanguage: 'fr' }] },
        }),
      });
      await service.translateOnDemand('post-1', 'fr');
      expect(zmqClient.translateTextObject).not.toHaveBeenCalled();
    });

    it('ignores blank text objects', async () => {
      const { service, zmqClient } = makeService({
        post: storyWithCanvasText({
          storyEffects: { textObjects: [{ text: '   ', sourceLanguage: 'en' }, { text: '', sourceLanguage: 'en' }] },
        }),
      });
      await service.translateOnDemand('post-1', 'fr');
      expect(zmqClient.translateTextObject).not.toHaveBeenCalled();
    });

    /// Le composer iOS encode le texte sous `text` ; `content` est l'alias legacy.
    it('reads the legacy content key of a text object', async () => {
      const { service, zmqClient } = makeService({
        post: storyWithCanvasText({
          storyEffects: { textObjects: [{ content: 'Legacy overlay', sourceLanguage: 'en' }] },
        }),
      });
      await service.translateOnDemand('post-1', 'fr');
      expect(zmqClient.translateTextObject).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Legacy overlay' }),
      );
    });

    it('still returns quietly on a post with neither caption nor canvas text', async () => {
      const { service, zmqClient } = makeService({
        post: { content: '', originalLanguage: 'en', translations: {}, storyEffects: { textObjects: [] } },
      });
      await service.translateOnDemand('post-1', 'fr');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
      expect(zmqClient.translateTextObject).not.toHaveBeenCalled();
    });

    it('detects language from post content when originalLanguage is null', async () => {
      const { service, zmqClient } = makeService({
        post: { content: 'Je suis très content', originalLanguage: null, translations: {} },
      });
      await service.translateOnDemand('post-1', 'en');
      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalledTimes(1);
      const [, sourceLang] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(sourceLang).toBe('fr');
    });

    it('sends ZMQ when translations field is null (no cached translations)', async () => {
      const { service, zmqClient } = makeService({
        post: { content: 'Bonjour monde', originalLanguage: 'fr', translations: null },
      });
      await service.translateOnDemand('post-1', 'en');
      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalledTimes(1);
    });

    it('swallows ZMQ errors', async () => {
      const { service, zmqClient } = makeService({
        post: { content: 'Hello', originalLanguage: 'en', translations: {} },
      });
      (zmqClient.translateToMultipleLanguages as jest.Mock).mockRejectedValue(new Error('ZMQ down'));
      await expect(service.translateOnDemand('post-1', 'fr')).resolves.toBeUndefined();
    });
  });

  describe('translateComment', () => {
    it('skips URL-only comment content (links preserved verbatim, never sent to NLLB)', async () => {
      const { service, zmqClient } = makeService();
      await service.translateComment('comment-1', 'post-1', 'https://example.com/shared-link', 'en');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });

    it('sends ZMQ request with comment:<id> messageId', async () => {
      const { service, zmqClient } = makeService();
      await service.translateComment('comment-1', 'post-1', 'Hello world', 'en');
      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalledTimes(1);
      const [, , , messageId] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(messageId).toBe('comment:comment-1');
    });

    it('detects language from content when originalLanguage is not provided', async () => {
      const { service, zmqClient } = makeService();
      await service.translateComment('comment-1', 'post-1', 'Je suis très content');
      const [, sourceLang] = (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(sourceLang).toBe('fr');
    });

    it('swallows ZMQ errors', async () => {
      const { service, zmqClient } = makeService();
      (zmqClient.translateToMultipleLanguages as jest.Mock).mockRejectedValue(new Error('ZMQ down'));
      await expect(service.translateComment('c-1', 'p-1', 'Hello', 'en')).resolves.toBeUndefined();
    });
  });

  describe('translateCommentOnDemand', () => {
    const commentFixture = (overrides: Record<string, unknown> = {}) => ({
      content: 'Hello world', originalLanguage: 'en', translations: null, postId: 'post-1', ...overrides,
    });

    it('sends a single-language ZMQ request with the comment routing keys', async () => {
      const { service, zmqClient } = makeService({ postComment: commentFixture() });
      await service.translateCommentOnDemand('comment-1', 'de');

      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalledTimes(1);
      const [content, sourceLang, targets, messageId, context] =
        (zmqClient.translateToMultipleLanguages as jest.Mock).mock.calls[0] as [string, string, string[], string, string];
      expect(content).toBe('Hello world');
      expect(sourceLang).toBe('en');
      expect(targets).toEqual(['de']);
      expect(messageId).toBe('comment:comment-1');
      expect(context).toBe('comment_context:post-1');
    });

    it('skips when the translation is already cached — unless force replays it', async () => {
      const cached = commentFixture({ translations: { de: { text: 'Hallo' } } });
      const { service, zmqClient } = makeService({ postComment: cached });

      await service.translateCommentOnDemand('comment-1', 'de');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();

      await service.translateCommentOnDemand('comment-1', 'de', { force: true });
      expect(zmqClient.translateToMultipleLanguages).toHaveBeenCalledTimes(1);
    });

    it('skips when target equals source, URL-only content, or missing comment', async () => {
      const { service, zmqClient } = makeService({ postComment: commentFixture() });
      await service.translateCommentOnDemand('comment-1', 'en');
      expect(zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();

      const urlOnly = makeService({ postComment: commentFixture({ content: 'https://example.com/x' }) });
      await urlOnly.service.translateCommentOnDemand('comment-1', 'de');
      expect(urlOnly.zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();

      const missing = makeService({ postComment: null as unknown as Record<string, unknown> });
      await missing.service.translateCommentOnDemand('comment-gone', 'de');
      expect(missing.zmqClient.translateToMultipleLanguages).not.toHaveBeenCalled();
    });
  });

  describe('ZMQ event listener — translationCompleted', () => {
    const makeEvent = (messageId: string) => ({
      type: 'translation_completed' as const,
      taskId: 'task-1',
      targetLanguage: 'fr',
      timestamp: Date.now(),
      result: {
        messageId,
        translatedText: 'Bonjour',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        confidenceScore: 0.99,
        processingTime: 100,
        modelType: 'nllb',
        translatorModel: 'nllb-200',
      },
    });

    it('ignores events with no messageId in result', async () => {
      const { prisma, zmqClient } = makeService();
      zmqClient.emit('translationCompleted', {
        ...makeEvent('post:post-1'),
        result: { ...makeEvent('post:post-1').result, messageId: undefined },
      });
      await flushPromises();
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('ignores events with unrecognized messageId prefix', async () => {
      const { prisma, zmqClient } = makeService();
      zmqClient.emit('translationCompleted', makeEvent('user:user-1'));
      await flushPromises();
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('routes post: messageId to handlePostTranslationCompleted', async () => {
      const { prisma, zmqClient, socialEvents } = makeService({
        post: { authorId: 'author-1' },
      });
      zmqClient.emit('translationCompleted', makeEvent('post:post-1'));
      await flushPromises();
      expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
      const cmd = (prisma.$runCommandRaw as jest.Mock).mock.calls[0] as [object];
      expect(cmd[0]).toMatchObject({ update: 'Post' });
    });

    it('routes comment: messageId to handleCommentTranslationCompleted', async () => {
      const { prisma, zmqClient } = makeService({
        postComment: { postId: 'post-1' },
        post: { authorId: 'author-1' },
      });
      zmqClient.emit('translationCompleted', makeEvent('comment:comment-1'));
      await flushPromises();
      expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
      const cmd = (prisma.$runCommandRaw as jest.Mock).mock.calls[0] as [object];
      expect(cmd[0]).toMatchObject({ update: 'PostComment' });
    });

    it('does not broadcast post translation when post author is not found', async () => {
      const { socialEvents, zmqClient } = makeService({ post: null });
      zmqClient.emit('translationCompleted', makeEvent('post:post-missing'));
      await flushPromises();
      expect(socialEvents.broadcastPostTranslationUpdated).not.toHaveBeenCalled();
    });

    it('does not broadcast comment translation when comment is not found', async () => {
      const { socialEvents, zmqClient } = makeService({ postComment: null });
      zmqClient.emit('translationCompleted', makeEvent('comment:comment-missing'));
      await flushPromises();
      expect(socialEvents.broadcastCommentTranslationUpdated).not.toHaveBeenCalled();
    });

    it('does not broadcast comment translation when parent post is not found', async () => {
      const { socialEvents, zmqClient } = makeService({
        postComment: { postId: 'post-missing' },
        post: null,
      });
      zmqClient.emit('translationCompleted', makeEvent('comment:comment-1'));
      await flushPromises();
      expect(socialEvents.broadcastCommentTranslationUpdated).not.toHaveBeenCalled();
    });

    it('broadcasts post translation with correct payload', async () => {
      const { socialEvents, zmqClient } = makeService({
        post: { authorId: 'author-1' },
      });
      zmqClient.emit('translationCompleted', makeEvent('post:post-1'));
      await flushPromises();
      expect(socialEvents.broadcastPostTranslationUpdated).toHaveBeenCalledTimes(1);
      const [payload] = (socialEvents.broadcastPostTranslationUpdated as jest.Mock).mock.calls[0] as [object];
      expect(payload).toMatchObject({
        postId: 'post-1',
        language: 'fr',
        translation: expect.objectContaining({ text: 'Bonjour' }),
      });
    });

    it('broadcasts comment translation with correct payload', async () => {
      const { socialEvents, zmqClient } = makeService({
        postComment: { postId: 'post-1' },
        post: { authorId: 'author-1' },
      });
      zmqClient.emit('translationCompleted', makeEvent('comment:comment-1'));
      await flushPromises();
      expect(socialEvents.broadcastCommentTranslationUpdated).toHaveBeenCalledTimes(1);
      const [payload] = (socialEvents.broadcastCommentTranslationUpdated as jest.Mock).mock.calls[0] as [object];
      expect(payload).toMatchObject({
        postId: 'post-1',
        commentId: 'comment-1',
        language: 'fr',
        translation: expect.objectContaining({ text: 'Bonjour' }),
      });
    });

    it('swallows $runCommandRaw failure in post translation handler', async () => {
      const { prisma, zmqClient } = makeService({
        post: { authorId: 'author-1' },
      });
      (prisma.$runCommandRaw as jest.Mock).mockRejectedValue(new Error('DB error'));
      zmqClient.emit('translationCompleted', makeEvent('post:post-1'));
      await flushPromises();
      // The catch block logs and returns — no uncaught rejection
    });

    it('swallows $runCommandRaw failure in comment translation handler', async () => {
      const { prisma, zmqClient } = makeService({
        postComment: { postId: 'post-1' },
        post: { authorId: 'author-1' },
      });
      (prisma.$runCommandRaw as jest.Mock).mockRejectedValue(new Error('DB error'));
      zmqClient.emit('translationCompleted', makeEvent('comment:comment-1'));
      await flushPromises();
      // The catch block logs and returns — no uncaught rejection
    });

    it('uses fallback translatorModel and confidenceScore for post when not provided', async () => {
      const { socialEvents, zmqClient } = makeService({
        post: { authorId: 'author-1' },
      });
      const event = makeEvent('post:post-1');
      zmqClient.emit('translationCompleted', {
        ...event,
        result: { ...event.result, translatorModel: undefined, confidenceScore: undefined },
      });
      await flushPromises();
      expect(socialEvents.broadcastPostTranslationUpdated).toHaveBeenCalledTimes(1);
      const [postPayload] = (socialEvents.broadcastPostTranslationUpdated as jest.Mock).mock.calls[0] as [{ translation: { translationModel: string; confidenceScore: number } }];
      expect(postPayload.translation.translationModel).toBe('nllb');
      expect(postPayload.translation.confidenceScore).toBe(1);
    });

    it('uses fallback translatorModel and confidenceScore for comment when not provided', async () => {
      const { socialEvents, zmqClient } = makeService({
        postComment: { postId: 'post-1' },
        post: { authorId: 'author-1' },
      });
      const event = makeEvent('comment:comment-1');
      zmqClient.emit('translationCompleted', {
        ...event,
        result: { ...event.result, translatorModel: undefined, confidenceScore: undefined },
      });
      await flushPromises();
      expect(socialEvents.broadcastCommentTranslationUpdated).toHaveBeenCalledTimes(1);
      const [commentPayload] = (socialEvents.broadcastCommentTranslationUpdated as jest.Mock).mock.calls[0] as [{ translation: { translationModel: string; confidenceScore: number } }];
      expect(commentPayload.translation.translationModel).toBe('nllb');
      expect(commentPayload.translation.confidenceScore).toBe(1);
    });

    it('handles broadcast failure silently (empty .catch)', async () => {
      const { prisma, socialEvents, zmqClient } = makeService({
        post: { authorId: 'author-1' },
      });
      (socialEvents.broadcastPostTranslationUpdated as jest.Mock).mockRejectedValue(new Error('broadcast error'));
      zmqClient.emit('translationCompleted', makeEvent('post:post-1'));
      await flushPromises();
      expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
    });

    it('handles comment broadcast failure silently (empty .catch)', async () => {
      const { prisma, socialEvents, zmqClient } = makeService({
        postComment: { postId: 'post-1' },
        post: { authorId: 'author-1' },
      });
      (socialEvents.broadcastCommentTranslationUpdated as jest.Mock).mockRejectedValue(new Error('broadcast error'));
      zmqClient.emit('translationCompleted', makeEvent('comment:comment-1'));
      await flushPromises();
      expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
    });
  });
});

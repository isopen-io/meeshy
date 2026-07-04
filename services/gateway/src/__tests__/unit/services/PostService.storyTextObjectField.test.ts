/**
 * Story overlay-text field resolution (`text` canonical, `content` legacy).
 *
 * The iOS composer encodes overlay text under `text`; `content` is the
 * pre-rename legacy alias (accepted by the SDK decoder and the web transform).
 * The gateway used to read `.content` only, so every iOS-authored overlay was
 * silently dropped from search indexing AND translation — a Prisme Linguistique
 * regression (non-French viewers saw untranslated overlays).
 *
 * Pins:
 *  1. `PostService.storyTextObjectText` — pure canonical resolver.
 *  2. createPost fills the story search index from a `text`-only overlay.
 *  3. `triggerStoryTextObjectTranslation` fires a ZMQ job for a `text`-only
 *     overlay (and still for a legacy `content`-only overlay).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PostService } from '../../../services/PostService';
import { ZMQSingleton } from '../../../services/ZmqSingleton';
import type { TrackingLinkService } from '../../../services/TrackingLinkService';

const POST_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439099';

const noopTracking = {
  collectContentTrackingLinks: jest
    .fn<TrackingLinkService['collectContentTrackingLinks']>()
    .mockResolvedValue([]),
} as unknown as TrackingLinkService;

const buildPrisma = (contactLanguages: Array<string | null> = []) => {
  const post = {
    create: jest
      .fn<(arg?: unknown) => Promise<{ id: string; authorId: string; metadata: unknown }>>()
      .mockResolvedValue({ id: POST_ID, authorId: USER_ID, metadata: null }),
    update: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
    findUnique: jest
      .fn<(arg?: unknown) => Promise<unknown>>()
      .mockResolvedValue({ id: POST_ID, authorId: USER_ID }),
    findFirst: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue(null),
  };
  const participant = {
    findMany: jest
      .fn<(arg?: unknown) => Promise<Array<{ user: { systemLanguage: string | null } }>>>()
      .mockResolvedValue(contactLanguages.map((l) => ({ user: { systemLanguage: l } }))),
  };
  const prisma = { post, participant };
  return prisma as unknown as ConstructorParameters<typeof PostService>[0] & {
    post: typeof post;
    participant: typeof participant;
  };
};

const makeService = (prisma: ReturnType<typeof buildPrisma>) =>
  new PostService(
    prisma as unknown as ConstructorParameters<typeof PostService>[0],
    undefined,
    undefined,
    undefined,
    noopTracking,
  );

describe('PostService.storyTextObjectText — canonical overlay-text resolver', () => {
  it('returns the canonical `text` field', () => {
    expect(PostService.storyTextObjectText({ text: 'hello' })).toBe('hello');
  });

  it('falls back to the legacy `content` field when `text` is absent', () => {
    expect(PostService.storyTextObjectText({ content: 'legacy' })).toBe('legacy');
  });

  it('prefers `text` over the legacy `content`', () => {
    expect(PostService.storyTextObjectText({ text: 'new', content: 'old' })).toBe('new');
  });

  it('returns undefined when neither field is a string', () => {
    expect(PostService.storyTextObjectText({})).toBeUndefined();
    expect(PostService.storyTextObjectText({ text: 42 as unknown })).toBeUndefined();
  });
});

describe('PostService.createPost — story search index from overlays', () => {
  it('indexes a `text`-only overlay into Post.content (was dropped when reading `.content`)', async () => {
    const prisma = buildPrisma();

    await makeService(prisma).createPost(
      {
        type: 'STORY',
        visibility: 'PUBLIC',
        storyEffects: { textObjects: [{ id: 'a', text: 'searchable overlay' }] },
      } as never,
      USER_ID,
    );

    const contentWrite = prisma.post.update.mock.calls
      .map((c) => c[0] as { data?: { content?: string } })
      .find((arg) => arg?.data?.content !== undefined);
    expect(contentWrite?.data?.content).toBe('searchable overlay');
  });
});

describe('PostService.triggerStoryTextObjectTranslation — overlay translation', () => {
  let translateSpy: jest.Mock;

  beforeEach(() => {
    translateSpy = jest.fn();
    jest
      .spyOn(ZMQSingleton, 'getInstanceSync')
      .mockReturnValue({ translateTextObject: translateSpy } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const invoke = (prisma: ReturnType<typeof buildPrisma>, textObjects: unknown[]) =>
    (makeService(prisma) as unknown as {
      triggerStoryTextObjectTranslation: (p: string, t: unknown[], a: string) => Promise<void>;
    }).triggerStoryTextObjectTranslation(POST_ID, textObjects, USER_ID);

  it('fires a ZMQ job for a `text`-only overlay', async () => {
    // Audience speaks Spanish; overlay is authored in French.
    await invoke(buildPrisma(['es']), [{ id: 'a', text: 'Bonjour', sourceLanguage: 'fr' }]);

    expect(translateSpy).toHaveBeenCalledTimes(1);
    expect(translateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ postId: POST_ID, text: 'Bonjour', sourceLanguage: 'fr', targetLanguages: ['es'] }),
    );
  });

  it('still fires for a legacy `content`-only overlay (backward compatible)', async () => {
    await invoke(buildPrisma(['es']), [{ id: 'a', content: 'Bonjour', sourceLanguage: 'fr' }]);

    expect(translateSpy).toHaveBeenCalledTimes(1);
    expect(translateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Bonjour', targetLanguages: ['es'] }),
    );
  });

  it('does not fire when the overlay has no text at all', async () => {
    await invoke(buildPrisma(['es']), [{ id: 'a' }]);
    expect(translateSpy).not.toHaveBeenCalled();
  });
});

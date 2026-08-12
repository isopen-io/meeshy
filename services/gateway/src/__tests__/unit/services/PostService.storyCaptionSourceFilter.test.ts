/**
 * `triggerStoryTextTranslation` (story caption/content pipeline) must exclude
 * the caption's own source language from the ZMQ target-language list — same
 * guard its sibling `triggerStoryTextObjectTranslation` already applies
 * (`targetLanguages = allTargetLanguages.filter(l => l !== sourceLanguage)`).
 *
 * Without the guard, an author captioning in a language shared by part of
 * their audience (e.g. a French author with French-speaking contacts)
 * triggers a self-translation NLLB round-trip (`fr` → `fr`), which then
 * overwrites `Post.translations.fr` with a paraphrase of the original
 * instead of leaving it untouched — a Prisme Linguistique violation (the
 * viewer should see the author's exact words, not a machine-reprocessed
 * version, when the story is already in their language).
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
  const participant = {
    findMany: jest
      .fn<(arg?: unknown) => Promise<Array<{ user: { systemLanguage: string | null } }>>>()
      .mockResolvedValue(contactLanguages.map((l) => ({ user: { systemLanguage: l } }))),
  };
  const prisma = { participant };
  return prisma as unknown as ConstructorParameters<typeof PostService>[0] & {
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

describe('PostService.triggerStoryTextTranslation — caption source-language filtering', () => {
  let translateSpy: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    translateSpy = jest.fn();
    jest.spyOn(ZMQSingleton, 'getInstanceSync').mockReturnValue({
      translateToMultipleLanguages: translateSpy,
      on: jest.fn(),
      off: jest.fn(),
    } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const invoke = (
    prisma: ReturnType<typeof buildPrisma>,
    content: string,
    sourceLanguageOverride?: string,
  ) =>
    (makeService(prisma) as unknown as {
      triggerStoryTextTranslation: (
        p: string,
        c: string,
        a: string,
        s?: string,
      ) => Promise<void>;
    }).triggerStoryTextTranslation(POST_ID, content, USER_ID, sourceLanguageOverride);

  it('excludes the source language from the ZMQ target-language list', async () => {
    // Audience speaks French and Spanish; caption is authored in French.
    await invoke(buildPrisma(['fr', 'es']), 'Bonjour le monde', 'fr');

    expect(translateSpy).toHaveBeenCalledTimes(1);
    expect(translateSpy).toHaveBeenCalledWith(
      'Bonjour le monde',
      'fr',
      ['es'],
      `story:${POST_ID}`,
      `story_context:${POST_ID}`,
    );
  });

  it('does not fire at all when the only audience language is the source language', async () => {
    await invoke(buildPrisma(['fr']), 'Bonjour le monde', 'fr');

    expect(translateSpy).not.toHaveBeenCalled();
  });

  it('still fires for every audience language when none match the source', async () => {
    await invoke(buildPrisma(['es', 'de']), 'Bonjour le monde', 'fr');

    expect(translateSpy).toHaveBeenCalledTimes(1);
    expect(translateSpy).toHaveBeenCalledWith(
      'Bonjour le monde',
      'fr',
      ['es', 'de'],
      `story:${POST_ID}`,
      `story_context:${POST_ID}`,
    );
  });
});

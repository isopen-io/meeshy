/**
 * Unit tests for `MessageTranslationService._extractConversationLanguages`
 * after the Plan B integration of `User.deviceLocale` as the 4th-priority
 * destination of the Prisme Linguistique.
 *
 * Cf. `docs/superpowers/plans/2026-05-26-device-locale-fourth-priority-plan.md`
 * §Phase 2 Task 6.
 *
 * The method itself is private; we exercise it via `(svc as unknown as
 * { _extractConversationLanguages(id: string): Promise<string[]> })` —
 * same pattern used by `MessageTranslationService.test.ts` for other
 * private helpers in this service.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// `_extractConversationLanguages` only reads from `this.prisma` — no ZMQ,
// no fs, no logger-enhanced side effects — so no module mocks are needed.
// We never call `initialize()` in this suite, which keeps ZMQSingleton
// inert.

import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';

type ParticipantFixture = {
  type: 'user' | 'anonymous' | 'bot';
  displayName?: string;
  language?: string | null;
  user?: {
    id: string;
    username: string;
    systemLanguage?: string | null;
    regionalLanguage?: string | null;
    customDestinationLanguage?: string | null;
    deviceLocale?: string | null;
  } | null;
};

function makePrismaMock(overrides: {
  conversationAutoTranslate?: boolean;
  participants: ParticipantFixture[];
}) {
  const autoTranslate = overrides.conversationAutoTranslate ?? true;

  const conversationFindUnique = jest.fn(async () => ({
    autoTranslateEnabled: autoTranslate,
  }));

  const participantFindMany = jest.fn(async () =>
    overrides.participants.map((p, idx) => ({
      id: `p${idx + 1}`,
      displayName: p.displayName ?? `Participant ${idx + 1}`,
      type: p.type,
      language: p.language ?? null,
      user: p.user ?? null,
    }))
  );

  const prisma = {
    conversation: { findUnique: conversationFindUnique },
    participant: { findMany: participantFindMany },
  };

  return { prisma, conversationFindUnique, participantFindMany };
}

function extractLanguages(
  svc: MessageTranslationService,
  conversationId: string
): Promise<string[]> {
  return (svc as unknown as {
    _extractConversationLanguages(id: string): Promise<string[]>;
  })._extractConversationLanguages(conversationId);
}

describe('MessageTranslationService._extractConversationLanguages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes deviceLocale from every participant whose in-app prefs do not already cover it', async () => {
    // Alice fr + (no regional/custom) + deviceLocale it → contributes fr, it
    // Bob   en + (no regional/custom) + deviceLocale de → contributes en, de
    // Carol es + (no regional/custom) + deviceLocale fr → contributes es (fr already in set), fr
    const { prisma } = makePrismaMock({
      participants: [
        {
          type: 'user',
          user: {
            id: 'alice',
            username: 'alice',
            systemLanguage: 'fr',
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: 'it',
          },
        },
        {
          type: 'user',
          user: {
            id: 'bob',
            username: 'bob',
            systemLanguage: 'en',
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: 'de',
          },
        },
        {
          type: 'user',
          user: {
            id: 'carol',
            username: 'carol',
            systemLanguage: 'es',
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: 'fr',
          },
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new MessageTranslationService(prisma as any);
    const languages = await extractLanguages(svc, 'conv-3-users');

    expect(languages.sort()).toEqual(['de', 'en', 'es', 'fr', 'it'].sort());
  });

  it('dedupes deviceLocale when it matches an in-app preference', async () => {
    const { prisma } = makePrismaMock({
      participants: [
        {
          type: 'user',
          user: {
            id: 'alice',
            username: 'alice',
            systemLanguage: 'fr',
            regionalLanguage: null,
            customDestinationLanguage: null,
            // Same as systemLanguage: must NOT cause "fr" to appear twice.
            deviceLocale: 'fr',
          },
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new MessageTranslationService(prisma as any);
    const languages = await extractLanguages(svc, 'conv-dedup');

    expect(languages).toEqual(['fr']);
  });

  it('normalises deviceLocale identifiers (fr-FR → fr) before deduping', async () => {
    const { prisma } = makePrismaMock({
      participants: [
        {
          type: 'user',
          user: {
            id: 'alice',
            username: 'alice',
            systemLanguage: 'fr',
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: 'fr-FR', // should normalize to 'fr', then dedupe
          },
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new MessageTranslationService(prisma as any);
    const languages = await extractLanguages(svc, 'conv-normalize');

    expect(languages).toEqual(['fr']);
  });

  it('still merges anonymous participant.language with registered-user destinations', async () => {
    const { prisma } = makePrismaMock({
      participants: [
        {
          type: 'user',
          user: {
            id: 'alice',
            username: 'alice',
            systemLanguage: 'fr',
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: 'it',
          },
        },
        { type: 'anonymous', language: 'ar' },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new MessageTranslationService(prisma as any);
    const languages = await extractLanguages(svc, 'conv-mixed');

    expect(languages.sort()).toEqual(['ar', 'fr', 'it'].sort());
  });

  it('normalises an uppercase/locale-cased anonymous participant.language (Prisme rule #1)', async () => {
    // An anonymous participant stores `language` unvalidated, so it may hold 'EN'
    // or 'en-US'. Adding it verbatim injected a duplicate, never-matching NLLB
    // target against the lowercase-keyed MessageTranslation store.
    const { prisma } = makePrismaMock({
      participants: [
        {
          type: 'user',
          user: {
            id: 'alice',
            username: 'alice',
            systemLanguage: 'en',
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: null,
          },
        },
        { type: 'anonymous', language: 'EN' },
        { type: 'bot', language: 'ES-ES' },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new MessageTranslationService(prisma as any);
    const languages = await extractLanguages(svc, 'conv-cased');

    // 'EN' collapses onto the registered 'en' (no duplicate); 'ES-ES' → 'es'.
    expect(languages.sort()).toEqual(['en', 'es'].sort());
    expect(languages).not.toContain('EN');
    expect(languages).not.toContain('ES-ES');
  });

  it('returns [] when autoTranslateEnabled is false on the conversation', async () => {
    const { prisma } = makePrismaMock({
      conversationAutoTranslate: false,
      participants: [
        {
          type: 'user',
          user: {
            id: 'alice',
            username: 'alice',
            systemLanguage: 'fr',
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: 'it',
          },
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new MessageTranslationService(prisma as any);
    const languages = await extractLanguages(svc, 'conv-disabled');

    expect(languages).toEqual([]);
  });
});

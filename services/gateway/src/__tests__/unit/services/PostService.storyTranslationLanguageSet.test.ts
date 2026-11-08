/**
 * La traduction d'une story compte les LANGUES, jamais les ÉVÉNEMENTS (#16751).
 *
 * `triggerStoryContentTranslation` retirait son écouteur sur un COMPTEUR
 * d'événements (`receivedCount >= expectedCount`). Or le bus ZMQ relaie les
 * doublons par conception — `ZmqTranslationClient.setupEventForwarding` émet
 * `translationCompleted` et sa forme scopée INCONDITIONNELLEMENT, que
 * `settleTranslationLanguage` reconnaisse le taskId ou non — et le deadman de
 * `sendTranslationRequest` redemande les langues encore manquantes SOUS LE MÊME
 * taskId. Une langue lente-mais-vivante au passage du deadman revient donc deux
 * fois, le compteur atteint sa cible une langue trop tôt, et la DERNIÈRE langue
 * arrive sans écouteur : `Post.translations.<langue>` n'est jamais écrit, et son
 * lecteur voit la story dans la langue de l'auteur POUR TOUJOURS — le Prisme
 * sert l'original, aucun client ne refetche une traduction absente de la base.
 *
 * Le consommateur FRÈRE du même événement scopé fait déjà correct
 * (`socketio/call-transcription-relay.ts` monte un écouteur par langue) ; le
 * site story était le seul des deux à compter en vrac.
 *
 * Le témoin porte sur le RETRAIT de l'écouteur (`zmqClient.off`), pas sur
 * l'écriture : le harnais garde une référence directe à l'écouteur, donc
 * l'appeler écrit toujours. C'est l'écouteur RETIRÉ qui, en production, fait
 * disparaître la langue — l'assertion doit donc nommer le retrait.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PostService } from '../../../services/PostService';
import { MediaService } from '../../../services/MediaService';
import { ZMQSingleton } from '../../../services/ZmqSingleton';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) },
    init: jest.fn(),
  },
}));

const POST_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439099';
const CONTENT = 'Une story a traduire';

type Listener = (event: unknown) => Promise<void>;

function createMockPrisma(audience: string[]) {
  const prisma = {
    post: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async (arg: unknown) => ({
        id: POST_ID,
        authorId: USER_ID,
        type: 'STORY',
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        content: CONTENT,
        metadata: null,
        originalLanguage: (arg as { data: { originalLanguage?: string } }).data.originalLanguage ?? null,
        detectedLanguage: null,
        deletedAt: null,
        media: [],
      })),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        systemLanguage: 'fr',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null,
      }),
    },
    participant: {
      findMany: jest.fn().mockResolvedValue(audience.map((l) => ({ user: { systemLanguage: l } }))),
    },
    postMedia: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    $runCommandRaw: jest.fn().mockResolvedValue({ n: 1, nModified: 1, ok: 1 }),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma)
      : Promise.all(arg as ReadonlyArray<Promise<unknown>>),
  );
  return prisma;
}

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const SCOPED_EVENT = `translationCompleted:story:${POST_ID}`;

describe('PostService — la traduction d\'une story compte les langues (#16751)', () => {
  let listeners: Map<string, Listener>;
  let offSpy: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    listeners = new Map();
    offSpy = jest.fn();
    jest.spyOn(ZMQSingleton, 'getInstanceSync').mockReturnValue({
      translateToMultipleLanguages: jest.fn(),
      translateTextObject: jest.fn(),
      on: jest.fn((event: string, fn: Listener) => listeners.set(event, fn)),
      off: offSpy,
    } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const publishStoryFor = async (audience: string[]) => {
    const prisma = createMockPrisma(audience);
    const service = new PostService(prisma as unknown as PrismaClient, new MediaService());
    await service.createPost(
      { type: PostType.STORY, visibility: PostVisibility.PUBLIC, content: CONTENT, originalLanguage: 'fr' },
      USER_ID,
    );
    await flush();
    const listener = listeners.get(SCOPED_EVENT);
    expect(listener).toBeDefined();
    return { prisma, listener: listener! };
  };

  const deliver = async (listener: Listener, targetLanguage: string) => {
    await listener({
      taskId: 'task-unique',
      targetLanguage,
      metadata: {},
      result: { messageId: `story:${POST_ID}`, translatedText: `texte ${targetLanguage}`, confidenceScore: 0.9 },
    });
    await flush();
  };

  const offCallsForScopedEvent = () =>
    offSpy.mock.calls.filter((call) => call[0] === SCOPED_EVENT).length;

  it('un doublon de langue ne retire pas l\'ecouteur, et la derniere langue est servie', async () => {
    const { prisma, listener } = await publishStoryFor(['fr', 'es', 'de', 'ar']);

    await deliver(listener, 'es');
    await deliver(listener, 'es');
    await deliver(listener, 'de');

    expect(offCallsForScopedEvent()).toBe(0);

    await deliver(listener, 'ar');

    expect(offCallsForScopedEvent()).toBe(1);

    const writtenPaths = prisma.$runCommandRaw.mock.calls.map(
      (call) => Object.keys((call[0] as { updates: Array<{ u: { $set: Record<string, unknown> } }> }).updates[0].u.$set)[0],
    );
    expect(writtenPaths).toContain('translations.ar');
  });

  it('une langue INATTENDUE ne retire pas l\'ecouteur', async () => {
    const { listener } = await publishStoryFor(['fr', 'es', 'de']);

    await deliver(listener, 'es');
    await deliver(listener, 'zz');

    expect(offCallsForScopedEvent()).toBe(0);

    await deliver(listener, 'de');

    expect(offCallsForScopedEvent()).toBe(1);
  });

  it('un jeu complet sans doublon retire l\'ecouteur a la derniere langue — exactement comme avant', async () => {
    const { listener } = await publishStoryFor(['fr', 'es', 'de']);

    await deliver(listener, 'es');
    expect(offCallsForScopedEvent()).toBe(0);

    await deliver(listener, 'de');
    expect(offCallsForScopedEvent()).toBe(1);
  });
});

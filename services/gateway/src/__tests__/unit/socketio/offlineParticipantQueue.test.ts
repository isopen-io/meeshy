import { enqueueForOfflineParticipants } from '../../../socketio/offlineParticipantQueue';
import type {
  OfflineParticipantQueueDeps,
  OfflineParticipantQueueParams,
} from '../../../socketio/offlineParticipantQueue';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';

type ParticipantRow = {
  id: string;
  userId: string | null;
  language?: string;
  user?: {
    systemLanguage?: string | null;
    regionalLanguage?: string | null;
    customDestinationLanguage?: string | null;
    deviceLocale?: string | null;
  } | null;
};

function makeDeps(options: {
  participants: ParticipantRow[];
  connected?: string[];
}): OfflineParticipantQueueDeps & {
  enqueued: Array<{ key: string; entry: QueuedMessagePayload }>;
  selects: unknown[];
} {
  const enqueued: Array<{ key: string; entry: QueuedMessagePayload }> = [];
  const selects: unknown[] = [];
  const connected = new Set(options.connected ?? []);

  return {
    enqueued,
    selects,
    deliveryQueue: {
      async enqueue(key: string, entry: QueuedMessagePayload) {
        enqueued.push({ key, entry });
      },
    },
    prisma: {
      participant: {
        async findMany(args: { select?: unknown }) {
          selects.push(args?.select);
          return options.participants;
        },
      },
    } as unknown as OfflineParticipantQueueDeps['prisma'],
    connectedUsers: { has: (key: string) => connected.has(key) },
  };
}

function translationParams(
  overrides: Partial<OfflineParticipantQueueParams> = {}
): OfflineParticipantQueueParams {
  return {
    conversationId: 'conv-1',
    eventType: 'translation',
    messageId: 'msg-1',
    payload: { messageId: 'msg-1', translations: [] },
    dedupKey: 'msg-1:de',
    restrictToReadersOfLanguage: 'de',
    ...overrides,
  };
}

const GERMAN_READER: ParticipantRow = {
  id: 'p-de',
  userId: 'u-de',
  language: 'en',
  user: { systemLanguage: 'de' },
};

const SPANISH_READER: ParticipantRow = {
  id: 'p-es',
  userId: 'u-es',
  language: 'en',
  user: { systemLanguage: 'es' },
};

describe('enqueueForOfflineParticipants — language-restricted fan-out', () => {
  test('queues a translation only for offline readers whose prism carries that language', async () => {
    const deps = makeDeps({ participants: [GERMAN_READER, SPANISH_READER] });

    await enqueueForOfflineParticipants(deps, translationParams());

    expect(deps.enqueued.map((e) => e.key)).toEqual(['u-de']);
  });

  test('keeps a language ranked BELOW the primary — it is the Prisme fallback when the primary translation never lands', async () => {
    const deps = makeDeps({
      participants: [
        { id: 'p-1', userId: 'u-1', language: 'en', user: { systemLanguage: 'de', regionalLanguage: 'en' } },
      ],
    });

    await enqueueForOfflineParticipants(
      deps,
      translationParams({ restrictToReadersOfLanguage: 'en', dedupKey: 'msg-1:en' })
    );

    expect(deps.enqueued.map((e) => e.key)).toEqual(['u-1']);
  });

  test('falls back to Participant.language for an anonymous share-link guest (no User row)', async () => {
    const deps = makeDeps({
      participants: [
        { id: 'p-anon-de', userId: null, language: 'de', user: null },
        { id: 'p-anon-es', userId: null, language: 'es', user: null },
      ],
    });

    await enqueueForOfflineParticipants(deps, translationParams());

    expect(deps.enqueued.map((e) => e.key)).toEqual(['p-anon-de']);
  });

  test('fails OPEN when a participant carries no resolvable language at all', async () => {
    const deps = makeDeps({
      participants: [{ id: 'p-unknown', userId: 'u-unknown', language: '', user: null }],
    });

    await enqueueForOfflineParticipants(deps, translationParams());

    expect(deps.enqueued.map((e) => e.key)).toEqual(['u-unknown']);
  });

  test('normalizes region-tagged and upper-cased codes on both sides of the comparison', async () => {
    const deps = makeDeps({
      participants: [{ id: 'p-pt', userId: 'u-pt', language: 'en', user: { systemLanguage: 'PT-BR' } }],
    });

    await enqueueForOfflineParticipants(
      deps,
      translationParams({ restrictToReadersOfLanguage: 'pt', dedupKey: 'msg-1:pt' })
    );

    expect(deps.enqueued.map((e) => e.key)).toEqual(['u-pt']);
  });

  test('still excludes connected participants and the actor', async () => {
    const deps = makeDeps({
      participants: [
        GERMAN_READER,
        { id: 'p-de-2', userId: 'u-de-2', language: 'en', user: { systemLanguage: 'de' } },
        { id: 'p-de-3', userId: 'u-de-3', language: 'en', user: { systemLanguage: 'de' } },
      ],
      connected: ['u-de-2'],
    });

    await enqueueForOfflineParticipants(deps, translationParams({ actorUserId: 'u-de-3' }));

    expect(deps.enqueued.map((e) => e.key)).toEqual(['u-de']);
  });
});

describe('enqueueForOfflineParticipants — unrestricted fan-out is unchanged', () => {
  test('queues for every offline participant when no language restriction is given', async () => {
    const deps = makeDeps({ participants: [GERMAN_READER, SPANISH_READER] });

    await enqueueForOfflineParticipants(deps, {
      conversationId: 'conv-1',
      eventType: 'edited',
      messageId: 'msg-1',
      payload: { id: 'msg-1' },
    });

    expect(deps.enqueued.map((e) => e.key)).toEqual(['u-de', 'u-es']);
  });

  test('does not widen the participant projection when unrestricted', async () => {
    const deps = makeDeps({ participants: [GERMAN_READER] });

    await enqueueForOfflineParticipants(deps, {
      conversationId: 'conv-1',
      eventType: 'edited',
      messageId: 'msg-1',
      payload: { id: 'msg-1' },
    });

    expect(deps.selects[0]).toEqual({ id: true, userId: true });
  });

  test('honours a caller-supplied participant list without querying', async () => {
    const deps = makeDeps({ participants: [] });

    await enqueueForOfflineParticipants(deps, {
      conversationId: 'conv-1',
      eventType: 'edited',
      messageId: 'msg-1',
      payload: { id: 'msg-1' },
      participants: [{ id: 'p-1', userId: 'u-1' }],
    });

    expect(deps.enqueued.map((e) => e.key)).toEqual(['u-1']);
    expect(deps.selects).toHaveLength(0);
  });
});

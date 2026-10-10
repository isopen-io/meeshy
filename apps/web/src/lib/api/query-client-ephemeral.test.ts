import { afterEach, describe, expect, test } from 'bun:test';

import { configureEphemeralReceptionStorage, noteEphemeralReception, resetEphemeralReception } from '@/lib/view/ephemeral-reception';

import { messagesQueryKey } from './messages';
import type { MessagesInfiniteData } from './messages-pages';
import { createAppQueryClient, type StorageLike } from './query-client';
import type { Message } from './types';

/**
 * **LE CACHE PERSISTÉ NE GARDE PAS UN ÉPHÉMÈRE PARTI** (#8900, trou 1) — ni à
 * l'écriture (le texte ne dort pas sur le disque), ni à la relecture (un cache
 * écrit avant l'échéance ne le ressuscite pas au rechargement, même hors
 * ligne). `now` est injecté : aucun témoin ne lit l'horloge murale.
 */

const T0 = Date.parse('2026-09-30T10:00:00.000Z');
const MINUTE = 60_000;
const CACHE_KEY = 'meeshy.query-cache';
const BUSTER = '0.0.0-test:u-viewer';

function fakeStorage(): StorageLike & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

function messageOf(partial: Partial<Message>): Message {
  return {
    id: 'm',
    conversationId: 'c-a',
    senderId: 'u-other',
    content: 'texte',
    originalLanguage: 'fr',
    messageType: 'text',
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    translations: [],
    createdAt: new Date(T0).toISOString(),
    ...partial,
  } as unknown as Message;
}

const pagesOf = (messages: readonly Message[]): MessagesInfiniteData => ({
  pages: [{ messages, hasOlder: false, nextCursor: null }],
  pageParams: [undefined],
});

const idsIn = (data: MessagesInfiniteData | undefined): readonly string[] =>
  (data?.pages ?? []).flatMap((page) => page.messages.map((m) => m.id));

const thread = (): readonly Message[] => [
  messageOf({ id: 'm-servi-echu', content: 'Le code est 4817.', ephemeralDuration: 60, expiresAt: new Date(T0 - MINUTE).toISOString() as unknown as Date }),
  messageOf({ id: 'm-socket-echu', content: 'Rendez-vous à 18 h.', ephemeralDuration: 60 }),
  messageOf({ id: 'm-vivant', content: 'Encore là', ephemeralDuration: 3600 }),
  messageOf({ id: 'm-ordinaire', content: 'Bonjour' }),
];

afterEach(() => {
  configureEphemeralReceptionStorage(null, T0);
  resetEphemeralReception();
});

describe('persistance du cache et éphémères partis (#8900)', () => {
  test('à l’ÉCRITURE : ni l’échu servi ni l’échu reçu par socket n’atteignent le disque', () => {
    configureEphemeralReceptionStorage(null, T0);
    noteEphemeralReception('m-socket-echu', T0 - 2 * MINUTE);
    noteEphemeralReception('m-vivant', T0 - MINUTE);
    const storage = fakeStorage();
    const client = createAppQueryClient({ storage, buster: BUSTER, now: () => T0 });
    client.setQueryData(messagesQueryKey('c-a'), pagesOf(thread()));

    client.persist();

    const raw = storage.raw.get(CACHE_KEY) ?? '';
    expect(raw).not.toContain('4817');
    expect(raw).not.toContain('Rendez-vous');
    expect(raw).toContain('Encore là');
    expect(raw).toContain('Bonjour');
  });

  test('à la RELECTURE : un cache écrit avant l’échéance ne ressuscite rien', () => {
    configureEphemeralReceptionStorage(null, T0);
    noteEphemeralReception('m-socket-echu', T0 - 2 * MINUTE);
    noteEphemeralReception('m-vivant', T0 - MINUTE);
    const storage = fakeStorage();
    const writer = createAppQueryClient({ storage, buster: BUSTER, now: () => T0 - 10 * MINUTE });
    writer.setQueryData(messagesQueryKey('c-a'), pagesOf(thread()));
    writer.persist();
    expect(storage.raw.get(CACHE_KEY) ?? '').toContain('Rendez-vous');

    const reader = createAppQueryClient({ storage, buster: BUSTER, now: () => T0 });

    expect(idsIn(reader.getQueryData<MessagesInfiniteData>(messagesQueryKey('c-a')))).toEqual(['m-vivant', 'm-ordinaire']);
  });
});

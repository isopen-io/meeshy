import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { removeAfterReadLocally } from '@/lib/api/after-read';
import { pruneGoneEphemerals } from '@/lib/api/ephemeral-cache';
import { messagesQueryKey } from '@/lib/api/messages';
import { tombstone } from '@/lib/api/quote-tombstone';
import { applyMessageExpired } from '@/lib/api/realtime-ephemeral';
import type { Message } from '@/lib/api/types';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { DESTRUCTION_MS } from './ephemeral-destruction';
import { livingMessages, nextEphemeralGoneAt } from './ephemeral-gone';
import { configureEphemeralReceptionStorage, noteEphemeralReception, resetEphemeralReception } from './ephemeral-reception';

/**
 * **HORS LIGNE, UNE RÉPONSE MEURT SUR L'APPAREIL AVEC CE QU'ELLE CITE** (#10433,
 * suite de #8686 ; règle serveur #8630, `quoteCascade.ts`).
 *
 * Le fil retirait l'éphémère échu à son échéance locale (#8900), mais ses
 * réponses restaient — jusqu'au `message:expired` que la passerelle n'envoie
 * qu'en ligne, ou jusqu'au rechargement. Et une réponse à VUE UNIQUE non
 * éphémère n'avait AUCUNE échéance lisible (#7580) : elle survivait même à la
 * mort annoncée de la flamme-œil qu'elle cite.
 */

const T0 = Date.parse('2026-10-13T10:00:00.000Z');
const MINUTE = 60_000;
const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;

const VIEWER = 'u-viewer';
const isMine = (message: Message): boolean => message.senderId === VIEWER;

const ephemeral = (partial: Partial<Message> = {}): Message =>
  localMessage({ id: 'm-eph', senderId: 'u-other', content: 'Code 4521', ephemeralDuration: 60, ...partial });

const flameEye = (partial: Partial<Message> = {}): Message =>
  localMessage({ id: 'm-flamme', senderId: 'u-other', content: 'Secret', effectFlags: AFTER_READ, ...partial });

const replyTo = (quoted: Message, partial: Partial<Message> = {}): Message =>
  localMessage({ id: 'm-reply', senderId: 'u-other', content: 'Reçu', replyToId: quoted.id, replyTo: quoted, ...partial });

const living = (messages: readonly Message[], now: number): readonly string[] =>
  livingMessages({ messages, isMine, now, destroyingIds: new Set(), expiredIds: new Set() }).map((m) => m.id);

const expiredQuote = (quoted: Message, at: number): Message => tombstone(quoted, new Date(at).toISOString(), true);

afterEach(() => {
  configureEphemeralReceptionStorage(null, T0);
  resetEphemeralReception();
});

describe('le fil retire une réponse quand ce qu’elle cite meurt chez ce lecteur, sans réseau', () => {
  test('l’éphémère échu localement emporte sa réponse, à la même échéance', () => {
    noteEphemeralReception('m-eph', T0);
    const quoted = ephemeral();
    const thread = [quoted, replyTo(quoted)];

    expect(living(thread, T0 + MINUTE - 1)).toEqual(['m-eph', 'm-reply']);
    expect(living(thread, T0 + MINUTE + DESTRUCTION_MS)).toEqual([]);
  });

  test('la mort descend la chaîne : la réponse à la réponse part aussi', () => {
    noteEphemeralReception('m-eph', T0);
    const quoted = ephemeral();
    const first = replyTo(quoted);
    const second = replyTo(first, { id: 'm-reply-2', replyToId: 'm-reply' });

    expect(living([quoted, first, second], T0 + MINUTE + DESTRUCTION_MS)).toEqual([]);
  });

  test('l’éphémère sorti du cache emporte encore sa réponse, par la citation embarquée', () => {
    noteEphemeralReception('m-eph', T0);
    const thread = [replyTo(ephemeral())];

    expect(living(thread, T0 + MINUTE + DESTRUCTION_MS)).toEqual([]);
  });

  test('la flamme-œil consommée en quittant emporte sa réponse, sans `message:expired`', () => {
    const client = new QueryClient();
    const quoted = flameEye();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([quoted, replyTo(quoted)]));

    removeAfterReadLocally(client, { conversationId: 'c-a', messageIds: ['m-flamme'], now: new Date(T0) });

    const cached = threadOf(client, 'c-a')?.messages ?? [];
    expect(cached.map((m) => m.id)).toEqual(['m-reply']);
    expect(living(cached, T0 + DESTRUCTION_MS)).toEqual([]);
  });

  test('la réponse ne part pas AVANT ce qu’elle cite', () => {
    const thread = [replyTo(ephemeral(), { replyTo: expiredQuote(ephemeral(), T0) })];

    expect(living(thread, T0 + DESTRUCTION_MS - 1)).toEqual(['m-reply']);
  });

  test('le fil se réveille à la mort d’une citation dont le message n’est pas chargé', () => {
    noteEphemeralReception('m-eph', T0);
    const thread = [replyTo(ephemeral())];

    expect(nextEphemeralGoneAt({ messages: thread, isMine, now: T0, destroyingIds: new Set() })).toBe(
      T0 + MINUTE + DESTRUCTION_MS,
    );
  });
});

describe('ce qui ne meurt pas ne fait rien mourir', () => {
  test('une citation SUPPRIMÉE (pas expirée) laisse vivre la réponse', () => {
    const plain = localMessage({ id: 'm-plain', senderId: 'u-other', content: 'Salut' });
    const thread = [replyTo(plain, { replyTo: tombstone(plain, new Date(T0).toISOString()) })];

    expect(living(thread, T0 + 10 * MINUTE)).toEqual(['m-reply']);
  });

  test('une flamme-œil pas encore consommée laisse vivre la réponse', () => {
    const quoted = flameEye();

    expect(living([quoted, replyTo(quoted)], T0 + 10 * MINUTE)).toEqual(['m-flamme', 'm-reply']);
  });

  test('l’expéditeur d’une flamme-œil garde la réponse : rien ne lui est servi', () => {
    const quoted = flameEye({ senderId: VIEWER });

    expect(living([quoted, replyTo(quoted)], T0 + 10 * MINUTE)).toEqual(['m-flamme', 'm-reply']);
  });

  test('un éphémère qui n’a pas encore été reçu n’emporte rien', () => {
    const quoted = ephemeral();

    expect(living([quoted, replyTo(quoted)], T0 + 10 * MINUTE)).toEqual(['m-eph', 'm-reply']);
  });
});

describe('une réponse à VUE UNIQUE, non éphémère, à une flamme-œil morte est retirée', () => {
  const viewOnceReply = (quote: Message): Message =>
    replyTo(flameEye(), { isViewOnce: true, content: 'SECRET-VU', replyTo: quote });

  test('dans le fil, à la mort de la flamme-œil', () => {
    const thread = [viewOnceReply(expiredQuote(flameEye({ isViewOnce: true }), T0))];

    expect(living(thread, T0 + DESTRUCTION_MS)).toEqual([]);
  });

  test('une vue unique qui cite un message vivant reste', () => {
    const thread = [viewOnceReply(flameEye())];

    expect(living(thread, T0 + 10 * MINUTE)).toEqual(['m-reply']);
  });

  test('`message:expired` de la cascade serveur la RETIRE au lieu de la sceller « déjà ouverte »', () => {
    const client = new QueryClient();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([viewOnceReply(flameEye())]));
    const scheduled: (() => void)[] = [];
    const schedule = (fn: () => void): void => {
      scheduled.push(fn);
    };

    applyMessageExpired(client, { messageId: 'm-flamme', conversationId: 'c-a' }, schedule, new Date(T0));
    applyMessageExpired(client, { messageId: 'm-reply', conversationId: 'c-a' }, schedule, new Date(T0));
    for (const fn of scheduled) fn();

    expect(threadOf(client, 'c-a')?.messages.some((m) => m.id === 'm-reply')).toBe(false);
  });
});

describe('le cache persisté ne garde pas la réponse d’un éphémère mort', () => {
  test('la réponse sort du disque avec ce qu’elle cite', () => {
    noteEphemeralReception('m-eph', T0);
    const quoted = ephemeral();
    const client = new QueryClient();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([quoted, replyTo(quoted), localMessage({ id: 'm-autre' })]));
    const state = {
      mutations: [],
      queries: [
        {
          queryKey: messagesQueryKey('c-a'),
          queryHash: 'h',
          state: { data: client.getQueryData(messagesQueryKey('c-a')) },
        },
      ],
    } as unknown as Parameters<typeof pruneGoneEphemerals>[0];

    const pruned = pruneGoneEphemerals(state, T0 + MINUTE + DESTRUCTION_MS);

    const data = pruned.queries[0]?.state.data as ReturnType<typeof threadPages>;
    expect(data.pages.flatMap((page) => page.messages.map((m) => m.id))).toEqual(['m-autre']);
  });
});

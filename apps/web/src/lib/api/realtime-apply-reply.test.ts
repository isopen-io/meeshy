import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';

import { mergeTimeline } from '@/lib/grouping';
import { createOutboxStore, entriesOf } from '@/lib/send/outbox-store';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { decodeMessages } from './decode';
import { messagesQueryKey } from './messages';
import { applyMessageNew } from './realtime-apply';
import type { Message } from './types';

/**
 * **UNE RÉPONSE REÇUE EN DIRECT S'AFFICHE COMME UNE RÉPONSE (#7996).**
 *
 * La passerelle sert la citation sur `message:new` (`replyTo`, les deux
 * producteurs : `MessageHandler._buildMessagePayload` et
 * `MeeshySocketIOManager`, via `buildMessageNewPayload`). `rawMessageFromSocket`
 * ÉNUMÈRE les clés qu'il recopie et `replyTo` n'y figurait pas : la bulle
 * temps réel d'une réponse arrivait SANS sa citation — et, pour l'expéditeur,
 * l'écho de son propre envoi REMPLAÇAIT la rangée optimiste (qui, elle,
 * portait la citation) par une rangée amputée. La réponse ne redevenait une
 * réponse qu'au rechargement (`GET …/messages` sert `replyTo`).
 */
const QUOTED = {
  id: 'm-cite',
  conversationId: 'c-a',
  senderId: 'p-amina',
  content: 'Je pousse la mesure ce soir.',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: '2026-09-26T08:00:00.000Z',
  sender: { id: 'p-amina', displayName: 'Amina Diallo', userId: 'u-amina' },
} as const;

const replyEcho = (partial: Partial<SocketIOMessage> = {}): SocketIOMessage =>
  ({
    id: 'm-reponse',
    conversationId: 'c-a',
    senderId: 'u-viewer',
    content: 'Parfait, merci',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: '2026-09-26T08:05:00.000Z',
    replyToId: 'm-cite',
    replyTo: QUOTED,
    ...partial,
  }) as unknown as SocketIOMessage;

const rendered = (client: QueryClient, outbox: ReturnType<typeof createOutboxStore>): readonly Message[] =>
  mergeTimeline(
    decodeMessages(threadOf(client, 'c-a')?.messages ?? []),
    entriesOf(outbox.getState(), 'c-a').map((e) => e.message),
  );

describe('applyMessageNew — la citation d’une réponse voyage avec elle (#7996)', () => {
  test('la réponse d’un pair arrive AVEC sa citation, sans rechargement', () => {
    const client = new QueryClient();
    const outbox = createOutboxStore();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([]));

    applyMessageNew(client, outbox, replyEcho({ senderId: 'p-kwame' }));

    const row = rendered(client, outbox).find((m) => m.id === 'm-reponse');
    expect(row?.replyTo?.id).toBe('m-cite');
    expect(row?.replyTo?.content).toBe('Je pousse la mesure ce soir.');
    expect(row?.replyTo?.sender?.displayName).toBe('Amina Diallo');
  });

  test('l’écho de MA réponse promeut la rangée optimiste SANS lui retirer sa citation', () => {
    const client = new QueryClient();
    const outbox = createOutboxStore();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([]));
    const quoted = localMessage({ id: 'm-cite', senderId: 'p-amina', content: 'Je pousse la mesure ce soir.' });
    const optimistic = localMessage({
      id: 'cid-7996',
      clientMessageId: 'cid-7996',
      content: 'Parfait, merci',
      replyToId: 'm-cite',
      replyTo: quoted,
    } as Message & { clientMessageId: string });
    outbox.getState().enqueue('c-a', { message: optimistic as never, delivery: 'pending', attempts: 1, startedAt: 0 });
    expect(rendered(client, outbox)[0]?.replyTo?.id).toBe('m-cite');

    applyMessageNew(client, outbox, replyEcho({ clientMessageId: 'cid-7996' }));

    const rows = rendered(client, outbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('m-reponse');
    expect(rows[0]?.replyTo?.id).toBe('m-cite');
  });

  test('un écho arrivé APRÈS l’accusé REST ne retire pas la citation déjà confirmée', () => {
    const client = new QueryClient();
    const outbox = createOutboxStore();
    const quoted = localMessage({ id: 'm-cite', senderId: 'p-amina', content: 'Je pousse la mesure ce soir.' });
    const confirmed = localMessage({
      id: 'm-reponse',
      clientMessageId: 'cid-7996',
      content: 'Parfait, merci',
      replyToId: 'm-cite',
      replyTo: quoted,
    } as Message & { clientMessageId: string });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([confirmed]));

    applyMessageNew(client, outbox, replyEcho({ clientMessageId: 'cid-7996' }));

    const rows = rendered(client, outbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.replyTo?.id).toBe('m-cite');
  });

  test('un message SANS citation ne pose aucune clé `replyTo`', () => {
    const client = new QueryClient();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([]));
    const { replyTo: _r, replyToId: _id, ...plain } = replyEcho() as unknown as Record<string, unknown>;

    applyMessageNew(client, createOutboxStore(), plain as unknown as SocketIOMessage);

    expect(Object.hasOwn(threadOf(client, 'c-a')?.messages[0] ?? {}, 'replyTo')).toBe(false);
  });
});

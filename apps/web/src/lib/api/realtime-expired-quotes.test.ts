import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import { applyMessageExpired } from './realtime-ephemeral';
import type { Message } from './types';

/**
 * `message:expired` (#7960, volet web) — le fil retire la rangée et la liste
 * passe « expiré » (#7454, #7547) ; restaient les CITATIONS : une réponse à un
 * éphémère gardait dans son `replyTo` embarqué le texte du message détruit,
 * lisible dans le cache persisté. Même règle que `message:deleted` (#7926) et
 * que le relais iOS (`markDeleted` fait suivre les citations) : la citation
 * devient une pierre tombale, sur-le-champ.
 */

const NOW = new Date('2026-09-25T10:00:00.000Z');

const ephemeral = (partial: Partial<Message> = {}): Message =>
  localMessage({ id: 'm-eph', senderId: 'u-other', content: 'Code 4521', ephemeralDuration: 30, ...partial });

const reply = (quoted: Message, partial: Partial<Message> = {}): Message =>
  localMessage({ id: 'm-reply', senderId: 'u-viewer', content: 'Reçu', replyToId: quoted.id, replyTo: quoted, ...partial });

const seeded = (messages: readonly Message[], conversationId = 'c-a'): QueryClient => {
  const client = new QueryClient();
  client.setQueryData(messagesQueryKey(conversationId), threadPages(messages));
  return client;
};

const rowOf = (client: QueryClient, id: string, conversationId = 'c-a'): Message | undefined =>
  threadOf(client, conversationId)?.messages.find((m) => m.id === id);

const never = (): void => undefined;

describe('message:expired — les citations du message détruit sont scellées sur-le-champ', () => {
  test('la citation embarquée perd le texte, et porte `deletedAt`', () => {
    const client = seeded([ephemeral(), reply(ephemeral())]);

    applyMessageExpired(client, { messageId: 'm-eph', conversationId: 'c-a' }, never, NOW);

    const quote = rowOf(client, 'm-reply')?.replyTo;
    expect(quote?.content).toBe('');
    expect(quote?.deletedAt).toBeDefined();
    expect(JSON.stringify(rowOf(client, 'm-reply'))).not.toContain('Code 4521');
  });

  test('la citation suit MÊME si le message expiré n’est pas dans la fenêtre chargée', () => {
    const client = seeded([reply(ephemeral())]);

    applyMessageExpired(client, { messageId: 'm-eph', conversationId: 'c-a' }, never, NOW);

    expect(rowOf(client, 'm-reply')?.replyTo?.content).toBe('');
  });

  test('le texte de la RÉPONSE elle-même reste', () => {
    const client = seeded([reply(ephemeral())]);

    applyMessageExpired(client, { messageId: 'm-eph', conversationId: 'c-a' }, never, NOW);

    expect(rowOf(client, 'm-reply')?.content).toBe('Reçu');
  });

  test('une réponse qui cite un AUTRE message ne bouge pas', () => {
    const other = localMessage({ id: 'm-other', senderId: 'u-other', content: 'Salut' });
    const client = seeded([reply(other, { id: 'm-reply-other' })]);
    const before = rowOf(client, 'm-reply-other');

    applyMessageExpired(client, { messageId: 'm-eph', conversationId: 'c-a' }, never, NOW);

    expect(rowOf(client, 'm-reply-other')).toBe(before);
  });

  test('un événement qui nomme une AUTRE conversation ne touche pas ce fil', () => {
    const client = seeded([reply(ephemeral())], 'c-a');

    applyMessageExpired(client, { messageId: 'm-eph', conversationId: 'c-b' }, never, NOW);

    expect(rowOf(client, 'm-reply')?.replyTo?.content).toBe('Code 4521');
  });
});

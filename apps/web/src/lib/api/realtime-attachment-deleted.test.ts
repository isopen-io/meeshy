import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY, findCachedConversation } from './conversations';
import { mediaHubConversationKey } from './media-hub-cache';
import { messagesQueryKey } from './messages';
import { applyAttachmentDeleted, isAttachmentDeletedEvent } from './realtime-attachment-deleted';
import type { Attachment, Conversation, Message } from './types';

/**
 * `attachment:deleted` (#13611) — la passerelle diffuse `{ conversationId,
 * messageId, attachmentId }` à la room de la conversation (#13608). Miroir
 * Android : `AttachmentRemovalDeltas` (#13609).
 */

const NOW = new Date('2026-10-29T10:00:00.000Z');

const piece = (id: string, partial: Partial<Attachment> = {}): Attachment =>
  ({ id, messageId: 'm-1', mimeType: 'image/png', fileUrl: `https://cdn.example/${id}.png`, fileSize: 100, ...partial }) as Attachment;

const event = (partial: Record<string, unknown> = {}): Record<string, unknown> => ({
  conversationId: 'c-a',
  messageId: 'm-1',
  attachmentId: 'a-1',
  ...partial,
});

const listRow = (lastMessage: Message | undefined): Conversation =>
  ({ id: 'c-a', lastMessage, lastMessageAt: lastMessage?.createdAt }) as unknown as Conversation;

const seed = (
  messages: readonly Message[],
  options: { readonly last?: Message; readonly hub?: readonly Message[] } = {},
): QueryClient => {
  const client = new QueryClient();
  client.setQueryData(messagesQueryKey('c-a'), threadPages(messages));
  if (options.last !== undefined) {
    client.setQueryData(CONVERSATIONS_QUERY_KEY, {
      pages: [{ conversations: [listRow(options.last)] }],
      pageParams: [undefined],
    });
  }
  if (options.hub !== undefined) client.setQueryData(mediaHubConversationKey('c-a'), threadPages(options.hub));
  return client;
};

const rowOf = (client: QueryClient): Message | undefined => threadOf(client, 'c-a')?.messages.find((m) => m.id === 'm-1');
const hubOf = (client: QueryClient): readonly Message[] =>
  (client.getQueryData<{ pages: { messages: Message[] }[] }>(mediaHubConversationKey('c-a'))?.pages ?? []).flatMap((p) => p.messages);
const apply = (client: QueryClient, partial: Record<string, unknown> = {}): void =>
  applyAttachmentDeleted(client, event(partial) as never, NOW);

describe('isAttachmentDeletedEvent — garde de forme, fail-closed', () => {
  test('la charge servie passe', () => {
    expect(isAttachmentDeletedEvent(event())).toBe(true);
  });

  test('une charge incomplète ou mal typée est ignorée', () => {
    expect(isAttachmentDeletedEvent(event({ attachmentId: undefined }))).toBe(false);
    expect(isAttachmentDeletedEvent(event({ messageId: 7 }))).toBe(false);
    expect(isAttachmentDeletedEvent(event({ conversationId: '' }))).toBe(false);
    expect(isAttachmentDeletedEvent(null)).toBe(false);
    expect(isAttachmentDeletedEvent('attachment:deleted')).toBe(false);
  });
});

describe('applyAttachmentDeleted — le fil', () => {
  test('la pièce nommée quitte le message ; sa voisine et le texte restent', () => {
    const neighbour = piece('a-2');
    const client = seed([localMessage({ id: 'm-1', content: 'regarde', attachments: [piece('a-1'), neighbour] })]);
    apply(client);
    const row = rowOf(client);
    expect(row?.attachments?.map((a) => a.id)).toEqual(['a-2']);
    expect(row?.attachments?.[0]).toEqual(neighbour);
    expect(row?.content).toBe('regarde');
    expect(row?.deletedAt).toBeUndefined();
  });

  test('sans texte ni autre pièce, le message devient une pierre tombale, comme sa suppression', () => {
    const client = seed([localMessage({ id: 'm-1', content: '  ', attachments: [piece('a-1')] })]);
    apply(client);
    const row = rowOf(client);
    expect(row?.attachments).toBeUndefined();
    expect(row?.content).toBe('');
    expect(String(row?.deletedAt)).toBe(NOW.toISOString());
  });

  test('un message à texte garde sa bulle quand sa seule pièce part', () => {
    const client = seed([localMessage({ id: 'm-1', content: 'salut', attachments: [piece('a-1')] })]);
    apply(client);
    expect(rowOf(client)?.attachments).toEqual([]);
    expect(rowOf(client)?.deletedAt).toBeUndefined();
  });

  test('idempotent : rejoué, l’événement ne change rien (même référence)', () => {
    const client = seed([localMessage({ id: 'm-1', content: 'x', attachments: [piece('a-1'), piece('a-2')] })]);
    apply(client);
    const after = threadOf(client, 'c-a')?.messages[0];
    apply(client);
    expect(threadOf(client, 'c-a')?.messages[0]).toBe(after);
  });

  test('pierre tombale rejouée : rien ne bouge', () => {
    const client = seed([localMessage({ id: 'm-1', content: '', attachments: [piece('a-1')] })]);
    apply(client);
    const after = rowOf(client);
    apply(client);
    expect(rowOf(client)).toBe(after);
  });

  test('un message d’une AUTRE conversation que celle annoncée n’est pas touché', () => {
    const foreign = localMessage({ id: 'm-1', conversationId: 'c-b', content: '', attachments: [piece('a-1')] });
    const client = seed([foreign]);
    apply(client);
    expect(rowOf(client)).toBe(foreign);
  });

  test('message, pièce ou fil inconnus : aucun effet, aucune création', () => {
    const client = seed([localMessage({ id: 'm-1', content: 'x', attachments: [piece('a-2')] })]);
    const before = threadOf(client, 'c-a')?.messages[0];
    apply(client, { attachmentId: 'a-9' });
    apply(client, { messageId: 'm-9' });
    expect(threadOf(client, 'c-a')?.messages[0]).toBe(before);
    const empty = new QueryClient();
    apply(empty);
    expect(threadOf(empty, 'c-a')).toBeUndefined();
  });

  test('les citations du message devenu pierre tombale le deviennent aussi', () => {
    const quoted = localMessage({ id: 'm-1', content: '', attachments: [piece('a-1')] });
    const reply = localMessage({ id: 'm-2', content: 'ok', replyTo: quoted });
    const client = seed([quoted, reply]);
    apply(client);
    const quote = threadOf(client, 'c-a')?.messages.find((m) => m.id === 'm-2')?.replyTo;
    expect(String(quote?.deletedAt)).toBe(NOW.toISOString());
  });
});

describe('applyAttachmentDeleted — l’écran des médias', () => {
  test('la pièce quitte la rangée du hub ; la rangée vidée le quitte', () => {
    const both = localMessage({ id: 'm-1', content: '', attachments: [piece('a-1'), piece('a-2')] });
    const other = localMessage({ id: 'm-2', content: '', attachments: [piece('a-3')] });
    const client = seed([both], { hub: [both, other] });
    apply(client);
    expect(hubOf(client).map((m) => [m.id, m.attachments?.map((a) => a.id)])).toEqual([
      ['m-1', ['a-2']],
      ['m-2', ['a-3']],
    ]);
    apply(client, { attachmentId: 'a-2' });
    expect(hubOf(client).map((m) => m.id)).toEqual(['m-2']);
  });

  test('le hub retire la pièce même quand le fil n’est pas chargé', () => {
    const msg = localMessage({ id: 'm-1', content: '', attachments: [piece('a-1')] });
    const client = new QueryClient();
    client.setQueryData(mediaHubConversationKey('c-a'), threadPages([msg]));
    apply(client);
    expect(hubOf(client)).toEqual([]);
  });
});

describe('applyAttachmentDeleted — l’aperçu de la liste', () => {
  const lastOf = (client: QueryClient): Message | undefined | null => findCachedConversation(client, 'c-a')?.lastMessage;

  test('la pièce et son résumé suivent, le texte reste', () => {
    const last = localMessage({
      id: 'm-1',
      content: 'regarde',
      attachments: [piece('a-1'), piece('a-2', { mimeType: 'video/mp4', fileSize: 50 })],
      attachmentSummary: { count: 2, kinds: { image: 1, video: 1 }, totalSize: 150 },
    } as never);
    const client = seed([last], { last });
    apply(client);
    const next = lastOf(client) as Message & { attachmentSummary?: unknown };
    expect(next?.attachments?.map((a) => a.id)).toEqual(['a-2']);
    expect(next?.attachmentSummary).toEqual({ count: 1, kinds: { video: 1 }, totalSize: 50 });
    expect(next?.content).toBe('regarde');
  });

  test('message vidé : le message précédent du fil reprend la ligne', () => {
    const previous = localMessage({
      id: 'm-0',
      content: 'avant',
      createdAt: new Date('2026-09-12T08:00:00.000Z'),
    });
    const last = localMessage({ id: 'm-1', content: '', attachments: [piece('a-1')] });
    const client = seed([previous, last], { last });
    apply(client);
    expect(lastOf(client)?.id).toBe('m-0');
    expect(lastOf(client)?.content).toBe('avant');
  });

  test('message vidé sans survivant : la ligne porte la pierre tombale, sans pièce', () => {
    const last = localMessage({ id: 'm-1', content: '', attachments: [piece('a-1')] });
    const client = seed([last], { last });
    apply(client);
    expect(lastOf(client)?.attachments).toBeUndefined();
    expect(String(lastOf(client)?.deletedAt)).toBe(NOW.toISOString());
  });

  test('un message PROTÉGÉ qui reprend la ligne n’y met ni texte ni traduction', () => {
    const secret = localMessage({
      id: 'm-0',
      content: 'secret en clair',
      isViewOnce: true,
      translations: [{ targetLanguage: 'en', translatedContent: 'secret' }] as never,
      createdAt: new Date('2026-09-12T08:00:00.000Z'),
    });
    const last = localMessage({ id: 'm-1', content: '', attachments: [piece('a-1')] });
    const client = seed([secret, last], { last });
    apply(client);
    const row = lastOf(client);
    expect(row?.id).toBe('m-0');
    expect(row?.content).toBe('');
    expect(row?.translations).toEqual([]);
    expect(row?.isViewOnce).toBe(true);
  });

  test('un message chiffré reste sans texte dans la ligne', () => {
    const sealed = localMessage({ id: 'm-0', content: 'cryptogramme', isEncrypted: true, createdAt: new Date('2026-09-12T08:00:00.000Z') });
    const last = localMessage({ id: 'm-1', content: '', attachments: [piece('a-1')] });
    const client = seed([sealed, last], { last });
    apply(client);
    expect(lastOf(client)?.content).toBe('');
  });

  test('ligne PROTÉGÉE dont le fil n’est pas chargé : rien n’est deviné, la liste est relue', () => {
    const last = localMessage({ id: 'm-1', content: '', isBlurred: true });
    const client = seed([], { last });
    client.setQueryData(messagesQueryKey('c-a'), undefined);
    apply(client);
    expect(client.getQueryState(CONVERSATIONS_QUERY_KEY)?.isInvalidated).toBe(true);
    expect(lastOf(client)).toBe(last);
  });

  test('la ligne d’un AUTRE message n’est pas touchée', () => {
    const last = localMessage({ id: 'm-7', content: 'x', attachments: [piece('a-1', { messageId: 'm-7' })] });
    const other = localMessage({ id: 'm-1', content: 'y', attachments: [piece('a-1')] });
    const client = seed([other], { last });
    apply(client);
    expect(lastOf(client)).toBe(last);
  });
});

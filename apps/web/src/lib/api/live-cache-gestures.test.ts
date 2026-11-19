import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { answering, deferred, listPage, openList, openThread, pageOf, refusing, row, seedList, servedRow, settle } from '@/test-support/live-relecture';
import { liveQueryClient } from '@/test-support/live-query-client';
import { localMessage, threadPages } from '@/test-support/thread-cache';

import { performDeparture } from './conversation-departure';
import { findCachedConversation } from './conversations';
import type { ConversationsPage } from './conversations-pages';
import { performDeleteForEveryone, performDeleteForMe } from './delete-message';
import { messagesQueryKey } from './messages';
import type { MessagesPage } from './messages-pages';
import { repaintProfile } from './my-portrait';
import { graftTranscription } from './realtime-transcription-ready';
import type { Attachment, Message, Participant } from './types';

/**
 * **UN GESTE OPTIMISTE N'EST JAMAIS DÉFAIT PAR UNE RELECTURE PARTIE AVANT LUI**
 * (#19082). Le journal des écritures vives (#18914) rejouait les écritures du
 * temps réel ; un geste qui écrivait le cache par un autre chemin — quitter une
 * conversation, repeindre un portrait — était effacé par la réponse d'une
 * relecture en vol, et un geste REFUSÉ restaurait un INSTANTANÉ, qui, rejoué
 * sur une réponse plus fraîche, la faisait reculer.
 *
 * Deux règles, mesurées geste par geste : un geste fait pendant une relecture
 * TIENT à sa réponse ; un geste refusé ne se rejoue plus, et ce qui le défait
 * se calcule SUR la rangée reçue — jamais sur l'instantané pris avant elle.
 */

const FRESH = { '🔥': 4 } as const;

describe('un geste fait pendant une relecture tient à sa réponse', () => {
  test('quitter une conversation : la réponse de la liste, partie avant, ne la ramène pas', async () => {
    const queryClient = liveQueryClient();
    seedList(queryClient, [row(), row({ id: 'c-b' })]);
    const inFlight = deferred<ConversationsPage>();
    const { stop } = openList(queryClient, () => inFlight.promise);

    expect(await performDeparture({ conversationId: 'c-b', kind: 'leave', online: true, deps: { source: 'gateway', transport: answering('POST'), queryClient } })).toBe('departed');
    inFlight.resolve(listPage([row(), row({ id: 'c-b' })]));
    await settle(queryClient);

    expect(findCachedConversation(queryClient, 'c-b')).toBeUndefined();
    expect(findCachedConversation(queryClient, 'c-a')).toBeDefined();
    stop();
  });

  test('mon portrait repeint (user:updated) pendant une relecture de la liste n’est pas défait par sa réponse', async () => {
    const queryClient = liveQueryClient();
    const peer = (avatar: string): Participant => ({ id: 'p-ada', userId: 'u-ada', avatar, displayName: 'Ada' }) as unknown as Participant;
    seedList(queryClient, [row({ participants: [peer('ancienne.webp')] })]);
    const inFlight = deferred<ConversationsPage>();
    const { stop } = openList(queryClient, () => inFlight.promise);

    repaintProfile(queryClient, { userId: 'u-ada', avatar: 'nouvelle.webp' });
    inFlight.resolve(listPage([row({ participants: [peer('ancienne.webp')] })]));
    await settle(queryClient);

    expect(findCachedConversation(queryClient, 'c-a')?.participants.map((p) => p.avatar)).toEqual(['nouvelle.webp']);
    stop();
  });

  test('une suppression pour tous réussie pendant une relecture du fil garde sa pierre tombale', async () => {
    const queryClient = liveQueryClient();
    const victim = localMessage({ id: 'm-1', senderId: 'u-viewer' });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([victim]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);

    await performDeleteForEveryone({ queryClient, conversationId: 'c-a', messages: [victim], transport: answering('DELETE') });
    inFlight.resolve(pageOf([victim]));
    await settle(queryClient);

    expect(servedRow(queryClient, 'm-1')?.deletedAt).toBeDefined();
    stop();
  });
});

describe('un geste refusé pendant une relecture ne fait pas reculer sa réponse', () => {
  test('quitter refusé : la conversation revient telle que la réponse la sert', async () => {
    const queryClient = liveQueryClient();
    seedList(queryClient, [row(), row({ id: 'c-b', title: 'Avant' })]);
    const inFlight = deferred<ConversationsPage>();
    const { stop } = openList(queryClient, () => inFlight.promise);

    expect(await performDeparture({ conversationId: 'c-b', kind: 'leave', online: true, deps: { source: 'gateway', transport: refusing('POST'), queryClient } })).toBe('failed');
    inFlight.resolve(listPage([row(), row({ id: 'c-b', title: 'Renommée ailleurs' })]));
    await settle(queryClient);

    expect(findCachedConversation(queryClient, 'c-b')?.title).toBe('Renommée ailleurs');
    stop();
  });

  test('supprimer pour tous refusé : la rangée est celle que la réponse sert, pas l’instantané', async () => {
    const queryClient = liveQueryClient();
    const before = localMessage({ id: 'm-1', senderId: 'u-viewer', reactionSummary: {} });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([before]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);

    await performDeleteForEveryone({ queryClient, conversationId: 'c-a', messages: [before], transport: refusing('DELETE') });
    inFlight.resolve(pageOf([localMessage({ ...before, reactionSummary: FRESH })]));
    await settle(queryClient);

    const served = servedRow(queryClient, 'm-1');
    expect(served?.deletedAt ?? null).toBeNull();
    expect(served?.reactionSummary).toEqual(FRESH);
    stop();
  });

  test('supprimer pour tous une VUE UNIQUE refusé : la rangée est celle que la réponse sert, pas l’instantané', async () => {
    const queryClient = liveQueryClient();
    const before = localMessage({ id: 'm-vu', senderId: 'u-viewer', isViewOnce: true, content: 'secret', reactionSummary: {} });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([before]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);

    await performDeleteForEveryone({ queryClient, conversationId: 'c-a', messages: [before], transport: refusing('DELETE') });
    inFlight.resolve(pageOf([localMessage({ ...before, viewOnceCount: 1, reactionSummary: FRESH })]));
    await settle(queryClient);

    const served = servedRow(queryClient, 'm-vu');
    expect(served?.content).toBe('secret');
    expect(served?.viewOnceCount).toBe(1);
    expect(served?.reactionSummary).toEqual(FRESH);
    stop();
  });

  test('supprimer pour tous refusé, sans relecture : la vue unique retrouve son contenu, calculé sur la rangée en cache', async () => {
    const queryClient = liveQueryClient();
    const before = localMessage({ id: 'm-vu', senderId: 'u-viewer', isViewOnce: true, content: 'secret' });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([before]));

    await performDeleteForEveryone({ queryClient, conversationId: 'c-a', messages: [before], transport: refusing('DELETE') });

    const restored = servedRow(queryClient, 'm-vu');
    expect(restored?.content).toBe('secret');
    expect(restored?.isFullyConsumed ?? false).toBe(false);
  });

  test('supprimer pour tous le dernier message refusé : la ligne garde ce que la réponse de la liste sert', async () => {
    const queryClient = liveQueryClient();
    const last = localMessage({ id: 'm-1', senderId: 'u-viewer' });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([last]));
    seedList(queryClient, [row({ unreadCount: 2, lastMessage: last })]);
    const inFlight = deferred<ConversationsPage>();
    const { stop } = openList(queryClient, () => inFlight.promise);

    await performDeleteForEveryone({ queryClient, conversationId: 'c-a', messages: [last], transport: refusing('DELETE') });
    inFlight.resolve(listPage([row({ unreadCount: 7, lastMessage: last })]));
    await settle(queryClient);

    const listed = findCachedConversation(queryClient, 'c-a');
    expect(listed?.unreadCount).toBe(7);
    expect(listed?.lastMessage?.id).toBe('m-1');
    expect(listed?.lastMessage?.deletedAt ?? null).toBeNull();
    stop();
  });

  test('supprimer pour moi refusé : la rangée est celle que la réponse sert, pas l’instantané', async () => {
    const queryClient = liveQueryClient();
    const before = localMessage({ id: 'm-1', senderId: 'u-other', reactionSummary: {} });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([before]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);

    await performDeleteForMe({ queryClient, conversationId: 'c-a', messages: [before], transport: refusing('DELETE') });
    inFlight.resolve(pageOf([localMessage({ ...before, reactionSummary: FRESH })]));
    await settle(queryClient);

    expect(servedRow(queryClient, 'm-1')?.reactionSummary).toEqual(FRESH);
    stop();
  });
});

describe('ce qui est rejoué se juge sur la rangée REÇUE', () => {
  test('une transcription greffée pendant une relecture ne se pose pas sur une pièce que la réponse sert voilée', async () => {
    const queryClient = liveQueryClient();
    const piece = { id: 'a-1', mimeType: 'audio/webm', fileUrl: 'a-1.webm' } as unknown as Attachment;
    const vocal = localMessage({ id: 'm-voc', senderId: 'u-other', messageType: 'audio', attachments: [piece] });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([vocal]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);

    graftTranscription(queryClient, { conversationId: 'c-a', messageId: 'm-voc', attachmentId: 'a-1', transcription: { type: 'audio', transcribedText: 'bonjour', language: 'fr', confidence: 1, source: 'whisper' } });
    const veiled: Message = localMessage({ ...vocal, attachments: [{ ...piece, isBlurred: true } as Attachment] });
    inFlight.resolve(pageOf([veiled]));
    await settle(queryClient);

    expect(servedRow(queryClient, 'm-voc')?.attachments?.[0]?.transcription ?? null).toBeNull();
    stop();
  });
});

/**
 * **L'INVENTAIRE TENU** (#19082) — sous la racine `['conversations']`, aucune
 * écriture directe du cache : elles passent toutes par `writeLive` (le
 * doc-comment de `live-cache-journal.ts` les nomme), sans quoi la réponse d'une
 * relecture partie avant elles les effacerait. Une clé de la racine écrite en
 * direct par un module neuf rougit ici, à l'écriture.
 */
const SOURCES = fileURLToPath(new URL('../../', import.meta.url));

const sourcesOf = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test-support' ? [] : sourcesOf(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

const ROOT_WRITE = /set(?:Query|Queries)Data[^(]*\(\s*(?:CONVERSATIONS_QUERY_KEY|conversationQueryKey\(|messagesQueryKey\(|\[\s*'conversations')/;

describe('l’inventaire des écritures de la racine des conversations', () => {
  test('aucune clé de la racine n’est écrite en direct : toutes passent par le journal', () => {
    const direct = sourcesOf(SOURCES)
      .filter((path) => ROOT_WRITE.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SOURCES, path).split('\\').join('/'));

    expect(direct).toEqual([]);
  });
});

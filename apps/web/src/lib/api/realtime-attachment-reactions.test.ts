import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import { applyAttachmentReactionUpdate, isAttachmentReactionUpdate } from './realtime-attachment-reactions';
import type { Attachment, Message } from './types';

/**
 * `attachment:reaction-added` / `attachment:reaction-removed` (#7894) — la
 * passerelle diffuse à la room de la conversation le résumé ABSOLU de la pièce
 * (`AttachmentReactionHandler.ts`, `AttachmentReactionUpdateEventData`). Miroir
 * iOS : `ConversationViewModel.applyAttachmentReactionDelta` REMPLACE
 * `reactionSummary`, sans toucher à `currentUserReactions` (une diffusion n'a
 * pas de lecteur).
 */

const piece = (partial: Partial<Attachment>): Attachment =>
  ({ id: 'a-1', messageId: 'm-1', mimeType: 'image/png', fileUrl: 'https://cdn.example/p.png', ...partial }) as Attachment;

const seeded = (attachments: readonly Attachment[]): QueryClient => {
  const client = new QueryClient();
  const message: Message = localMessage({ id: 'm-1', conversationId: 'c-a', attachments: [...attachments] });
  client.setQueryData(messagesQueryKey('c-a'), threadPages([message]));
  return client;
};

const event = (partial: Record<string, unknown>): Record<string, unknown> => ({
  attachmentId: 'a-1',
  messageId: 'm-1',
  conversationId: 'c-a',
  participantId: 'p-other',
  emoji: '🔥',
  action: 'add',
  reactionSummary: { '🔥': 1 },
  timestamp: '2026-09-25T10:00:00.000Z',
  ...partial,
});

const piecesOf = (client: QueryClient): readonly Attachment[] => threadOf(client, 'c-a')?.messages[0]?.attachments ?? [];

describe('isAttachmentReactionUpdate — garde de forme, fail-closed', () => {
  test('la charge servie passe', () => {
    expect(isAttachmentReactionUpdate(event({}))).toBe(true);
  });

  test('une charge qui ne nomme pas sa pièce, son message ou son résumé est rejetée', () => {
    expect(isAttachmentReactionUpdate(event({ attachmentId: undefined }))).toBe(false);
    expect(isAttachmentReactionUpdate(event({ messageId: 42 }))).toBe(false);
    expect(isAttachmentReactionUpdate(event({ reactionSummary: null }))).toBe(false);
    expect(isAttachmentReactionUpdate(event({ reactionSummary: { '🔥': 'deux' } }))).toBe(false);
    expect(isAttachmentReactionUpdate(null)).toBe(false);
  });
});

describe('applyAttachmentReactionUpdate — le résumé ABSOLU remplace celui de la pièce', () => {
  test('la pièce nommée reçoit le résumé servi ; sa voisine ne bouge pas (même référence)', () => {
    const neighbour = piece({ id: 'a-2' });
    const client = seeded([piece({ reactionSummary: { '😍': 1 } }), neighbour]);
    const payload = event({ reactionSummary: { '😍': 1, '🔥': 2 } });
    if (!isAttachmentReactionUpdate(payload)) throw new Error('charge invalide');

    applyAttachmentReactionUpdate(client, payload);

    const [reacted, quiet] = piecesOf(client);
    expect(reacted?.reactionSummary).toEqual({ '😍': 1, '🔥': 2 });
    expect(quiet).toBe(neighbour);
  });

  test('« ma réaction » n’est pas réécrite par une diffusion', () => {
    const client = seeded([piece({ reactionSummary: { '🔥': 1 }, currentUserReactions: ['🔥'] })]);
    const payload = event({ reactionSummary: { '🔥': 2 } });
    if (!isAttachmentReactionUpdate(payload)) throw new Error('charge invalide');

    applyAttachmentReactionUpdate(client, payload);

    expect(piecesOf(client)[0]?.currentUserReactions).toEqual(['🔥']);
  });

  test('un retrait qui vide le résumé retire la pastille', () => {
    const client = seeded([piece({ reactionSummary: { '🔥': 1 } })]);
    const payload = event({ action: 'remove', reactionSummary: {} });
    if (!isAttachmentReactionUpdate(payload)) throw new Error('charge invalide');

    applyAttachmentReactionUpdate(client, payload);

    expect(piecesOf(client)[0]?.reactionSummary).toEqual({});
  });

  test('pièce inconnue, message inconnu ou fil fermé : rien ne change', () => {
    const client = seeded([piece({})]);
    const before = piecesOf(client);
    for (const partial of [{ attachmentId: 'a-x' }, { messageId: 'm-x' }, { conversationId: 'c-x' }]) {
      const payload = event(partial);
      if (!isAttachmentReactionUpdate(payload)) throw new Error('charge invalide');
      applyAttachmentReactionUpdate(client, payload);
    }
    expect(piecesOf(client)).toBe(before);
  });
});

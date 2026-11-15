import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import type { ApiResult } from '@/lib/api/http';
import type { Conversation } from '@/lib/api/types';
import type { Draft } from '@/lib/send/perform-send';

import { cachedDirectWith, performMoodReply, type MoodReplyPorts } from './reply';

/**
 * **RÉPONDRE À UNE HUMEUR, EN PRIVÉ** (#10813) — la réponse part, CITANT
 * l'humeur (`storyReplyToId`), dans la DERNIÈRE conversation directe avec son
 * auteur, ou dans celle que la passerelle crée (création idempotente d'un
 * direct, `createDirectConversation`). Aucune seconde fonction d'envoi :
 * `performSend` (outbox, bulle optimiste, relance) porte l'envoi.
 */

const participant = (userId: string) => ({ id: `p-${userId}`, userId, isActive: true }) as Conversation['participants'][number];

const direct = (id: string, peer: string, lastMessageAt: string): Conversation =>
  ({
    id,
    type: 'direct',
    participants: [participant('u-me'), participant(peer)],
    lastMessageAt: new Date(lastMessageAt),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date(lastMessageAt),
  }) as unknown as Conversation;

const group = (id: string, members: readonly string[]): Conversation =>
  ({
    id,
    type: 'group',
    participants: members.map(participant),
    lastMessageAt: new Date('2026-10-16T09:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-16T09:00:00.000Z'),
  }) as unknown as Conversation;

const listClient = (conversations: readonly Conversation[]): QueryClient => {
  const client = new QueryClient();
  client.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [{ conversations, pagination: { limit: 30, offset: 0, total: conversations.length, hasMore: false } }],
    pageParams: [undefined],
  });
  return client;
};

type Recorder = { readonly sent: { conversationId: string; draft: Draft }[]; readonly opened: string[] };

const portsOf = (overrides: Partial<MoodReplyPorts> = {}): { ports: MoodReplyPorts; record: Recorder } => {
  const record: Recorder = { sent: [], opened: [] };
  const ports: MoodReplyPorts = {
    online: () => true,
    cachedDirect: () => undefined,
    openDirect: async (userId): Promise<ApiResult<{ readonly id: string }>> => {
      record.opened.push(userId);
      return { ok: true, data: { id: 'c-created' } };
    },
    send: async (params) => {
      record.sent.push(params);
    },
    ...overrides,
  };
  return { ports, record };
};

const mood = { postId: 'st-1', authorId: 'u-nour' } as const;

describe('la conversation où la réponse part', () => {
  test('la DERNIÈRE conversation directe avec l’auteur, jamais un groupe où il siège', () => {
    const client = listClient([
      group('g-1', ['u-me', 'u-nour', 'u-sam']),
      direct('d-old', 'u-nour', '2026-09-01T10:00:00.000Z'),
      direct('d-other', 'u-sam', '2026-10-16T11:00:00.000Z'),
      direct('d-recent', 'u-nour', '2026-10-15T10:00:00.000Z'),
    ]);
    expect(cachedDirectWith(client, 'u-nour')).toBe('d-recent');
  });

  test('aucun direct en cache : rien — la passerelle tranchera', () => {
    expect(cachedDirectWith(listClient([group('g-1', ['u-me', 'u-nour'])]), 'u-nour')).toBeUndefined();
    expect(cachedDirectWith(new QueryClient(), 'u-nour')).toBeUndefined();
  });
});

describe('performMoodReply', () => {
  test('un direct déjà connu reçoit la réponse SANS aller-retour de création, citation comprise', async () => {
    const { ports, record } = portsOf({ cachedDirect: (userId) => (userId === 'u-nour' ? 'd-recent' : undefined) });
    const outcome = await performMoodReply({ mood, text: '  Trop bien !  ', language: 'fr', viewerId: 'u-me', ports });
    expect(outcome).toEqual({ status: 'sent', conversationId: 'd-recent' });
    expect(record.opened).toEqual([]);
    expect(record.sent).toEqual([{ conversationId: 'd-recent', draft: { content: 'Trop bien !', originalLanguage: 'fr', storyReplyToId: 'st-1' } }]);
  });

  test('sans direct connu, la création idempotente le rend, et la réponse y part', async () => {
    const { ports, record } = portsOf();
    const outcome = await performMoodReply({ mood, text: 'Coucou', language: 'en', viewerId: 'u-me', ports });
    expect(record.opened).toEqual(['u-nour']);
    expect(outcome).toEqual({ status: 'sent', conversationId: 'c-created' });
    expect(record.sent[0]?.draft.storyReplyToId).toBe('st-1');
    expect(record.sent[0]?.draft.originalLanguage).toBe('en');
  });

  test('un texte vide ne part pas', async () => {
    const { ports, record } = portsOf();
    expect(await performMoodReply({ mood, text: '   ', language: 'fr', viewerId: 'u-me', ports })).toEqual({ status: 'empty' });
    expect(record.sent).toEqual([]);
  });

  test('ma propre humeur ne se répond pas', async () => {
    const { ports, record } = portsOf();
    expect(await performMoodReply({ mood, text: 'moi', language: 'fr', viewerId: 'u-nour', ports })).toEqual({ status: 'self' });
    expect(record.sent).toEqual([]);
  });

  test('hors ligne, rien ne part et le texte reste à l’appelant', async () => {
    const { ports, record } = portsOf({ online: () => false });
    expect(await performMoodReply({ mood, text: 'Coucou', language: 'fr', viewerId: 'u-me', ports })).toEqual({ status: 'offline' });
    expect(record.opened).toEqual([]);
    expect(record.sent).toEqual([]);
  });

  test('une création refusée est un échec dit, jamais un envoi dans le vide', async () => {
    const { ports, record } = portsOf({ openDirect: async () => ({ ok: false, status: 403, error: 'USER_BLOCKED' }) });
    expect(await performMoodReply({ mood, text: 'Coucou', language: 'fr', viewerId: 'u-me', ports })).toEqual({ status: 'failed' });
    expect(record.sent).toEqual([]);
  });
});

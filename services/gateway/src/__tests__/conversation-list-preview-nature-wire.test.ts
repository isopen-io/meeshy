/**
 * `GET /conversations` SERT la nature du dernier message, sa dernière réaction
 * et l'appel en cours (#7545) — mesuré sur le corps SÉRIALISÉ par le schéma
 * réel, la seule lecture qui voie ce que fast-json-stringify retire.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify from 'fastify';
import { conversationListResponseSchema } from '@meeshy/shared/types/api-schemas';

async function servi(conversation: Record<string, unknown>) {
  const app = Fastify({ logger: false });
  app.get('/conversations', { schema: { response: { 200: conversationListResponseSchema } } }, async () => ({
    success: true,
    data: [{ id: 'c1', type: 'group', createdAt: '2026-09-23T09:00:00.000Z', ...conversation }],
    pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
  }));
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/conversations' });
  await app.close();
  return res.json().data[0];
}

const lastMessage = (surcharge: Record<string, unknown>) => ({
  id: 'm1',
  content: '',
  senderId: 'p1',
  messageType: 'image',
  createdAt: '2026-09-23T10:00:00.000Z',
  ...surcharge,
});

describe('GET /conversations — la nature du dernier message survit au sérialiseur', () => {
  it('première pièce jointe : fileSize et thumbnailUrl, et le résumé de toutes', async () => {
    const conv = await servi({
      lastMessage: lastMessage({
        attachments: [
          { id: 'a1', mimeType: 'image/jpeg', fileSize: 234000, thumbnailUrl: 'https://cdn/a1.jpg', width: 450, height: 456, pageCount: null },
        ],
        attachmentSummary: { count: 3, kinds: { image: 3 }, totalSize: 1400000 },
      }),
    });
    expect(conv.lastMessage.attachments[0]).toMatchObject({ fileSize: 234000, thumbnailUrl: 'https://cdn/a1.jpg', width: 450, height: 456 });
    expect(conv.lastMessage.attachmentSummary).toEqual({ count: 3, kinds: { image: 3 }, totalSize: 1400000 });
  });

  it('appel, événement système, transfert et chiffrement', async () => {
    const conv = await servi({
      lastMessage: lastMessage({
        messageType: 'system',
        isEncrypted: false,
        isForwarded: true,
        callSummary: { callId: 'k1', kind: 'video', outcome: 'missed', durationSec: 0, initiatorId: 'u1', endedByInitiator: false },
        systemEvent: { key: 'system.member-joined', params: { name: 'Bob' } },
      }),
    });
    expect(conv.lastMessage.callSummary).toEqual({ callId: 'k1', kind: 'video', outcome: 'missed', durationSec: 0, initiatorId: 'u1', endedByInitiator: false });
    expect(conv.lastMessage.systemEvent).toEqual({ key: 'system.member-joined', params: { name: 'Bob' } });
    expect(conv.lastMessage.isForwarded).toBe(true);
    expect(conv.lastMessage.isEncrypted).toBe(false);
  });

  it('dernière réaction et appel en cours, au niveau de la conversation', async () => {
    const lastReaction = {
      emoji: '❤️',
      reactorId: 'p2',
      reactorUserId: 'u2',
      reactorName: 'Alice',
      messageId: 'm1',
      targetSenderId: 'p1',
      targetSenderUserId: 'u1',
      excerpt: 'Bonjour',
      excerptOriginalLanguage: 'fr',
      excerptTranslations: { en: 'Hello' },
      excerptProtection: null,
      createdAt: '2026-09-23T10:05:00.000Z',
    };
    const activeCall = { id: 'call-1', kind: 'audio', participantCount: 3, startedAt: '2026-09-23T10:06:00.000Z' };
    const conv = await servi({ lastMessage: lastMessage({}), lastReaction, activeCall });
    expect(conv.lastReaction).toEqual(lastReaction);
    expect(conv.activeCall).toEqual(activeCall);
  });

  it('null reste null : pas de réaction, pas d’appel', async () => {
    const conv = await servi({ lastMessage: null, lastReaction: null, activeCall: null });
    expect(conv.lastReaction).toBeNull();
    expect(conv.activeCall).toBeNull();
  });
});

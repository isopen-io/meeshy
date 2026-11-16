/**
 * #17441 — on RÉPOND à un appel, à une arrivée ou à un départ annoncé.
 *
 * Trois choses doivent tenir côté passerelle, et chacune a son témoin :
 *  1. la garde d'envoi ADMET un `replyToId` qui vise un avis citable — et
 *     continue de refuser l'avis de capture (#9629) ;
 *  2. la citation SERVIE porte la métadonnée de l'avis (`notice`), seule chose
 *     dont un client a besoin pour le dire dans la langue de SON lecteur — le
 *     `content` stocké n'est qu'un repli français ;
 *  3. le fil REST la DÉCLARE, sans quoi fast-json-stringify la retire en
 *     silence (#4945).
 *
 * @jest-environment node
 */

import { describe, it, expect, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';
import { admitAttachmentReply } from '../../../services/messaging/attachmentReplySnapshot';
import { servedQuotedMessage } from '../../../services/messaging/servedQuotedMessage';

const CONVERSATION = '507f1f77bcf86cd799439aaa';
const CITE = '507f1f77bcf86cd799439000';

const MISSED_CALL = {
  kind: 'call', callId: 'c1', initiatorId: 'u1', callType: 'audio', outcome: 'missed',
  durationSeconds: 0, bytesTotal: null, bytesEstimated: false, networkQuality: null,
};
const JOINED = { kind: 'member-joined', participantId: 'p1', displayName: 'Zoé', isAnonymous: false, viaShareLink: false };
const LEFT = { kind: 'member-left', actor: { participantId: 'p1', displayName: 'Zoé' } };
const ARRIVED = { kind: 'members-arrived', arrivals: [{ participantId: 'p1', displayName: 'Zoé' }], count: 1, windowStartedAt: '2026-11-10T10:00:00.000Z' };
const CAPTURE = { kind: 'content-capture', capturedMessageId: '507f1f77bcf86cd799439001' };

const systemRow = (metadata: Record<string, unknown>) => ({
  id: CITE,
  conversationId: CONVERSATION,
  deletedAt: null,
  messageType: 'system',
  content: 'repli français',
  metadata,
});

const prismaWith = (row: Record<string, unknown>) =>
  ({
    message: { findUnique: async () => row },
    messageAttachment: { findUnique: async () => null },
  }) as never;

describe('#17441 — la garde d’envoi admet la citation d’un avis affiché', () => {
  it.each([
    ['un appel manqué', MISSED_CALL],
    ['une arrivée', JOINED],
    ['des arrivées regroupées', ARRIVED],
    ['un départ annoncé', LEFT],
  ])('%s se cite', async (_label, metadata) => {
    const verdict = await admitAttachmentReply(prismaWith(systemRow(metadata)), { conversationId: CONVERSATION, replyToId: CITE });
    expect(verdict).toEqual({ ok: true, snapshot: null });
  });

  it('un avis de capture reste refusé (#9629)', async () => {
    const verdict = await admitAttachmentReply(prismaWith(systemRow(CAPTURE)), { conversationId: CONVERSATION, replyToId: CITE });
    expect(verdict.ok).toBe(false);
  });
});

describe('#17441 — la citation servie porte la métadonnée de l’avis', () => {
  it.each([
    ['un appel manqué', MISSED_CALL],
    ['une arrivée', JOINED],
    ['des arrivées regroupées', ARRIVED],
    ['un départ annoncé', LEFT],
  ])('%s voyage en `notice`', (_label, metadata) => {
    expect(servedQuotedMessage(systemRow(metadata))['notice']).toEqual(metadata);
  });

  it.each([
    ['un avis de capture', systemRow(CAPTURE)],
    ['un retrait par un tiers', systemRow({ kind: 'member-removed', actor: { participantId: 'a', displayName: 'A' }, target: { participantId: 'b', displayName: 'B' } })],
    ['un message ordinaire', { id: CITE, messageType: 'text', content: 'salut', metadata: { kind: 'call' } }],
  ])('%s ne porte aucun `notice`', (_label, row) => {
    const served = servedQuotedMessage(row);
    expect('notice' in served ? served['notice'] : undefined).toBeUndefined();
  });

  it('un avis SUPPRIMÉ ne dit plus rien de lui, `notice` compris', () => {
    const served = servedQuotedMessage({ ...systemRow(MISSED_CALL), deletedAt: '2026-11-10T10:00:00.000Z' });
    expect('notice' in served).toBe(true);
    expect(served['notice']).toBeUndefined();
  });
});

describe('#17441 — le fil REST déclare `replyTo.notice`', () => {
  const app = Fastify();
  afterAll(async () => {
    await app.close();
  });

  it('fast-json-stringify sert la métadonnée de l’avis cité', async () => {
    const reponse = {
      id: '507f1f77bcf86cd799439a11',
      conversationId: CONVERSATION,
      senderId: '507f1f77bcf86cd799439c02',
      content: 'Je te rappelle',
      originalLanguage: 'fr',
      messageType: 'text',
      createdAt: '2026-11-10T10:05:00.000Z',
      replyToId: CITE,
      replyTo: { id: CITE, content: 'Appel manqué', originalLanguage: 'fr', createdAt: '2026-11-10T10:00:00.000Z', notice: MISSED_CALL },
    };
    app.get('/m', { schema: { response: { 200: messageSchema } } }, async () => reponse);
    await app.ready();
    const servi = (await app.inject({ method: 'GET', url: '/m' })).json() as { replyTo: { notice?: unknown } };
    expect(servi.replyTo.notice).toEqual(MISSED_CALL);
  });
});

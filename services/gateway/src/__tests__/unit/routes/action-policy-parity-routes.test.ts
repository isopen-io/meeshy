/**
 * PARITÉ (#11214) — « Supprimer pour moi » d'un message et « Masquer » d'une
 * conversation : les vecteurs de la loi des actions
 * (`packages/shared/fixtures/action-policy/`) rejoués contre les routes qui font
 * foi. Les deux exigent une participation ACTIVE (`isActive: true`) : une loi
 * qui offre le geste à un lecteur sorti propose ce que la passerelle refuse.
 * Les doubles HONORENT le `where` de la route (`matchesMongoWhere`) : retirer
 * `isActive: true` de la route fait tomber ce témoin.
 *
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, jest } from '@jest/globals';
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';

import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';
import type { ConversationActionInput, ConversationActions } from '@meeshy/shared/utils/conversation-action-policy';
import type { MessageActionInput, MessageActions } from '@meeshy/shared/utils/message-action-policy';

type Vector<I, E> = { readonly _label: string; readonly input: I; readonly expected: E };

const FIXTURES = resolve(__dirname, '../../../../../../packages/shared/fixtures/action-policy');
const vectorsOf = <T>(name: string): readonly T[] => JSON.parse(readFileSync(resolve(FIXTURES, `${name}.vectors.json`), 'utf-8')).vectors;

const messageVectors = vectorsOf<Vector<MessageActionInput, MessageActions>>('message-actions');
const conversationVectors = vectorsOf<Vector<ConversationActionInput, ConversationActions>>('conversation-actions');

const viewerRef: { current: string } = { current: 'user-viewer' };

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = { type: 'registered', userId: viewerRef.current, hasFullAccess: true };
  }),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

import { performConversationDeleteForMe } from '../../../routes/conversations/delete-for-me';
import userDeletionsRoutes from '../../../routes/user-deletions';

const MESSAGE_ID = '65f000000000000000000001';
const CONVERSATION_ID = '65f0000000000000000000c1';

type Viewer = MessageActionInput['viewer'];

const membershipRows = (viewer: Viewer): readonly MongoDocument[] => [
  { id: viewer.participantId ?? 'part-viewer', userId: viewer.id, conversationId: CONVERSATION_ID, isActive: viewer.isActiveMember, role: 'member' },
];

const honouring = (rows: readonly MongoDocument[]) => async (args: { where?: MongoDocument }) =>
  rows.find((row) => matchesMongoWhere(row, args.where)) ?? null;

async function messageDeleteForMeStatus(vector: Vector<MessageActionInput, MessageActions>): Promise<number> {
  const { viewer } = vector.input;
  viewerRef.current = viewer.id;
  const rows = membershipRows(viewer);
  const prisma = {
    message: {
      findUnique: async () => ({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        conversation: { participants: rows.filter((row) => matchesMongoWhere(row, { userId: viewer.id, isActive: true })) },
      }),
    },
    participant: { findFirst: honouring(rows) },
    userMessageDeletion: { upsert: async () => ({}), findUnique: async () => null },
    notification: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    $transaction: async () => undefined,
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  await app.register(userDeletionsRoutes);
  await app.ready();
  const response = await app.inject({ method: 'DELETE', url: `/api/messages/${MESSAGE_ID}/delete-for-me`, headers: { authorization: 'Bearer token' } });
  await app.close();
  return response.statusCode;
}

async function conversationHideRefused(vector: Vector<ConversationActionInput, ConversationActions>): Promise<boolean> {
  const { viewer } = vector.input;
  const rows = membershipRows(viewer);
  const prisma = {
    participant: { findFirst: honouring(rows), update: async () => ({}) },
    conversation: { update: async () => ({ participants: [] }) },
    $transaction: async () => [{ participants: [] }],
  };
  return performConversationDeleteForMe({} as never, prisma as never, { userId: viewer.id, rawConversationId: CONVERSATION_ID }).then(
    () => false,
    (error: Error) => error.name === 'ConversationDeleteForMeNotAParticipantError',
  );
}

jest.spyOn(console, 'warn').mockImplementation(() => undefined);

describe('parité — « Supprimer pour moi » d’un message (DELETE /messages/:id/delete-for-me)', () => {
  it('les vecteurs couvrent un lecteur sorti à qui la loi ne propose pas le geste', () => {
    expect(messageVectors.some((vector) => !vector.input.viewer.isActiveMember && !vector.expected.verdicts.deleteForMe)).toBe(true);
  });

  it.each(messageVectors.map((vector) => [vector._label, vector] as const))('%s', async (_label, vector) => {
    const { viewer } = vector.input;
    const status = await messageDeleteForMeStatus(vector);

    if (vector.expected.verdicts.deleteForMe) expect(status).toBe(200);
    if (!viewer.isActiveMember) expect([status, vector.expected.verdicts.deleteForMe]).toEqual([403, false]);
  });
});

describe('parité — « Masquer » une conversation (performConversationDeleteForMe)', () => {
  it.each(conversationVectors.map((vector) => [vector._label, vector] as const))('%s', async (_label, vector) => {
    const refused = await conversationHideRefused(vector);

    if (vector.expected.hide) expect(refused).toBe(false);
    if (!vector.input.viewer.isActiveMember) expect([refused, vector.expected.hide]).toEqual([true, false]);
  });
});

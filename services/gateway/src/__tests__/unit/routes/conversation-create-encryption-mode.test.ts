/**
 * LE MODE DE CHIFFREMENT SE CHOISIT À LA CRÉATION (directive porteur du 2026-11-01).
 *
 * - Le serveur chiffre toujours au repos : une conversation ne naît JAMAIS sans
 *   mode. Un ancien client qui ne dit rien reçoit `server`.
 * - `server` et `hybrid` se choisissent par tous ; la clé de la conversation
 *   est obtenue AVANT la création, et sans clé maîtresse rien n'est créé.
 * - `e2ee` se choisit par ANALYST et plus, jamais avec `plaintext`, et ne
 *   rouvre que le tête-à-tête chiffré de la paire.
 *
 * Le double évalue les `where` contre des documents en mémoire : c'est la
 * conversation RENDUE, et le `create` ÉCRIT, qui parlent.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { findConversationsIn, type DirectDoc } from '../../helpers/direct-pair-world';
import { ServerAtRestUnavailableError } from '../../../services/messaging/serverAtRest';

const ME = '507f1f77bcf86cd799439001';
const PEER = '507f1f77bcf86cd799439002';
const OTHER = '507f1f77bcf86cd799439003';
const SEALED_DM = '507f1f77bcf86cd7994390e2';
const READABLE_DM = '507f1f77bcf86cd7994390c1';
const SERVER_KEY = 'key-of-the-new-conversation';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

const activationKeyId = jest.fn<(conversationId: string, designated: string | null) => Promise<string>>();
jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({ activationKeyId })),
}));

beforeEach(() => {
  activationKeyId.mockReset();
  activationKeyId.mockImplementation(async () => SERVER_KEY);
});

const member = (userId: string, role = 'member') => ({
  userId,
  role,
  isActive: true,
  user: { id: userId, username: userId.slice(-4), displayName: userId.slice(-4), avatar: null, banner: null },
});

const direct = (id: string, fields: Record<string, unknown>): DirectDoc => ({
  id,
  identifier: `mshy_${id.slice(-4)}`,
  type: 'direct',
  title: null,
  createdAt: new Date('2026-10-01T10:00:00Z'),
  firstMessageSentAt: new Date('2026-10-01T10:05:00Z'),
  lastMessageAt: new Date('2026-10-20T10:00:00Z'),
  participants: [member(ME, 'creator'), member(PEER)],
  ...fields,
});

function world(docs: DirectDoc[]) {
  const directs = findConversationsIn(docs);
  const conversationCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({
    ...args.data,
    createdAt: new Date(),
    participants: [],
  }));
  const conversationUpdateMany = jest.fn(async (args: { where: { id?: string }; data: Record<string, unknown> }) => {
    const doc = docs.find((candidate) => candidate.id === args.where.id);
    if (!doc) return { count: 0 };
    Object.assign(doc, args.data);
    return { count: 1 };
  });
  const prisma = {
    conversation: {
      findFirst: jest.fn(async (args: any) => (args?.where?.identifier !== undefined ? null : directs.findFirst(args))),
      findMany: jest.fn(async (args: any) => directs.findMany(args)),
      findUnique: jest.fn(async (args: any) => directs.findFirst({ where: { id: args?.where?.id } })),
      create: conversationCreate,
      updateMany: conversationUpdateMany,
    },
    user: {
      findMany: jest.fn(async () => [
        { id: ME, displayName: 'Me', username: 'me' },
        { id: PEER, displayName: 'Peer', username: 'peer' },
        { id: OTHER, displayName: 'Other', username: 'other' },
      ]),
      findFirst: jest.fn(async () => null),
    },
    participant: { findFirst: jest.fn(async () => null) },
    userBlock: { findFirst: jest.fn(async () => null) },
    notification: { create: jest.fn(async () => ({})) },
  } as unknown as PrismaClient;
  return { prisma, conversationCreate, conversationUpdateMany };
}

async function buildApp(prisma: PrismaClient, role: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const auth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ME,
      registeredUser: { id: ME, role },
      hasFullAccess: true,
    };
  };
  const { registerCoreRoutes } = await import('../../../routes/conversations/core');
  registerCoreRoutes(app, prisma, auth, auth);
  await app.ready();
  return app;
}

async function create(options: { role?: string; docs?: DirectDoc[]; payload: Record<string, unknown> }) {
  const { prisma, conversationCreate, conversationUpdateMany } = world(options.docs ?? []);
  const app = await buildApp(prisma, options.role ?? 'USER');
  const res = await app.inject({
    method: 'POST',
    url: '/conversations',
    headers: { authorization: 'Bearer x' },
    payload: options.payload,
  });
  await app.close();
  const written = (conversationCreate.mock.calls[0] as [{ data: Record<string, unknown> }] | undefined)?.[0].data;
  return { status: res.statusCode, body: res.json(), written, conversationCreate, conversationUpdateMany };
}

const directTo = (peer: string, extra: Record<string, unknown> = {}) => ({ type: 'direct', participantIds: [peer], ...extra });
const group = (extra: Record<string, unknown> = {}) => ({ type: 'group', title: 'Équipe', participantIds: [PEER, OTHER], ...extra });

describe('une conversation ne naît jamais sans mode : le serveur chiffre toujours au repos', () => {
  it('un ancien client qui ne dit rien crée une conversation `server`, sous la clé obtenue pour SON identifiant', async () => {
    const created = await create({ payload: group() });
    expect(created.status).toBe(201);
    expect(created.written).toMatchObject({
      encryptionMode: 'server',
      encryptionProtocol: 'aes-256-gcm',
      encryptionEnabledBy: ME,
      serverEncryptionKeyId: SERVER_KEY,
      encryptionEpoch: 1,
    });
    expect(created.written?.encryptionEnabledAt).toBeInstanceOf(Date);
    expect(activationKeyId).toHaveBeenCalledWith(created.written?.id, null);
    expect(created.body.data.encryptionMode).toBe('server');
  });

  it('`plaintext: true` crée un tête-à-tête que le serveur lit — chiffré au repos, pas en clair', async () => {
    const created = await create({ payload: directTo(PEER, { plaintext: true }) });
    expect(created.status).toBe(201);
    expect(created.written).toMatchObject({ encryptionMode: 'server', serverEncryptionKeyId: SERVER_KEY });
  });

  it('`hybrid` se choisit par un utilisateur ordinaire', async () => {
    const created = await create({ role: 'USER', payload: group({ encryptionMode: 'hybrid' }) });
    expect(created.status).toBe(201);
    expect(created.written).toMatchObject({ encryptionMode: 'hybrid', encryptionProtocol: 'aes-256-gcm', serverEncryptionKeyId: SERVER_KEY });
  });

  it('sans clé maîtresse, rien n’est créé : 503 SERVER_AT_REST_UNAVAILABLE', async () => {
    activationKeyId.mockImplementation(async () => {
      throw new ServerAtRestUnavailableError('missing');
    });
    const created = await create({ payload: group() });
    expect(created.status).toBe(503);
    expect(created.body.code).toBe('SERVER_AT_REST_UNAVAILABLE');
    expect(created.conversationCreate).not.toHaveBeenCalled();
  });

  it('« sans chiffrement » n’est pas un mode : la demande est refusée', async () => {
    const created = await create({ payload: group({ encryptionMode: 'none' }) });
    expect(created.status).toBe(400);
    expect(created.conversationCreate).not.toHaveBeenCalled();
  });
});

describe('`e2ee` se choisit à la création par ANALYST et plus', () => {
  it.each(['ANALYST', 'ADMIN', 'BIGBOSS'])('%s crée un tête-à-tête chiffré de bout en bout, sans clé serveur', async (role) => {
    const created = await create({ role, payload: directTo(PEER, { encryptionMode: 'e2ee' }) });
    expect(created.status).toBe(201);
    expect(created.written).toMatchObject({ encryptionMode: 'e2ee', encryptionProtocol: 'signal_v3', encryptionEnabledBy: ME });
    expect(created.written).not.toHaveProperty('serverEncryptionKeyId');
    expect(activationKeyId).not.toHaveBeenCalled();
  });

  it('un utilisateur ordinaire est refusé, et rien n’est créé', async () => {
    const created = await create({ role: 'USER', payload: directTo(PEER, { encryptionMode: 'e2ee' }) });
    expect(created.status).toBe(403);
    expect(created.body.code).toBe('ENCRYPTION_ACTIVATION_RESTRICTED');
    expect(created.conversationCreate).not.toHaveBeenCalled();
  });

  it('`e2ee` et `plaintext` ensemble se contredisent : 400', async () => {
    const created = await create({ role: 'ADMIN', payload: directTo(PEER, { encryptionMode: 'e2ee', plaintext: true }) });
    expect(created.status).toBe(400);
    expect(created.body.code).toBe('ENCRYPTION_MODE_CONFLICT');
  });

  it('rouvre le tête-à-tête chiffré de la paire au lieu d’en créer un second', async () => {
    const created = await create({
      role: 'ADMIN',
      docs: [direct(READABLE_DM, { encryptionMode: 'server' }), direct(SEALED_DM, { encryptionMode: 'e2ee' })],
      payload: directTo(PEER, { encryptionMode: 'e2ee' }),
    });
    expect(created.status).toBe(200);
    expect(created.body.data.id).toBe(SEALED_DM);
    expect(created.conversationCreate).not.toHaveBeenCalled();
  });

  it('ne rend jamais le tête-à-tête lisible pour un chiffré : il en crée un à côté', async () => {
    const created = await create({
      role: 'ADMIN',
      docs: [direct(READABLE_DM, { encryptionMode: 'server' })],
      payload: directTo(PEER, { encryptionMode: 'e2ee' }),
    });
    expect(created.status).toBe(201);
    expect(created.written).toMatchObject({ encryptionMode: 'e2ee' });
  });
});

describe('un mode lisible choisi rouvre le tête-à-tête lisible de la paire', () => {
  it('`server` demandé ne rend jamais le chiffré : il rouvre le lisible', async () => {
    const created = await create({
      docs: [direct(READABLE_DM, { encryptionMode: 'server' }), direct(SEALED_DM, { encryptionMode: 'e2ee' })],
      payload: directTo(PEER, { encryptionMode: 'server' }),
    });
    expect(created).toMatchObject({ status: 200 });
    expect(created.body.data.id).toBe(READABLE_DM);
  });

  it('`server` demandé à côté d’un seul chiffré crée le lisible', async () => {
    const created = await create({
      docs: [direct(SEALED_DM, { encryptionMode: 'e2ee' })],
      payload: directTo(PEER, { encryptionMode: 'server' }),
    });
    expect(created.status).toBe(201);
    expect(created.written).toMatchObject({ encryptionMode: 'server' });
  });

  it('sans mode, un ancien client garde la recherche d’avant : le chiffré d’abord', async () => {
    const created = await create({
      docs: [direct(READABLE_DM, { encryptionMode: 'server' }), direct(SEALED_DM, { encryptionMode: 'e2ee' })],
      payload: directTo(PEER),
    });
    expect(created.status).toBe(200);
    expect(created.body.data.id).toBe(SEALED_DM);
  });
});

describe('un tête-à-tête ancien, sans mode, se chiffre au repos quand on le rouvre', () => {
  it.each([
    ['un mode lisible demandé', { encryptionMode: 'server' }],
    ['un ancien client sans mode', {}],
  ])('%s : le tête-à-tête rouvert passe en `server`, sous sa clé, sans second tête-à-tête', async (_label, extra) => {
    const created = await create({
      docs: [direct(READABLE_DM, { encryptionMode: null })],
      payload: directTo(PEER, extra),
    });
    expect(created.status).toBe(200);
    expect(created.body.data.id).toBe(READABLE_DM);
    expect(created.body.data.encryptionMode).toBe('server');
    expect(created.conversationCreate).not.toHaveBeenCalled();
    expect(activationKeyId).toHaveBeenCalledWith(READABLE_DM, null);
    const write = (created.conversationUpdateMany.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)
      .map(([args]) => args.data)
      .find((data) => data.encryptionMode !== undefined);
    expect(write).toMatchObject({ encryptionMode: 'server', serverEncryptionKeyId: SERVER_KEY, encryptionEpoch: 1 });
  });

  it('sans clé maîtresse, le tête-à-tête n’est pas rouvert en clair : 503', async () => {
    activationKeyId.mockImplementation(async () => {
      throw new ServerAtRestUnavailableError('missing');
    });
    const created = await create({ docs: [direct(READABLE_DM, { encryptionMode: null })], payload: directTo(PEER, { encryptionMode: 'server' }) });
    expect(created.status).toBe(503);
  });

  it('un tête-à-tête déjà `server` rouvert ne change pas', async () => {
    const created = await create({ docs: [direct(READABLE_DM, { encryptionMode: 'server' })], payload: directTo(PEER, { encryptionMode: 'hybrid' }) });
    expect(created.status).toBe(200);
    expect(activationKeyId).not.toHaveBeenCalled();
  });
});

describe('le bout en bout ne se choisit à la création que pour un tête-à-tête', () => {
  it('un groupe `e2ee` est refusé : 400 ENCRYPTION_MODE_UNSUPPORTED, rien n’est créé', async () => {
    const created = await create({ role: 'ADMIN', payload: group({ encryptionMode: 'e2ee' }) });
    expect(created.status).toBe(400);
    expect(created.body.code).toBe('ENCRYPTION_MODE_UNSUPPORTED');
    expect(created.conversationCreate).not.toHaveBeenCalled();
  });
});

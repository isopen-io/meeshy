/**
 * UN SECOND TÊTE-À-TÊTE, LISIBLE PAR LE SERVEUR, À CÔTÉ DU CHIFFRÉ (#12966).
 *
 * Décision porteur du 2026-10-25 : une conversation chiffrée de bout en bout ne
 * repasse jamais en clair (#12949) ; pour échanger en clair avec la même
 * personne, un second tête-à-tête existe à côté. Une paire a au plus UN
 * tête-à-tête `e2ee` et au plus UN tête-à-tête que le serveur lit (sans mode,
 * `server` ou `hybrid`).
 *
 * - Sans `plaintext` (tout ancien client, et « ouvrir la conversation avec X ») :
 *   le tête-à-tête CHIFFRÉ s'il existe, sinon le plus récemment actif — le
 *   comportement d'avant tant qu'une paire n'a qu'un régime ; sans aucun, on en
 *   crée un. Jamais une bascule silencieuse vers le clair : écrire dans le fil
 *   lisible n'y attire pas l'autre.
 * - `plaintext: true` : le tête-à-tête lisible existant, ou un nouveau, même si
 *   un `e2ee` existe. Jamais un `e2ee` (ni un mode inconnu) rendu pour lisible.
 *
 * Le double évalue les `where` (relation `participants` comprise) et l'ordre
 * contre des documents en mémoire : c'est la conversation RENDUE qui parle.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { findConversationsIn, type DirectDoc } from '../../helpers/direct-pair-world';

const ME = '507f1f77bcf86cd799439001';
const PEER = '507f1f77bcf86cd799439002';
const THIRD = '507f1f77bcf86cd799439003';
const SEALED_DM = '507f1f77bcf86cd7994390e2';
const READABLE_DM = '507f1f77bcf86cd7994390c1';
const CREATED_DM = '507f1f77bcf86cd7994390aa';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

const member = (userId: string, role = 'member', isActive = true) => ({
  userId,
  role,
  isActive,
  user: { id: userId, username: userId.slice(-4), displayName: userId.slice(-4), avatar: null, banner: null },
});

const direct = (id: string, fields: Record<string, unknown>, members = [member(ME, 'creator'), member(PEER)]): DirectDoc => ({
  id,
  identifier: `mshy_${id.slice(-4)}`,
  type: 'direct',
  title: null,
  createdAt: new Date('2026-10-01T10:00:00Z'),
  firstMessageSentAt: new Date('2026-10-01T10:05:00Z'),
  participants: members,
  ...fields,
});

const EARLIER = new Date('2026-10-20T10:00:00Z');
const LATER = new Date('2026-10-24T10:00:00Z');

function world(docs: DirectDoc[]) {
  const directs = findConversationsIn(docs);
  const conversationCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({
    id: CREATED_DM,
    identifier: 'mshy_new',
    type: args.data.type,
    title: null,
    createdAt: new Date(),
    participants: [],
  }));
  const prisma = {
    conversation: {
      findFirst: jest.fn(async (args: any) => (args?.where?.identifier !== undefined ? null : directs.findFirst(args))),
      findMany: jest.fn(async (args: any) => directs.findMany(args)),
      findUnique: jest.fn(async (args: any) => directs.findFirst({ where: { id: args?.where?.id } })),
      create: conversationCreate,
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    user: {
      findMany: jest.fn(async () => [
        { id: ME, displayName: 'Me', username: 'me' },
        { id: PEER, displayName: 'Peer', username: 'peer' },
      ]),
      findFirst: jest.fn(async () => null),
    },
    participant: { findFirst: jest.fn(async () => null) },
    userBlock: { findFirst: jest.fn(async () => null) },
    notification: { create: jest.fn(async () => ({})) },
  } as unknown as PrismaClient;
  return { prisma, conversationCreate };
}

async function buildApp(prisma: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const auth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ME,
      registeredUser: { id: ME },
      hasFullAccess: true,
    };
  };
  const { registerCoreRoutes } = await import('../../../routes/conversations/core');
  registerCoreRoutes(app, prisma, auth, auth);
  await app.ready();
  return app;
}

async function openDirect(docs: DirectDoc[], extra: Record<string, unknown> = {}) {
  const { prisma, conversationCreate } = world(docs);
  const app = await buildApp(prisma);
  const res = await app.inject({
    method: 'POST',
    url: '/conversations',
    headers: { authorization: 'Bearer x' },
    payload: { type: 'direct', participantIds: [PEER], ...extra },
  });
  await app.close();
  return { status: res.statusCode, id: res.json()?.data?.id as string | undefined, conversationCreate };
}

describe('sans précision, on rouvre le tête-à-tête chiffré s’il existe, sinon le plus récemment actif (#12966)', () => {
  it('le chiffré, quand c’est lui qui a vécu le plus récemment', async () => {
    const opened = await openDirect([
      direct(READABLE_DM, { lastMessageAt: EARLIER }),
      direct(SEALED_DM, { encryptionMode: 'e2ee', lastMessageAt: LATER }),
    ]);
    expect(opened).toMatchObject({ status: 200, id: SEALED_DM });
    expect(opened.conversationCreate).not.toHaveBeenCalled();
  });

  it('le chiffré encore, quand le lisible a vécu plus récemment : y écrire n’y attire pas l’autre', async () => {
    const opened = await openDirect([
      direct(READABLE_DM, { lastMessageAt: LATER }),
      direct(SEALED_DM, { encryptionMode: 'e2ee', lastMessageAt: EARLIER }),
    ]);
    expect(opened).toMatchObject({ status: 200, id: SEALED_DM });
  });

  it('sans chiffré, le plus récemment actif des doublons historiques lisibles, comme avant', async () => {
    const opened = await openDirect([
      direct(READABLE_DM, { lastMessageAt: EARLIER }),
      direct(CREATED_DM, { lastMessageAt: LATER }),
    ]);
    expect(opened).toMatchObject({ status: 200, id: CREATED_DM });
    expect(opened.conversationCreate).not.toHaveBeenCalled();
  });

  it('un mode inconnu ne se rouvre jamais pour lisible par défaut : il passe avant le lisible', async () => {
    const opened = await openDirect([
      direct(READABLE_DM, { lastMessageAt: LATER }),
      direct(SEALED_DM, { encryptionMode: 'quantum', lastMessageAt: EARLIER }),
    ]);
    expect(opened).toMatchObject({ status: 200, id: SEALED_DM });
  });

  it('un ancien client dont le seul tête-à-tête est chiffré le retrouve, sans qu’un second soit créé', async () => {
    const opened = await openDirect([direct(SEALED_DM, { encryptionMode: 'e2ee', lastMessageAt: LATER })]);
    expect(opened).toMatchObject({ status: 200, id: SEALED_DM });
    expect(opened.conversationCreate).not.toHaveBeenCalled();
  });

  it('`plaintext: false` vaut l’absence', async () => {
    const opened = await openDirect([direct(SEALED_DM, { encryptionMode: 'e2ee', lastMessageAt: LATER })], { plaintext: false });
    expect(opened).toMatchObject({ status: 200, id: SEALED_DM });
  });
});

describe('`plaintext: true` rend ou crée le tête-à-tête que le serveur lit (#12966)', () => {
  it('crée un tête-à-tête sans chiffrement quand le seul existant est chiffré de bout en bout', async () => {
    const opened = await openDirect([direct(SEALED_DM, { encryptionMode: 'e2ee', lastMessageAt: LATER })], { plaintext: true });
    expect(opened).toMatchObject({ status: 201, id: CREATED_DM });
    expect(opened.conversationCreate).toHaveBeenCalledTimes(1);
    const data = (opened.conversationCreate.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    expect(data.type).toBe('direct');
    expect(data).not.toHaveProperty('encryptionMode');
    expect(data).not.toHaveProperty('encryptionEnabledAt');
  });

  it('rend le lisible existant, même moins récent que le chiffré : jamais un second lisible', async () => {
    const opened = await openDirect(
      [
        direct(SEALED_DM, { encryptionMode: 'e2ee', lastMessageAt: LATER }),
        direct(READABLE_DM, { lastMessageAt: EARLIER }),
      ],
      { plaintext: true },
    );
    expect(opened).toMatchObject({ status: 200, id: READABLE_DM });
    expect(opened.conversationCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['chiffré au repos par le serveur', { encryptionMode: 'server' }],
    ['hybride', { encryptionMode: 'hybrid' }],
    ['désactivé (mode nul)', { encryptionMode: null }],
  ])('un tête-à-tête %s compte pour le lisible', async (_label, fields) => {
    const opened = await openDirect(
      [direct(SEALED_DM, { encryptionMode: 'e2ee', lastMessageAt: LATER }), direct(READABLE_DM, { ...fields, lastMessageAt: EARLIER })],
      { plaintext: true },
    );
    expect(opened).toMatchObject({ status: 200, id: READABLE_DM });
  });

  it.each([
    ['de bout en bout écrit en capitales', 'E2EE'],
    ['d’un mode inconnu', 'quantum'],
  ])('un tête-à-tête %s n’est jamais rendu pour lisible : on en crée un', async (_label, mode) => {
    const opened = await openDirect([direct(SEALED_DM, { encryptionMode: mode, lastMessageAt: LATER })], { plaintext: true });
    expect(opened).toMatchObject({ status: 201, id: CREATED_DM });
  });

  it('un tête-à-tête que le pair a quitté ne compte pas', async () => {
    const opened = await openDirect([direct(READABLE_DM, { lastMessageAt: LATER }, [member(ME, 'creator'), member(PEER, 'member', false)])], {
      plaintext: true,
    });
    expect(opened).toMatchObject({ status: 201, id: CREATED_DM });
  });

  it('le tête-à-tête lisible d’une AUTRE paire n’est jamais rendu', async () => {
    const opened = await openDirect([direct(READABLE_DM, { lastMessageAt: LATER }, [member(ME, 'creator'), member(THIRD)])], { plaintext: true });
    expect(opened).toMatchObject({ status: 201, id: CREATED_DM });
  });
});

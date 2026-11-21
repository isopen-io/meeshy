/**
 * #20063 — une communauté nommée AVANT #16786 se lit telle qu'écrite, sur les trois clients.
 *
 * Avant #16786, le nom et la description passaient par la sérialisation HTML de DOMPurify : une entrée qui
 * portait un `<` était stockée échappée (« Tom & Jerry <3 » ⇒ « Tom &amp; Jerry &lt;3 »). Les écritures depuis
 * sont telles qu'écrites, mais les lignes anciennes gardent leurs entités. Le web décodait à la lecture ; iOS et
 * Android affichaient `&amp;`, et le formulaire de réglages iOS renvoyait le texte abîmé à l'enregistrement.
 *
 * La passerelle sert désormais le texte tel qu'écrit à la LECTURE, sur toutes les portes qu'un client lit
 * (liste, détail, création, réglages, recherche, « mes communautés », `community:updated`) : un seul correctif,
 * qui vaut aussi pour les applications déjà installées, sans migration de données.
 *
 * Les témoins traversent le VRAI sérialiseur de réponse (`app.inject`), jamais une copie du handler.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

import { communityRoutes } from '../../../../routes/communities/index';
import { broadcastCommunityUpdated } from '../../../../services/community-updated-broadcast';
import type { CommunityUpdatedEventData } from '@meeshy/shared/types/socketio-events';

const VIEWER = '507f1f77bcf86cd799439011';
const COMMUNITY = '507f1f77bcf86cd799439021';

const LEGACY_NAME = 'Tom &amp; Jerry &lt;3';
const LEGACY_DESCRIPTION = '3 &gt; 2 &amp; &quot;guillemets&quot; &#39;simples&#39;';
const AS_WRITTEN_NAME = 'Tom & Jerry <3';
const AS_WRITTEN_DESCRIPTION = '3 > 2 & "guillemets" \'simples\'';

const legacyRow = (overrides: Record<string, unknown> = {}) => ({
  id: COMMUNITY,
  identifier: 'mshy_tom',
  name: LEGACY_NAME,
  description: LEGACY_DESCRIPTION,
  avatar: null,
  banner: null,
  isPrivate: false,
  isActive: true,
  requiresJoinApproval: false,
  createdBy: VIEWER,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  creator: { id: VIEWER, username: 'alice', displayName: 'Alice', avatar: null },
  members: [{ role: 'admin' }],
  _count: { members: 1, Conversation: 0 },
  ...overrides,
});

const fakePrisma = (row = legacyRow()) => ({
  community: {
    findMany: jest.fn(async () => [row]),
    count: jest.fn(async () => 1),
    findFirst: jest.fn(async () => row),
  },
  communityMember: {
    findMany: jest.fn(async () => [{ role: 'admin', community: { id: row.id, name: row.name, identifier: row.identifier, avatar: null, isPrivate: false } }]),
    count: jest.fn(async () => 0),
  },
  communityJoinRequest: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
  friendRequest: { findMany: jest.fn(async () => []) },
  user: { findMany: jest.fn(async () => []) },
  userPreferences: { findMany: jest.fn(async () => []) },
  conversation: {},
});

const served = async (url: string, prisma = fakePrisma()) => {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as { authContext: unknown }).authContext = {
      isAuthenticated: true,
      userId: VIEWER,
      registeredUser: { id: VIEWER, role: 'USER' },
    };
  });
  await app.register(communityRoutes);
  await app.ready();
  const response = await app.inject({ method: 'GET', url });
  await app.close();
  return { status: response.statusCode, body: response.json() as { data: unknown } };
};

const firstOf = (data: unknown) => (Array.isArray(data) ? data[0] : data) as { name?: string; description?: string | null };

describe('#20063 — une communauté nommée avant #16786 se lit telle qu’écrite', () => {
  it('la liste sert le nom et la description tels qu’écrits', async () => {
    const { status, body } = await served('/communities');
    expect(status).toBe(200);
    expect(firstOf(body.data)).toMatchObject({ name: AS_WRITTEN_NAME, description: AS_WRITTEN_DESCRIPTION });
  });

  it('le détail sert le nom et la description tels qu’écrits', async () => {
    const { status, body } = await served(`/communities/${COMMUNITY}`);
    expect(status).toBe(200);
    expect(firstOf(body.data)).toMatchObject({ name: AS_WRITTEN_NAME, description: AS_WRITTEN_DESCRIPTION });
  });

  it('la recherche sert le nom et la description tels qu’écrits', async () => {
    const { status, body } = await served('/communities/search?q=tom');
    expect(status).toBe(200);
    expect(firstOf(body.data)).toMatchObject({ name: AS_WRITTEN_NAME, description: AS_WRITTEN_DESCRIPTION });
  });

  it('« mes communautés » sert le nom tel qu’écrit', async () => {
    const { status, body } = await served('/communities/mine');
    expect(status).toBe(200);
    expect(firstOf(body.data)).toMatchObject({ name: AS_WRITTEN_NAME });
  });

  it('une seule passe : « &amp;lt; » se lit « &lt; », jamais « < »', async () => {
    const { body } = await served('/communities', fakePrisma(legacyRow({ name: 'A &amp;lt; B' })));
    expect(firstOf(body.data).name).toBe('A &lt; B');
  });

  it('un texte sans entité et une description absente sortent inchangés', async () => {
    const { body } = await served('/communities', fakePrisma(legacyRow({ name: 'Club 3 > 2', description: null })));
    expect(firstOf(body.data)).toMatchObject({ name: 'Club 3 > 2', description: null });
  });

  it('`community:updated` porte le nom et la description tels qu’écrits', async () => {
    const delivered: CommunityUpdatedEventData[] = [];
    const prisma = {
      community: { findFirst: jest.fn(async () => legacyRow()) },
      communityMember: { findMany: jest.fn(async () => [{ userId: VIEWER }]) },
    };
    await broadcastCommunityUpdated(
      { prisma: prisma as never, deliver: (_userId, payload) => delivered.push(payload) },
      { communityId: COMMUNITY },
    );
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ name: AS_WRITTEN_NAME, description: AS_WRITTEN_DESCRIPTION });
  });
});

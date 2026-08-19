/**
 * `GET /conversations/search` charge les participants (`include` de
 * `search.ts:142-157`) mais, avant ce correctif, ne les recopie pas dans
 * l'objet retourné (`search.ts:286-316`) : une conversation DIRECTE trouvée
 * par la recherche arrivait alors sans titre (forcé à `null` pour les
 * directs) ET sans personne — illisible à l'écran et non déduplicable côté
 * client (spec 2026-08-19, chantier forward-reach, tâche 4).
 *
 * Ce test traverse le VRAI schéma de réponse partagé — `registerSearchRoutes`
 * l'installe lui-même sur la route (`conversationMinimalSchema`, importé
 * réellement, jamais recopié ici) — pour que fast-json-stringify puisse
 * réellement supprimer `participants` s'il n'est pas déclaré, exactement
 * comme en production.
 *
 * @jest-environment node
 */
import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, jest, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn() }) },
}));

import { registerSearchRoutes } from '../../../routes/conversations/search';

const USER_ID = '507f1f77bcf86cd799439011';

const MOCK_DIRECT_CONVERSATION = {
  id: 'c1',
  identifier: 'mshy_direct-a-b',
  title: null,
  type: 'direct',
  avatar: null,
  banner: null,
  isActive: true,
  communityId: null,
  lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  _count: { participants: 2 },
  participants: [
    { id: 'p1', userId: 'u1', displayName: 'Alice', user: { id: 'u1', username: 'alice', displayName: 'Alice' } },
    { id: 'p2', userId: USER_ID, displayName: 'Moi', user: { id: USER_ID, username: 'me', displayName: 'Moi' } },
  ],
  messages: [],
};

function makePrisma() {
  return {
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: { findMany: jest.fn<any>().mockResolvedValue([MOCK_DIRECT_CONVERSATION]) },
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const requiredAuth = async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  };
  registerSearchRoutes(app, makePrisma() as any, requiredAuth);
  await app.ready();
  return app;
}

describe('GET /conversations/search — participants d’une conversation directe', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it('émet les participants (au plus 5, déjà chargés par le include) au lieu de les taire', async () => {
    app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=ali' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data[0].participants).toHaveLength(2);
    expect(body.data[0].participants[0]).toEqual({
      id: 'p1',
      userId: 'u1',
      displayName: 'Alice',
      user: { id: 'u1', username: 'alice', displayName: 'Alice' },
    });
  });
});

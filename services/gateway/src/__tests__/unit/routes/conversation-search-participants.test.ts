/**
 * `GET /conversations/search` charge les participants (`include` de
 * `search.ts:142-157`) mais, avant ce correctif, ne les recopie pas dans
 * l'objet retourné (`search.ts:286-316`) : une conversation DIRECTE trouvée
 * par la recherche arrivait alors sans titre (forcé à `null` pour les
 * directs) ET sans personne — illisible à l'écran et non déduplicable côté
 * client (spec 2026-08-19, chantier forward-reach, tâche 4).
 *
 * DÉCISION DU USER (2026-08-19) : les participants ne sortent QUE pour les
 * conversations dont l'appelant est MEMBRE. La route retourne aussi les salons
 * `public`/`global` dont il ne l'est pas (elle sert la recherche globale) — y
 * émettre jusqu'à cinq identités est une exposition refusée. Le drapeau
 * `isMember`, calculé pour la page en UNE requête, remplace l'heuristique
 * client : le tableau `participants` étant tronqué à cinq, un membre d'un salon
 * public de plus de cinq personnes n'y figure pas et son propre salon
 * disparaissait de sa recherche.
 *
 * Ce test traverse le VRAI schéma de réponse partagé — `registerSearchRoutes`
 * l'installe lui-même sur la route (`conversationMinimalSchema`, importé
 * réellement, jamais recopié ici) — pour que fast-json-stringify puisse
 * réellement supprimer `participants` ou `isMember` s'ils ne sont pas déclarés,
 * exactement comme en production.
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
const ANON_PARTICIPANT_ID = '507f1f77bcf86cd799439099';

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

/**
 * Un salon `public` que la recherche retourne parce qu'il correspond au texte,
 * SANS que l'appelant en soit membre : les cinq participants chargés par le
 * `include` sont des tiers.
 */
const MOCK_FOREIGN_PUBLIC_CONVERSATION = {
  id: 'c2',
  identifier: 'photo',
  title: 'Photographie',
  type: 'public',
  avatar: null,
  banner: null,
  isActive: true,
  communityId: null,
  lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  _count: { participants: 50 },
  participants: [
    { id: 'p9', userId: 'u9', displayName: 'Autre', user: { id: 'u9', username: 'autre', displayName: 'Autre' } },
  ],
  messages: [],
};

function makePrisma(opts: { conversations?: unknown[]; memberships?: unknown[] } = {}) {
  return {
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue(opts.conversations ?? [MOCK_DIRECT_CONVERSATION]),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue(opts.memberships ?? [{ conversationId: 'c1' }]),
    },
  };
}

/** Les appels de `participant.findMany` qui résolvent l'APPARTENANCE (colonne
 * posée à la racine du `where`), par opposition à celui du service de non-lus
 * (`OR` des deux colonnes). */
function membershipCalls(prisma: ReturnType<typeof makePrisma>): any[] {
  return (prisma.participant.findMany as any).mock.calls
    .map(([args]: any[]) => args)
    .filter((args: any) => args?.where?.userId !== undefined || args?.where?.id !== undefined);
}

async function buildApp(
  prisma: ReturnType<typeof makePrisma>,
  authContext: Record<string, unknown> = { type: 'registered', isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } }
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const requiredAuth = async (req: any) => {
    req.authContext = authContext;
  };
  registerSearchRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}

describe('GET /conversations/search — participants réservés aux membres', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it('émet les participants (au plus 5, déjà chargés par le include) et isMember=true pour une conversation dont on est membre', async () => {
    app = await buildApp(makePrisma());

    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=ali' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data[0].isMember).toBe(true);
    expect(body.data[0].participants).toHaveLength(2);
    expect(body.data[0].participants[0]).toEqual({
      id: 'p1',
      userId: 'u1',
      displayName: 'Alice',
      user: { id: 'u1', username: 'alice', displayName: 'Alice' },
    });
  });

  it("n'émet AUCUN participant et pose isMember=false pour un salon public dont on n'est pas membre", async () => {
    app = await buildApp(
      makePrisma({
        conversations: [MOCK_DIRECT_CONVERSATION, MOCK_FOREIGN_PUBLIC_CONVERSATION],
        memberships: [{ conversationId: 'c1' }],
      })
    );

    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=photo' });
    const body = JSON.parse(res.body);

    const foreign = body.data.find((c: { id: string }) => c.id === 'c2');
    expect(foreign.isMember).toBe(false);
    expect(foreign.participants).toEqual([]);
  });

  it('résout l’appartenance en UNE requête pour la page entière, sur la colonne userId pour un compte', async () => {
    const prisma = makePrisma({
      conversations: [MOCK_DIRECT_CONVERSATION, MOCK_FOREIGN_PUBLIC_CONVERSATION],
      memberships: [{ conversationId: 'c1' }],
    });
    app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: '/conversations/search?q=photo' });

    // `MessageReadStatusService.getUnreadCountsForUser` interroge lui aussi
    // `participant.findMany` (sous un `OR` des deux colonnes) : le discriminant
    // est la colonne posée à la RACINE du `where`, propre à la résolution
    // d'appartenance. Une seule et unique requête, pour toute la page.
    expect(membershipCalls(prisma)).toHaveLength(1);
    expect(membershipCalls(prisma)[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: { in: ['c1', 'c2'] },
          isActive: true,
          userId: USER_ID,
        }),
      })
    );
  });

  /**
   * `authContext.userId` porte un `Participant.id` pour un invité de lien
   * partagé (`middleware/auth.ts`) : chercher sous `userId` ne matcherait RIEN
   * et le priverait de TOUS ses participants, en silence. Même règle que
   * `socketio/utils/participant-resolver.ts`.
   */
  it('branche la requête sur la colonne id pour un invité de lien partagé', async () => {
    const prisma = makePrisma({ memberships: [{ conversationId: 'c1' }] });
    app = await buildApp(prisma, {
      type: 'anonymous',
      isAuthenticated: true,
      userId: ANON_PARTICIPANT_ID,
      participantId: ANON_PARTICIPANT_ID,
    });

    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=ali' });
    const body = JSON.parse(res.body);

    expect(membershipCalls(prisma)).toHaveLength(1);
    expect(membershipCalls(prisma)[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({ id: ANON_PARTICIPANT_ID, isActive: true }),
      })
    );
    expect(body.data[0].isMember).toBe(true);
    expect(body.data[0].participants).toHaveLength(2);
  });
});

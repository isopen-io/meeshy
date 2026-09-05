/**
 * `POST /communities/:id/invite` — le `where: { userId }` imbriqué sous
 * `members` est HONORÉ, pas seulement déclaré (#4867).
 *
 * Extrait de `communities-extended.test.ts` (qui couvre déjà les branches
 * « inviter absent » et « inviter member en communauté privée » avec un
 * double INCONDITIONNEL) pour rester sous le budget de taille de fichier
 * (#4531, 1000 lignes) — l'ajout de ces deux témoins y aurait fait franchir
 * le seuil.
 *
 * Les deux témoins voisins de `communities-extended.test.ts` pré-filtrent la
 * fixture `members` À LA MAIN : un tableau déjà vide, ou déjà réduit à la
 * ligne de l'appelant, reste identique qu'on applique le `where` ou pas — ils
 * ne prouvent donc rien sur le `where: { userId }` imbriqué que
 * `communities/membership.ts:387` applique réellement. Ici le double HONORE
 * ce `where` (`findFirstHonouringWhere`, #4585), et la fixture porte
 * l'INTRUS que la production doit écarter : un AUTRE membre de la
 * communauté, en tête du tableau BRUT. Si le `where` imbriqué disparaissait,
 * `members[0]` deviendrait cet intrus et la route laisserait passer
 * l'invitation.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { findFirstHonouringWhere } from '../../helpers/find-first-honouring-where';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn((offset: any, limit: any) => ({
    offset: Number(offset) || 0,
    limit: Number(limit) || 20,
  })),
}));

// Comme dans `communities-extended.test.ts` : `@meeshy/shared/types/api-schemas`
// n'est PAS mocké — un double de schéma désarmerait fast-json-stringify.
import { communityRoutes } from '../../../routes/communities';

const USER_ID = 'user-ext-001';
const OTHER_USER_ID = 'user-ext-other';
const COMM_ID = '507f1f77bcf86cd799430011';
const INVITEE_ID = '507f1f77bcf86cd799430033';

const baseAuthContext = {
  isAuthenticated: true,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: { id: USER_ID, username: 'alice', displayName: 'Alice', role: 'USER' },
};

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({}),
    },
    user: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: INVITEE_ID }),
    },
    ...overrides,
  } as any;
}

async function buildAuthApp(prisma: ReturnType<typeof makePrisma>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => { req.authContext = baseAuthContext; });
  app.decorate('prisma', prisma);
  await communityRoutes(app);
  await app.ready();
  return app;
}

describe('POST /communities/:id/invite — inviter not a member, proven by mutation on the nested where (#4867)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>(findFirstHonouringWhere([
      {
        id: COMM_ID, isPrivate: false, createdBy: OTHER_USER_ID,
        members: [{ userId: OTHER_USER_ID, role: 'admin' }],
      },
    ]));
    app = await buildAuthApp(prisma);
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 for the caller whose OWN row is absent, despite an unrelated member row existing', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/invite`,
      payload: { userId: INVITEE_ID },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /communities/:id/invite — private community, non-admin inviter, proven by mutation (#4867)', () => {
  // Fixture semée avec un intrus ADMIN d'un AUTRE compte, en tête du tableau
  // brut. Si le `where: { userId }` imbriqué disparaissait, `members[0]`
  // deviendrait cet admin et la route laisserait passer l'invitation.
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>(findFirstHonouringWhere([
      {
        id: COMM_ID, isPrivate: true, createdBy: OTHER_USER_ID,
        members: [
          { userId: OTHER_USER_ID, role: 'admin' },
          { userId: USER_ID, role: 'member' },
        ],
      },
    ]));
    app = await buildAuthApp(prisma);
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 for the caller whose OWN row is member, despite an unrelated admin row existing', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/invite`,
      payload: { userId: INVITEE_ID },
    });
    expect(res.statusCode).toBe(403);
  });
});

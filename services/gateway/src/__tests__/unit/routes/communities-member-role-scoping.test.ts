/**
 * Un rôle de membre ne se change que dans SA propre communauté (#4142).
 *
 * `PATCH /communities/:id/members/:memberId/role` vérifiait que l'appelant est
 * administrateur de la communauté `:id`, puis écrivait
 * `communityMember.update({ where: { id: memberId } })` — sans jamais borner la
 * ligne à cette communauté. `CommunityMember.id` étant global, un administrateur
 * de la communauté A pouvait promouvoir ou rétrograder un membre de la
 * communauté B en connaissant son identifiant de ligne.
 *
 * Pourquoi ces témoins assertent sur la REQUÊTE et non sur la réponse : un
 * double Prisma rend ce qu'on lui dit, quel que soit le `where` reçu. Un témoin
 * qui n'observe que le code de statut passe au vert sur la version vulnérable
 * comme sur la version corrigée — il ne peut pas tomber, donc il n'atteste rien.
 * Le seul observable qui distingue les deux est l'argument passé à `update`.
 *
 * Le second témoin ferme la moitié que le premier ne voit pas : quand la borne
 * ne matche aucune ligne, Prisma lève `P2025`, et la route doit répondre 404 —
 * pas 500, et surtout pas confirmer l'existence de la ligne d'à côté.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => {
  const actual = jest.requireActual('@meeshy/shared/types/api-schemas') as Record<string, unknown>;
  return actual;
});

jest.mock('../../../routes/communities/types', () => ({
  AddMemberSchema: { parse: (data: unknown) => data },
  UpdateMemberRoleSchema: { parse: (data: unknown) => data },
  CommunityRole: { ADMIN: 'admin', MODERATOR: 'moderator', MEMBER: 'member' },
}));

jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn<any>().mockReturnValue({ offset: 0, limit: 20 }),
}));

import { registerMemberRoutes } from '../../../routes/communities/members';

const ADMIN_DE_A = '507f1f77bcf86cd799439011';
const MEMBRE_DE_B = '507f1f77bcf86cd799439022';
const COMMUNAUTE_A = '507f1f77bcf86cd7994390aa';
/** L'identifiant de LIGNE d'une adhésion à une AUTRE communauté. */
const LIGNE_ADHESION_B = '507f1f77bcf86cd7994390bb';

type UpdateDouble = jest.Mock<any>;

async function buildApp(update: UpdateDouble): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      userId: ADMIN_DE_A,
      registeredUser: { id: ADMIN_DE_A, role: 'USER' },
    };
  });
  app.decorate('prisma', {
    community: {
      // L'appelant EST bien administrateur de la communauté A.
      findFirst: jest.fn<any>().mockResolvedValue({
        id: COMMUNAUTE_A,
        createdBy: ADMIN_DE_A,
        members: [{ userId: ADMIN_DE_A, role: 'admin' }],
      }),
    },
    communityMember: { update },
  } as any);
  await app.register(registerMemberRoutes);
  await app.ready();
  return app;
}

describe('PATCH /communities/:id/members/:memberId/role — portée de l’écriture', () => {
  it('borne la ligne à la communauté du chemin, jamais au seul identifiant de membre', async () => {
    const update = jest.fn<any>().mockResolvedValue({
      id: LIGNE_ADHESION_B,
      communityId: COMMUNAUTE_A,
      userId: MEMBRE_DE_B,
      role: 'admin',
      user: { id: MEMBRE_DE_B, username: 'bob', displayName: 'Bob', avatar: null },
    });
    const app = await buildApp(update);

    await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNAUTE_A}/members/${LIGNE_ADHESION_B}/role`,
      payload: { role: 'admin' },
    });

    expect(update).toHaveBeenCalledTimes(1);
    const where = update.mock.calls[0][0].where as Record<string, unknown>;

    // C'est LA ligne du correctif : sans `communityId`, l'écriture porte sur
    // n'importe quelle adhésion du système.
    expect(where).toMatchObject({
      id: LIGNE_ADHESION_B,
      communityId: COMMUNAUTE_A,
    });

    await app.close();
  });

  it('répond 404 quand la ligne visée appartient à une autre communauté', async () => {
    // Ce que Prisma fait réellement quand le `where` composite ne matche rien.
    const p2025 = Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
    const update = jest.fn<any>().mockRejectedValue(p2025);
    const app = await buildApp(update);

    const res = await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNAUTE_A}/members/${LIGNE_ADHESION_B}/role`,
      payload: { role: 'admin' },
    });

    // 404 et non 403 : répondre « interdit » confirmerait que la ligne existe
    // ailleurs, ce que l'appelant n'a pas le droit de savoir.
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});

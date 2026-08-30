/**
 * Déplacer une conversation vers une communauté exige un droit sur CETTE conversation (#4191).
 *
 * `POST /communities/:id/conversations/:conversationId` vérifiait que
 * l'appelant administre la communauté d'ARRIVÉE, chargeait la conversation avec
 * ses `participants` et son `communityId` — puis écrivait sans consulter ni
 * l'un ni l'autre. Le Swagger de la route promettait pourtant « admin/creator
 * of BOTH the community and the conversation » : le contrat était écrit, jamais
 * appliqué.
 *
 * Deux conséquences distinctes, mesurées avant de choisir le correctif :
 *   — le rattachement n'ouvre PAS le contenu aux membres de la communauté
 *     (`GET /communities/:id/conversations` reste borné par `participants some`) ;
 *   — mais il CONFÈRE un privilège — un administrateur de la communauté hôte
 *     supervise la liste complète des membres des salons qu'elle héberge
 *     (`isMemberListingRestricted`) — et la réponse de cette route divulgue
 *     immédiatement les participants et le nombre de messages de n'importe
 *     quelle conversation dont on connaît l'identifiant.
 *
 * Les témoins assertent sur l'appel à `update` — jamais émis — et non sur le
 * seul code de statut : un double Prisma répond ce qu'on lui dit quel que soit
 * le `where` reçu, donc un témoin qui n'observe que la réponse ne peut pas
 * tomber (leçon du témoin de #4142).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../routes/communities/member-presence', () => ({
  gateConversationParticipantsPresence: jest.fn<any>(async (_p: unknown, _v: unknown, rows: unknown[]) => rows),
}));

jest.mock('../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => null,
}));

import { registerCoreRoutes } from '../../../routes/communities/core';

const APPELANT = '507f1f77bcf86cd799439011';
const TIERS = '507f1f77bcf86cd799439022';
const COMMUNAUTE_ARRIVEE = '507f1f77bcf86cd7994390aa';
const COMMUNAUTE_SOURCE = '507f1f77bcf86cd7994390cc';
const CONVERSATION = '507f1f77bcf86cd7994390bb';

type Doubles = {
  /** Les participants de la conversation visée, tels que la base les rend. */
  participants: Array<{ userId: string; role: string; isActive?: boolean }>;
  /** La communauté à laquelle la conversation appartient DÉJÀ, s'il y en a une. */
  communityId?: string | null;
  /** Le rôle de l'appelant dans la communauté SOURCE, s'il en a un. */
  roleDansLaSource?: string | null;
};

async function buildApp(doubles: Doubles) {
  const update = jest.fn<any>().mockResolvedValue({
    id: CONVERSATION,
    communityId: COMMUNAUTE_ARRIVEE,
    participants: [],
    _count: { messages: 0, participants: 0 },
  });

  const communityFindFirst = jest.fn<any>(async ({ where }: { where: { id: string } }) => {
    if (where.id === COMMUNAUTE_ARRIVEE) {
      return {
        id: COMMUNAUTE_ARRIVEE,
        createdBy: APPELANT,
        members: [{ userId: APPELANT, role: 'admin' }],
      };
    }
    if (where.id === COMMUNAUTE_SOURCE) {
      return {
        id: COMMUNAUTE_SOURCE,
        createdBy: TIERS,
        members: doubles.roleDansLaSource
          ? [{ userId: APPELANT, role: doubles.roleDansLaSource }]
          : [],
      };
    }
    return null;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      userId: APPELANT,
      registeredUser: { id: APPELANT, role: 'USER' },
    };
  });
  app.decorate('prisma', {
    community: { findFirst: communityFindFirst },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: CONVERSATION,
        communityId: doubles.communityId ?? null,
        participants: doubles.participants.map((p) => ({ isActive: true, ...p })),
      }),
      update,
    },
  } as any);
  await app.register(registerCoreRoutes);
  await app.ready();

  return { app, update };
}

function appel(app: FastifyInstance) {
  return app.inject({
    method: 'POST',
    url: `/communities/${COMMUNAUTE_ARRIVEE}/conversations/${CONVERSATION}`,
  });
}

describe('POST /communities/:id/conversations/:conversationId — l’autorité sur la CONVERSATION', () => {
  it('refuse un administrateur de communauté qui n’est même pas participant', async () => {
    const { app, update } = await buildApp({
      participants: [{ userId: TIERS, role: 'creator' }],
    });

    const res = await appel(app);

    // L'écriture ne doit PAS avoir eu lieu — c'est le seul observable qui
    // distingue la version vulnérable de la version corrigée.
    expect(update).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('refuse un simple participant — appartenir n’est pas administrer', async () => {
    const { app, update } = await buildApp({
      participants: [
        { userId: TIERS, role: 'creator' },
        { userId: APPELANT, role: 'member' },
      ],
    });

    const res = await appel(app);

    expect(update).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('laisse passer l’administrateur de la conversation', async () => {
    const { app, update } = await buildApp({
      participants: [{ userId: APPELANT, role: 'admin' }],
    });

    const res = await appel(app);

    expect(update).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);

    await app.close();
  });

  it('laisse passer le créateur de la conversation', async () => {
    const { app, update } = await buildApp({
      participants: [{ userId: APPELANT, role: 'creator' }],
    });

    await appel(app);

    expect(update).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('ignore un participant PARTI, même s’il était administrateur', async () => {
    const { app, update } = await buildApp({
      participants: [{ userId: APPELANT, role: 'admin', isActive: false }],
    });

    await appel(app);

    expect(update).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('… et sur la communauté SOURCE, quand la conversation en a déjà une', () => {
  it('refuse de retirer une conversation à une communauté qu’on n’administre pas', async () => {
    const { app, update } = await buildApp({
      participants: [{ userId: APPELANT, role: 'admin' }],
      communityId: COMMUNAUTE_SOURCE,
      roleDansLaSource: null,
    });

    const res = await appel(app);

    // Administrer la conversation ne donne pas le droit de la SOUSTRAIRE à une
    // communauté tierce, qui la perdrait sans que personne y consente.
    expect(update).not.toHaveBeenCalled();
    // 403 et non 404 : l'appelant administre la conversation, il en connaît
    // donc déjà l'existence — lui dire pourquoi on refuse ne divulgue rien.
    expect(res.statusCode).toBe(403);

    await app.close();
  });

  it('accepte quand l’appelant administre AUSSI la communauté source', async () => {
    const { app, update } = await buildApp({
      participants: [{ userId: APPELANT, role: 'admin' }],
      communityId: COMMUNAUTE_SOURCE,
      roleDansLaSource: 'admin',
    });

    await appel(app);

    expect(update).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('n’exige rien de plus quand la conversation est déjà dans la communauté d’arrivée', async () => {
    const { app, update } = await buildApp({
      participants: [{ userId: APPELANT, role: 'admin' }],
      communityId: COMMUNAUTE_ARRIVEE,
    });

    await appel(app);

    expect(update).toHaveBeenCalledTimes(1);

    await app.close();
  });
});

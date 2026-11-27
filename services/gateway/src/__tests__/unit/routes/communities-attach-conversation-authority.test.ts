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
  participants: Array<{ userId: string; role: string; isActive?: boolean; bannedAt?: Date | null }>;
  /** Rend la communauté d'arrivée PRIVÉE : le rattachement y ADMET les participants. */
  privee?: boolean;
  /** Les lignes `CommunityMember` déjà en base, pour la planification d'admission. */
  membresExistants?: Array<{ id: string; userId: string; isActive: boolean }>;
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
        isPrivate: doubles.privee ?? false,
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
  const communityMemberFindMany = jest.fn<any>().mockResolvedValue(doubles.membresExistants ?? []);
  const communityMemberCreateMany = jest.fn<any>().mockResolvedValue({ count: 0 });
  const communityMemberUpdateMany = jest.fn<any>().mockResolvedValue({ count: 0 });

  app.decorate('prisma', {
    community: { findFirst: communityFindFirst, update: jest.fn<any>().mockResolvedValue({}) },
    communityMember: {
      findMany: communityMemberFindMany,
      createMany: communityMemberCreateMany,
      updateMany: communityMemberUpdateMany,
      count: jest.fn<any>().mockResolvedValue(0),
    },
    communityJoinRequest: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }), findMany: jest.fn<any>().mockResolvedValue([]) },
    user: {
      findMany: jest.fn<any>(async (args: any) => ((args?.where?.id?.in as string[] | undefined) ?? []).map((id) => ({ id }))),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    conversation: {
      /**
       * Ce double APPLIQUE le `select` des participants, et c'est nécessaire,
       * pas cosmétique (#20136).
       *
       * Un double Prisma ordinaire rend ce qu'on lui dit QUEL QUE SOIT le
       * `select` : une loi jugée après lecture (`participationEstVivante` lit
       * `row.bannedAt == null`) reste alors verte même si la production cesse
       * de charger la colonne — et `undefined == null` étant VRAI, la garde
       * rend `true` pour un banni. Mesuré : avec un double permissif, retirer
       * `bannedAt` du `select` de production ne fait tomber AUCUN témoin.
       *
       * En projetant, la fixture ne peut plus rendre un champ que la requête
       * n'a pas demandé : le no-op muet redevient visible par les témoins de
       * COMPORTEMENT, sans qu'aucun d'eux ait à parler de projection.
       */
      findFirst: jest.fn<any>(async (args: any) => {
        const champs = Object.keys(args?.select?.participants?.select ?? {});
        const projeter = (row: Record<string, unknown>) =>
          champs.length === 0
            ? row
            : Object.fromEntries(champs.filter((champ) => champ in row).map((champ) => [champ, row[champ]]));
        return {
          id: CONVERSATION,
          communityId: doubles.communityId ?? null,
          participants: doubles.participants.map((p) => projeter({ isActive: true, ...p })),
        };
      }),
      update,
    },
  } as any);
  await app.register(registerCoreRoutes);
  await app.ready();

  return { app, update, communityMemberFindMany, communityMemberCreateMany };
}

const ADMIS = (n: number) => `a1${n.toString(16).padStart(22, '0')}`;

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

/**
 * #20136 — la porte ET la liste qui ÉCRIT lisent la PARTICIPATION VIVANTE.
 *
 * La route jugeait l'appelant par `p.isActive !== false` : deux écarts avec
 * `participationEstVivante`, de gravité très inégale.
 *
 * | ce que le site écrivait | la loi | conséquence |
 * |---|---|---|
 * | `p.isActive !== false` | `isActive === true` | une ligne dont `isActive` est ABSENT ou nul passait |
 * | *rien sur `bannedAt`* | `bannedAt == null` | **un administrateur BANNI rattachait « sa » conversation** |
 *
 * Et le même relevé, sous le même prédicat, alimentait `planCommunityAdmission` :
 * cette seconde liste n'affiche rien, elle **écrit** — `applyCommunityAdmission`
 * crée une ligne `CommunityMember` par participant. Un banni de la conversation
 * devenait donc MEMBRE de la communauté privée d'accueil, par un geste qui parle
 * d'autre chose.
 *
 * **Le piège de ce lot est la PROJECTION, pas le prédicat.**
 * `participationEstVivante` lit `row.bannedAt == null`, et un champ non projeté
 * vaut `undefined` — dont `undefined == null` est VRAI. Poser la loi sans
 * ajouter `bannedAt` au `select` est donc un no-op MUET : la garde a l'air
 * posée et rend `true` pour un banni. Le dernier témoin de ce bloc est là pour
 * ça, et lui seul peut le voir.
 */
describe('#20136 — la participation VIVANTE, à la porte et dans ce qui écrit', () => {
  const BANNI_LE = new Date('2026-11-01T00:00:00.000Z');

  it("refuse un administrateur de conversation BANNI, et n'écrit rien", async () => {
    const { app, update } = await buildApp({
      participants: [{ userId: APPELANT, role: 'admin', isActive: true, bannedAt: BANNI_LE }],
    });

    const res = await appel(app);

    expect(update).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("refuse une ligne dont `isActive` est ABSENT — « non faux » n'est pas « vrai »", async () => {
    // Le second écart, le plus discret : `p.isActive !== false` admettait cette
    // ligne-là. Elle ne peut pas être produite par le `where` (il n'y en a pas
    // sur cette lecture), donc seule la loi la retient.
    const { app, update } = await buildApp({
      participants: [{ userId: APPELANT, role: 'admin', isActive: undefined }],
    });

    const res = await appel(app);

    expect(update).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('un administrateur VIVANT rattache toujours — la mesure inverse', async () => {
    // Sans elle, « refuse tout le monde » satisferait les deux témoins ci-dessus.
    const { app, update } = await buildApp({
      participants: [{ userId: APPELANT, role: 'admin', isActive: true, bannedAt: null }],
    });

    const res = await appel(app);

    expect(update).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("n'ADMET pas un participant banni dans la communauté privée d'accueil", async () => {
    // La moitié qui ÉCRIT : `applyCommunityAdmission` crée un `CommunityMember`
    // par identité remise. Le banni ne doit pas y figurer — et l'appelant
    // légitime doit, lui, continuer de rattacher.
    const { app, update, communityMemberFindMany } = await buildApp({
      privee: true,
      participants: [
        { userId: APPELANT, role: 'admin', isActive: true, bannedAt: null },
        { userId: TIERS, role: 'member', isActive: true, bannedAt: BANNI_LE },
      ],
    });

    const res = await appel(app);

    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalled();
    // `planCommunityAdmission` interroge les lignes existantes des identités
    // qu'on lui remet : c'est là que la liste se lit, avant toute écriture.
    const interroges = communityMemberFindMany.mock.calls.flatMap(
      (call: any) => (call[0]?.where?.userId?.in as string[] | undefined) ?? []
    );
    expect(interroges).not.toContain(TIERS);
    await app.close();
  });
});

describe('#20464 — rattacher à une communauté PRIVÉE débite le budget des ajouts sans accord', () => {
  const salon = (count: number) => [
    { userId: APPELANT, role: 'admin', isActive: true, bannedAt: null },
    ...Array.from({ length: count }, (_, n) => ({ userId: ADMIS(n), role: 'member', isActive: true, bannedAt: null })),
  ];

  it('un salon dont les participants dépassent le plafond horaire de l’acteur : 429 nommé, rien n’est rattaché ni admis', async () => {
    const { app, update, communityMemberCreateMany } = await buildApp({ privee: true, participants: salon(31) });

    const res = await appel(app);

    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe('COMMUNITY_ADDITION_BUDGET_EXCEEDED');
    expect(res.headers['retry-after']).toBeDefined();
    expect(update).not.toHaveBeenCalled();
    expect(communityMemberCreateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('sous le plafond, le rattachement passe et admet ses participants — la mesure inverse', async () => {
    const { app, update, communityMemberCreateMany } = await buildApp({ privee: true, participants: salon(30) });

    const res = await appel(app);

    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    expect(communityMemberCreateMany).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

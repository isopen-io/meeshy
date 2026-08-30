/**
 * Une demande d'amitié suit UN chemin, dans les deux sens (#4162).
 *
 * Deux familles complètes coexistaient, montées sur le même préfixe, avec des
 * gardes divergentes — et le partage du trafic était INVERSÉ : les clients
 * appelaient les handlers les plus FAIBLES. Celui que tout le monde appelait
 * n'avait ni garde d'auto-envoi, ni contrôle de désactivation, ni contrôle de
 * blocage ; son jumeau orphelin avait la première, et personne ne l'appelait.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../utils/withMutationLog', () => {
  class MutationResultGone extends Error {}
  return { withMutationLog: jest.fn(async (args: any) => args.op()), MutationResultGone };
});

/**
 * La LOI de visibilité de la présence est doublée — pas réécrite.
 *
 * Ce qu'on veut prouver ici n'est pas que `PresenceVisibilityService` décide
 * juste (ses propres suites le font), mais que ces routes la CONSULTENT avec le
 * viewer de la requête et SERVENT son verdict. Le double rend donc un verdict
 * choisi par le témoin ; si la route cessait d'appeler la loi, la présence
 * brute de la fixture sortirait telle quelle et chaque assertion tomberait.
 */
const visibilitePar = new Map<string, { showOnline: boolean; showLastSeenTimestamp: boolean }>();
const viewersVus: unknown[] = [];

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: async (viewer: unknown, ids: string[]) => {
      viewersVus.push(viewer);
      const carte = new Map<string, { showOnline: boolean; showLastSeenTimestamp: boolean }>();
      for (const id of ids) {
        const verdict = visibilitePar.get(id);
        if (verdict) carte.set(id, verdict);
      }
      return carte;
    },
  }),
}));

const VU = { showOnline: true, showLastSeenTimestamp: true };
const MASQUE = { showOnline: false, showLastSeenTimestamp: false };

import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';

const PREFIXE = '/api/v1/directory';
const MOI = '507f1f77bcf86cd799439011';
const AUTRE = '507f1f77bcf86cd799439022';
const FR_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

const VU_LE = new Date('2026-08-29T10:00:00.000Z');
const PARTIE = {
  id: AUTRE, username: 'alice', firstName: 'Alice', lastName: 'A', displayName: 'Alice', avatar: null,
  // La présence est chargée par `PROJECTION_PARTIE` — les trois clients la
  // DÉCLARENT sur `FriendRequestUser` depuis toujours et ne la recevaient pas.
  isOnline: true, lastActiveAt: VU_LE,
};

type Options = {
  receveur?: { id: string; deactivatedAt: Date | null; blockedUserIds: string[] } | null;
  emetteurBloque?: string[];
  demandeExistante?: { id: string } | null;
  demande?: { id: string; senderId: string; receiverId: string; status: string } | null;
  conversationExistante?: { id: string; identifier: string; type: string } | null;
};

function prismaDouble(opts: Options = {}) {
  const client = {
    user: {
      findUnique: jest.fn<any>(async (args: any) => {
        if (args?.where?.id === MOI) return { blockedUserIds: opts.emetteurBloque ?? [], displayName: 'Moi', username: 'moi' };
        if (opts.receveur === null) return null;
        return opts.receveur ?? { id: AUTRE, deactivatedAt: null, blockedUserIds: [], displayName: 'Alice', username: 'alice' };
      }),
    },
    friendRequest: {
      findFirst: jest.fn<any>(async () => opts.demandeExistante ?? null),
      findUnique: jest.fn<any>(async (args: any) =>
        args?.select
          ? (opts.demande === undefined
              ? { id: FR_ID, senderId: AUTRE, receiverId: MOI, status: 'pending' }
              : opts.demande)
          : { id: FR_ID, senderId: AUTRE, receiverId: MOI, status: 'accepted', sender: PARTIE, receiver: PARTIE }
      ),
      create: jest.fn<any>(async () => ({ id: FR_ID, senderId: MOI, receiverId: AUTRE, status: 'pending', sender: PARTIE, receiver: PARTIE })),
      update: jest.fn<any>(async () => ({ id: FR_ID, senderId: AUTRE, receiverId: MOI, status: 'accepted', sender: PARTIE, receiver: PARTIE })),
      delete: jest.fn<any>(async () => ({})),
      findMany: jest.fn<any>(async () => []),
    },
    conversation: {
      findFirst: jest.fn<any>(async () => opts.conversationExistante ?? null),
      create: jest.fn<any>(async () => ({ id: 'convid00000000000000001', identifier: 'abc', type: 'direct' })),
    },
  };
  return client;
}

async function monter(opts: Options = {}) {
  const prisma = prismaDouble(opts);
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('notificationService', null);
  app.decorate('socialEvents', null);
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: MOI };
    req.authContext = { isAuthenticated: true, type: 'user', userId: MOI, registeredUser: { id: MOI, role: 'USER' } };
  });
  await app.register(directoryFriendRequestsRoutes, { prefix: PREFIXE });
  await app.ready();
  return { app, prisma };
}

const envoyer = (app: FastifyInstance, receiverId: string) =>
  app.inject({
    method: 'POST',
    url: `${PREFIXE}/friend-requests`,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ receiverId }),
  });

const agir = (app: FastifyInstance, action: string) =>
  app.inject({
    method: 'PATCH',
    url: `${PREFIXE}/friend-requests/${FR_ID}`,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  });

describe("Les trois gardes de l'envoi", () => {
  it("refuse l'AUTO-ENVOI — la garde qui ne vivait que dans le jumeau orphelin", async () => {
    const { app, prisma } = await monter();

    const res = await envoyer(app, MOI);

    expect(res.statusCode).toBe(400);
    expect(prisma.friendRequest.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un destinataire DÉSACTIVÉ — la ligne serait créée et personne ne pourrait y répondre', async () => {
    const { app, prisma } = await monter({
      receveur: { id: AUTRE, deactivatedAt: new Date('2026-01-01'), blockedUserIds: [] },
    });

    const res = await envoyer(app, AUTRE);

    expect(res.statusCode).toBe(404);
    expect(prisma.friendRequest.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuse quand le destinataire a BLOQUÉ l'émetteur — la garde qui n'existait NULLE PART", async () => {
    const { app, prisma } = await monter({
      receveur: { id: AUTRE, deactivatedAt: null, blockedUserIds: [MOI] },
    });

    const res = await envoyer(app, AUTRE);

    expect(res.statusCode).toBe(409);
    expect(prisma.friendRequest.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuse aussi quand c'est l'ÉMETTEUR qui a bloqué — le blocage vaut dans les DEUX sens", async () => {
    const { app, prisma } = await monter({ emetteurBloque: [AUTRE] });

    expect((await envoyer(app, AUTRE)).statusCode).toBe(409);
    expect(prisma.friendRequest.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("rend le MÊME refus qu'une demande déjà existante — un blocage n'est pas un oracle", async () => {
    const { app: bloque } = await monter({ receveur: { id: AUTRE, deactivatedAt: null, blockedUserIds: [MOI] } });
    const { app: existante } = await monter({ demandeExistante: { id: FR_ID } });

    const a = await envoyer(bloque, AUTRE);
    const b = await envoyer(existante, AUTRE);

    // Distinguer les deux dirait à l'émetteur qu'il a été bloqué — une
    // information que le bloqueur n'a pas choisi de donner.
    expect(a.statusCode).toBe(b.statusCode);
    expect(a.json().message).toBe(b.json().message);
    await bloque.close();
    await existante.close();
  });

  it('crée la demande quand rien ne la refuse', async () => {
    const { app, prisma } = await monter();

    const res = await envoyer(app, AUTRE);

    expect(res.statusCode).toBe(201);
    expect(prisma.friendRequest.create).toHaveBeenCalled();
    await app.close();
  });
});

describe("L'acceptation SERT la conversation", () => {
  it('porte `conversation` dans la charge SÉRIALISÉE — pas seulement sur l\'objet du handler', async () => {
    // Le défaut était une suppression au SÉRIALISEUR : le handler greffait la
    // conversation sur l'objet rendu, et `friendRequestSchema` ne la déclarant
    // pas, fast-json-stringify la retirait. Ce témoin doit donc lire la
    // RÉPONSE HTTP — un test sur l'objet du handler ne verrait rien.
    const { app } = await monter();

    const res = await agir(app, 'accept');

    expect(res.statusCode).toBe(200);
    const data = res.json().data as { conversation?: { id: string } };
    expect(data.conversation).toBeDefined();
    expect(data.conversation?.id).toBe('convid00000000000000001');
    await app.close();
  });

  it("la sert AUSSI quand la conversation existait déjà — « je viens de la créer » n'intéresse pas l'appelant", async () => {
    // Le site précédent ne greffait la conversation que dans la branche de
    // CRÉATION : accepter une demande entre deux personnes qui avaient déjà un
    // fil ne rendait rien, même une fois le schéma corrigé.
    const { app } = await monter({
      conversationExistante: { id: 'convid00000000000000009', identifier: 'xyz', type: 'direct' },
    });

    const data = (await agir(app, 'accept')).json().data as { conversation?: { id: string } };

    expect(data.conversation?.id).toBe('convid00000000000000009');
    await app.close();
  });
});

describe("Un geste, un verbe — et l'acteur autorisé", () => {
  it('`cancel` appartient à l\'ÉMETTEUR : le receveur ne peut pas annuler', async () => {
    // La demande a été envoyée par AUTRE ; MOI en suis le receveur.
    const { app, prisma } = await monter();

    const res = await agir(app, 'cancel');

    expect(res.statusCode).toBe(404);
    expect(prisma.friendRequest.delete).not.toHaveBeenCalled();
    await app.close();
  });

  it('`dismiss` appartient aux DEUX parties, et SUPPRIME la ligne', async () => {
    const { app, prisma } = await monter();

    const res = await agir(app, 'dismiss');

    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted).toBe(true);
    expect(prisma.friendRequest.delete).toHaveBeenCalled();
    await app.close();
  });

  it("`accept` appartient au RECEVEUR : l'émetteur ne peut pas accepter sa propre demande", async () => {
    const { app } = await monter({ demande: { id: FR_ID, senderId: MOI, receiverId: AUTRE, status: 'pending' } });

    expect((await agir(app, 'accept')).statusCode).toBe(404);
    await app.close();
  });

  it("rend 404 pour TOUTES les raisons de refus — l'existence d'une demande entre tiers n'est pas publique", async () => {
    const { app: absente } = await monter({ demande: null });
    const { app: pasAMoi } = await monter({ demande: { id: FR_ID, senderId: MOI, receiverId: AUTRE, status: 'pending' } });

    expect((await agir(absente, 'accept')).statusCode).toBe(404);
    expect((await agir(pasAMoi, 'accept')).statusCode).toBe(404);
    await absente.close();
    await pasAMoi.close();
  });

  it('refuse une action inconnue', async () => {
    const { app } = await monter();

    expect((await agir(app, 'explode')).statusCode).toBe(400);
    await app.close();
  });
});

describe('Le listing fusionné', () => {
  it('pagine par curseur avec `direction=any`', async () => {
    const lignes = [
      { id: 'a', senderId: MOI, receiverId: AUTRE, status: 'pending', createdAt: new Date('2026-08-03'), sender: PARTIE, receiver: PARTIE },
      { id: 'b', senderId: AUTRE, receiverId: MOI, status: 'pending', createdAt: new Date('2026-08-02'), sender: PARTIE, receiver: PARTIE },
      { id: 'c', senderId: MOI, receiverId: AUTRE, status: 'pending', createdAt: new Date('2026-08-01'), sender: PARTIE, receiver: PARTIE },
    ];
    const { app, prisma } = await monter();
    prisma.friendRequest.findMany = jest.fn<any>(async () => lignes);

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/friend-requests?direction=any&limit=2` });

    expect(res.statusCode).toBe(200);
    const corps = res.json();
    expect(corps.data).toHaveLength(2);
    expect(corps.pagination.hasMore).toBe(true);
    // Le curseur est l'HORODATAGE : c'est la clé de tri, et les deux index
    // composés se terminent par elle.
    expect(corps.pagination.nextCursor).toBe(new Date('2026-08-02').toISOString());

    // `direction=any` interroge les DEUX colonnes d'identité.
    const where = (prisma.friendRequest.findMany as any).mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('receiverId');
    expect(JSON.stringify(where)).toContain('senderId');
    await app.close();
  });

  it('refuse une page au-delà du plafond', async () => {
    const { app } = await monter();

    expect((await app.inject({ method: 'GET', url: `${PREFIXE}/friend-requests?limit=101` })).statusCode).toBe(400);
    await app.close();
  });

  it('rend 304 sur un `If-None-Match` valide', async () => {
    const { app } = await monter();

    const premier = await app.inject({ method: 'GET', url: `${PREFIXE}/friend-requests` });
    const etag = premier.headers.etag as string;
    expect(etag).toBeTruthy();

    const second = await app.inject({
      method: 'GET',
      url: `${PREFIXE}/friend-requests`,
      headers: { 'if-none-match': etag },
    });

    expect(second.statusCode).toBe(304);
    await app.close();
  });

  it('filtre par `q` côté SERVEUR — le web drainait la liste entière pour le faire en mémoire', async () => {
    const { app, prisma } = await monter();

    await app.inject({ method: 'GET', url: `${PREFIXE}/friend-requests?q=ali` });

    const where = JSON.stringify((prisma.friendRequest.findMany as any).mock.calls[0][0].where);
    expect(where).toContain('ali');
    await app.close();
  });
});

/**
 * La PRÉSENCE d'une partie de demande — chargée, et jamais servie brute (#4254).
 *
 * `PROJECTION_PARTIE` ne chargeait ni `isOnline` ni `lastActiveAt`, alors que
 * les TROIS clients les déclarent sur la partie d'une demande : `FriendRequestUser`
 * (iOS et son port Kotlin) et `FriendRequest.sender?: User` (web). Le coût
 * n'était pas une pastille manquante mais deux TRIS morts —
 * `FriendListAggregator.aggregate` ordonne la liste de contacts iOS sur
 * `isOnline` puis `lastActiveAt`, et `useContactsV2` en dérive son ensemble
 * `onlineUserIds` initial : sur des champs toujours nuls, l'ordre était celui
 * du dictionnaire.
 *
 * Les charger OBLIGE à la loi du 2026-08-25 : hors amitié acceptée, ces deux
 * colonnes ne sont JAMAIS servies. Et la loi s'applique aux TROIS producteurs
 * de lignes, pas au seul listing — l'ENVOI s'adresse par définition à un
 * inconnu, c'est là que la fuite serait la plus grave.
 */
describe('La présence des parties obéit à la loi, sur les trois producteurs', () => {
  const lignePendante = {
    id: 'a', senderId: AUTRE, receiverId: MOI, status: 'pending',
    createdAt: new Date('2026-08-03'), sender: PARTIE, receiver: PARTIE,
  };

  beforeEach(() => {
    visibilitePar.clear();
    viewersVus.length = 0;
  });

  it("MASQUE la présence d'un non-ami dans le listing — la colonne est chargée, pas servie", async () => {
    visibilitePar.set(AUTRE, MASQUE);
    const { app, prisma } = await monter();
    prisma.friendRequest.findMany = jest.fn<any>(async () => [lignePendante]);

    const corps = (await app.inject({ method: 'GET', url: `${PREFIXE}/friend-requests` })).json();

    expect(corps.data[0].sender.isOnline).toBe(false);
    expect(corps.data[0].sender.lastActiveAt).toBeNull();
    await app.close();
  });

  it("SERT la présence d'un ami accepté — sinon les deux tris clients restent morts", async () => {
    visibilitePar.set(AUTRE, VU);
    const { app, prisma } = await monter();
    prisma.friendRequest.findMany = jest.fn<any>(async () => [lignePendante]);

    const corps = (await app.inject({ method: 'GET', url: `${PREFIXE}/friend-requests` })).json();

    expect(corps.data[0].sender.isOnline).toBe(true);
    // `lastActiveAt` ne survit à fast-json-stringify que parce que la route le
    // DÉCLARE localement : `userMinimalSchema` le tait, et le déclarer là-bas
    // le pousserait sur des dizaines de réponses qui ne gatent pas.
    expect(corps.data[0].sender.lastActiveAt).toBe(VU_LE.toISOString());
    await app.close();
  });

  it('consulte la loi avec le VIEWER de la requête, jamais avec un rang par défaut', async () => {
    visibilitePar.set(AUTRE, MASQUE);
    const { app, prisma } = await monter();
    prisma.friendRequest.findMany = jest.fn<any>(async () => [lignePendante]);

    await app.inject({ method: 'GET', url: `${PREFIXE}/friend-requests` });

    expect(viewersVus[0]).toEqual({ userId: MOI, role: 'USER' });
    await app.close();
  });

  it("une entrée ABSENTE de la carte est MASQUÉE — la porte échoue fermée", async () => {
    // Aucun verdict posé : le double rend une carte vide, comme le ferait la
    // loi sur une cible qu'elle ne sait pas résoudre.
    const { app, prisma } = await monter();
    prisma.friendRequest.findMany = jest.fn<any>(async () => [lignePendante]);

    const corps = (await app.inject({ method: 'GET', url: `${PREFIXE}/friend-requests` })).json();

    expect(corps.data[0].sender.isOnline).toBe(false);
    expect(corps.data[0].sender.lastActiveAt).toBeNull();
    await app.close();
  });

  it("l'ENVOI ne révèle pas si l'inconnu qu'on ajoute est en ligne", async () => {
    visibilitePar.set(AUTRE, MASQUE);
    const { app } = await monter();

    const corps = (await envoyer(app, AUTRE)).json();

    expect(corps.data.receiver.isOnline).toBe(false);
    expect(corps.data.receiver.lastActiveAt).toBeNull();
    await app.close();
  });

  it("le REFUS ne révèle rien non plus — éconduire ne crée pas d'amitié", async () => {
    visibilitePar.set(AUTRE, MASQUE);
    const { app } = await monter();

    const corps = (await agir(app, 'reject')).json();

    expect(corps.data.sender.isOnline).toBe(false);
    await app.close();
  });

  it("l'ACCEPTATION sert la présence du nouvel ami, et garde `conversation`", async () => {
    visibilitePar.set(AUTRE, VU);
    const { app } = await monter({ conversationExistante: { id: 'convid00000000000000009', identifier: 'x', type: 'direct' } });

    const corps = (await agir(app, 'accept')).json();

    expect(corps.data.sender.isOnline).toBe(true);
    expect(corps.data.sender.lastActiveAt).toBe(VU_LE.toISOString());
    expect(corps.data.conversation.id).toBe('convid00000000000000009');
    await app.close();
  });
});

/**
 * Un curseur ILLISIBLE rend 400, pas 500 (#4254).
 *
 * Les deux clients s'apprêtent à PERSISTER ce curseur — cache disque iOS,
 * cache React Query web — et à le renvoyer au réveil. `new Date('...')` sur une
 * valeur tronquée ou d'un format d'une version voisine rend `Invalid Date`, que
 * Prisma rejette : la liste répondait 500, un code sur lequel aucun client ne
 * sait repartir de la première page.
 */
describe('Le curseur est un contrat, pas une chaîne libre', () => {
  it('refuse un curseur illisible AVANT la requête', async () => {
    const { app, prisma } = await monter();

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/friend-requests?cursor=hier-soir` });

    expect(res.statusCode).toBe(400);
    expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('accepte un curseur ISO et le pose en borne stricte', async () => {
    const { app, prisma } = await monter();

    const res = await app.inject({
      method: 'GET',
      url: `${PREFIXE}/friend-requests?cursor=${encodeURIComponent('2026-08-02T00:00:00.000Z')}`,
    });

    expect(res.statusCode).toBe(200);
    const where = JSON.stringify((prisma.friendRequest.findMany as any).mock.calls[0][0].where);
    expect(where).toContain('2026-08-02T00:00:00.000Z');
    await app.close();
  });
});

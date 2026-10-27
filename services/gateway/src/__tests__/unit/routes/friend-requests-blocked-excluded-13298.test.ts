/**
 * #13298 — une personne bloquée, dans un sens OU dans l'autre, n'apparaît
 * dans AUCUNE liste d'amitié servie par la passerelle.
 *
 * Le blocage (`User.blockedUserIds`) ne touche pas la `FriendRequest` : une
 * amitié acceptée, une demande en attente, envoyée ou reçue, restent en base
 * (rompre l'amitié est une décision produit ouverte). Les QUATRE listes qui
 * servent ces lignes les filtrent donc à la lecture :
 *
 *  - `GET /directory/friend-requests` (`direction=received|sent|any`) ;
 *  - `GET /friend-requests/received` et `/friend-requests/sent` (alias) ;
 *  - `GET /users/friend-requests` (l'annuaire d'amis, `?status=accepted`).
 *
 * Le double Prisma ÉVALUE la clause (`matchesMongoWhere`) sur un monde en
 * mémoire : c'est la ligne servie qui parle, jamais la clause recopiée.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

const MOI = '507f1f77bcf86cd799439011';
const AMIE = '507f1f77bcf86cd799439012';
const JE_BLOQUE = '507f1f77bcf86cd799439013';
const ME_BLOQUE = '507f1f77bcf86cd799439014';
const ATTENTE_BLOQUE = '507f1f77bcf86cd799439015';
const RECUE_DE_BLOQUEUR = '507f1f77bcf86cd799439016';

type Monde = {
  readonly users: ReadonlyArray<{ id: string; blockedUserIds: string[] }>;
  readonly demandes: ReadonlyArray<MongoDocument>;
};

const personne = (id: string) => ({ id, username: `u${id.slice(-2)}`, displayName: null, avatar: null, isOnline: false, lastActiveAt: null });

const demande = (id: string, senderId: string, receiverId: string, status: string, jour: number): MongoDocument => ({
  id,
  senderId,
  receiverId,
  status,
  message: null,
  createdAt: new Date(Date.UTC(2026, 9, jour)),
  updatedAt: new Date(Date.UTC(2026, 9, jour)),
  sender: personne(senderId),
  receiver: personne(receiverId),
});

function monde(): Monde {
  return {
    users: [
      { id: MOI, blockedUserIds: [JE_BLOQUE, ATTENTE_BLOQUE] },
      { id: AMIE, blockedUserIds: [] },
      { id: JE_BLOQUE, blockedUserIds: [] },
      { id: ME_BLOQUE, blockedUserIds: [MOI] },
      { id: ATTENTE_BLOQUE, blockedUserIds: [] },
      { id: RECUE_DE_BLOQUEUR, blockedUserIds: [MOI] },
    ],
    demandes: [
      demande('aaaaaaaaaaaaaaaaaaaaaa01', MOI, AMIE, 'accepted', 1),
      demande('aaaaaaaaaaaaaaaaaaaaaa02', JE_BLOQUE, MOI, 'accepted', 2),
      demande('aaaaaaaaaaaaaaaaaaaaaa03', MOI, ME_BLOQUE, 'accepted', 3),
      demande('aaaaaaaaaaaaaaaaaaaaaa04', MOI, ATTENTE_BLOQUE, 'pending', 4),
      demande('aaaaaaaaaaaaaaaaaaaaaa05', RECUE_DE_BLOQUEUR, MOI, 'pending', 5),
      demande('aaaaaaaaaaaaaaaaaaaaaa06', AMIE, MOI, 'pending', 6),
    ],
  };
}

const parDateDecroissante = (a: MongoDocument, b: MongoDocument) =>
  (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime() || String(b.id).localeCompare(String(a.id));

function prismaDuMonde(m: Monde) {
  const filtrer = (where: MongoDocument | undefined) => m.demandes.filter((row) => matchesMongoWhere(row, where));
  return {
    user: {
      findMany: async ({ where }: { where?: MongoDocument }) =>
        m.users.filter((row) => matchesMongoWhere(row as unknown as MongoDocument, where)).map(({ id }) => ({ id })),
      findUnique: async ({ where }: { where: { id: string } }) => m.users.find((row) => row.id === where.id) ?? null,
    },
    friendRequest: {
      findMany: async ({ where, skip, take }: { where?: MongoDocument; skip?: number; take?: number }) => {
        const lignes = [...filtrer(where)].sort(parDateDecroissante);
        const depuis = skip ?? 0;
        return lignes.slice(depuis, take === undefined ? undefined : depuis + take);
      },
      count: async ({ where }: { where?: MongoDocument }) => filtrer(where).length,
    },
  };
}

async function monter(m: Monde): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaDuMonde(m) as unknown);
  app.decorate('notificationService', null);
  app.decorate('socialEvents', null);
  app.decorate('authenticate', async (req: FastifyRequest, _reply: FastifyReply) => {
    const r = req as unknown as Record<string, unknown>;
    r.user = { userId: MOI, username: 'moi', role: 'USER' };
    r.authContext = { isAuthenticated: true, userId: MOI, registeredUser: { id: MOI, role: 'USER' } };
  });
  const { friendRequestRoutes } = await import('../../../routes/friends');
  const { directoryFriendRequestsRoutes } = await import('../../../routes/directory/friend-requests');
  const { getFriendRequests } = await import('../../../routes/users/devices');
  await app.register(friendRequestRoutes, { prefix: '' });
  await app.register(directoryFriendRequestsRoutes, { prefix: '/directory' });
  await app.register(getFriendRequests, { prefix: '' });
  await app.ready();
  return app;
}

const AUTH = { authorization: 'Bearer token' };

async function pairsServis(app: FastifyInstance, url: string): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url, headers: AUTH });
  expect(res.statusCode).toBe(200);
  const lignes = res.json().data as Array<{ senderId: string; receiverId: string }>;
  return lignes.map((l) => (l.senderId === MOI ? l.receiverId : l.senderId)).sort();
}

describe('#13298 — les listes d’amitié ne servent jamais une personne bloquée', () => {
  it('directory, direction=any : ni celui que je bloque, ni celui qui me bloque, en contact comme en demande', async () => {
    const app = await monter(monde());
    await expect(pairsServis(app, '/directory/friend-requests?direction=any')).resolves.toEqual([AMIE, AMIE]);
    await app.close();
  });

  it('directory, contacts acceptés : l’ami accepté puis bloqué — dans chaque sens — sort de la liste', async () => {
    const app = await monter(monde());
    await expect(pairsServis(app, '/directory/friend-requests?direction=any&status=accepted')).resolves.toEqual([AMIE]);
    await app.close();
  });

  it('directory, envoyées et reçues : la demande en attente vers/depuis un bloqué disparaît', async () => {
    const app = await monter(monde());
    await expect(pairsServis(app, '/directory/friend-requests?direction=sent')).resolves.toEqual([AMIE]);
    await expect(pairsServis(app, '/directory/friend-requests?direction=received')).resolves.toEqual([AMIE]);
    await app.close();
  });

  it('alias /friend-requests/received et /sent : même filtre, au curseur comme au rang (total compris)', async () => {
    const app = await monter(monde());
    await expect(pairsServis(app, '/friend-requests/received')).resolves.toEqual([AMIE]);
    await expect(pairsServis(app, '/friend-requests/sent')).resolves.toEqual([AMIE]);
    const res = await app.inject({ method: 'GET', url: '/friend-requests/sent?offset=0', headers: AUTH });
    expect(res.json().pagination.total).toBe(1);
    await app.close();
  });

  it('GET /users/friend-requests : l’annuaire d’amis ne sert aucun bloqué, et son total le sait', async () => {
    const app = await monter(monde());
    await expect(pairsServis(app, '/users/friend-requests')).resolves.toEqual([AMIE, AMIE]);
    const res = await app.inject({ method: 'GET', url: '/users/friend-requests?status=accepted', headers: AUTH });
    expect(res.json().data.map((l: { receiverId: string }) => l.receiverId)).toEqual([AMIE]);
    expect(res.json().pagination.total).toBe(1);
    await app.close();
  });

  it('sans aucun blocage, rien ne change : toutes les lignes restent servies', async () => {
    const libre: Monde = { ...monde(), users: monde().users.map((u) => ({ ...u, blockedUserIds: [] })) };
    const app = await monter(libre);
    const servis = await pairsServis(app, '/directory/friend-requests?direction=any');
    expect(servis).toHaveLength(6);
    await app.close();
  });
});

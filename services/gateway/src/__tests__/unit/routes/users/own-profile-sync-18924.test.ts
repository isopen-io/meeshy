/**
 * #18924 — CHANGER SA LANGUE, SON NOM OU SA PHOTO SE VOIT AUSSITÔT SUR SES
 * AUTRES APPAREILS.
 *
 * `user:updated` part vers les rooms des PARTENAIRES et exclut l'auteur ; aucun
 * événement n'atteignait les autres appareils de l'auteur lui-même. Un changement
 * de langue fait sur le web laissait l'iPhone et l'Android connectés sur l'ancien
 * Prisme jusqu'à la prochaine lecture de `GET /me`.
 *
 * Le témoin branche de VRAIES sockets sur un VRAI serveur Socket.IO : deux
 * appareils du même compte (A1 écrit, A2 attend) et un partenaire (B), chacun
 * dans sa room personnelle comme `AuthHandler` les y range. Ce qui compte n'est
 * pas l'appel d'une fonction d'émission mais ce qu'une AUTRE socket du compte
 * REÇOIT — et ce qu'un partenaire ne reçoit jamais.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { createServer, type Server as HTTPServer } from 'http';
import type { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { profileUpdatedEventDataSchema, type ProfileUpdatedEventData } from '@meeshy/shared/types/own-profile-sync';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn(), logWarn: jest.fn() }));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

jest.mock('../../../../middleware/auth', () => ({
  authUserCacheKey: jest.fn((id: string) => `auth:user:${id}`),
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ del: jest.fn(async () => undefined) })),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(({ op }: { op: () => unknown }) => op()),
}));

jest.mock('../../../../routes/auth/types', () => ({
  formatUserResponse: jest.fn((u: Record<string, unknown>) => ({ ...u, formatted: true })),
}));

import { updateUserAvatar, updateUserBanner, updateUserProfile } from '../../../../routes/users/profile';
import { ownProfileUpdatedPayload } from '../../../../routes/users/own-profile-sync';

const ALICE = '507f1f77bcf86cd799439011';
const BOB = '507f1f77bcf86cd799439022';
const WRITTEN_AT = new Date('2026-11-17T09:30:00.000Z');
const NEW_AVATAR = '2026/11/507f1f77bcf86cd799439011/avatar_3.webp';
const NEW_BANNER = '2026/11/507f1f77bcf86cd799439011/banner_2.webp';

const aliceRow = (overrides: Record<string, unknown> = {}) => ({
  id: ALICE,
  username: 'alice',
  displayName: 'Alice Cooper',
  firstName: 'Alice',
  lastName: 'Cooper',
  email: 'alice@example.com',
  phoneNumber: '+33600000000',
  password: 'hash',
  role: 'USER',
  isOnline: true,
  lastActiveAt: new Date('2026-11-17T09:29:00.000Z'),
  avatar: null,
  banner: null,
  bio: '',
  city: 'Lyon',
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: 'fr',
  updatedAt: WRITTEN_AT,
  ...overrides,
});

type Live = { readonly http: HTTPServer; readonly io: SocketIOServer; readonly clients: readonly ClientSocket[] };

const opened: Live[] = [];

afterEach(() => {
  opened.splice(0).forEach(({ http, io, clients }) => {
    clients.forEach((client) => client.close());
    void io.close();
    http.close();
  });
});

/** Un serveur où chaque socket rejoint la room personnelle de son compte, comme `AuthHandler` la range. */
const liveSockets = async (accounts: readonly string[]): Promise<Live> => {
  const http = createServer();
  const io = new SocketIOServer(http);
  io.on('connection', (socket) => {
    void socket.join(ROOMS.user(String(socket.handshake.auth.userId)));
    socket.emit('test:joined');
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address() as AddressInfo;
  const clients = await Promise.all(
    accounts.map(
      (userId) =>
        new Promise<ClientSocket>((resolve) => {
          const client = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false, auth: { userId } });
          client.on('test:joined', () => resolve(client));
        }),
    ),
  );
  const live = { http, io, clients };
  opened.push(live);
  return live;
};

const nextProfileUpdate = (client: ClientSocket, withinMs = 2000): Promise<ProfileUpdatedEventData> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`aucun ${SERVER_EVENTS.PROFILE_UPDATED} reçu en ${withinMs} ms`)), withinMs);
    client.once(SERVER_EVENTS.PROFILE_UPDATED, (data: ProfileUpdatedEventData) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

/** Ce qu'une socket reçoit pendant un délai — pour prouver qu'un partenaire ne reçoit RIEN. */
const recordProfileUpdates = (client: ClientSocket): (() => readonly ProfileUpdatedEventData[]) => {
  const received: ProfileUpdatedEventData[] = [];
  client.on(SERVER_EVENTS.PROFILE_UPDATED, (data: ProfileUpdatedEventData) => received.push(data));
  return () => received;
};

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makePrisma(served: Record<string, unknown>) {
  return {
    userPreferences: { findMany: jest.fn(async () => []) },
    userPreference: { findMany: jest.fn(async () => []) },
    userVoiceModel: { updateMany: jest.fn(async () => ({ count: 0 })) },
    messageAttachment: { findFirst: jest.fn(async () => ({ id: 'att-own' })) },
    participant: { updateMany: jest.fn(async () => ({ count: 2 })) },
    user: {
      findUnique: jest.fn(async () => aliceRow()),
      update: jest.fn(async () => served),
    },
  };
}

async function buildApp(params: {
  readonly route: (app: FastifyInstance) => Promise<void>;
  readonly served: Record<string, unknown>;
  readonly io: SocketIOServer | null;
}) {
  const app = Fastify({ logger: false });
  const emitUserUpdated = jest.fn(async () => undefined);
  app.decorate('prisma', makePrisma(params.served) as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as unknown as { authContext: unknown }).authContext = {
      isAuthenticated: true,
      userId: ALICE,
      registeredUser: { id: ALICE, role: 'USER', username: 'alice' },
    };
  });
  app.decorate('notificationService', { emitUserUpdated } as never);
  app.decorate('socketIOHandler', {
    getManager: () => ({
      getIO: () => params.io,
      refreshUserResolvedLanguages: jest.fn(),
      refreshUserTypingIdentity: jest.fn(),
    }),
  } as never);
  await params.route(app as unknown as FastifyInstance);
  await app.ready();
  return { app, emitUserUpdated };
}

describe('#18924 — la charge PROPRE de mon profil : l’instantané de ce que mes appareils affichent, rien d’autre', () => {
  it('les langues, le nom, la photo, la bannière et l’instant de l’écriture — ni e-mail, ni téléphone, ni présence', () => {
    const payload = ownProfileUpdatedPayload(aliceRow({ systemLanguage: 'en', regionalLanguage: 'es' }));

    expect(payload).toEqual({
      userId: ALICE,
      updatedAt: WRITTEN_AT.toISOString(),
      profile: {
        systemLanguage: 'en',
        regionalLanguage: 'es',
        customDestinationLanguage: null,
        displayName: 'Alice Cooper',
        firstName: 'Alice',
        lastName: 'Cooper',
        username: 'alice',
        avatar: null,
        banner: null,
      },
    });
    expect(profileUpdatedEventDataSchema.parse(payload)).toEqual(payload);
  });

  it('une ligne sans instant d’écriture ne se compose pas : on n’invente pas l’instant sur lequel les clients arbitrent', () => {
    const { updatedAt: _instant, ...withoutInstant } = aliceRow();

    expect(ownProfileUpdatedPayload(withoutInstant as never)).toBeNull();
  });
});

describe('#18924 — PATCH /users/me : une AUTRE socket du compte reçoit le changement, un partenaire jamais', () => {
  it('changer sa langue atteint l’autre appareil, avec le Prisme entier', async () => {
    const { io, clients } = await liveSockets([ALICE, ALICE, BOB]);
    const [, aliceOther, bob] = clients;
    const bobReceived = recordProfileUpdates(bob!);
    const { app, emitUserUpdated } = await buildApp({ route: updateUserProfile, served: aliceRow({ systemLanguage: 'en' }), io });
    const received = nextProfileUpdate(aliceOther!);

    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { systemLanguage: 'en' } });

    expect(res.statusCode).toBe(200);
    const event = await received;
    expect(event.userId).toBe(ALICE);
    expect(event.profile).toMatchObject({ systemLanguage: 'en', regionalLanguage: null, customDestinationLanguage: null });
    expect(profileUpdatedEventDataSchema.safeParse(event).success).toBe(true);
    await settle(150);
    expect(bobReceived()).toEqual([]);
    expect(emitUserUpdated).not.toHaveBeenCalled();
    await app.close();
  });

  it('changer son nom atteint l’autre appareil ; les partenaires gardent leur charge PUBLIQUE, sans langue', async () => {
    const { io, clients } = await liveSockets([ALICE, ALICE, BOB]);
    const [, aliceOther, bob] = clients;
    const bobReceived = recordProfileUpdates(bob!);
    const { app, emitUserUpdated } = await buildApp({
      route: updateUserProfile,
      served: aliceRow({ displayName: 'Alice C.' }),
      io,
    });
    const received = nextProfileUpdate(aliceOther!);

    await app.inject({ method: 'PATCH', url: '/users/me', payload: { displayName: 'Alice C.' } });

    expect((await received).profile).toMatchObject({ displayName: 'Alice C.', firstName: 'Alice', lastName: 'Cooper', username: 'alice' });
    await settle(150);
    expect(bobReceived()).toEqual([]);
    const [[partnerCall]] = emitUserUpdated.mock.calls as unknown as [[{ changes: Record<string, unknown> }]];
    expect(Object.keys(partnerCall.changes).sort()).toEqual(['displayName', 'firstName', 'lastName', 'username']);
    await app.close();
  });

  it('une bio seule ne touche aucun champ de l’instantané : rien n’est diffusé', async () => {
    const { io, clients } = await liveSockets([ALICE, ALICE]);
    const [, aliceOther] = clients;
    const aliceReceived = recordProfileUpdates(aliceOther!);
    const { app } = await buildApp({ route: updateUserProfile, served: aliceRow({ bio: 'Bonjour' }), io });

    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { bio: 'Bonjour' } });

    expect(res.statusCode).toBe(200);
    await settle(150);
    expect(aliceReceived()).toEqual([]);
    await app.close();
  });

  it('une ligne hors contrat ne part pas, et l’écriture faite répond 200 — elle ne se rapporte pas comme un échec', async () => {
    const { io, clients } = await liveSockets([ALICE, ALICE]);
    const [, aliceOther] = clients;
    const aliceReceived = recordProfileUpdates(aliceOther!);
    const { updatedAt: _instant, ...withoutInstant } = aliceRow({ systemLanguage: 'en' });
    const { app } = await buildApp({ route: updateUserProfile, served: withoutInstant, io });

    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { systemLanguage: 'en' } });

    expect(res.statusCode).toBe(200);
    await settle(150);
    expect(aliceReceived()).toEqual([]);
    await app.close();
  });

  it('sans couche Socket.IO, l’écriture répond quand même : la diffusion est un canal latéral', async () => {
    const { app } = await buildApp({ route: updateUserProfile, served: aliceRow({ systemLanguage: 'en' }), io: null });

    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { systemLanguage: 'en' } });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('#18924 — la photo et la bannière suivent le même chemin', () => {
  it('PATCH /users/me/avatar : l’autre appareil reçoit la nouvelle photo, le partenaire rien', async () => {
    const { io, clients } = await liveSockets([ALICE, ALICE, BOB]);
    const [, aliceOther, bob] = clients;
    const bobReceived = recordProfileUpdates(bob!);
    const { app } = await buildApp({ route: updateUserAvatar, served: aliceRow({ avatar: NEW_AVATAR }), io });
    const received = nextProfileUpdate(aliceOther!);

    const res = await app.inject({ method: 'PATCH', url: '/users/me/avatar', payload: { avatar: NEW_AVATAR } });

    expect(res.statusCode).toBe(200);
    expect((await received).profile.avatar).toBe(NEW_AVATAR);
    await settle(150);
    expect(bobReceived()).toEqual([]);
    await app.close();
  });

  it('PATCH /users/me/banner : l’autre appareil reçoit la nouvelle bannière', async () => {
    const { io, clients } = await liveSockets([ALICE, ALICE]);
    const [, aliceOther] = clients;
    const { app } = await buildApp({ route: updateUserBanner, served: aliceRow({ banner: NEW_BANNER }), io });
    const received = nextProfileUpdate(aliceOther!);

    const res = await app.inject({ method: 'PATCH', url: '/users/me/banner', payload: { banner: NEW_BANNER } });

    expect(res.statusCode).toBe(200);
    expect((await received).profile.banner).toBe(NEW_BANNER);
    await app.close();
  });
});

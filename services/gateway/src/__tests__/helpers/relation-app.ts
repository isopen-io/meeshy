/**
 * Une application Fastify de TÉMOIN pour les routes de cercles (#13933) : les
 * routes de demande ET les routes `/relations`, sur le double EN MÉMOIRE de
 * `relationStore`, avec un `io` qui NOTE ce qui part à qui — c'est l'ÉTAT obtenu
 * et les émissions qui parlent, jamais la clause envoyée.
 */
import { jest } from '@jest/globals';
import Fastify from 'fastify';
import { relationStore, type RelationStore } from './user-relation-store';

export const MOI = '507f1f77bcf86cd799439011';
export const AUTRE = '507f1f77bcf86cd799439022';
export const TIERS = '507f1f77bcf86cd799439033';
export const NOW = new Date('2026-10-31T12:00:00Z');
export const DAY = 86_400_000;

export const PARTIE = (id: string) => ({
  id, username: `u${id.slice(-2)}`, firstName: 'A', lastName: 'B', displayName: `U${id.slice(-2)}`, avatar: null, isOnline: false, lastActiveAt: null,
});

export type Emission = { readonly room: string; readonly event: string; readonly payload: unknown };

export const lien = (grantedByLow: string, grantedByHigh: string, extra: Record<string, unknown> = {}) => ({
  id: 'aa0000000000000000000099',
  userLowId: MOI < AUTRE ? MOI : AUTRE,
  userHighId: MOI < AUTRE ? AUTRE : MOI,
  grantedByLow,
  grantedByHigh,
  origin: 'request',
  transitions: [],
  levelSince: new Date(NOW.getTime() - 100 * DAY),
  ...extra,
});

export const demande = (
  id: string, status: string, senderId = MOI, receiverId = AUTRE, extra: Record<string, unknown> = {},
) => ({ id, senderId, receiverId, status, createdAt: new Date(NOW.getTime() - DAY), updatedAt: new Date(NOW.getTime() - DAY), ...extra });

/** Une semaine ISO entière, chacun ayant écrit à l'autre : le jour porte un message dans chaque sens. */
export const semaineActive = (weeksAgo: number, userLowId: string, userHighId: string) => {
  const monday = new Date(Date.UTC(2026, 9, 26));
  const day = new Date(monday.getTime() - weeksAgo * 7 * DAY);
  return {
    userLowId, userHighId, day: day.toISOString().slice(0, 10),
    byLowMessage: 1, byHighMessage: 1,
  };
};

export type AppOptions = {
  readonly userId?: string;
  readonly demandes?: ReadonlyArray<Record<string, unknown>>;
  readonly liens?: ReadonlyArray<Record<string, unknown>>;
  readonly jours?: ReadonlyArray<Record<string, unknown>>;
  readonly bloques?: ReadonlyArray<string>;
  readonly naissances?: Readonly<Record<string, Date | null>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly cache?: Map<string, string>;
};

export type TestApp = {
  readonly store: RelationStore;
  readonly emissions: Emission[];
  readonly notifier: Record<string, jest.Mock>;
  readonly consents: Record<string, unknown>[];
  readonly call: (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, body?: unknown, as?: string) => Promise<{ status: number; body: any }>;
  readonly close: () => Promise<void>;
};

const CACHE = new Map<string, string>();

export async function buildRelationApp(
  register: (app: ReturnType<typeof Fastify>) => Promise<void>,
  options: AppOptions = {},
): Promise<TestApp> {
  const store = relationStore({ friendRequests: options.demandes ?? [], relations: options.liens ?? [] });
  const emissions: Emission[] = [];
  const consents: Record<string, unknown>[] = [];
  const jours = [...(options.jours ?? [])];
  const notifier = {
    createFriendRequestNotification: jest.fn(async () => undefined),
    emitFriendRequestNew: jest.fn(),
    emitFriendRequestCancelled: jest.fn(),
    emitFriendRequestRejected: jest.fn(),
    emitFriendRequestAccepted: jest.fn(),
    retractFriendRequestNotifications: jest.fn(async () => undefined),
    markFriendRequestNotificationsAsRead: jest.fn(async () => undefined),
    createFriendAcceptedNotification: jest.fn(async () => undefined),
    createSystemNotification: jest.fn(async () => undefined),
  };
  const users = new Map<string, Record<string, unknown>>(
    [MOI, AUTRE, TIERS].map((id) => [id, {
      id, deactivatedAt: null, blockedUserIds: options.bloques && id === AUTRE ? [...options.bloques] : [],
      birthDate: options.naissances?.[id] ?? null, username: `u${id.slice(-2)}`, displayName: `U${id.slice(-2)}`,
    }]),
  );
  const prisma = {
    user: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => users.get(args.where.id) ?? null),
      findMany: jest.fn(async () => []),
    },
    friendRequest: {
      ...store.prisma.friendRequest,
      update: jest.fn(async (args: Parameters<typeof store.prisma.friendRequest.update>[0]) => {
        const row = await store.prisma.friendRequest.update(args);
        return { ...row, sender: PARTIE(String(row.senderId)), receiver: PARTIE(String(row.receiverId)) };
      }),
      create: jest.fn(async (args: Parameters<typeof store.prisma.friendRequest.create>[0]) => {
        const row = await store.prisma.friendRequest.create(args);
        return { ...row, sender: PARTIE(String(row.senderId)), receiver: PARTIE(String(row.receiverId)) };
      }),
    },
    userRelation: store.prisma.userRelation,
    pairInteractionDay: { findMany: jest.fn(async () => jours) },
    relationFeatureSetting: {
      upsert: jest.fn(async (args: { create: Record<string, unknown> }) => { consents.push(args.create); return args.create; }),
    },
    conversation: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 'convid00000000000000001', identifier: 'abc', type: 'direct' })),
    },
  };
  const io = {
    to: (room: string) => ({ emit: (event: string, payload: unknown) => { emissions.push({ room, event, payload }); } }),
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('notificationService', notifier as never);
  app.decorate('socialEvents', null as never);
  app.decorate('redis', null as never);
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io, joinUserToConversationRoom: async () => undefined }) } as never);
  let acting = options.userId ?? MOI;
  app.decorate('authenticate', async (req: object) => {
    Object.assign(req, {
      user: { userId: acting },
      authContext: { isAuthenticated: true, type: 'user', userId: acting, registeredUser: { id: acting, role: 'USER' } },
    });
  });
  await register(app);
  await app.ready();
  void CACHE;
  return {
    store, emissions, notifier, consents,
    call: async (method, url, body, as) => {
      acting = as ?? options.userId ?? MOI;
      const res = await app.inject({
        method, url,
        headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
    },
    close: () => app.close(),
  };
}

/** Fige l'horloge sur `at` SANS toucher aux minuteries : Fastify et les doubles continuent de tourner. */
export function freezeClock(at: Date = NOW): void {
  jest.useFakeTimers({
    now: at,
    doNotFake: [
      'nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
      'queueMicrotask', 'performance', 'hrtime', 'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback',
    ],
  });
}

export const thawClock = (): void => { jest.useRealTimers(); };

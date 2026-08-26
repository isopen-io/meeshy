/**
 * Unit tests for conversations/ban.ts
 * Tests PATCH /conversations/:id/participants/:userId/ban
 *       PATCH /conversations/:id/participants/:userId/unban
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { makeChainableIO } from '../../helpers/chainable-io';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>().mockResolvedValue(null),
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    CONVERSATION_PARTICIPANT_BANNED: 'conversation:participant-banned',
    CONVERSATION_PARTICIPANT_UNBANNED: 'conversation:participant-unbanned',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerBanRoutes } from '../../../routes/conversations/ban';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const TARGET_USER_ID = '507f1f77bcf86cd799439022';
const CONV_ID = 'conv-aabbcc';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeSocketIO() {
  const mockFetchSockets = jest.fn<any>().mockResolvedValue([{ leave: jest.fn() }]);
  const mockIo = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    in: jest.fn().mockReturnValue({ fetchSockets: mockFetchSockets }),
  };
  const mockManager = {
    getIO: jest.fn().mockReturnValue(mockIo),
    invalidateParticipantCache: jest.fn(),
    endLiveLocationForDepartedMember: jest.fn(),
  };
  return { mockIo, mockManager, mockFetchSockets };
}

function makePrisma(overrides: any = {}) {
  // `...overrides` d'ABORD : placé après, il réécrasait `participant` en entier
  // avec la version du test, annulant la fusion par clé que la ligne
  // `...overrides.participant` prétend faire — tout défaut non redéclaré par le
  // test disparaissait silencieusement.
  return {
    ...overrides,
    participant: {
      findFirst: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
      // Membres actifs APRÈS l'écriture : rooms personnelles de la diffusion,
      // et effectif absolu du payload.
      findMany: jest.fn<any>().mockResolvedValue([{ id: 'part-other', userId: 'user-other' }]),
      ...overrides.participant,
    },
  };
}

async function buildApp({
  prismaOverrides = {} as any,
  withSocket = true,
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma>; socket: ReturnType<typeof makeSocketIO> }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = makePrisma(prismaOverrides);
  const socket = makeSocketIO();

  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  });

  app.decorate('socketIOHandler', withSocket ? {
    getManager: () => socket.mockManager,
  } : null as any);

  const requiredAuth = async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerBanRoutes(app, prisma as any, null, requiredAuth);
  await app.ready();
  return { app, prisma, socket };
}

// ─── PATCH /conversations/:id/participants/:userId/ban ────────────────────────

describe('PATCH /conversations/:id/participants/:userId/ban — caller not in conversation', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue(null),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when caller is not a member', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/ban` });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /conversations/:id/participants/:userId/ban — target not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'admin' })
            .mockResolvedValueOnce(null),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when target participant is not found', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/ban` });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /conversations/:id/participants/:userId/ban — already banned', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'admin' })
            .mockResolvedValueOnce({ id: 'part-target', userId: TARGET_USER_ID, role: 'member', bannedAt: new Date(), displayName: 'Bob' }),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 when target is already banned', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/ban` });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /conversations/:id/participants/:userId/ban — insufficient role', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'member' })       // caller is member (level 10)
            .mockResolvedValueOnce({ id: 'part-target', userId: TARGET_USER_ID, role: 'admin', bannedAt: null, displayName: 'Bob' }), // target is admin (level 30)
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when caller has equal or lower role than target', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/ban` });
    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /conversations/:id/participants/:userId/ban — success', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  let socket: ReturnType<typeof makeSocketIO>;
  beforeAll(async () => {
    ({ app, prisma, socket } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'admin' })
            .mockResolvedValueOnce({ id: 'part-target', userId: TARGET_USER_ID, role: 'member', bannedAt: null, displayName: 'Bob' }),
          update: jest.fn<any>().mockResolvedValue({}),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when admin bans a member', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/ban` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('calls prisma.participant.update with bannedAt and isActive=false', async () => {
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false }),
      }),
    );
  });

  it('emits CONVERSATION_PARTICIPANT_BANNED socket event', async () => {
    expect(socket.mockIo.emit).toHaveBeenCalledWith(
      'conversation:participant-banned',
      expect.objectContaining({ userId: TARGET_USER_ID }),
    );
  });

  it("éteint le partage de position du banni — le fil VIT, et il n'a plus le pouvoir de l'arrêter", () => {
    // Le bannissement retire l'appartenance, et `location:live-stop` la résout
    // avant tout (`isActive: true`) : le seul verbe capable de retirer
    // l'épingle tombe donc en silence. Sans cette extinction, la position réelle
    // du banni reste affichée au groupe qui vient de l'exclure.
    expect(socket.mockManager.endLiveLocationForDepartedMember).toHaveBeenCalledWith(
      CONV_ID,
      TARGET_USER_ID,
    );
  });
});

// ─── PATCH /conversations/:id/participants/:userId/unban ──────────────────────

describe('PATCH /conversations/:id/participants/:userId/unban — caller not in conversation', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue(null),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when caller is not a member', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/unban` });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /conversations/:id/participants/:userId/unban — caller is member (insufficient role)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'member' }),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when caller is not admin or creator', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/unban` });
    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /conversations/:id/participants/:userId/unban — banned participant not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'admin' })
            .mockResolvedValueOnce(null),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when no banned participant is found', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/unban` });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /conversations/:id/participants/:userId/unban — success', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  let socket: ReturnType<typeof makeSocketIO>;
  beforeAll(async () => {
    ({ app, prisma, socket } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'admin' })
            .mockResolvedValueOnce({ id: 'part-target', userId: TARGET_USER_ID , bannedAt: new Date('2026-08-01T00:00:00.000Z') }),
          update: jest.fn<any>().mockResolvedValue({}),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when admin unbans a participant', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/unban` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('restores participant with bannedAt=null and isActive=true', async () => {
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bannedAt: null, isActive: true }),
      }),
    );
  });

  it('emits CONVERSATION_PARTICIPANT_UNBANNED socket event', async () => {
    expect(socket.mockIo.emit).toHaveBeenCalledWith(
      'conversation:participant-unbanned',
      expect.objectContaining({ userId: TARGET_USER_ID }),
    );
  });
});

/**
 * Le banni n'était joignable que par la room de conversation — donc seulement
 * s'il avait le FIL ouvert à cet instant. Sur l'écran de liste, ses appareils
 * n'apprenaient rien : la ligne restait, cliquable, alors que
 * `GET /conversations` ne la sert plus (`participants.some({ isActive: true })`),
 * et les deux clients la persistent. Elle ne disparaissait qu'au prochain delta
 * `updatedSince=` (tombstone `bannedAt`) — au mieux à la reconnexion suivante,
 * au pire 24 h plus tard (`fullReconcileInterval`).
 *
 * Même écart, même raison, même correctif que `leave.ts` et que le retrait par
 * un admin : les trois fins d'appartenance adressent désormais la room
 * personnelle de celui qu'elles sortent.
 */
describe('PATCH …/ban — les AUTRES appareils du banni', () => {
  let app: FastifyInstance;
  let io: ReturnType<typeof makeChainableIO>;

  beforeAll(async () => {
    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    io = makeChainableIO();
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>()
          .mockResolvedValueOnce({ id: 'part-actor', role: 'creator', userId: USER_ID })
          .mockResolvedValue({
            id: 'part-target', userId: TARGET_USER_ID,
            role: 'member',
            bannedAt: null,
            displayName: 'Target',
            isActive: true,
            leftAt: null,
          }),
        findMany: jest.fn<any>().mockResolvedValue([
          { id: 'part-witness', userId: 'user-witness' },
          { id: 'part-anon', userId: null },
        ]),
      },
    });
    app.decorate('socketIOHandler', {
      getManager: () => ({ getIO: () => io, invalidateParticipantCache: jest.fn() }),
    } as any);
    registerBanRoutes(app, prisma as any, null, async (req: any) => {
      req.authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } };
    });
    await app.ready();
    await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/ban` });
  });

  afterAll(async () => { await app.close(); });

  it('chaîne la room PERSONNELLE du banni, après celles des restants', () => {
    expect(io._roomsFor('conversation:participant-banned')).toEqual([
      `conversation:${CONV_ID}`,
      'user:user-witness',
      'user:part-anon',
      `user:${TARGET_USER_ID}`,
    ]);
  });

  it("n'émet qu'UNE fois — un appareil du banni resté dans la room ne double pas", () => {
    expect(io._sent.filter((s) => s.event === 'conversation:participant-banned')).toHaveLength(1);
  });
});

/**
 * Lot 1 — l'effectif ENTIER pour l'admin du groupe, des DEUX côtés du
 * bannissement. Un broadcast unique ne portait que la présentation plafonnée :
 * l'admin qui venait de lire 250 par REST le voyait retomber à « 199+ » au
 * premier bannissement, et les deux clients persistent la valeur reçue.
 */
describe('PATCH …/ban et …/unban — l\'effectif ENTIER pour l\'admin du groupe', () => {
  const BIG_AUDIENCE = [
    { id: 'part-admin', userId: 'user-admin', role: 'admin', user: { role: 'USER' } },
    ...Array.from({ length: 249 }, (_, i) => ({
      id: `part-big-${i}`,
      userId: null,
      role: 'member',
      user: null,
    })),
  ];

  async function runBanRoute(url: string, findFirst: any) {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    const io = makeChainableIO();
    const prisma = makePrisma({
      participant: {
        findFirst,
        findMany: jest.fn<any>().mockResolvedValue(BIG_AUDIENCE),
      },
    });
    app.decorate('socketIOHandler', {
      getManager: () => ({ getIO: () => io, invalidateParticipantCache: jest.fn() }),
    } as any);
    registerBanRoutes(app, prisma as any, null, async (req: any) => {
      req.authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } };
    });
    await app.ready();
    await app.inject({ method: 'PATCH', url });
    await app.close();
    return io;
  }

  it('sert 250 à l\'admin du groupe sur le bannissement', async () => {
    const io = await runBanRoute(
      `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/ban`,
      jest.fn<any>()
        .mockResolvedValueOnce({ id: 'part-actor', role: 'creator', userId: USER_ID })
        .mockResolvedValue({
          id: 'part-target', userId: TARGET_USER_ID,
          role: 'member',
          bannedAt: null,
          displayName: 'Target',
          isActive: true,
          leftAt: null,
        })
    );

    const sends = io._sendsFor('conversation:participant-banned');
    expect(sends).toHaveLength(2);
    expect(sends[0].payload).toMatchObject({ memberCount: 199, memberCountCapped: true });
    expect(sends[0].excepts).toEqual(['user:user-admin']);
    expect(sends[1].rooms).toEqual(['user:user-admin']);
    expect(sends[1].payload).toMatchObject({ memberCount: 250 });
  });

  it('sert 250 à l\'admin du groupe sur la levée', async () => {
    const io = await runBanRoute(
      `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/unban`,
      jest.fn<any>()
        .mockResolvedValueOnce({ id: 'part-caller', role: 'admin' })
        .mockResolvedValueOnce({ id: 'part-target', userId: TARGET_USER_ID , bannedAt: new Date('2026-08-01T00:00:00.000Z') })
    );

    const sends = io._sendsFor('conversation:participant-unbanned');
    expect(sends).toHaveLength(2);
    expect(sends[0].payload).toMatchObject({ memberCount: 199, memberCountCapped: true });
    expect(sends[1].rooms).toEqual(['user:user-admin']);
    expect(sends[1].payload).toMatchObject({ memberCount: 250 });
  });
});

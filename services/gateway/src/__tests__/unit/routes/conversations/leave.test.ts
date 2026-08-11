/**
 * Unit tests for conversations leave route (leave.ts)
 * Tests POST /conversations/:id/leave.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('conv-resolved-id');
const mockInvalidateParticipantLookup = jest.fn();

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: (...args: any[]) => mockInvalidateParticipantLookup(...args),
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    CONVERSATION_PARTICIPANT_LEFT: 'conversation:participant-left',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerLeaveRoutes } from '../../../../routes/conversations/leave';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';

const mockParticipant = {
  id: PART_ID,
  conversationId: CONV_ID,
  userId: USER_ID,
  role: 'member',
  displayName: 'Alice',
  isActive: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    } else {
      (req as any).authContext = { isAuthenticated: false, userId: null };
    }
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(mockParticipant),
      count: jest.fn<any>().mockResolvedValue(0),
      update: jest.fn<any>().mockResolvedValue({ ...mockParticipant, isActive: false }),
      // Membres restants APRÈS le départ — la ligne qui vient d'être désactivée
      // est hors du `where`. Ils nomment les rooms personnelles ET portent
      // l'effectif du payload.
      findMany: jest.fn<any>().mockResolvedValue([
        { id: 'p-other', userId: 'user-other' },
      ]),
    },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, isActive: false }),
    },
    ...overrides,
  };
}

/**
 * `.to()` rend un émetteur CHAÎNABLE et retient les rooms de CHAQUE chaîne :
 * `to(a).to(b).emit()` est la forme que produit
 * `emitToConversationParticipants` pour ne livrer qu'une copie par socket, et
 * `expect(io.to).toHaveBeenCalledWith(room)` ne peut pas distinguer « adressé
 * dans la chaîne qui a émis » de « adressé ailleurs ».
 */
function captureEmits() {
  const sent: Array<{ rooms: string[]; event: string; payload: any }> = [];
  const chain = (rooms: string[]): any => ({
    to: (room: string) => chain([...rooms, room]),
    emit: (event: string, payload: unknown) => { sent.push({ rooms, event, payload }); },
  });
  const io = {
    to: jest.fn((room: string) => chain([room])),
    emit: jest.fn(),
    in: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([]),
  };
  return {
    io,
    roomsFor: (event: string) => sent.filter((s) => s.event === event).flatMap((s) => s.rooms),
    payloadFor: (event: string) => sent.find((s) => s.event === event)?.payload,
  };
}

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
  withSocket?: boolean;
  io?: any;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma = makePrisma(), withSocket = false } = opts;

  const app = Fastify({ logger: false });
  const requiredAuth = makePreValidationAuth(authenticated);

  if (withSocket) {
    const mockIO = opts.io ?? {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      in: jest.fn().mockReturnThis(),
      fetchSockets: jest.fn<any>().mockResolvedValue([]),
    };
    app.decorate('socketIOHandler', {
      getManager: jest.fn(() => ({
        getIO: jest.fn(() => mockIO),
        invalidateParticipantCache: jest.fn(),
      })),
    });
  } else {
    app.decorate('socketIOHandler', null as any);
  }

  registerLeaveRoutes(app, prisma as any, jest.fn(), requiredAuth);
  await app.ready();
  return app;
}

// ─── POST /conversations/:id/leave ───────────────────────────────────────────

describe('POST /conversations/:id/leave — not a participant', () => {
  it('returns 404 when user is not in the conversation', async () => {
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        count: jest.fn<any>().mockResolvedValue(0),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /conversations/:id/leave — success as member', () => {
  it('returns 200 when member leaves successfully', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.conversationId).toBeDefined();
    await app.close();
  });
});

describe('POST /conversations/:id/leave — creator with other members', () => {
  it('returns 400 when creator tries to leave without transferring ownership', async () => {
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue({ ...mockParticipant, role: 'creator' }),
        count: jest.fn<any>().mockResolvedValue(3), // other active members
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /conversations/:id/leave — creator alone in conversation', () => {
  it('returns 200 and deactivates conversation when creator is last member', async () => {
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue({ ...mockParticipant, role: 'creator' }),
        count: jest.fn<any>().mockResolvedValue(0), // no other members
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /conversations/:id/leave — success with socket events', () => {
  it('returns 200 and emits socket events', async () => {
    const app = await buildApp({ withSocket: true });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  // La ligne de LISTE rend l'effectif ; un membre posé sur cet écran a quitté
  // `conversation:<id>` et n'est joignable que par sa room personnelle. Le
  // commentaire de la route nommait pourtant l'écran de liste depuis toujours.
  it('adresse la room personnelle des membres restants, pas seulement le fil', async () => {
    const captured = captureEmits();
    const app = await buildApp({ withSocket: true, io: captured.io });
    await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });

    const rooms = captured.roomsFor('conversation:participant-left');
    expect(rooms).toContain('conversation:conv-resolved-id');
    expect(rooms).toContain('user:user-other');
    await app.close();
  });

  it('porte l\'effectif ABSOLU restant, pas un delta', async () => {
    const captured = captureEmits();
    const prisma = makePrisma();
    prisma.participant.findMany = jest.fn<any>().mockResolvedValue([
      { id: 'p-1', userId: 'user-1' },
      { id: 'p-2', userId: null },
    ]);
    const app = await buildApp({ withSocket: true, io: captured.io, prisma });
    await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });

    expect(captured.payloadFor('conversation:participant-left')).toMatchObject({ memberCount: 2 });
    await app.close();
  });
});

describe('POST /conversations/:id/leave — participant lookup cache invalidation', () => {
  it('invalidates the cached participant lookup for the leaving member', async () => {
    mockInvalidateParticipantLookup.mockClear();
    const app = await buildApp();
    await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
    expect(mockInvalidateParticipantLookup).toHaveBeenCalledWith(PART_ID, 'conv-resolved-id');
    await app.close();
  });
});

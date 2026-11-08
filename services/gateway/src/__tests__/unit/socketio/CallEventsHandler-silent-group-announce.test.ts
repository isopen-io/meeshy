/**
 * #14644 — un appel lancé dans un groupe SILENCIEUX (créé, aucun message encore)
 * l'annonce d'abord, exactement comme un premier message : `conversation:new`
 * et l'invitation partent vers les invités AVANT `call:initiated`. Personne
 * n'est sonné depuis un groupe qu'il ne voit pas.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockInitiateCall = jest.fn<any>();
const mockScheduleRingingTimeout = jest.fn<any>();
const mockGetUnrespondedParticipants = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn().mockImplementation(() => ({
    initiateCall: mockInitiateCall,
    generateIceServers: jest.fn<any>().mockReturnValue([]),
    scheduleRingingTimeout: mockScheduleRingingTimeout,
    createCallSummaryMessage: jest.fn<any>().mockResolvedValue(null),
    createLiveCallMessage: jest.fn<any>().mockResolvedValue(null),
    clearRingingTimeout: jest.fn<any>(),
    getUnrespondedParticipants: mockGetUnrespondedParticipants,
    markCallAsMissed: jest.fn<any>().mockResolvedValue(undefined),
    getIceServerTtl: jest.fn<any>().mockReturnValue(86400),
  })),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn((_schema: unknown, data: unknown) => ({ success: true, data })),
  isValidationFailure: jest.fn((r: { success: boolean }) => !r.success),
}));

jest.mock('../../../utils/socket-rate-limiter', () => ({
  getSocketRateLimiter: jest.fn().mockReturnValue({ checkLimit: jest.fn(), destroy: jest.fn() }),
  checkSocketRateLimit: jest.fn<any>().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    CALL_INITIATE: { maxRequests: 5, windowMs: 60000, keyPrefix: 'socket:call:initiate' },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';
import { openCallRingTables } from '../../helpers/call-ring-policy-tables';

const CALLER = '507f1f77bcf86cd799439101';
const ALICE = '507f1f77bcf86cd799439102';
const CALL_ID = '507f1f77bcf86cd799439111';
const CONV_ID = '507f1f77bcf86cd799439112';

const callSession = () => ({
  id: CALL_ID,
  conversationId: CONV_ID,
  initiatorId: CALLER,
  mode: 'sfu',
  metadata: { type: 'audio' },
  initiator: { id: CALLER, username: 'caller', displayName: 'Caller', avatar: null },
  conversation: { type: 'group', title: 'Équipe' },
  participants: [],
});

const groupRow = () => ({
  id: CONV_ID,
  type: 'group',
  title: 'Équipe',
  createdAt: new Date('2026-11-02T09:00:00.000Z'),
  participants: [
    { userId: CALLER, role: 'creator', messageRequestAt: null, user: { id: CALLER, displayName: 'Caller', username: 'caller', avatar: null, firstName: null, lastName: null } },
    { userId: ALICE, role: 'member', messageRequestAt: null, user: { id: ALICE, displayName: 'Alice', username: 'alice', avatar: null, firstName: null, lastName: null } },
  ],
});

const makePrisma = (silent: boolean) =>
  ({
    ...openCallRingTables(),
    conversation: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: silent ? 1 : 0 }),
      findUnique: jest.fn<any>().mockResolvedValue(groupRow()),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-caller' }),
      findMany: jest.fn<any>().mockResolvedValue([{ userId: CALLER }, { userId: ALICE }]),
    },
    callSession: { findUnique: jest.fn<any>().mockResolvedValue(callSession()) },
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    pushToken: { findMany: jest.fn<any>().mockResolvedValue([]) },
  }) as any;

const makeHarness = (prisma: any) => {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-caller',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn<any>(),
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    data: {},
  };
  const timeline: string[] = [];
  const io = {
    to: jest.fn((room: string) => ({ emit: jest.fn((event: string) => timeline.push(`${event}@${room}`)) })),
    in: jest.fn((room: string) => ({
      fetchSockets: jest.fn(async () =>
        room === ROOMS.user(ALICE)
          ? [{ id: 'socket-alice', data: {}, emit: jest.fn((event: string) => timeline.push(`${event}@${room}`)) }]
          : []
      ),
    })),
  };
  const createConversationInviteNotification = jest.fn<any>().mockResolvedValue(null);
  const handler = new CallEventsHandler(prisma);
  handler.setPushNotificationService({ sendToUser: jest.fn<any>().mockResolvedValue(undefined) } as any);
  handler.setNotificationService({ createConversationInviteNotification, createMissedCallNotification: jest.fn<any>() } as any);
  handler.setupCallEvents(socket as any, io as any, () => CALLER);
  const initiate = () => handlers[CALL_EVENTS.INITIATE]({ conversationId: CONV_ID, type: 'audio' }, jest.fn<any>());
  return { initiate, timeline, createConversationInviteNotification };
};

describe('call:initiate — un groupe silencieux s\'annonce avant de sonner (#14644)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPrivacyPreferencesCache();
    mockInitiateCall.mockResolvedValue(callSession());
  });

  it('conversation:new part vers l\'invité AVANT call:initiated, et l\'invitation part', async () => {
    const { initiate, timeline, createConversationInviteNotification } = makeHarness(makePrisma(true));

    await initiate();

    const announced = timeline.indexOf(`${SERVER_EVENTS.CONVERSATION_NEW}@${ROOMS.user(ALICE)}`);
    const rung = timeline.indexOf(`${CALL_EVENTS.INITIATED}@${ROOMS.user(ALICE)}`);
    expect(announced).toBeGreaterThanOrEqual(0);
    expect(rung).toBeGreaterThan(announced);
    expect(createConversationInviteNotification).toHaveBeenCalledWith(expect.objectContaining({ invitedUserId: ALICE, conversationId: CONV_ID }));
  });

  it('un groupe déjà démarré n\'est pas annoncé une seconde fois, et sonne', async () => {
    const { initiate, timeline, createConversationInviteNotification } = makeHarness(makePrisma(false));

    await initiate();

    expect(timeline).not.toContain(`${SERVER_EVENTS.CONVERSATION_NEW}@${ROOMS.user(ALICE)}`);
    expect(timeline).toContain(`${CALL_EVENTS.INITIATED}@${ROOMS.user(ALICE)}`);
    expect(createConversationInviteNotification).not.toHaveBeenCalled();
  });
});

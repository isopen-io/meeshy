/**
 * « Appels hors contacts » (#8073) — côté éventail de sonnerie.
 *
 * Dans un appel de GROUPE, un membre qui a coupé le réglage et n'est pas ami
 * de l'appelant n'est simplement pas sonné : ni `call:initiated`, ni push
 * d'appel entrant, ni « appel manqué » ensuite. Les autres sonnent.
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
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';
import { closedCallRingTables, openCallRingTables } from '../../helpers/call-ring-policy-tables';

const CALLER = '507f1f77bcf86cd799439101';
const FRIEND = '507f1f77bcf86cd799439102';
const STRANGER = '507f1f77bcf86cd799439103';
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

const makePrisma = (ringTables: ReturnType<typeof openCallRingTables>) =>
  ({
    ...ringTables,
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-caller' }),
      findMany: jest.fn<any>().mockResolvedValue([{ userId: CALLER }, { userId: FRIEND }, { userId: STRANGER }]),
    },
    callSession: { findUnique: jest.fn<any>().mockResolvedValue(callSession()) },
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    pushToken: { findMany: jest.fn<any>().mockResolvedValue([]) },
  }) as unknown as PrismaClient;

const friendship = [{ senderId: CALLER, receiverId: FRIEND }];

const makeHarness = (prisma: PrismaClient, onlineUserIds: ReadonlyArray<string> = []) => {
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
  const initiatedTo: string[] = [];
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    in: jest.fn((room: string) => ({
      fetchSockets: jest.fn(async () =>
        onlineUserIds
          .filter((id) => ROOMS.user(id) === room)
          .map((id) => ({
            id: `socket-${id}`,
            data: {},
            emit: jest.fn((event: string) => {
              if (event === CALL_EVENTS.INITIATED) initiatedTo.push(id);
            }),
          }))
      ),
    })),
  };
  const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
  const createMissedCallNotification = jest.fn<any>().mockResolvedValue(null);
  const handler = new CallEventsHandler(prisma);
  handler.setPushNotificationService({ sendToUser } as any);
  handler.setNotificationService({ createMissedCallNotification } as any);
  handler.setupCallEvents(socket as any, io as any, () => CALLER);
  const initiate = () => handlers[CALL_EVENTS.INITIATE]({ conversationId: CONV_ID, type: 'audio' }, jest.fn<any>());
  return { handler, initiate, sendToUser, createMissedCallNotification, initiatedTo };
};

const pushedUserIds = (sendToUser: jest.Mock<any>) =>
  [...new Set(sendToUser.mock.calls.map((call) => (call[0] as { userId: string }).userId))];

describe('call:initiate — « Appels hors contacts » dans un appel de groupe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPrivacyPreferencesCache();
    mockInitiateCall.mockResolvedValue(callSession());
  });

  it("n'envoie aucun push d'appel entrant au non-contact qui a coupé le réglage, et sonne l'ami", async () => {
    const { initiate, sendToUser } = makeHarness(makePrisma(closedCallRingTables(friendship)));

    await initiate();

    expect(pushedUserIds(sendToUser)).toEqual([FRIEND]);
  });

  it("n'émet pas call:initiated vers les sockets du non-contact", async () => {
    const { initiate, initiatedTo } = makeHarness(makePrisma(closedCallRingTables(friendship)), [FRIEND, STRANGER]);

    await initiate();

    expect(initiatedTo).toEqual([FRIEND]);
  });

  it('sonne tout le monde quand le réglage est ouvert', async () => {
    const { initiate, sendToUser } = makeHarness(makePrisma(openCallRingTables()));

    await initiate();

    expect(pushedUserIds(sendToUser).sort()).toEqual([FRIEND, STRANGER].sort());
  });

  it("n'annonce pas d'appel manqué au non-contact qui n'a pas sonné", async () => {
    mockGetUnrespondedParticipants.mockResolvedValue([FRIEND, STRANGER]);
    const { handler, createMissedCallNotification } = makeHarness(makePrisma(closedCallRingTables(friendship)));

    await handler.createMissedCallNotifications(CALL_ID);

    expect(createMissedCallNotification).toHaveBeenCalledTimes(1);
    expect(createMissedCallNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: FRIEND, callerId: CALLER, callSessionId: CALL_ID })
    );
  });
});

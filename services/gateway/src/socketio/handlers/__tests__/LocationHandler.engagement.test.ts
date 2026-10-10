/**
 * `location:live-start` crédite `tool.location`, variante `live` (#8959) — au
 * partage DÉMARRÉ seulement, jamais sur un refus ni pour un anonyme.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockGetConnectedUser = jest.fn() as jest.Mock<any>;

jest.mock('../../utils/socket-helpers', () => ({
  getConnectedUser: (...args: unknown[]) => mockGetConnectedUser(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

jest.mock('../../../utils/socket-rate-limiter.js', () => ({
  getSocketRateLimiter: () => ({ checkLimit: async () => true }),
  SOCKET_RATE_LIMITS: { LOCATION_LIVE_START: {}, LOCATION_LIVE_UPDATE: {}, LOCATION_LIVE_STOP: {} },
}));

import { LocationHandler } from '../LocationHandler';
import type { Socket } from 'socket.io';

const SOCKET_ID = 'socket-sharer';
const USER_ID = '507f1f77bcf86cd799439001';
const CONV_ID = '507f1f77bcf86cd799439011';

function build(options: { anonymous?: boolean; member?: boolean; closed?: boolean } = {}) {
  mockGetConnectedUser.mockReturnValue({
    user: { id: USER_ID, isAnonymous: Boolean(options.anonymous), participantId: 'p-1', displayName: 'Alice' },
    realUserId: USER_ID,
  });
  const engagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) };
  const handler = new LocationHandler({
    io: { to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }) } as any,
    prisma: {
      participant: { findFirst: jest.fn<any>().mockResolvedValue(options.member === false ? null : { id: 'p-1' }) },
      conversation: {
        findUnique: jest.fn<any>().mockResolvedValue(
          options.closed ? { isActive: false, closedAt: new Date() } : { isActive: true, closedAt: null },
        ),
      },
    } as any,
    connectedUsers: new Map(),
    socketToUser: new Map([[SOCKET_ID, USER_ID]]),
    normalizeConversationId: async (id: string) => id,
    engagement,
  });
  const socket = {
    id: SOCKET_ID,
    emit: jest.fn(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
  } as unknown as Socket;
  const callback = jest.fn();
  const start = (payload: Record<string, unknown> = {}) =>
    handler.handleLiveLocationStart(
      socket,
      { latitude: 48.8566, longitude: 2.3522, conversationId: CONV_ID, durationMinutes: 30, ...payload } as any,
      callback,
    );
  return { start, engagement, callback };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('tool.location — partage en direct', () => {
  beforeEach(() => jest.clearAllMocks());

  it('crédite le partageur, variante live, dans la conversation', async () => {
    const { start, engagement, callback } = build();
    await start();
    await flush();

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(engagement.recordActivity).toHaveBeenCalledWith(USER_ID, 'tool.location', {
      conversationId: CONV_ID,
      variant: 'live',
    });
  });

  it('ne crédite rien à un anonyme', async () => {
    const { start, engagement } = build({ anonymous: true });
    await start();
    await flush();

    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('ne crédite rien quand le départ est refusé', async () => {
    const outsider = build({ member: false });
    await outsider.start();
    const closed = build({ closed: true });
    await closed.start();
    const invalid = build();
    await invalid.start({ durationMinutes: 9999 });
    await flush();

    expect(outsider.engagement.recordActivity).not.toHaveBeenCalled();
    expect(closed.engagement.recordActivity).not.toHaveBeenCalled();
    expect(invalid.engagement.recordActivity).not.toHaveBeenCalled();
  });
});

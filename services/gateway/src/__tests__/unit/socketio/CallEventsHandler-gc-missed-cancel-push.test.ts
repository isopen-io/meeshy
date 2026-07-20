/**
 * CallEventsHandler — sendMissedCallCancellationPushForTerminatedCall
 *
 * Phantom-ringing safety net: `CallCleanupService`'s GC tier 1 (initiated/
 * ringing > 120s → missed) is the fallback for when the in-process ringing
 * timer never fired (crash before boot rehydration, or the timer callback
 * itself threw). Every OTHER missed-call path (the normal ringing timeout,
 * via `broadcastCallEnded` → `sendCallCancellationPushes`) sends a silent
 * `call_cancel` APNs push to conversation members who never joined the call
 * room — the socket-fanout `call:ended` never reaches them because they have
 * no live socket in `ROOMS.call`/`ROOMS.conversation`/`ROOMS.user`. Without
 * this wrapper, `CallCleanupService` had no way to trigger that push, so a
 * phantom-ringing callee reaped by the GC safety net kept ringing until its
 * own client-side timeout.
 *
 * This wrapper is a thin adapter around the existing private
 * `sendCallCancellationPushes` — these tests pin its externally observable
 * contract (queries + push payload), not its internals.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const CALLER_ID = 'user-caller';
const NEVER_JOINED_ID = 'user-never-joined';

function makePrisma(opts: {
  members?: Array<{ userId: string }>;
  joined?: Array<{ participant: { userId: string } | null }>;
} = {}) {
  return {
    participant: {
      findMany: jest.fn<any>().mockResolvedValue(
        opts.members ?? [{ userId: CALLER_ID }, { userId: NEVER_JOINED_ID }]
      ),
    },
    callParticipant: {
      findMany: jest.fn<any>().mockResolvedValue(
        opts.joined ?? [{ participant: { userId: CALLER_ID } }]
      ),
    },
  } as unknown as PrismaClient;
}

describe('CallEventsHandler.sendMissedCallCancellationPushForTerminatedCall', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends a silent call_cancel push to conversation members who never joined the call room', async () => {
    const prisma = makePrisma();
    const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
    const handler = new CallEventsHandler(prisma);
    handler.setPushNotificationService({ sendToUser } as any);

    await handler.sendMissedCallCancellationPushForTerminatedCall(CALL_ID, CONV_ID, 0);

    expect(sendToUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: NEVER_JOINED_ID,
        payload: expect.objectContaining({
          silent: true,
          data: { type: 'call_cancel', callId: CALL_ID },
        }),
        // Cross-platform mobile depuis l'audit 2026-07-11 #2 : le hardcode
        // apns/ios laissait un Android backgrounded sonner dans le vide.
        types: ['apns', 'fcm'],
        platforms: ['ios', 'android'],
      })
    );
  });

  it('excludes the caller (endedEvent has no endedBy, so only joined participants are excluded)', async () => {
    const prisma = makePrisma();
    const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
    const handler = new CallEventsHandler(prisma);
    handler.setPushNotificationService({ sendToUser } as any);

    await handler.sendMissedCallCancellationPushForTerminatedCall(CALL_ID, CONV_ID, 0);

    expect(sendToUser).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: CALLER_ID })
    );
  });

  it('does nothing when no conversationId is provided', async () => {
    const prisma = makePrisma();
    const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
    const handler = new CallEventsHandler(prisma);
    handler.setPushNotificationService({ sendToUser } as any);

    await handler.sendMissedCallCancellationPushForTerminatedCall(CALL_ID, undefined, 0);

    expect(sendToUser).not.toHaveBeenCalled();
    expect((prisma.participant.findMany as jest.Mock)).not.toHaveBeenCalled();
  });

  it('does nothing when no push service is configured', async () => {
    const prisma = makePrisma();
    const handler = new CallEventsHandler(prisma);
    // No setPushNotificationService call

    await expect(
      handler.sendMissedCallCancellationPushForTerminatedCall(CALL_ID, CONV_ID, 0)
    ).resolves.not.toThrow();
    expect((prisma.participant.findMany as jest.Mock)).not.toHaveBeenCalled();
  });

  it('never throws, even when the push service rejects', async () => {
    const prisma = makePrisma();
    const sendToUser = jest.fn<any>().mockRejectedValue(new Error('APNs down'));
    const handler = new CallEventsHandler(prisma);
    handler.setPushNotificationService({ sendToUser } as any);

    await expect(
      handler.sendMissedCallCancellationPushForTerminatedCall(CALL_ID, CONV_ID, 0)
    ).resolves.not.toThrow();
  });
});

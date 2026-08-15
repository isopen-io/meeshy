/**
 * CallEventsHandler.broadcastParticipantLeftForRest
 *
 * Public entry point for the REST `DELETE /calls/:id/participants/:pid`
 * (self-leave AND moderator kick) route via
 * `CallService.setParticipantLeftBroadcaster` (wired in server.ts). That
 * route has no `io` of its own — it delegates the CALL_EVENTS.PARTICIPANT_LEFT
 * fanout here. Sibling of `broadcastCallEndedForTerminatedCall`, but
 * unconditional: unlike call:ended (only relevant when the call actually
 * ends), PARTICIPANT_LEFT must reach the call room for EVERY leave/kick —
 * it's what drives the other peers' WebRTC teardown and roster update,
 * whether or not the call itself survives.
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

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallParticipantLeftEvent } from '@meeshy/shared/types/video-call';

const CALL_ID = '507f1f77bcf86cd799439011';
const CALL_ROOM = `call:${CALL_ID}`;

function makePrisma() {
  return {} as unknown as PrismaClient;
}

function makeIo() {
  const roomEmit = jest.fn<any>();
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: roomEmit }),
  };
  return { io, roomEmit };
}

describe('CallEventsHandler.broadcastParticipantLeftForRest', () => {
  beforeEach(() => jest.clearAllMocks());

  it('emits CALL_EVENTS.PARTICIPANT_LEFT to the call room with the event verbatim', () => {
    const handler = new CallEventsHandler(makePrisma());
    const { io, roomEmit } = makeIo();

    const event: CallParticipantLeftEvent = {
      callId: CALL_ID,
      participantId: 'call-participant-row-id',
      userId: 'user-kicked',
      mode: 'p2p' as any,
    };

    handler.broadcastParticipantLeftForRest(io as any, event);

    expect(io.to).toHaveBeenCalledWith(CALL_ROOM);
    expect(roomEmit).toHaveBeenCalledWith('call:participant-left', event);
  });

  it('never throws even with a minimal event shape', () => {
    const handler = new CallEventsHandler(makePrisma());
    const { io } = makeIo();

    expect(() =>
      handler.broadcastParticipantLeftForRest(io as any, {
        callId: CALL_ID,
        participantId: 'row-1',
        mode: 'p2p' as any,
      })
    ).not.toThrow();
  });
});

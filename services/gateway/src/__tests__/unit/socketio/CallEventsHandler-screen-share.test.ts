/**
 * CallEventsHandler — `call:toggle-screen` (#8063, partage d'écran).
 *
 * Le partage d'écran voyage sur la MÊME diffusion que la caméra et le micro :
 * `call:media-toggled` avec `mediaType: 'screen'`. Relevé des consommateurs
 * avant d'élargir : le décodeur web (`decodeMediaToggled`) rend `null` pour
 * tout `mediaType` hors `audio`/`video`, iOS tombe dans `default: break` — la
 * valeur neuve est INERTE pour les clients déjà publiés.
 *
 * Le partage n'écrit PAS `isVideoEnabled` : c'est un état de diffusion, pas la
 * caméra — le rendre persistant ferait croire, à un pair qui rejoint, que la
 * caméra est allumée.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn(),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),
  isValidationFailure: jest.fn((r: { success: boolean }) => !r.success),
}));

jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({ checkLimit: jest.fn(), destroy: jest.fn() })),
  getSocketRateLimiter: jest.fn().mockReturnValue({ checkLimit: jest.fn(), destroy: jest.fn() }),
  checkSocketRateLimit: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    MEDIA_TOGGLE: { maxRequests: 50, windowMs: 60000, keyPrefix: 'socket:call:media' },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent } from '../../../middleware/validation';
import { socketMediaToggleSchema } from '../../../validation/call-schemas';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const VALID_CALL_ID = '507f1f77bcf86cd799439011';
const VALID_CONV_ID = '507f1f77bcf86cd799439012';
const USER_ID = 'user-sharer-abc';

function makePrisma() {
  return {
    callSession: { findUnique: jest.fn<any>().mockResolvedValue({ conversationId: VALID_CONV_ID }) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-1' }) },
  } as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socketRoomEmit = jest.fn<any>();
  const socket = {
    id: 'socket-screen-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: directEmit,
    to: jest.fn().mockReturnValue({ emit: socketRoomEmit }),
    data: {},
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  return { socket, io, handlers, directEmit, socketRoomEmit };
}

function makeCallService() {
  return {
    updateParticipantMedia: jest.fn<any>().mockResolvedValue(undefined),
    getCallSession: jest.fn<any>().mockResolvedValue({
      participants: [{ participantId: 'participant-1', leftAt: null, participant: { userId: USER_ID } }],
    }),
  } as any;
}

async function toggleScreen(enabled: boolean) {
  const callService = makeCallService();
  const { socket, io, handlers, socketRoomEmit, directEmit } = makeSocket();
  const handler = new CallEventsHandler(makePrisma(), callService);
  handler.setupCallEvents(socket as any, io as any, () => USER_ID);
  await handlers[CALL_EVENTS.TOGGLE_SCREEN]({ callId: VALID_CALL_ID, enabled });
  return { callService, socket, socketRoomEmit, directEmit };
}

describe('CallEventsHandler — call:toggle-screen', () => {
  beforeEach(() => {
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
  });

  it('shares the contract name with the client event map', () => {
    expect(CALL_EVENTS.TOGGLE_SCREEN).toBe('call:toggle-screen');
    expect(CLIENT_EVENTS.CALL_TOGGLE_SCREEN).toBe('call:toggle-screen');
  });

  it('broadcasts call:media-toggled with mediaType screen to the other participants only', async () => {
    const { socket, socketRoomEmit, directEmit } = await toggleScreen(true);

    expect(socket.to).toHaveBeenCalledWith(expect.stringContaining(VALID_CALL_ID));
    expect(socketRoomEmit).toHaveBeenCalledWith(CALL_EVENTS.MEDIA_TOGGLED, {
      callId: VALID_CALL_ID,
      participantId: 'participant-1',
      userId: USER_ID,
      mediaType: 'screen',
      enabled: true,
    });
    expect(directEmit).not.toHaveBeenCalled();
  });

  it('broadcasts the stop too, so the peers give the stage back to the camera', async () => {
    const { socketRoomEmit } = await toggleScreen(false);

    expect(socketRoomEmit).toHaveBeenCalledWith(
      CALL_EVENTS.MEDIA_TOGGLED,
      expect.objectContaining({ mediaType: 'screen', enabled: false })
    );
  });

  it('never writes the camera flag: sharing the screen is not turning the camera on', async () => {
    const { callService } = await toggleScreen(true);

    expect(callService.updateParticipantMedia).not.toHaveBeenCalled();
  });
});

describe('socketMediaToggleSchema — screen', () => {
  it('accepts the screen media type tolerated on the wire', () => {
    const parsed = socketMediaToggleSchema.safeParse({ callId: VALID_CALL_ID, enabled: true, mediaType: 'screen' });

    expect(parsed.success).toBe(true);
  });
});

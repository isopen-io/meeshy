/**
 * #13142 — dans une conversation chiffrée de bout en bout, la frappe voyage en
 * signal chiffré : `typing:start` en clair n'est ni relayé à la room, ni suivi,
 * ni compté comme activité. Hors e2ee, rien ne change.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockNormalizeConversationId = jest.fn() as jest.Mock<any>;
const mockGetConnectedUser = jest.fn() as jest.Mock<any>;
const mockValidateSocketEvent = jest.fn() as jest.Mock<any>;
const mockResolveParticipant = jest.fn() as jest.Mock<any>;

jest.mock('../../utils/socket-helpers', () => ({
  normalizeConversationId: (...args: unknown[]) => mockNormalizeConversationId(...args),
  getConnectedUser: (...args: unknown[]) => mockGetConnectedUser(...args),
}));

jest.mock('../../utils/participant-resolver', () => ({
  resolveParticipant: (...args: unknown[]) => mockResolveParticipant(...args),
  resolveMembershipDenialReason: jest.fn(),
}));

jest.mock('../../../middleware/validation.js', () => ({
  validateSocketEvent: (...args: unknown[]) => mockValidateSocketEvent(...args),
}));

jest.mock('../../../validation/socket-event-schemas.js', () => ({ SocketTypingSchema: {} }));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import { StatusHandler } from '../StatusHandler';
import type { Socket } from 'socket.io';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';
const SOCKET_ID = 'socket-e2ee';

function makeSocket() {
  const roomEmit = jest.fn();
  const socket = {
    id: SOCKET_ID,
    to: jest.fn<any>().mockReturnValue({ emit: roomEmit, except: jest.fn<any>().mockReturnValue({ emit: roomEmit }) }),
    emit: jest.fn(),
    leave: jest.fn<any>().mockResolvedValue(undefined),
  } as unknown as Socket;
  return { socket, roomEmit };
}

function makeHandler(encryptionMode: string | null) {
  const updateLastSeen = jest.fn();
  const handler = new StatusHandler({
    prisma: {
      conversation: { findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: 'dm', encryptionMode }) },
      participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ username: 'alice', displayName: 'Alice' }),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
    } as any,
    statusService: { updateLastSeen } as any,
    privacyPreferencesService: { shouldShowTypingIndicator: jest.fn<any>().mockResolvedValue(true) } as any,
    connectedUsers: new Map(),
    socketToUser: new Map([[SOCKET_ID, USER_ID]]),
    userSockets: new Map<string, Set<string>>(),
  });
  return { handler, updateLastSeen };
}

describe('StatusHandler.handleTypingStart — conversation chiffrée de bout en bout (#13142)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue(CONV_ID);
    mockValidateSocketEvent.mockReturnValue({ success: true, data: { conversationId: CONV_ID } });
    mockGetConnectedUser.mockReturnValue({
      user: { id: USER_ID, isAnonymous: false, socketId: SOCKET_ID, language: 'fr', resolvedLanguages: [] },
      realUserId: USER_ID,
    });
    mockResolveParticipant.mockResolvedValue({ id: 'p1' });
  });

  it("ne relaie rien en clair et ne compte pas l'activité", async () => {
    const { socket, roomEmit } = makeSocket();
    const { handler, updateLastSeen } = makeHandler('e2ee');

    await handler.handleTypingStart(socket, { conversationId: CONV_ID });
    await handler.handleTypingStop(socket, { conversationId: CONV_ID });

    expect(roomEmit).not.toHaveBeenCalled();
    expect(updateLastSeen).not.toHaveBeenCalled();
  });

  it('relaie toujours la frappe hors bout en bout', async () => {
    const { socket, roomEmit } = makeSocket();
    const { handler } = makeHandler('server');

    await handler.handleTypingStart(socket, { conversationId: CONV_ID });

    expect(roomEmit).toHaveBeenCalled();
  });
});

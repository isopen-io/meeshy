import {
  extractJWTToken,
  extractSessionToken,
  getConnectedUser,
  normalizeConversationId,
  buildAnonymousDisplayName,
  isValidConversationId,
  isValidMessageContent,
  getConversationRoomId,
  extractConversationIdFromRoom,
  resolveParticipant,
  resolveParticipantFromMessage,
} from '../index';

describe('socketio/utils/index — re-exports', () => {
  it('re-exports socket-helpers utilities', () => {
    expect(typeof extractJWTToken).toBe('function');
    expect(typeof extractSessionToken).toBe('function');
    expect(typeof getConnectedUser).toBe('function');
    expect(typeof normalizeConversationId).toBe('function');
    expect(typeof buildAnonymousDisplayName).toBe('function');
    expect(typeof isValidConversationId).toBe('function');
    expect(typeof isValidMessageContent).toBe('function');
    expect(typeof getConversationRoomId).toBe('function');
    expect(typeof extractConversationIdFromRoom).toBe('function');
  });

  it('re-exports participant-resolver utilities', () => {
    expect(typeof resolveParticipant).toBe('function');
    expect(typeof resolveParticipantFromMessage).toBe('function');
  });
});

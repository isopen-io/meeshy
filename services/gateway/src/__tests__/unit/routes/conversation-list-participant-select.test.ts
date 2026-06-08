import { conversationListParticipantSelect } from '../../../routes/conversations/core';

/**
 * T17 — over-fetch trim regression guard for the GET /conversations LIST
 * participant select. The list serializes up to 5 participants × N
 * conversations, so each per-participant field multiplies on the wire.
 */
describe('conversationListParticipantSelect (T17 over-fetch trim)', () => {
  it('does NOT select permissions — no client reads participant permissions in the list view', () => {
    expect('permissions' in conversationListParticipantSelect).toBe(false);
  });

  it('keeps language — the web frontend reads participant.language for conversation-title language', () => {
    expect(conversationListParticipantSelect.language).toBe(true);
  });

  it('keeps the fields the list view actually renders', () => {
    const select = conversationListParticipantSelect as Record<string, unknown>;
    for (const field of ['id', 'userId', 'displayName', 'avatar', 'role', 'isOnline', 'nickname', 'joinedAt', 'isActive']) {
      expect(select[field]).toBe(true);
    }
  });

  it('keeps the nested user fallback fields (display name / avatar / online status / name)', () => {
    expect(conversationListParticipantSelect.user.select.id).toBe(true);
    expect(conversationListParticipantSelect.user.select.username).toBe(true);
    expect(conversationListParticipantSelect.user.select.displayName).toBe(true);
    expect(conversationListParticipantSelect.user.select.avatar).toBe(true);
    expect(conversationListParticipantSelect.user.select.isOnline).toBe(true);
    // iter-8: firstName/lastName added to eliminate the separate memberUsers query
    expect(conversationListParticipantSelect.user.select.firstName).toBe(true);
    expect(conversationListParticipantSelect.user.select.lastName).toBe(true);
  });
});

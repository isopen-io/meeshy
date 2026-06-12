import {
  conversationDetailInclude,
  CONVERSATION_DETAIL_PARTICIPANTS_CAP
} from '../../../routes/conversations/core';

/**
 * Iter 33 (F1) — bandwidth guard for the GET /conversations/:id DETAIL
 * include. The detail endpoint used to hydrate EVERY participant (active or
 * not, unbounded — ~500 KB for a 500-member group) on each conversation open,
 * while the list endpoint caps at 5 and the dedicated paginated
 * GET /conversations/:id/participants endpoint serves the full roster.
 */
describe('conversationDetailInclude (F1 participants cap)', () => {
  it('only includes active participants — members who left are served by the dedicated endpoint', () => {
    expect(conversationDetailInclude.participants.where).toEqual({ isActive: true });
  });

  it('caps hydrated participants at the detail preview limit', () => {
    expect(CONVERSATION_DETAIL_PARTICIPANTS_CAP).toBe(100);
    expect(conversationDetailInclude.participants.take).toBe(CONVERSATION_DETAIL_PARTICIPANTS_CAP);
  });

  it('orders by joinedAt asc so the capped page is deterministic (DM peers always present)', () => {
    expect(conversationDetailInclude.participants.orderBy).toEqual({ joinedAt: 'asc' });
  });

  it('keeps the nested user payload the detail view renders', () => {
    const userSelect = conversationDetailInclude.participants.include.user.select as Record<string, unknown>;
    for (const field of ['id', 'username', 'displayName', 'firstName', 'lastName', 'avatar', 'isOnline', 'lastActiveAt', 'role']) {
      expect(userSelect[field]).toBe(true);
    }
  });

  it('exposes the exact active-member total so clients never need the full roster for a count', () => {
    expect(conversationDetailInclude._count).toEqual({
      select: { participants: { where: { isActive: true } } }
    });
  });
});

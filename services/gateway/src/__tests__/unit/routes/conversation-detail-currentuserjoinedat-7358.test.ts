/**
 * Issue #7358 — G9 — Dettes des accusés gateway
 *
 * currentUserJoinedAt doit être servi dans GET /conversations/:id
 * Comme currentUserRole et unreadCount, c'est une valeur calculée pour l'utilisateur.
 */

import {
  CONVERSATION_DETAIL_SERVED_FIELDS,
  conversationDetailPlan
} from '../../../routes/conversations/core-detail';

describe('GET /conversations/:id — currentUserJoinedAt field (#7358)', () => {
  it('should include currentUserJoinedAt in CONVERSATION_DETAIL_SERVED_FIELDS', () => {
    // Assert that currentUserJoinedAt is in the list of served fields
    expect(CONVERSATION_DETAIL_SERVED_FIELDS).toContain('currentUserJoinedAt');
  });

  it('should include currentUserJoinedAt in conversationDetailPlan with empty columns', () => {
    // Assert that currentUserJoinedAt is in the plan
    expect(conversationDetailPlan.columns).toHaveProperty('currentUserJoinedAt');

    // Assert that it has no column dependencies (like currentUserRole and unreadCount)
    // Empty array means it's calculated, not loaded from DB
    expect(conversationDetailPlan.columns.currentUserJoinedAt).toEqual([]);
  });
});

import {
  conversationDetailInclude,
  CONVERSATION_DETAIL_PARTICIPANTS_CAP
} from '../../../routes/conversations/core';

/**
 * Iter 33 (F1) + iter 35 (F8) — bandwidth guards for the GET /conversations/:id
 * DETAIL include. Iter 33 capped hydrated participants (active only, max 100).
 * Iter 35 converts the participant `include` to a strict `select`: the wire
 * schema (`conversationParticipantSchema`) already strips everything else via
 * fast-json-stringify, so the DB was hydrating dead scalars — including the
 * sensitive `sessionTokenHash` and the embedded `anonymousSession` document —
 * for up to 100 participants on every conversation open.
 */
describe('conversationDetailInclude (F1 participants cap + F8 strict select)', () => {
  const participants = conversationDetailInclude.participants as {
    where: unknown;
    orderBy: unknown;
    take: number;
    select: Record<string, unknown>;
  };

  it('only includes active participants — members who left are served by the dedicated endpoint', () => {
    expect(participants.where).toEqual({ isActive: true });
  });

  it('caps hydrated participants at the detail preview limit', () => {
    expect(CONVERSATION_DETAIL_PARTICIPANTS_CAP).toBe(100);
    expect(participants.take).toBe(CONVERSATION_DETAIL_PARTICIPANTS_CAP);
  });

  it('orders by joinedAt asc so the capped page is deterministic (DM peers always present)', () => {
    expect(participants.orderBy).toEqual({ joinedAt: 'asc' });
  });

  it('selects exactly the participant scalars the wire schema declares', () => {
    const select = { ...participants.select };
    delete select.user;
    expect(Object.keys(select).sort()).toEqual([
      'avatar',
      'displayName',
      'id',
      'isActive',
      'isOnline',
      'joinedAt',
      'lastActiveAt',
      'permissions',
      'role',
      'type',
      'userId'
    ]);
  });

  it('never hydrates sensitive or dead participant fields (stripped from the wire anyway)', () => {
    for (const field of ['sessionTokenHash', 'anonymousSession', 'shareLinkId', 'deletedForMe', 'leftAt', 'bannedAt', 'nickname', 'conversationId', 'language']) {
      expect(participants.select[field]).toBeUndefined();
    }
  });

  it('keeps the nested user fields the server needs for default title generation (the wire strips nested user)', () => {
    const userSelect = (participants.select.user as { select: Record<string, unknown> }).select;
    expect(Object.keys(userSelect).sort()).toEqual([
      'displayName',
      'firstName',
      'id',
      'lastName',
      'username'
    ]);
  });

  it('exposes the exact active-member total so clients never need the full roster for a count', () => {
    expect(conversationDetailInclude._count).toEqual({
      select: { participants: { where: { isActive: true } } }
    });
  });
});

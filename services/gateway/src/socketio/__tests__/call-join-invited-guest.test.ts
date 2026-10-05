import { describe, it, expect } from '@jest/globals';
import { resolveJoinParticipantId } from '../call-participants';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const CONV = '64b7f0c2a1b2c3d4e5f60719';

type Row = { id: string; conversationId: string; userId: string; isActive: boolean; bannedAt: Date | null };

const deps = (rows: Row[], invited: string[]) => ({
  callService: {} as never,
  prisma: {
    callSession: {
      findUnique: async () => ({ conversationId: CONV, status: 'active', invitedUserIds: invited }),
    },
    participant: {
      findFirst: async ({ where }: { where: { userId: string; conversationId: string; isActive?: boolean } }) =>
        rows.find(
          (r) =>
            r.userId === where.userId &&
            r.conversationId === where.conversationId &&
            (where.isActive === undefined || r.isActive === where.isActive)
        ) ?? null,
      create: async () => ({ id: 'guest-dave' }),
    },
    user: { findUnique: async () => ({ username: 'dave', displayName: 'Dave', avatar: null }) },
  } as never,
});

describe('call:join — qui entre dans l’appel, et par quelle participation (#8433)', () => {
  it('un membre entre par sa participation', async () => {
    const rows = [{ id: 'p-bob', conversationId: CONV, userId: 'bob', isActive: true, bannedAt: null }];
    expect(await resolveJoinParticipantId(deps(rows, []), 'bob', CALL)).toBe('p-bob');
  });

  it('une personne invitée entre par la participation que son invitation lui ouvre', async () => {
    expect(await resolveJoinParticipantId(deps([], ['dave']), 'dave', CALL)).toBe('guest-dave');
  });

  it('une personne ni membre ni invitée n’entre pas', async () => {
    expect(await resolveJoinParticipantId(deps([], ['dave']), 'mallory', CALL)).toBeNull();
  });
});

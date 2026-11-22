import { describe, it, expect } from '@jest/globals';
import { resolveJoinParticipantId } from '../call-participants';
import { findFirstIn } from '../../__tests__/helpers/mongo-where';

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
      // La SÉMANTIQUE du vrai client, jamais un comparateur écrit à la main
      // (leçon du 2026-11-21) : le `where` de cette porte compose désormais
      // DEUX branches `OR` sous un `AND` (#20310), et un comparateur
      // `Object.entries(...).every(...)` rendrait `null` sur un correctif
      // JUSTE — un faux ROUGE, qui se découvre en abandonnant le correctif.
      findFirst: findFirstIn(rows as unknown as Array<Record<string, unknown>>),
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

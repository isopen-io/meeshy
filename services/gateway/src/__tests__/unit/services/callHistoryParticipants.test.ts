/**
 * Un appel de GROUPE nomme ses participants dans le journal (#8066) : qui a
 * rejoint l'appel, sans le lecteur lui-même, dans l'ordre d'arrivée, un
 * participant une seule fois. Aucune présence n'est servie (ni `isOnline`
 * ni `lastActiveAt`) : la liste dit qui ÉTAIT là, jamais qui l'est.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: () => Promise.resolve(new Map()) }),
}));

import { listCallHistory } from '../../../services/calls/callHistoryList';
import { resolveGroupCallParticipants } from '../../../services/calls/callHistoryParticipants';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { PresenceViewer } from '../../../services/PresenceVisibilityService';
import type { RosterCall } from '../../../services/calls/answeredCallRoster';
import { findManyIn, type MongoDocument } from '../../helpers/mongo-where';

type FindMany = (args?: unknown) => Promise<unknown>;

const READER = '507f1f77bcf86cd799439022';
const VIEWER: PresenceViewer = { userId: READER, role: 'USER' };

const rosterRow = (callSessionId: string, participant: Record<string, unknown>, line: Record<string, unknown> = {}): MongoDocument => ({ callSessionId, participant, ...line });
/** Les lignes comme documents MongoDB : une clé `answeredAt` absente est absente, et le `where` est évalué. */
const callParticipantDocuments = (rows: ReadonlyArray<MongoDocument>) => ({ findMany: findManyIn(rows).findMany });
const ANSWERED_AT = new Date('2026-09-20T10:00:05Z');
/** Un appel de groupe décroché ; `tracksAnswers` : au moins une de ses lignes porte la clé `answeredAt`. */
const answered = (id: string, call: Partial<RosterCall> = {}): RosterCall => ({ id, answeredAt: ANSWERED_AT, duo: false, tracksAnswers: true, ...call });

const alice = {
  id: 'p-alice',
  userId: 'u-alice',
  displayName: 'alice-participant',
  avatar: null,
  user: { username: 'alice', displayName: 'Alice', avatar: 'https://cdn/alice.png' },
};
const bob = { id: 'p-bob', userId: null, displayName: 'Bob (invité)', avatar: 'https://cdn/bob.png', user: null };
const reader = { id: 'p-reader', userId: READER, displayName: 'Moi', avatar: null, user: { username: 'me', displayName: 'Me', avatar: null } };

const prismaWithRoster = (rows: unknown[]) => {
  const findMany = jest.fn<FindMany>().mockResolvedValue(rows);
  return { prisma: { callParticipant: { findMany } } as unknown as PrismaClient, findMany };
};

describe('resolveGroupCallParticipants', () => {
  it('nomme ceux qui ont rejoint, sans le lecteur, un participant une seule fois', async () => {
    const { prisma, findMany } = prismaWithRoster([
      rosterRow('call-g', alice),
      rosterRow('call-g', reader),
      rosterRow('call-g', bob),
      rosterRow('call-g', alice),
    ]);
    const byCall = await resolveGroupCallParticipants(prisma, [answered('call-g', { tracksAnswers: false })], READER);
    expect(byCall.get('call-g')).toEqual([
      { participantId: 'p-alice', userId: 'u-alice', username: 'alice', displayName: 'alice-participant', avatar: 'https://cdn/alice.png' },
      { participantId: 'p-bob', userId: null, username: null, displayName: 'Bob (invité)', avatar: 'https://cdn/bob.png' },
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { callSessionId: { in: ['call-g'] } }, orderBy: { joinedAt: 'asc' } }));
    expect(JSON.stringify(findMany.mock.calls)).not.toMatch(/isOnline|lastActiveAt|phoneNumber|email/);
  });

  it('#18242 B1 — groupe de trois : Karim sonne puis refuse, Awa décroche ⇒ le journal ne nomme pas Karim', async () => {
    const awa = { ...alice, id: 'p-awa', userId: 'u-awa', user: { username: 'awa', displayName: 'Awa', avatar: null } };
    const karim = { ...alice, id: 'p-karim', userId: 'u-karim', user: { username: 'karim', displayName: 'Karim', avatar: null } };
    const { prisma } = prismaWithRoster([
      rosterRow('call-g', reader, { role: 'initiator', answeredAt: null }),
      rosterRow('call-g', karim, { role: 'participant', answeredAt: null, leftAt: new Date('2026-09-20T10:00:02Z') }),
      rosterRow('call-g', awa, { role: 'participant', answeredAt: ANSWERED_AT }),
    ]);
    const byCall = await resolveGroupCallParticipants(prisma, [answered('call-g')], 'u-awa');
    expect(byCall.get('call-g')?.map((p) => p.displayName)).toEqual(['Moi']);
  });

  it('#18242 B1 — une sonnerie ignorée ou un refus tardif ne font pas un participant ; un appel non décroché n\'en a aucun', async () => {
    const karim = { ...alice, id: 'p-karim', userId: 'u-karim', user: { username: 'karim', displayName: 'Karim', avatar: null } };
    const { prisma, findMany } = prismaWithRoster([
      rosterRow('call-g', alice, { role: 'participant', answeredAt: ANSWERED_AT }),
      rosterRow('call-g', karim, { role: 'participant', answeredAt: null, leftAt: new Date('2026-09-20T10:05:00Z') }),
      rosterRow('call-m', karim, { role: 'participant', answeredAt: null }),
    ]);
    const byCall = await resolveGroupCallParticipants(prisma, [answered('call-g'), answered('call-m', { answeredAt: null })], READER);
    expect(byCall.get('call-g')?.map((p) => p.displayName)).toEqual(['alice-participant']);
    expect(byCall.get('call-m') ?? []).toEqual([]);
    expect(JSON.stringify(findMany.mock.calls)).toMatch(/answeredAt/);
  });

  it('#18242 — nomme comme la carte du fil : surnom, copie du participant, compte, Prénom Nom, pseudo ; un compte purgé est « Compte supprimé »', async () => {
    const person = (id: string, participant: Record<string, unknown>, user: Record<string, unknown> | null) =>
      rosterRow('call-g', { id: `p-${id}`, userId: `u-${id}`, displayName: '', nickname: null, avatar: null, ...participant, user: user && { username: `${id}_handle`, displayName: null, firstName: null, lastName: null, avatar: null, ...user } });
    const { prisma } = prismaWithRoster([
      person('1', { nickname: 'Surnom', displayName: 'Copie' }, { displayName: 'Compte' }),
      person('2', { displayName: 'Copie 2' }, { displayName: 'Compte 2' }),
      person('3', {}, { displayName: 'Compte 3' }),
      person('4', {}, { firstName: 'Lina', lastName: 'Diallo' }),
      person('5', {}, {}),
      person('6', { displayName: 'Compte supprimé', nickname: 'Ancien surnom' }, { firstName: 'Compte', lastName: 'supprimé' }),
    ]);
    const byCall = await resolveGroupCallParticipants(prisma, [answered('call-g', { tracksAnswers: false })], READER);
    expect(byCall.get('call-g')?.map((p) => p.displayName)).toEqual(['Surnom', 'Copie 2', 'Compte 3', 'Lina Diallo', '5_handle', 'Compte supprimé']);
  });

  it('#18242 B-1 — un appel NON SUIVI (aucune ligne ne porte la clé) nomme tous ceux qui avaient une ligne, comme avant', async () => {
    const karim = { ...alice, id: 'p-karim', userId: 'u-karim', displayName: 'Karim' };
    const { prisma } = prismaWithRoster([rosterRow('call-g', alice), rosterRow('call-g', karim)]);
    const byCall = await resolveGroupCallParticipants(prisma, [answered('call-g', { tracksAnswers: false })], READER);
    expect(byCall.get('call-g')?.map((p) => p.displayName)).toEqual(['alice-participant', 'Karim']);
  });

  it('ne lit rien quand la page ne porte aucun appel de groupe', async () => {
    const { prisma, findMany } = prismaWithRoster([]);
    const byCall = await resolveGroupCallParticipants(prisma, [], READER);
    expect(byCall.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('listCallHistory — participants d’un appel de groupe', () => {
  const groupRow = {
    id: 'call-g',
    conversationId: 'conv-g',
    mode: 'sfu',
    status: 'ended',
    endReason: null,
    initiatorId: READER,
    startedAt: new Date('2026-09-20T10:00:00Z'),
    answeredAt: new Date('2026-09-20T10:00:05Z'),
    endedAt: new Date('2026-09-20T10:10:00Z'),
    duration: 595,
    bytesSent: null,
    bytesReceived: null,
    metadata: { type: 'audio' },
    conversation: { type: 'group', title: 'Équipe', avatar: null, participants: [{ id: 'p-reader' }] },
  };

  it('porte les participants sur la ligne d’un appel de groupe, une liste vide pour un appel direct', async () => {
    const directRow = { ...groupRow, id: 'call-d', conversationId: 'conv-d', conversation: { type: 'direct', title: null, avatar: null, participants: [{ id: 'p-reader' }] } };
    const prisma = {
      callSession: { findMany: jest.fn<FindMany>().mockResolvedValue([groupRow, directRow]) },
      participant: { findMany: jest.fn<FindMany>().mockResolvedValue([]) },
      callParticipant: callParticipantDocuments([rosterRow('call-g', alice)]),
    } as unknown as PrismaClient;
    const page = await listCallHistory(prisma, READER, { limit: 30, filter: 'all', viewer: VIEWER });
    expect(page.items.find((item) => item.callId === 'call-g')?.participants.map((p) => p.displayName)).toEqual(['alice-participant']);
    expect(page.items.find((item) => item.callId === 'call-d')?.participants).toEqual([]);
  });

  it('#18242 — un membre qui a sonné puis refusé lit « manqué », jamais « entrant décroché »', async () => {
    const karimCall = { ...groupRow, id: 'call-k', initiatorId: 'u-init' };
    const init = { id: 'p-init', userId: 'u-init', displayName: 'Init', avatar: null, user: null };
    const prisma = {
      callSession: { findMany: jest.fn<FindMany>().mockResolvedValue([karimCall]) },
      participant: { findMany: jest.fn<FindMany>().mockResolvedValue([]) },
      callParticipant: callParticipantDocuments([
        rosterRow('call-k', init, { role: 'initiator', answeredAt: ANSWERED_AT }),
        rosterRow('call-k', alice, { role: 'participant', answeredAt: ANSWERED_AT }),
        rosterRow('call-k', reader, { role: 'participant', answeredAt: null, leftAt: new Date('2026-09-20T10:00:02Z') }),
      ]),
    } as unknown as PrismaClient;
    const page = await listCallHistory(prisma, READER, { limit: 30, filter: 'all', viewer: VIEWER });
    expect(page.items.find((item) => item.callId === 'call-k')?.direction).toBe('missed');
  });

  it('#18242 — un membre qui a décroché lit « entrant »', async () => {
    const awaCall = { ...groupRow, id: 'call-a', initiatorId: 'u-init' };
    const prisma = {
      callSession: { findMany: jest.fn<FindMany>().mockResolvedValue([awaCall]) },
      participant: { findMany: jest.fn<FindMany>().mockResolvedValue([]) },
      callParticipant: callParticipantDocuments([
        rosterRow('call-a', reader, { role: 'participant', answeredAt: ANSWERED_AT }),
      ]),
    } as unknown as PrismaClient;
    const page = await listCallHistory(prisma, READER, { limit: 30, filter: 'all', viewer: VIEWER });
    expect(page.items.find((item) => item.callId === 'call-a')?.direction).toBe('incoming');
  });
});

/**
 * Un appel de GROUPE nomme ses participants dans le journal (#8066) : qui a
 * rejoint l'appel, sans le lecteur lui-même, dans l'ordre d'arrivée, un
 * participant une seule fois. Aucune présence n'est servie (ni `isOnline`
 * ni `lastActiveAt`) : la liste dit qui ÉTAIT là, jamais qui l'est.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()) }),
}));

import { listCallHistory } from '../../../services/calls/callHistoryList';
import { resolveGroupCallParticipants } from '../../../services/calls/callHistoryParticipants';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const READER = '507f1f77bcf86cd799439022';
const VIEWER = { userId: READER, role: 'USER' } as const;

const rosterRow = (callSessionId: string, participant: Record<string, unknown>) => ({ callSessionId, participant });

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
  const findMany = jest.fn<any>().mockResolvedValue(rows);
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
    const byCall = await resolveGroupCallParticipants(prisma, ['call-g'], READER);
    expect(byCall.get('call-g')).toEqual([
      { participantId: 'p-alice', userId: 'u-alice', username: 'alice', displayName: 'Alice', avatar: 'https://cdn/alice.png' },
      { participantId: 'p-bob', userId: null, username: null, displayName: 'Bob (invité)', avatar: 'https://cdn/bob.png' },
    ]);
    const query = findMany.mock.calls[0][0];
    expect(query.where).toEqual({ callSessionId: { in: ['call-g'] } });
    expect(query.orderBy).toEqual({ joinedAt: 'asc' });
    expect(JSON.stringify(query.select)).not.toMatch(/isOnline|lastActiveAt|phoneNumber|email/);
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
    conversation: { type: 'group', title: 'Équipe', avatar: null },
  };

  it('porte les participants sur la ligne d’un appel de groupe, une liste vide pour un appel direct', async () => {
    const directRow = { ...groupRow, id: 'call-d', conversationId: 'conv-d', conversation: { type: 'direct', title: null, avatar: null } };
    const prisma = {
      callSession: { findMany: jest.fn<any>().mockResolvedValue([groupRow, directRow]) },
      participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      callParticipant: { findMany: jest.fn<any>().mockResolvedValue([rosterRow('call-g', alice)]) },
    } as unknown as PrismaClient;
    const page = await listCallHistory(prisma, READER, { limit: 30, filter: 'all', viewer: VIEWER as any });
    expect(page.items.find((item) => item.callId === 'call-g')?.participants.map((p) => p.displayName)).toEqual(['Alice']);
    expect(page.items.find((item) => item.callId === 'call-d')?.participants).toEqual([]);
  });
});

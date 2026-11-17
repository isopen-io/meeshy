/**
 * Une arrivée par un lien de partage fait bouger « Arrivées 23 · il y a 12 min »
 * chez son créateur et ses gestionnaires, en temps réel (#19446).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

import { announceShareLinkArrival } from '../../../services/conversations/shareLinkArrivalAnnounce';
import type { LinkActivityRelay, ShareLinkArrivalInput } from '../../../socketio/linkActivityEvents';
import { performLinkJoin } from '../../../routes/conversations/link-admission';
import { executeurImmediat } from '../../helpers/after-response';

const LINK = { id: 'sl-1', linkId: 'mshy_abc', currentUses: 23, maxUses: 50, createdBy: 'u-creator', conversationId: 'c-1' };
const ARRIVING = { id: 'p-new', type: 'anonymous', joinedAt: new Date('2026-11-17T10:00:00.000Z'), joinCountry: 'SN', displayName: 'Ana', userId: null };
const MEMBERS = [
  { userId: 'u-creator', role: 'creator' },
  { userId: 'u-admin', role: 'ADMIN' },
  { userId: 'u-mod', role: 'moderator' },
  { userId: 'u-member', role: 'member' },
];

function relaySpy() {
  const arrivals: ShareLinkArrivalInput[] = [];
  const relay: LinkActivityRelay = {
    trackingLinkClicked: jest.fn(),
    shareLinkArrival: (input) => { arrivals.push(input); },
    communityLinkEntry: jest.fn(),
    affiliateReferralJoined: jest.fn(),
  };
  return { relay, arrivals };
}

function fakePrisma() {
  return {
    conversationShareLink: { findUnique: jest.fn(async () => LINK) },
    participant: {
      findUnique: jest.fn(async () => ARRIVING),
      findMany: jest.fn(async ({ where }: { where: { role?: { in: string[] } } }) =>
        MEMBERS.filter((member) => !where.role || where.role.in.includes(member.role))),
    },
  };
}

describe('announceShareLinkArrival', () => {
  it("annonce au créateur et aux gestionnaires — jamais à un membre simple — les compteurs du lien et le pays de l'arrivée", async () => {
    const { relay, arrivals } = relaySpy();
    await announceShareLinkArrival({ prisma: fakePrisma() as never, relay, shareLinkId: 'sl-1', participantId: 'p-new' });
    expect(arrivals).toHaveLength(1);
    expect([...arrivals[0].recipientIds].sort()).toEqual(['u-admin', 'u-creator', 'u-mod']);
    expect(arrivals[0]).toMatchObject({
      linkId: 'mshy_abc', currentUses: 23, maxUses: 50,
      arrival: { participantId: 'p-new', isAnonymous: true, country: 'SN', joinedAt: ARRIVING.joinedAt },
    });
  });

  it("se tait quand le lien ou l'arrivée a disparu, et n'échoue jamais", async () => {
    const { relay, arrivals } = relaySpy();
    const prisma = fakePrisma();
    prisma.conversationShareLink.findUnique.mockResolvedValueOnce(null as never);
    await announceShareLinkArrival({ prisma: prisma as never, relay, shareLinkId: 'sl-1', participantId: 'p-new' });
    prisma.participant.findUnique.mockRejectedValueOnce(new Error('base') as never);
    await expect(announceShareLinkArrival({ prisma: prisma as never, relay, shareLinkId: 'sl-1', participantId: 'p-new' })).resolves.toBeUndefined();
    expect(arrivals).toEqual([]);
  });
});

describe('performLinkJoin — le relais reçoit l’arrivée après le pays', () => {
  it("annonce l'arrivée d'un invité une fois son pays enregistré, en tâche post-réponse", async () => {
    const { relay, arrivals } = relaySpy();
    const shareLinkRow = {
      id: 'sl-1', linkId: 'mshy_abc', identifier: 'invitation', conversationId: 'c-1', createdBy: 'u-creator',
      isActive: true, expiresAt: null, maxUses: 50, currentUses: 22, maxConcurrentUsers: null, currentConcurrentUsers: 0,
      maxUniqueSessions: null, currentUniqueSessions: 0, requireAccount: false, requireNickname: false, requireEmail: false,
      requireBirthday: false, allowedCountries: [], allowedLanguages: [], allowedIpRanges: [], allowAnonymousMessages: true,
      allowAnonymousFiles: false, allowAnonymousImages: true, allowViewHistory: true,
      conversation: { id: 'c-1', title: 'Équipe', type: 'group', isActive: true, closedAt: null },
    };
    const announce = fakePrisma();
    const prisma = {
      conversationShareLink: {
        findFirst: jest.fn(async () => shareLinkRow),
        updateMany: jest.fn(async () => ({ count: 1 })),
        findUnique: announce.conversationShareLink.findUnique,
      },
      user: { findUnique: jest.fn(async () => ({ displayName: 'Ana', username: 'ana' })) },
      participant: {
        findFirst: jest.fn(async () => null),
        findUnique: announce.participant.findUnique,
        findMany: jest.fn(async (args: { where: { role?: { in: string[] } } }) => (args.where.role ? announce.participant.findMany(args) : [])),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'p-new', avatar: null, ...data })),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'p-new', avatar: null, ...data })),
      },
      message: { create: jest.fn(async () => ({ id: 'msg-1' })) },
      conversation: { update: jest.fn(async () => ({})) },
    };
    const executeur = executeurImmediat();
    const outcome = await performLinkJoin({
      prisma: prisma as never,
      key: 'mshy_abc',
      authContext: undefined,
      requestIp: '203.0.113.7',
      profile: { firstName: 'Nova', lastName: '', requestedUsername: 'nova', language: 'fr' },
      afterResponse: executeur.afterResponse,
      lookupCountry: async () => 'SN',
      linkActivity: relay,
    });
    await executeur.settle();
    expect(outcome.kind).toBe('joined');
    expect(executeur.labels).toContain('link-arrival-country');
    expect(arrivals.map((arrival) => [arrival.linkId, arrival.arrival.country])).toEqual([['mshy_abc', 'SN']]);
  });
});

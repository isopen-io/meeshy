/**
 * Une entrée par le lien d'une communauté fait bouger ses chiffres chez ses
 * intendants — créateur, administrateurs, modérateurs actifs —, jamais chez un
 * membre simple ni chez l'arrivant (#19446).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { announceCommunityLinkEntry } from '../../../services/community-link-entry-announce';
import { scheduleCommunityMemberBroadcastFrom } from '../../../services/community-member-broadcast';
import type { CommunityLinkEntryInput, LinkActivityRelay } from '../../../socketio/linkActivityEvents';

function relaySpy() {
  const entries: CommunityLinkEntryInput[] = [];
  const relay: LinkActivityRelay = {
    trackingLinkClicked: jest.fn(),
    shareLinkArrival: jest.fn(),
    communityLinkEntry: (input) => { entries.push(input); },
    affiliateReferralJoined: jest.fn(),
  };
  return { relay, entries };
}

const MEMBERS = [
  { userId: 'u-admin', role: 'admin' },
  { userId: 'u-mod', role: 'moderator' },
  { userId: 'u-member', role: 'member' },
  { userId: 'u-arriving', role: 'member' },
];

function fakePrisma(community: unknown = { id: 'c-1', identifier: 'mshy_club', createdBy: 'u-creator' }) {
  return {
    community: { findFirst: jest.fn(async () => community) },
    communityMember: {
      findMany: jest.fn(async ({ where }: { where: { role?: { in: string[] } } }) =>
        MEMBERS.filter((member) => !where.role || where.role.in.includes(member.role))),
      count: jest.fn(async () => 4),
    },
  };
}

describe('announceCommunityLinkEntry', () => {
  it("pose le nombre exact d'entrées par le lien chez les intendants, et seulement chez eux", async () => {
    const { relay, entries } = relaySpy();
    const prisma = fakePrisma();
    const at = new Date('2026-11-17T10:00:00.000Z');
    await announceCommunityLinkEntry({ prisma: prisma as never, relay, communityId: 'c-1', at });
    expect(entries).toHaveLength(1);
    expect([...entries[0].recipientIds].sort()).toEqual(['u-admin', 'u-creator', 'u-mod']);
    expect(entries[0]).toMatchObject({ communityId: 'c-1', linkId: 'mshy_club', entries: 4, at });
    expect(prisma.communityMember.count).toHaveBeenCalledWith({ where: { communityId: 'c-1', isActive: true, joinedVia: 'link' } });
  });

  it("se tait pour une communauté désactivée ou disparue, et n'échoue jamais", async () => {
    const { relay, entries } = relaySpy();
    await announceCommunityLinkEntry({ prisma: fakePrisma(null) as never, relay, communityId: 'c-1', at: new Date() });
    const failing = fakePrisma();
    failing.communityMember.count.mockRejectedValueOnce(new Error('base') as never);
    await expect(announceCommunityLinkEntry({ prisma: failing as never, relay, communityId: 'c-1', at: new Date() })).resolves.toBeUndefined();
    expect(entries).toEqual([]);
  });
});

describe('scheduleCommunityMemberBroadcastFrom — une entrée par le lien part aussi vers les intendants', () => {
  const settle = async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
  };

  const schedule = (fastify: unknown, via: 'self' | 'invited' | 'link'): void =>
    scheduleCommunityMemberBroadcastFrom(fastify as never, { kind: 'joined', communityId: 'c-1', userId: 'u-arriving', role: 'member', via });

  function host() {
    const sent: [string, string, unknown][] = [];
    const io = { to: (room: string) => ({ emit: (event: string, data: unknown) => { sent.push([room, event, data]); } }) };
    const prisma = fakePrisma();
    const fastify = {
      prisma: { ...prisma, communityMember: { ...prisma.communityMember } },
      socketIOHandler: { getManager: () => ({ getIO: () => io }) },
      log: { warn: jest.fn(), error: jest.fn() },
    };
    return { fastify, sent };
  }

  it("annonce l'entrée par le lien aux intendants", async () => {
    const { fastify, sent } = host();
    schedule(fastify, 'link');
    await settle();
    const linkEntries = sent.filter(([, event]) => event === 'community-link:entry').map(([room]) => room).sort();
    expect(linkEntries).toEqual(['user:u-admin', 'user:u-creator', 'user:u-mod']);
  });

  it("ne dit rien d'une entrée de soi-même ou sur invitation", async () => {
    const { fastify, sent } = host();
    schedule(fastify, 'self');
    schedule(fastify, 'invited');
    await settle();
    expect(sent.filter(([, event]) => event === 'community-link:entry')).toEqual([]);
  });
});

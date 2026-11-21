/**
 * Un filleul qui s'inscrit fait bouger « 14 filleuls » chez son parrain, en
 * temps réel (#19446) — jamais chez le filleul, jamais sur une relation
 * préexistante, et sans rien dire de qui est arrivé.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({ recordActivity: async () => undefined })),
}));

import { AffiliateTrackingService } from '../../../services/AffiliateTrackingService';
import { announceAffiliateReferral } from '../../../services/affiliate-referral-announce';
import type { AffiliateReferralInput, LinkActivityRelay } from '../../../socketio/linkActivityEvents';

const makePrisma = (existingRelation: { id: string; status: string } | null) => ({
  user: { findUnique: jest.fn(async () => ({ id: 'newcomer-1', createdAt: new Date() })), findFirst: jest.fn(async () => null) },
  affiliateToken: {
    findUnique: jest.fn(async () => ({ id: 'tok-1', token: 'aff_X', isActive: true, createdBy: 'sponsor-1', expiresAt: null, maxUses: null, currentUses: 0 })),
    update: jest.fn(async () => ({})),
  },
  affiliateRelation: {
    findFirst: jest.fn(async () => existingRelation),
    create: jest.fn(async () => ({ id: 'rel-1', status: 'completed' })),
    count: jest.fn(async (_args: unknown) => 14),
  },
  friendRequest: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
});

function relaySpy() {
  const referrals: AffiliateReferralInput[] = [];
  const relay: LinkActivityRelay = {
    trackingLinkClicked: jest.fn(),
    shareLinkArrival: jest.fn(),
    communityLinkEntry: jest.fn(),
    affiliateReferralJoined: (input) => { referrals.push(input); },
  };
  return { relay, referrals };
}

describe('convertAffiliateVisit — le parrain apprend le filleul', () => {
  it('signale une relation NEUVE avec le jeton et le parrain', async () => {
    const joined: unknown[] = [];
    await AffiliateTrackingService.convertAffiliateVisit(makePrisma(null), 'aff_X', 'newcomer-1', undefined, (event) => { joined.push(event); });
    expect(joined).toEqual([{ tokenId: 'tok-1', sponsorId: 'sponsor-1' }]);
  });

  it('ne signale rien quand la relation existait déjà', async () => {
    const joined: unknown[] = [];
    await AffiliateTrackingService.convertAffiliateVisit(makePrisma({ id: 'rel-0', status: 'completed' }), 'aff_X', 'newcomer-1', undefined, (event) => { joined.push(event); });
    expect(joined).toEqual([]);
  });
});

describe('announceAffiliateReferral', () => {
  it('pose le nombre exact de filleuls du jeton dans la room du parrain', async () => {
    const { relay, referrals } = relaySpy();
    const prisma = makePrisma(null);
    await announceAffiliateReferral({ prisma: prisma as never, relay, tokenId: 'tok-1', sponsorId: 'sponsor-1' });
    expect(prisma.affiliateRelation.count).toHaveBeenCalledWith({ where: { affiliateTokenId: 'tok-1' } });
    expect(referrals).toEqual([{ sponsorId: 'sponsor-1', tokenId: 'tok-1', referralCount: 14 }]);
  });

  it("n'échoue jamais", async () => {
    const { relay, referrals } = relaySpy();
    const prisma = makePrisma(null);
    prisma.affiliateRelation.count.mockRejectedValueOnce(new Error('base') as never);
    await expect(announceAffiliateReferral({ prisma: prisma as never, relay, tokenId: 'tok-1', sponsorId: 'sponsor-1' })).resolves.toBeUndefined();
    expect(referrals).toEqual([]);
  });
});

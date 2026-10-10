/**
 * `social.invite_joined` (#8959) : une inscription par un lien d'affiliation
 * crédite l'inviteur, et la CIBLE est la personne arrivée — le catalogue paie
 * l'opération une fois par cible, donc une fois par filleul.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

const mockRecordActivity = jest.fn<(userId: string, key: string, options?: Record<string, unknown>) => Promise<void>>();

jest.mock('../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: (userId: string, key: string, options?: Record<string, unknown>) => mockRecordActivity(userId, key, options),
  })),
}));

import { AffiliateTrackingService } from '../../../services/AffiliateTrackingService';

const makePrisma = (existingRelation: { id: string; status: string } | null) => ({
  affiliateToken: {
    findUnique: jest.fn(async () => ({
      id: 'tok-1', token: 'aff_X', isActive: true, createdBy: 'inviter-1', expiresAt: null, maxUses: null, currentUses: 0,
    })),
    update: jest.fn(async () => ({})),
  },
  affiliateRelation: {
    findFirst: jest.fn(async () => existingRelation),
    create: jest.fn(async () => ({ id: 'rel-1', status: 'completed' })),
  },
  friendRequest: {
    findFirst: jest.fn(async () => null),
    create: jest.fn(async () => ({})),
  },
});

describe('AffiliateTrackingService.convertAffiliateVisit — crédit', () => {
  it('crédite l\'inviteur avec le filleul pour cible', async () => {
    mockRecordActivity.mockReset().mockResolvedValue(undefined);

    await AffiliateTrackingService.convertAffiliateVisit(makePrisma(null), 'aff_X', 'newcomer-1');

    expect(mockRecordActivity).toHaveBeenCalledWith('inviter-1', 'social.invite_joined', {
      actorId: 'newcomer-1',
      targetId: 'newcomer-1',
    });
  });

  it('ne crédite rien quand la relation existait déjà', async () => {
    mockRecordActivity.mockReset().mockResolvedValue(undefined);

    await AffiliateTrackingService.convertAffiliateVisit(makePrisma({ id: 'rel-0', status: 'completed' }), 'aff_X', 'newcomer-1');

    expect(mockRecordActivity).not.toHaveBeenCalled();
  });
});

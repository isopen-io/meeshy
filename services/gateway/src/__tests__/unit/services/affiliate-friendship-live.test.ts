/**
 * Un filleul inscrit par un lien de parrainage devient l'Ami de son parrain, et
 * les deux le voient AUSSITÔT (#19540) : `relation:level-raised` aux deux,
 * `friend-request:accepted` à celui qui avait envoyé la demande, les caches
 * d'amis oubliés, et ce qui s'ouvre dès Ami rejoué pour la paire — comme une
 * acceptation ordinaire. Un refus ou un blocage antérieur ne dit rien.
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
const recordFriendship = jest.fn(async (_db: unknown, _params: unknown) => 'created' as string);
jest.mock('../../../services/relations/userRelationWriter', () => ({
  recordFriendship: (db: unknown, params: unknown) => recordFriendship(db, params),
}));

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { AffiliateTrackingService } from '../../../services/AffiliateTrackingService';
import {
  announceAffiliateFriendship,
  type AffiliateFriendshipLinked,
} from '../../../services/affiliate-friendship-announce';

type FriendRequestRow = { id: string; senderId: string; receiverId: string; status: string };

const makePrisma = (existingRequest: FriendRequestRow | null) => ({
  user: { findUnique: jest.fn(async () => ({ id: 'newcomer-1', createdAt: new Date() })), findFirst: jest.fn(async () => null) },
  affiliateToken: {
    findUnique: jest.fn(async () => ({ id: 'tok-1', token: 'aff_X', isActive: true, createdBy: 'sponsor-1', expiresAt: null, maxUses: null, currentUses: 0 })),
    update: jest.fn(async () => ({})),
  },
  affiliateRelation: {
    findFirst: jest.fn(async () => null),
    create: jest.fn(async () => ({ id: 'rel-1', status: 'completed' })),
  },
  friendRequest: {
    findFirst: jest.fn(async () => existingRequest),
    create: jest.fn(async () => ({ id: 'fr-new', senderId: 'sponsor-1', receiverId: 'newcomer-1', status: 'accepted' })),
    update: jest.fn(async () => ({ ...existingRequest, status: 'accepted' })),
  },
});

const convert = async (existingRequest: FriendRequestRow | null): Promise<AffiliateFriendshipLinked[]> => {
  const linked: AffiliateFriendshipLinked[] = [];
  await AffiliateTrackingService.convertAffiliateVisit(
    makePrisma(existingRequest), 'aff_X', 'newcomer-1', undefined, undefined, (event) => { linked.push(event); },
  );
  return linked;
};

describe('convertAffiliateVisit — le lien Ami noué par le parrainage est signalé', () => {
  it('une demande créée acceptée et un lien NEUF : la paire, la demande et la montée', async () => {
    recordFriendship.mockResolvedValueOnce('created');
    expect(await convert(null)).toEqual([{
      sponsorId: 'sponsor-1',
      referredId: 'newcomer-1',
      levelRaised: true,
      acceptedRequest: { id: 'fr-new', senderId: 'sponsor-1', receiverId: 'newcomer-1' },
    }]);
  });

  it('une demande EN ATTENTE du filleul promue : elle garde son expéditeur', async () => {
    recordFriendship.mockResolvedValueOnce('raised');
    const pending = { id: 'fr-0', senderId: 'newcomer-1', receiverId: 'sponsor-1', status: 'pending' };
    expect(await convert(pending)).toEqual([{
      sponsorId: 'sponsor-1',
      referredId: 'newcomer-1',
      levelRaised: true,
      acceptedRequest: { id: 'fr-0', senderId: 'newcomer-1', receiverId: 'sponsor-1' },
    }]);
  });

  it('une demande déjà acceptée et un lien inchangé : rien à dire', async () => {
    recordFriendship.mockResolvedValueOnce('unchanged');
    const accepted = { id: 'fr-0', senderId: 'sponsor-1', receiverId: 'newcomer-1', status: 'accepted' };
    expect(await convert(accepted)).toEqual([]);
  });

  it('un refus antérieur : aucun lien, aucun signal', async () => {
    recordFriendship.mockClear();
    const rejected = { id: 'fr-0', senderId: 'sponsor-1', receiverId: 'newcomer-1', status: 'rejected' };
    expect(await convert(rejected)).toEqual([]);
    expect(recordFriendship).not.toHaveBeenCalled();
  });

  it('un signal qui lève ne fait pas échouer la conversion', async () => {
    recordFriendship.mockResolvedValueOnce('created');
    const result = await AffiliateTrackingService.convertAffiliateVisit(
      makePrisma(null), 'aff_X', 'newcomer-1', undefined, undefined, () => { throw new Error('écho'); },
    );
    expect(result).toEqual({ success: true, data: { id: 'rel-1', status: 'completed' } });
  });
});

function ioSpy() {
  const sent: Array<{ room: string; event: string; payload: unknown }> = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => { sent.push({ room, event, payload }); return true; } }) };
  return { io: io as never, sent };
}

const deps = (io: never) => {
  const accepted: unknown[] = [];
  const forgotten: Array<ReadonlyArray<string>> = [];
  const refreshed: unknown[] = [];
  return {
    calls: { accepted, forgotten, refreshed },
    deps: {
      io,
      notifyAccepted: (params: unknown) => { accepted.push(params); },
      forget: async (ids: ReadonlyArray<string>) => { forgotten.push(ids); },
      refreshPair: async (pair: unknown) => { refreshed.push(pair); },
      now: () => new Date('2026-11-27T21:30:00.000Z'),
    },
  };
};

describe('announceAffiliateFriendship — comme une acceptation ordinaire', () => {
  it('monte le lien chez les deux, annonce la demande acceptée à son expéditeur, rejoue la paire', async () => {
    const { io, sent } = ioSpy();
    const { deps: d, calls } = deps(io);
    await announceAffiliateFriendship(d, {
      sponsorId: 'sponsor-1',
      referredId: 'newcomer-1',
      levelRaised: true,
      acceptedRequest: { id: 'fr-new', senderId: 'sponsor-1', receiverId: 'newcomer-1' },
    });

    expect(sent).toEqual([
      { room: 'user:sponsor-1', event: SERVER_EVENTS.RELATION_LEVEL_RAISED, payload: { userId: 'newcomer-1', level: 'FRIEND', at: '2026-11-27T21:30:00.000Z' } },
      { room: 'user:newcomer-1', event: SERVER_EVENTS.RELATION_LEVEL_RAISED, payload: { userId: 'sponsor-1', level: 'FRIEND', at: '2026-11-27T21:30:00.000Z' } },
    ]);
    expect(calls.accepted).toEqual([{ senderId: 'sponsor-1', friendRequestId: 'fr-new', accepterId: 'newcomer-1' }]);
    expect(calls.forgotten).toEqual([['sponsor-1', 'newcomer-1']]);
    expect(calls.refreshed).toEqual([{ userA: 'sponsor-1', userB: 'newcomer-1' }]);
  });

  it("une demande promue sans montée : l'expéditeur apprend l'acceptation, rien ne monte ni ne se rejoue", async () => {
    const { io, sent } = ioSpy();
    const { deps: d, calls } = deps(io);
    await announceAffiliateFriendship(d, {
      sponsorId: 'sponsor-1',
      referredId: 'newcomer-1',
      levelRaised: false,
      acceptedRequest: { id: 'fr-0', senderId: 'newcomer-1', receiverId: 'sponsor-1' },
    });

    expect(sent).toEqual([]);
    expect(calls.accepted).toEqual([{ senderId: 'newcomer-1', friendRequestId: 'fr-0', accepterId: 'sponsor-1' }]);
    expect(calls.forgotten).toEqual([['sponsor-1', 'newcomer-1']]);
    expect(calls.refreshed).toEqual([]);
  });

  it("n'échoue jamais, même quand un rejeu lève", async () => {
    const { io } = ioSpy();
    const { deps: d } = deps(io);
    const failing = { ...d, refreshPair: async () => { throw new Error('cache'); }, forget: async () => { throw new Error('redis'); } };
    await expect(announceAffiliateFriendship(failing, {
      sponsorId: 'sponsor-1', referredId: 'newcomer-1', levelRaised: true, acceptedRequest: null,
    })).resolves.toBeUndefined();
  });
});

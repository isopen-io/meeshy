/**
 * PresenceVisibilityService unit tests.
 *
 * Orchestrates relation/affiliation/conversation/blocking lookups + privacy
 * preferences, then delegates the policy to the shared pure helper
 * resolvePresenceVisibility. We mock Prisma + the privacy service and assert
 * the resulting visibility flags for each viewer↔target situation.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PresenceVisibilityService } from '../../services/PresenceVisibilityService';
import type { PrivacyPreferences } from '../../services/PrivacyPreferencesService';
import { findFirstHonouringWhere } from '../helpers/find-first-honouring-where';

const VIEWER = 'viewer-id';
const TARGET = 'target-id';

function makePrefs(over: Partial<PrivacyPreferences> = {}): PrivacyPreferences {
  return {
    showOnlineStatus: true,
    showLastSeen: true,
    showReadReceipts: true,
    showTypingIndicator: true,
    allowContactRequests: true,
    allowGroupInvites: true,
    saveMediaToGallery: true,
    allowAnalytics: true,
    ...over,
  };
}

function makeMocks(opts: {
  blocked?: boolean;
  friend?: boolean;
  prefs?: Partial<PrivacyPreferences>;
} = {}) {
  const prisma = {
    user: { findFirst: jest.fn<any>().mockResolvedValue(opts.blocked ? { id: 'x' } : null) },
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(opts.friend ? { id: 'fr' } : null) },
    userRelation: noRelations(),
  } as any;
  const privacy = { getPreferences: jest.fn<any>().mockResolvedValue(makePrefs(opts.prefs)) } as any;
  return { prisma, privacy, service: new PresenceVisibilityService(prisma, privacy) };
}

const target = { id: TARGET, deactivatedAt: null as Date | null };

/** Aucune ligne de niveau : la paire n'a que ses demandes (#13927, repli sur la demande acceptée). */
const noRelations = () => ({
  findUnique: jest.fn<any>().mockResolvedValue(null),
  findMany: jest.fn<any>().mockResolvedValue([]),
});

describe('PresenceVisibilityService.resolveForTarget', () => {
  it('shows everything to the user themselves without any DB lookup', async () => {
    const { service, prisma } = makeMocks();
    const v = await service.resolveForTarget({ userId: TARGET, role: 'USER' }, target);
    expect(v).toEqual({ showOnline: true, showLastSeenTimestamp: true });
    expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
  });

  it('does NOT show everything to a moderator anymore — MODERATOR lost its bypass on 2026-08-25', async () => {
    const { service, prisma } = makeMocks();
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'MODERATOR' }, target);
    expect(v).toEqual({ showOnline: false, showLastSeenTimestamp: false });
    expect(prisma.friendRequest.findFirst).toHaveBeenCalled();
  });

  it('shows everything to ADMIN/BIGBOSS without any relation lookup (directive: "Admin et supérieur")', async () => {
    for (const role of ['ADMIN', 'BIGBOSS'] as const) {
      const { service, prisma } = makeMocks();
      const v = await service.resolveForTarget({ userId: VIEWER, role }, target);
      expect(v).toEqual({ showOnline: true, showLastSeenTimestamp: true });
      expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
    }
  });

  it('hides everything from an anonymous (null) viewer on strict channels', async () => {
    const { service } = makeMocks({ friend: true });
    const v = await service.resolveForTarget(null, target);
    expect(v).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });

  it('shows full presence to an accepted friend when preferences are on', async () => {
    const { service } = makeMocks({ friend: true });
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'USER' }, target);
    expect(v).toEqual({ showOnline: true, showLastSeenTimestamp: true });
  });

  it('hides presence for an affiliate relation without an accepted friendship', async () => {
    const { service, prisma } = makeMocks({ friend: false });
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'USER' }, target);
    expect(v).toEqual({ showOnline: false, showLastSeenTimestamp: false });
    expect(prisma.friendRequest.findFirst).toHaveBeenCalled();
  });

  it('hides the timestamp for a friend when showLastSeen is off', async () => {
    const { service } = makeMocks({ friend: true, prefs: { showLastSeen: false } });
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'USER' }, target);
    expect(v).toEqual({ showOnline: true, showLastSeenTimestamp: false });
  });

  it('hides all presence for a friend when showOnlineStatus is off', async () => {
    const { service } = makeMocks({ friend: true, prefs: { showOnlineStatus: false } });
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'USER' }, target);
    expect(v).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });

  it('hides presence from a stranger', async () => {
    const { service } = makeMocks();
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'USER' }, target);
    expect(v).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });

  it('hides presence when blocked, without consulting the relation', async () => {
    const { service, prisma } = makeMocks({ blocked: true, friend: true });
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'USER' }, target);
    expect(v).toEqual({ showOnline: false, showLastSeenTimestamp: false });
    expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
  });

  it('hides presence for a deactivated target without any lookup', async () => {
    const { service, prisma } = makeMocks({ friend: true });
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'USER' }, {
      id: TARGET,
      deactivatedAt: new Date(),
    });
    expect(v).toEqual({ showOnline: false, showLastSeenTimestamp: false });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('hides presence from a conversation co-participant who is not a friend — sharing a conversation is not a relationship', async () => {
    const { service } = makeMocks({ friend: false });
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'USER' }, target);
    expect(v).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });
});

function makeBatchMocks(state: {
  friendIds?: string[];
  blockedTargetIds?: string[];
  viewerBlocks?: string[];
  deactivatedIds?: string[];
}) {
  const prisma = {
    user: {
      findMany: jest.fn<any>().mockImplementation(({ where }: any) => {
        if (where?.blockedUserIds?.has) {
          return Promise.resolve((state.blockedTargetIds ?? []).map((id) => ({ id })));
        }
        const ids: string[] = where?.id?.in ?? [];
        return Promise.resolve(ids.map((id) => ({ id, deactivatedAt: (state.deactivatedIds ?? []).includes(id) ? new Date() : null })));
      }),
      findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: state.viewerBlocks ?? [] }),
    },
    friendRequest: {
      findMany: jest.fn<any>().mockResolvedValue((state.friendIds ?? []).map((id) => ({ senderId: id, receiverId: VIEWER }))),
    },
    userRelation: noRelations(),
  } as any;
  const privacy = {
    getPreferencesForUsers: jest.fn<any>().mockImplementation((arr: Array<{ id: string }>) =>
      Promise.resolve(new Map(arr.map(({ id }) => [id, makePrefs()]))),
    ),
  } as any;
  return { service: new PresenceVisibilityService(prisma, privacy), prisma };
}

describe('PresenceVisibilityService.resolveForTargets (batch)', () => {
  const IDS = ['friend', 'stranger', 'blocked', 'mate'];

  it('does NOT return FULL for everyone to a moderator anymore — MODERATOR lost its bypass on 2026-08-25', async () => {
    const { service, prisma } = makeBatchMocks({});
    const map = await service.resolveForTargets({ userId: VIEWER, role: 'MODERATOR' }, IDS);
    expect(map.get('stranger')).toEqual({ showOnline: false, showLastSeenTimestamp: false });
    expect(prisma.friendRequest.findMany).toHaveBeenCalled();
  });

  it('returns FULL for everyone to ADMIN/BIGBOSS without per-id queries (directive: "Admin et supérieur")', async () => {
    for (const role of ['ADMIN', 'BIGBOSS'] as const) {
      const { service, prisma } = makeBatchMocks({});
      const map = await service.resolveForTargets({ userId: VIEWER, role }, IDS);
      expect(map.get('stranger')).toEqual({ showOnline: true, showLastSeenTimestamp: true });
      expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();
    }
  });

  it('hides a deactivated target even from an admin, matching resolveForTarget', async () => {
    const { service } = makeBatchMocks({ deactivatedIds: ['stranger'] });
    const map = await service.resolveForTargets({ userId: VIEWER, role: 'ADMIN' }, IDS);
    // Deactivation is "en amont" of the privilege bypass (design §8 + the pure
    // policy's targetIsDeactivated guard) — the single-target path already hides
    // it, so the batch list path must not leak the deactivated user's presence.
    expect(map.get('stranger')).toEqual({ showOnline: false, showLastSeenTimestamp: false });
    expect(map.get('friend')).toEqual({ showOnline: true, showLastSeenTimestamp: true });
  });

  it('resolves per-id visibility for a regular viewer — a non-friend co-participant ("mate") is hidden', async () => {
    const { service } = makeBatchMocks({
      friendIds: ['friend'],
      blockedTargetIds: ['blocked'],
    });
    const map = await service.resolveForTargets({ userId: VIEWER, role: 'USER' }, IDS);
    expect(map.get('friend')).toEqual({ showOnline: true, showLastSeenTimestamp: true });
    expect(map.get('stranger')).toEqual({ showOnline: false, showLastSeenTimestamp: false });
    expect(map.get('blocked')).toEqual({ showOnline: false, showLastSeenTimestamp: false });
    expect(map.get('mate')).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });

  it('hides everyone from an anonymous viewer', async () => {
    const { service } = makeBatchMocks({ friendIds: ['friend'] });
    const map = await service.resolveForTargets(null, IDS);
    expect(map.get('friend')).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });
});

describe('PresenceVisibilityService.acceptedFriendIds', () => {
  function svcWithFriendships(rows: Array<{ senderId: string; receiverId: string }>) {
    const prisma = {
      friendRequest: { findMany: jest.fn<any>().mockResolvedValue(rows) },
      userRelation: noRelations(),
      // #13298 — la relation de blocage, vide ici (témoins dédiés :
      // `presence-blocked-audience-13298.test.ts`).
      user: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
      },
    } as any;
    return { prisma, service: new PresenceVisibilityService(prisma, {} as any) };
  }

  it('rend le PAIR de chaque amitié acceptée, dans les deux sens de la demande', async () => {
    const { service } = svcWithFriendships([
      { senderId: VIEWER, receiverId: 'friend-sent' },
      { senderId: 'friend-received', receiverId: VIEWER },
    ]);
    await expect(service.acceptedFriendIds(VIEWER)).resolves.toEqual(
      new Set(['friend-sent', 'friend-received']),
    );
  });

  it("n'interroge que les demandes ACCEPTÉES du seul utilisateur — coût borné par ses amis", async () => {
    const { service, prisma } = svcWithFriendships([]);
    await service.acceptedFriendIds(VIEWER);
    expect(prisma.friendRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'accepted',
          OR: [{ senderId: VIEWER }, { receiverId: VIEWER }],
        },
      }),
    );
  });

  it("ne se rend jamais lui-même comme ami (ligne d'auto-amitié résiduelle)", async () => {
    const { service } = svcWithFriendships([{ senderId: VIEWER, receiverId: VIEWER }]);
    await expect(service.acceptedFriendIds(VIEWER)).resolves.toEqual(new Set());
  });
});

describe('PresenceVisibilityService.resolveForTarget — la loi d\'amitié atteint le verdict SERVI (#4866)', () => {
  /**
   * `makeMocks` ci-dessus double `friendRequest.findFirst` INCONDITIONNELLEMENT
   * (`mockResolvedValue`) : il ne peut pas distinguer une demande ACCEPTÉE d'une
   * demande PENDING/REJECTED entre les deux mêmes comptes. Ici le double HONORE
   * le `where` (`findFirstHonouringWhere`, #4585), et la fixture porte les DEUX
   * formes de bruit que la loi doit écarter — sans quoi le double n'a rien à
   * honorer (leçon de #4585, reprise par #4866 critère 2).
   */
  function servicePresentToFriendshipRows(rows: ReadonlyArray<Record<string, unknown>>) {
    const prisma = {
      user: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      friendRequest: { findFirst: jest.fn<any>(findFirstHonouringWhere(rows)) },
      userRelation: noRelations(),
    } as any;
    const privacy = { getPreferences: jest.fn<any>().mockResolvedValue(makePrefs()) } as any;
    return new PresenceVisibilityService(prisma, privacy);
  }

  it('une demande REFUSÉE entre le viewer et la cible ne révèle PAS la présence', async () => {
    const service = servicePresentToFriendshipRows([
      { id: 'fr-1', senderId: VIEWER, receiverId: TARGET, status: 'rejected' },
    ]);
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'USER' }, target);
    expect(v).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });

  it('une demande EN ATTENTE entre le viewer et la cible ne révèle PAS la présence', async () => {
    const service = servicePresentToFriendshipRows([
      { id: 'fr-1', senderId: TARGET, receiverId: VIEWER, status: 'pending' },
    ]);
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'USER' }, target);
    expect(v).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });

  it('une demande ACCEPTÉE, même en présence d\'une pending/rejected du même couple, révèle la présence', async () => {
    const service = servicePresentToFriendshipRows([
      { id: 'fr-old', senderId: VIEWER, receiverId: TARGET, status: 'rejected' },
      { id: 'fr-new', senderId: TARGET, receiverId: VIEWER, status: 'accepted' },
    ]);
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'USER' }, target);
    expect(v).toEqual({ showOnline: true, showLastSeenTimestamp: true });
  });
});


/**
 * #13927 — la présence se lit sur le NIVEAU effectif du lien (ligne UserRelation,
 * minimum des deux accords), plus sur le seul booléen d'une demande acceptée.
 * À ce lot, tout niveau >= Ami rend ce que rendait l'amitié (l'Ami binaire est
 * le lot suivant) ; en dessous, rien.
 */
describe('PresenceVisibilityService — le niveau effectif atteint le verdict SERVI (#13927)', () => {
  const LOW_ID = 'a'.repeat(24);
  const HIGH_ID = 'b'.repeat(24);
  const FULL = { showOnline: true, showLastSeenTimestamp: true };
  const HIDDEN = { showOnline: false, showLastSeenTimestamp: false };

  const ACCEPTED_AT = new Date('2026-09-01T00:00:00.000Z');

  function serviceWithRelation(
    row: { grantedByLow: string; grantedByHigh: string; transitions?: ReadonlyArray<Record<string, unknown>> } | null,
    request = false,
  ) {
    const prisma = {
      user: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      friendRequest: {
        findFirst: jest.fn<any>().mockResolvedValue(
          request ? { senderId: LOW_ID, receiverId: HIGH_ID, respondedAt: ACCEPTED_AT, updatedAt: ACCEPTED_AT } : null,
        ),
      },
      userRelation: {
        findUnique: jest.fn<any>().mockResolvedValue(row ? { userLowId: LOW_ID, userHighId: HIGH_ID, ...row } : null),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
    } as any;
    const privacy = { getPreferences: jest.fn<any>().mockResolvedValue(makePrefs()) } as any;
    return new PresenceVisibilityService(prisma, privacy);
  }

  const resolve = (service: PresenceVisibilityService) =>
    service.resolveForTarget({ userId: LOW_ID, role: 'USER' }, { id: HIGH_ID, deactivatedAt: null });

  it.each([
    ['FRIEND', 'FRIEND'],
    ['CLOSE', 'BLOOD'],
    ['BLOOD', 'BLOOD'],
  ])('un lien accordé %s / %s sert la présence', async (low, high) => {
    await expect(resolve(serviceWithRelation({ grantedByLow: low, grantedByHigh: high }))).resolves.toEqual(FULL);
  });

  it.each([
    ['ACQUAINTANCE', 'ACQUAINTANCE'],
    ['BLOOD', 'PUBLIC'],
    ['PUBLIC', 'BLOOD'],
  ])('un lien accordé %s / %s ne sert rien (sous Ami, ou à sens unique)', async (low, high) => {
    await expect(resolve(serviceWithRelation({ grantedByLow: low, grantedByHigh: high }))).resolves.toEqual(HIDDEN);
  });

  it('une baisse gravée après l\'acceptation l\'emporte sur la vieille demande acceptée', async () => {
    const drop = { actorId: LOW_ID, from: 'FRIEND', to: 'ACQUAINTANCE', at: new Date('2026-09-20T00:00:00.000Z') };
    await expect(
      resolve(serviceWithRelation({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'FRIEND', transitions: [drop] }, true)),
    ).resolves.toEqual(HIDDEN);
  });

  it('une ligne née sous Ami SANS baisse ne cache pas la présence d\'un ami accepté avant le rattrapage', async () => {
    await expect(
      resolve(serviceWithRelation({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE' }, true)),
    ).resolves.toEqual(FULL);
  });

  it('sans ligne, la demande acceptée se lit toujours Ami (aucune rétrogradation rétroactive)', async () => {
    await expect(resolve(serviceWithRelation(null, true))).resolves.toEqual(FULL);
  });
});

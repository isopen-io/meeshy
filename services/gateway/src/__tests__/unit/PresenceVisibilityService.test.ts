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
  affiliate?: boolean;
  sharesConversation?: boolean;
  prefs?: Partial<PrivacyPreferences>;
} = {}) {
  const prisma = {
    user: { findFirst: jest.fn<any>().mockResolvedValue(opts.blocked ? { id: 'x' } : null) },
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(opts.friend ? { id: 'fr' } : null) },
    affiliateRelation: { findFirst: jest.fn<any>().mockResolvedValue(opts.affiliate ? { id: 'af' } : null) },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue(opts.sharesConversation ? [{ conversationId: 'c1' }] : []),
      findFirst: jest.fn<any>().mockResolvedValue(opts.sharesConversation ? { id: 'p1' } : null),
    },
  } as any;
  const privacy = { getPreferences: jest.fn<any>().mockResolvedValue(makePrefs(opts.prefs)) } as any;
  return { prisma, privacy, service: new PresenceVisibilityService(prisma, privacy) };
}

const target = { id: TARGET, deactivatedAt: null as Date | null };

describe('PresenceVisibilityService.resolveForTarget', () => {
  it('shows everything to the user themselves without any DB lookup', async () => {
    const { service, prisma } = makeMocks();
    const v = await service.resolveForTarget({ userId: TARGET, role: 'USER' }, target);
    expect(v).toEqual({ showOnline: true, showLastSeenTimestamp: true });
    expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
  });

  it('shows everything to a moderator without any relation lookup', async () => {
    const { service, prisma } = makeMocks();
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'MODERATOR' }, target);
    expect(v).toEqual({ showOnline: true, showLastSeenTimestamp: true });
    expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
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

  it('shows presence to an affiliate even without friendship', async () => {
    const { service } = makeMocks({ friend: false, affiliate: true });
    const v = await service.resolveForTarget({ userId: VIEWER, role: 'USER' }, target);
    expect(v).toEqual({ showOnline: true, showLastSeenTimestamp: true });
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

  it('shows presence to a co-participant only when conversation context is allowed', async () => {
    const withCtx = makeMocks({ sharesConversation: true });
    expect(
      await withCtx.service.resolveForTarget({ userId: VIEWER, role: 'USER' }, target, {
        allowConversationContext: true,
      }),
    ).toEqual({ showOnline: true, showLastSeenTimestamp: true });

    const withoutCtx = makeMocks({ sharesConversation: true });
    expect(
      await withoutCtx.service.resolveForTarget({ userId: VIEWER, role: 'USER' }, target),
    ).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });
});

function makeBatchMocks(state: {
  friendIds?: string[];
  affiliateIds?: string[];
  blockedTargetIds?: string[];
  viewerBlocks?: string[];
  deactivatedIds?: string[];
  coParticipantIds?: string[];
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
    affiliateRelation: {
      findMany: jest.fn<any>().mockResolvedValue((state.affiliateIds ?? []).map((id) => ({ affiliateUserId: VIEWER, referredUserId: id }))),
    },
    participant: {
      findMany: jest.fn<any>().mockImplementation(({ where }: any) =>
        where?.userId === VIEWER
          ? Promise.resolve([{ conversationId: 'c1' }])
          : Promise.resolve((state.coParticipantIds ?? []).map((id) => ({ userId: id }))),
      ),
    },
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

  it('returns FULL for everyone to a moderator without per-id queries', async () => {
    const { service, prisma } = makeBatchMocks({});
    const map = await service.resolveForTargets({ userId: VIEWER, role: 'MODERATOR' }, IDS);
    expect(map.get('stranger')).toEqual({ showOnline: true, showLastSeenTimestamp: true });
    expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();
  });

  it('resolves per-id visibility for a regular viewer', async () => {
    const { service } = makeBatchMocks({
      friendIds: ['friend'],
      blockedTargetIds: ['blocked'],
      coParticipantIds: ['mate'],
    });
    const map = await service.resolveForTargets({ userId: VIEWER, role: 'USER' }, IDS, {
      allowConversationContext: true,
    });
    expect(map.get('friend')).toEqual({ showOnline: true, showLastSeenTimestamp: true });
    expect(map.get('stranger')).toEqual({ showOnline: false, showLastSeenTimestamp: false });
    expect(map.get('blocked')).toEqual({ showOnline: false, showLastSeenTimestamp: false });
    expect(map.get('mate')).toEqual({ showOnline: true, showLastSeenTimestamp: true });
  });

  it('hides everyone from an anonymous viewer', async () => {
    const { service } = makeBatchMocks({ friendIds: ['friend'] });
    const map = await service.resolveForTargets(null, IDS);
    expect(map.get('friend')).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });
});

describe('PresenceVisibilityService.resolvePrefsOnly', () => {
  function svcWithPrefs(prefsById: Record<string, Partial<PrivacyPreferences>>) {
    const privacy = {
      getPreferencesForUsers: jest.fn<any>().mockImplementation((arr: Array<{ id: string }>) =>
        Promise.resolve(new Map(arr.map(({ id }) => [id, makePrefs(prefsById[id] ?? {})]))),
      ),
    } as any;
    return new PresenceVisibilityService({} as any, privacy);
  }

  it('shows presence but applies the preference cascade, without any relation lookup', async () => {
    const svc = svcWithPrefs({ off: { showOnlineStatus: false }, noseen: { showLastSeen: false } });
    const map = await svc.resolvePrefsOnly(['normal', 'off', 'noseen']);
    expect(map.get('normal')).toEqual({ showOnline: true, showLastSeenTimestamp: true });
    expect(map.get('off')).toEqual({ showOnline: false, showLastSeenTimestamp: false });
    expect(map.get('noseen')).toEqual({ showOnline: true, showLastSeenTimestamp: false });
  });
});

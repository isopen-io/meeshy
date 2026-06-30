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

import { describe, it, expect } from 'vitest';
import {
  resolvePresenceVisibility,
  type PresenceVisibilityInput,
} from '../../utils/presence-visibility.js';

const baseInput = (over: Partial<PresenceVisibilityInput> = {}): PresenceVisibilityInput => ({
  isSelf: false,
  viewerRole: 'USER',
  areConnected: false,
  sharesConversation: false,
  targetShowOnlineStatus: true,
  targetShowLastSeen: true,
  targetIsDeactivated: false,
  isBlockedEitherWay: false,
  ...over,
});

describe('resolvePresenceVisibility', () => {
  it('shows everything to the user themselves, even with all preferences off', () => {
    const v = resolvePresenceVisibility(
      baseInput({ isSelf: true, targetShowOnlineStatus: false, targetShowLastSeen: false }),
    );
    expect(v).toEqual({ showOnline: true, showLastSeenTimestamp: true });
  });

  it('lets a moderator bypass the preferences of a stranger', () => {
    const v = resolvePresenceVisibility(
      baseInput({ viewerRole: 'MODERATOR', targetShowOnlineStatus: false, targetShowLastSeen: false }),
    );
    expect(v).toEqual({ showOnline: true, showLastSeenTimestamp: true });
  });

  it('lets ADMIN and BIGBOSS bypass too', () => {
    for (const role of ['ADMIN', 'BIGBOSS'] as const) {
      expect(resolvePresenceVisibility(baseInput({ viewerRole: role }))).toEqual({
        showOnline: true,
        showLastSeenTimestamp: true,
      });
    }
  });

  it('does NOT let AUDIT or ANALYST bypass (below MODERATOR)', () => {
    for (const role of ['AUDIT', 'ANALYST'] as const) {
      expect(resolvePresenceVisibility(baseInput({ viewerRole: role }))).toEqual({
        showOnline: false,
        showLastSeenTimestamp: false,
      });
    }
  });

  it('shows full presence to a connected contact when both preferences are on', () => {
    expect(resolvePresenceVisibility(baseInput({ areConnected: true }))).toEqual({
      showOnline: true,
      showLastSeenTimestamp: true,
    });
  });

  it('hides only the timestamp for a contact when showLastSeen is off', () => {
    expect(
      resolvePresenceVisibility(baseInput({ areConnected: true, targetShowLastSeen: false })),
    ).toEqual({ showOnline: true, showLastSeenTimestamp: false });
  });

  it('hides all presence for a contact when showOnlineStatus is off (master switch)', () => {
    expect(
      resolvePresenceVisibility(baseInput({ areConnected: true, targetShowOnlineStatus: false })),
    ).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });

  it('shows presence to a conversation co-participant when context is allowed', () => {
    expect(resolvePresenceVisibility(baseInput({ sharesConversation: true }))).toEqual({
      showOnline: true,
      showLastSeenTimestamp: true,
    });
  });

  it('hides presence from a stranger (no relation, no context, not privileged)', () => {
    expect(resolvePresenceVisibility(baseInput())).toEqual({
      showOnline: false,
      showLastSeenTimestamp: false,
    });
  });

  it('hides presence when either party blocked the other, even for a contact', () => {
    expect(
      resolvePresenceVisibility(baseInput({ areConnected: true, isBlockedEitherWay: true })),
    ).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });

  it('hides presence of a deactivated target, even from a contact', () => {
    expect(
      resolvePresenceVisibility(baseInput({ areConnected: true, targetIsDeactivated: true })),
    ).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });
});

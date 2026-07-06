import { describe, it, expect } from 'vitest';
import {
  resolvePresenceVisibility,
  applyPresenceVisibility,
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

describe('applyPresenceVisibility', () => {
  const profile = { id: 'u1', isOnline: true as boolean | null, lastActiveAt: new Date(1000) as Date | null };

  it('keeps both fields when both flags are on', () => {
    const out = applyPresenceVisibility(profile, { showOnline: true, showLastSeenTimestamp: true });
    expect(out.isOnline).toBe(true);
    expect(out.lastActiveAt).toEqual(new Date(1000));
  });

  it('nulls isOnline when showOnline is off, keeping the rest of the object', () => {
    const out = applyPresenceVisibility(profile, { showOnline: false, showLastSeenTimestamp: false });
    expect(out.isOnline).toBeNull();
    expect(out.lastActiveAt).toBeNull();
    expect(out.id).toBe('u1');
  });

  it('keeps isOnline but nulls the timestamp when only showLastSeenTimestamp is off', () => {
    const out = applyPresenceVisibility(profile, { showOnline: true, showLastSeenTimestamp: false });
    expect(out.isOnline).toBe(true);
    expect(out.lastActiveAt).toBeNull();
  });

  it('does not mutate the input object', () => {
    const input = { id: 'u2', isOnline: true as boolean | null, lastActiveAt: new Date(2000) as Date | null };
    applyPresenceVisibility(input, { showOnline: false, showLastSeenTimestamp: false });
    expect(input.isOnline).toBe(true);
    expect(input.lastActiveAt).toEqual(new Date(2000));
  });
});

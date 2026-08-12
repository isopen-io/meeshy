/**
 * GW7 — timezone-aware Do-Not-Disturb window, single shared rule site.
 *
 * The DND window was evaluated in server UTC in TWO duplicated gateway
 * implementations (NotificationService.isDNDActive and
 * PushNotificationService.isPushAllowed): a Tokyo user's 22:00-08:00 window
 * was applied on UTC hours. `isWithinDnd` is the one shared implementation,
 * consuming the new `dndUtcOffsetMinutes` preference (default 0 = legacy UTC
 * behavior).
 */

import { describe, it, expect } from 'vitest';
import { isWithinDnd } from '../../utils/notification-dnd';

const TOKYO_OFFSET_MINUTES = 540;

function makePrefs(overrides: Record<string, unknown> = {}) {
  return {
    dndEnabled: true,
    dndStartTime: '22:00',
    dndEndTime: '08:00',
    dndDays: [] as Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>,
    dndUtcOffsetMinutes: 0,
    ...overrides,
  };
}

describe('isWithinDnd', () => {
  it('returns false when dnd is disabled', () => {
    const prefs = makePrefs({ dndEnabled: false });
    expect(isWithinDnd(prefs, new Date('2026-07-20T23:30:00.000Z'))).toBe(false);
  });

  it('legacy UTC behavior when offset is 0 — inside overnight window', () => {
    expect(isWithinDnd(makePrefs(), new Date('2026-07-20T23:30:00.000Z'))).toBe(true);
    expect(isWithinDnd(makePrefs(), new Date('2026-07-20T07:59:00.000Z'))).toBe(true);
  });

  it('legacy UTC behavior when offset is 0 — outside overnight window', () => {
    expect(isWithinDnd(makePrefs(), new Date('2026-07-20T12:00:00.000Z'))).toBe(false);
    expect(isWithinDnd(makePrefs(), new Date('2026-07-20T08:00:00.000Z'))).toBe(false);
  });

  it('Tokyo (+540) — 23:00 local = 14:00 UTC is INSIDE the 22:00-08:00 window', () => {
    const prefs = makePrefs({ dndUtcOffsetMinutes: TOKYO_OFFSET_MINUTES });
    expect(isWithinDnd(prefs, new Date('2026-07-20T14:00:00.000Z'))).toBe(true);
  });

  it('Tokyo (+540) — 12:00 local = 03:00 UTC is OUTSIDE the 22:00-08:00 window', () => {
    const prefs = makePrefs({ dndUtcOffsetMinutes: TOKYO_OFFSET_MINUTES });
    expect(isWithinDnd(prefs, new Date('2026-07-20T03:00:00.000Z'))).toBe(false);
  });

  it('negative offset (-300, New York summer) — 23:00 local = 04:00 UTC next day is INSIDE', () => {
    const prefs = makePrefs({ dndUtcOffsetMinutes: -300 });
    expect(isWithinDnd(prefs, new Date('2026-07-21T04:00:00.000Z'))).toBe(true);
  });

  it('daytime window (14:00-16:00) respects local time with offset', () => {
    const prefs = makePrefs({ dndStartTime: '14:00', dndEndTime: '16:00', dndUtcOffsetMinutes: 60 });
    expect(isWithinDnd(prefs, new Date('2026-07-20T13:30:00.000Z'))).toBe(true);  // 14:30 local
    expect(isWithinDnd(prefs, new Date('2026-07-20T16:30:00.000Z'))).toBe(false); // 17:30 local
  });

  describe('dndDays — tested against the LOCAL day the window STARTED', () => {
    it('morning tail of an overnight window belongs to the previous local day', () => {
      // 2026-07-21 is a Tuesday. At 06:00 local (Tokyo), the overnight
      // 22:00-08:00 window STARTED Monday evening → 'mon' governs.
      const prefs = makePrefs({ dndUtcOffsetMinutes: TOKYO_OFFSET_MINUTES, dndDays: ['mon'] });
      const tuesdayMorningTokyo = new Date('2026-07-20T21:00:00.000Z'); // Tue 06:00 Tokyo
      expect(isWithinDnd(prefs, tuesdayMorningTokyo)).toBe(true);
    });

    it('window-start day not selected → not in DND', () => {
      const prefs = makePrefs({ dndUtcOffsetMinutes: TOKYO_OFFSET_MINUTES, dndDays: ['tue'] });
      const tuesdayMorningTokyo = new Date('2026-07-20T21:00:00.000Z'); // Tue 06:00 Tokyo, window started Mon
      expect(isWithinDnd(prefs, tuesdayMorningTokyo)).toBe(false);
    });

    it('evening slice is governed by the current local day', () => {
      // Mon 23:00 Tokyo = 2026-07-20T14:00Z (Monday in Tokyo).
      const prefs = makePrefs({ dndUtcOffsetMinutes: TOKYO_OFFSET_MINUTES, dndDays: ['mon'] });
      expect(isWithinDnd(prefs, new Date('2026-07-20T14:00:00.000Z'))).toBe(true);
    });
  });

  it('missing dndUtcOffsetMinutes falls back to UTC (legacy prefs documents)', () => {
    const prefs = makePrefs();
    delete (prefs as Record<string, unknown>).dndUtcOffsetMinutes;
    expect(isWithinDnd(prefs, new Date('2026-07-20T23:30:00.000Z'))).toBe(true);
    expect(isWithinDnd(prefs, new Date('2026-07-20T12:00:00.000Z'))).toBe(false);
  });

  describe('non-zero-padded hour (legacy docs persisted through the lax schema)', () => {
    // The lexicographic overnight/membership comparison only holds for
    // zero-padded "HH:MM". A legacy document carrying "9:00" (a single-digit
    // hour) must NOT be mis-read as an overnight window: '9' > '1' would flip
    // 09:00-17:00 into a spurious overnight block covering midnight → 17:00.
    it('single-digit start hour is a daytime window, not overnight', () => {
      const prefs = makePrefs({ dndStartTime: '9:00', dndEndTime: '17:00' });
      // 03:00 UTC is BEFORE a 09:00 start → outside the daytime window.
      expect(isWithinDnd(prefs, new Date('2026-01-01T03:00:00.000Z'))).toBe(false);
      // 10:00 UTC is INSIDE 09:00-17:00.
      expect(isWithinDnd(prefs, new Date('2026-01-01T10:00:00.000Z'))).toBe(true);
      // 18:00 UTC is AFTER the 17:00 end → outside.
      expect(isWithinDnd(prefs, new Date('2026-01-01T18:00:00.000Z'))).toBe(false);
    });

    it('single-digit end hour of an overnight window is evaluated correctly', () => {
      // 22:00-8:00 overnight, unpadded end. 07:59 local is INSIDE the morning
      // tail; 08:00 is the exclusive end.
      const prefs = makePrefs({ dndStartTime: '22:00', dndEndTime: '8:00' });
      expect(isWithinDnd(prefs, new Date('2026-01-01T07:59:00.000Z'))).toBe(true);
      expect(isWithinDnd(prefs, new Date('2026-01-01T08:00:00.000Z'))).toBe(false);
    });

    it('both bounds single-digit — daytime window with offset', () => {
      const prefs = makePrefs({ dndStartTime: '9:00', dndEndTime: '9:30', dndUtcOffsetMinutes: 60 });
      // 09:15 local = 08:15 UTC → inside 09:00-09:30 local.
      expect(isWithinDnd(prefs, new Date('2026-01-01T08:15:00.000Z'))).toBe(true);
      // 09:45 local = 08:45 UTC → outside.
      expect(isWithinDnd(prefs, new Date('2026-01-01T08:45:00.000Z'))).toBe(false);
    });
  });
});

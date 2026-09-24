import { describe, expect, test } from 'bun:test';

import { shouldRevealSendingClock } from './send-clock';

describe('shouldRevealSendingClock', () => {
  test('startedAt absent ⇒ true', () => {
    expect(shouldRevealSendingClock(undefined, 1_000)).toBe(true);
  });

  test('now − startedAt < 200 ⇒ false (199 ms)', () => {
    expect(shouldRevealSendingClock(1_000, 1_199)).toBe(false);
  });

  test('now − startedAt >= 200 ⇒ true (200 ms pile)', () => {
    expect(shouldRevealSendingClock(1_000, 1_200)).toBe(true);
  });
});

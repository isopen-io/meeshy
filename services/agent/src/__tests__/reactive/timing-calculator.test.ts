import { calculateResponseDelay } from '../../reactive/timing-calculator';

describe('TimingCalculator', () => {
  it('returns fast delay for greeting', () => {
    const delay = calculateResponseDelay({
      interpellationType: 'greeting', wordCount: 2,
      lastUserMessageAgoMs: 5 * 60 * 1000, unreadMessageCount: 1,
    });
    expect(delay).toBeGreaterThanOrEqual(3_000);
    expect(delay).toBeLessThanOrEqual(40_000);
  });

  it('returns shorter delay if user spoke recently', () => {
    const results: number[] = [];
    for (let i = 0; i < 20; i++) {
      results.push(calculateResponseDelay({
        interpellationType: 'mention', wordCount: 10,
        lastUserMessageAgoMs: 30 * 1000, unreadMessageCount: 1,
      }));
    }
    const recentAvg = results.reduce((a, b) => a + b) / results.length;

    const oldResults: number[] = [];
    for (let i = 0; i < 20; i++) {
      oldResults.push(calculateResponseDelay({
        interpellationType: 'mention', wordCount: 10,
        lastUserMessageAgoMs: 5 * 60 * 60 * 1000, unreadMessageCount: 1,
      }));
    }
    const oldAvg = oldResults.reduce((a, b) => a + b) / oldResults.length;

    expect(recentAvg).toBeLessThan(oldAvg);
  });

  it('typing time scales with word count', () => {
    const shortResults: number[] = [];
    for (let i = 0; i < 20; i++) {
      shortResults.push(calculateResponseDelay({
        interpellationType: 'reply', wordCount: 3,
        lastUserMessageAgoMs: 60_000, unreadMessageCount: 0,
      }));
    }
    const shortAvg = shortResults.reduce((a, b) => a + b) / shortResults.length;

    const longResults: number[] = [];
    for (let i = 0; i < 20; i++) {
      longResults.push(calculateResponseDelay({
        interpellationType: 'reply', wordCount: 50,
        lastUserMessageAgoMs: 60_000, unreadMessageCount: 0,
      }));
    }
    const longAvg = longResults.reduce((a, b) => a + b) / longResults.length;

    expect(longAvg).toBeGreaterThan(shortAvg);
  });

  it('caps typing time at 180s', () => {
    const results: number[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(calculateResponseDelay({
        interpellationType: 'reply', wordCount: 200,
        lastUserMessageAgoMs: 0, unreadMessageCount: 0,
      }));
    }
    const maxDelay = Math.max(...results);
    // apparition(0-5s) + reading(0) + typing(max 180s) + jitter(±20%) = max ~222s
    expect(maxDelay).toBeLessThanOrEqual(250_000);
  });

  it('adds reading delay proportional to unread count', () => {
    const noUnread: number[] = [];
    for (let i = 0; i < 20; i++) {
      noUnread.push(calculateResponseDelay({
        interpellationType: 'mention', wordCount: 10,
        lastUserMessageAgoMs: 60_000, unreadMessageCount: 0,
      }));
    }
    const noUnreadAvg = noUnread.reduce((a, b) => a + b) / noUnread.length;

    const manyUnread: number[] = [];
    for (let i = 0; i < 20; i++) {
      manyUnread.push(calculateResponseDelay({
        interpellationType: 'mention', wordCount: 10,
        lastUserMessageAgoMs: 60_000, unreadMessageCount: 10,
      }));
    }
    const manyUnreadAvg = manyUnread.reduce((a, b) => a + b) / manyUnread.length;

    expect(manyUnreadAvg).toBeGreaterThan(noUnreadAvg);
  });
});

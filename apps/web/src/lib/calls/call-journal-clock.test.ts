import { describe, expect, test } from 'bun:test';

import { journalClock } from './call-journal-clock';

describe('l’heure dans l’appel (#17517, #17878 A1.5)', () => {
  test('mm:ss (minutes complétées) depuis le début de l’appel, h:mm:ss au-delà de l’heure', () => {
    expect(journalClock(4_000, 0)).toBe('00:04');
    expect(journalClock(65_000, 0)).toBe('01:05');
    expect(journalClock(3_725_000, 0)).toBe('1:02:05');
  });

  test('une phrase antérieure au début se lit 00:00, sans début connu aucune heure', () => {
    expect(journalClock(500, 1_000)).toBe('00:00');
    expect(journalClock(65_000, null)).toBeNull();
  });
});

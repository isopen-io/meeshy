import { describe, expect, test } from 'bun:test';

import { rankEmojis } from './emoji-usage';

describe('emoji-usage — classement par usage, miroir EmojiUsageTracker.topEmojis', () => {
  test('sans historique, les défauts dans leur ordre', () => {
    expect(rankEmojis({}, { count: 3, defaults: ['😂', '❤️', '👍', '😮'] })).toEqual(['😂', '❤️', '👍']);
  });
});

import { describe, expect, test } from 'bun:test';

import { shareDestinationOf } from './share-destination';

describe('shareDestinationOf (#10502)', () => {
  test('une conversation l’emporte ; sinon la story ; sinon le repost', () => {
    expect(shareDestinationOf({ conversations: 2, publish: ['STORY'] })).toBe('conversation');
    expect(shareDestinationOf({ conversations: 0, publish: ['POST', 'STORY'] })).toBe('story');
    expect(shareDestinationOf({ conversations: 0, publish: ['REEL'] })).toBe('repost');
    expect(shareDestinationOf({ conversations: 0, publish: [] })).toBe('other');
  });
});

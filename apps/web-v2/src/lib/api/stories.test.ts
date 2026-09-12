import { describe, expect, test } from 'bun:test';

import { STATUS_MOODS_QUERY_KEY, STORIES_QUERY_PREFIX, STORY_TRAY_QUERY_KEY } from './stories';

/**
 * `STORIES_QUERY_PREFIX` (#6195) — le tirer-pour-rafraîchir de la Lentille
 * invalide CE préfixe d'un seul appel : les deux clés doivent en être des
 * PROJECTIONS, jamais deux littéraux qui pourraient diverger.
 */
describe('STORIES_QUERY_PREFIX', () => {
  test('STORY_TRAY_QUERY_KEY et STATUS_MOODS_QUERY_KEY commencent par le préfixe', () => {
    expect(STORY_TRAY_QUERY_KEY.slice(0, STORIES_QUERY_PREFIX.length)).toEqual(STORIES_QUERY_PREFIX);
    expect(STATUS_MOODS_QUERY_KEY.slice(0, STORIES_QUERY_PREFIX.length)).toEqual(STORIES_QUERY_PREFIX);
  });

  test('les deux clés restent DISTINCTES malgré le préfixe commun', () => {
    expect(STORY_TRAY_QUERY_KEY).not.toEqual(STATUS_MOODS_QUERY_KEY);
  });
});

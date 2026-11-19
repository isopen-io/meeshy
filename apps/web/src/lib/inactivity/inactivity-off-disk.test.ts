import { describe, expect, test } from 'bun:test';

import { persistableQuery } from '@/lib/api/query-client';
import { INACTIVITY_STATES_QUERY_KEY } from '@/lib/inactivity/inactivity-live';

describe('la dernière position d’un Sang ne se range pas sur le disque (#16984)', () => {
  test('le cache des alertes d’inactivité (qui porte lastPosition) n’est pas persistable', () => {
    expect(persistableQuery({ state: { status: 'success' }, queryKey: INACTIVITY_STATES_QUERY_KEY })).toBe(false);
  });
});

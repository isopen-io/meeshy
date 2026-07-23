/**
 * Tests for the IndexedDB dehydration policy.
 *
 * Message lists must NOT survive a reload: they are the one dataset that goes
 * stale the instant somebody else writes to the conversation. Persisting them
 * for 24h (combined with `staleTime: Infinity`) meant a message missed by the
 * socket layer stayed invisible across every reload. Everything else (profiles,
 * conversation lists, preferences, attachment metadata) still persists so the
 * app opens instantly.
 */

import { shouldDehydrateQuery } from '@/lib/react-query/persist-options';

function query(queryKey: readonly unknown[], status: 'success' | 'error' = 'success') {
  return { queryKey, state: { status, data: {} } } as unknown as Parameters<typeof shouldDehydrateQuery>[0];
}

describe('shouldDehydrateQuery', () => {
  it('never persists conversation message lists', () => {
    expect(shouldDehydrateQuery(query(['messages', 'list', 'conv-1', 'infinite']))).toBe(false);
    expect(shouldDehydrateQuery(query(['messages', 'list', 'conv-1']))).toBe(false);
    expect(shouldDehydrateQuery(query(['messages', 'status-details', 'msg-1']))).toBe(false);
  });

  it('persists non-message queries', () => {
    expect(shouldDehydrateQuery(query(['conversations', 'infinite']))).toBe(true);
    expect(shouldDehydrateQuery(query(['users', 'detail', 'user-1']))).toBe(true);
    expect(shouldDehydrateQuery(query(['attachments', 'att-1']))).toBe(true);
    expect(shouldDehydrateQuery(query(['user-preferences', 'interface']))).toBe(true);
  });

  it('does not persist failed queries', () => {
    expect(shouldDehydrateQuery(query(['conversations', 'infinite'], 'error'))).toBe(false);
  });
});

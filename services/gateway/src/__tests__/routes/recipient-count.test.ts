import { describe, it, expect } from '@jest/globals';
import { computeRecipientCount } from '../../routes/conversations/messages';

// The sender's all-or-nothing delivery indicator (✓✓ delivered / read) must use
// the server's authoritative active-recipient count as the denominator: active
// participants EXCLUDING the message's sender. These pin that computation so the
// client never has to infer it from a possibly-stale local member count.
describe('computeRecipientCount — active-recipient denominator', () => {
  it('excludes the sender when the sender is an active participant', () => {
    const active = new Set(['p_sender', 'p_a', 'p_b', 'p_c']);
    expect(computeRecipientCount(active, 'p_sender')).toBe(3);
  });

  it('a 1:1 conversation resolves to a single recipient', () => {
    const active = new Set(['p_sender', 'p_peer']);
    expect(computeRecipientCount(active, 'p_sender')).toBe(1);
  });

  it('does not subtract when the sender already left (not in the active set)', () => {
    const active = new Set(['p_a', 'p_b', 'p_c']);
    expect(computeRecipientCount(active, 'p_departed_sender')).toBe(3);
  });

  it('never returns a negative denominator for an empty active set', () => {
    expect(computeRecipientCount(new Set<string>(), 'p_sender')).toBe(0);
  });

  it('a lone remaining sender has zero recipients', () => {
    const active = new Set(['p_sender']);
    expect(computeRecipientCount(active, 'p_sender')).toBe(0);
  });
});

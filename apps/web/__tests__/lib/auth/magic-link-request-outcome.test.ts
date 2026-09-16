import { resolveMagicLinkRequestOutcome } from '@/lib/auth/magic-link-request-outcome';

describe('resolveMagicLinkRequestOutcome', () => {
  it('reads as sent on success', () => {
    expect(resolveMagicLinkRequestOutcome({ success: true })).toEqual({ kind: 'sent' });
  });

  it('reads as rate-limited when the gateway refused with code RATE_LIMITED (#6665)', () => {
    expect(resolveMagicLinkRequestOutcome({ success: false, code: 'RATE_LIMITED' })).toEqual({
      kind: 'rate-limited',
    });
  });

  it('reads as sent on any other failure — no enumeration of unknown addresses', () => {
    expect(resolveMagicLinkRequestOutcome({ success: false, error: 'Unknown address' })).toEqual({
      kind: 'sent',
    });
    expect(resolveMagicLinkRequestOutcome({ success: false })).toEqual({ kind: 'sent' });
  });

  it('does not read a successful response as rate-limited even if a stale code lingers', () => {
    expect(resolveMagicLinkRequestOutcome({ success: true, code: 'RATE_LIMITED' })).toEqual({
      kind: 'sent',
    });
  });
});

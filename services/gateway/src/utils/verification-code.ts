import crypto from 'crypto';

/**
 * Single source of truth for numeric out-of-band verification codes.
 *
 * These codes gate account-recovery actions (SMS password reset, phone
 * transfer, phone verification). They MUST come from a cryptographically
 * secure generator: `Math.random` is V8's non-cryptographic `xorshift128+`,
 * whose internal state an attacker can reconstruct from a few observed
 * outputs and then predict every subsequent draw (CWE-338 — Use of
 * Cryptographically Weak PRNG). The correct primitive, already used by
 * `TwoFactorService.generateBackupCode`, is `crypto.randomInt`.
 *
 * The range is `[10^(length-1), 10^length - 1]` — a fixed-width code with no
 * leading zero, preserving the exact space of the previous inline
 * `Math.floor(100000 + Math.random() * 900000)` for the default 6 digits
 * (100000–999999) so existing SMS/UX expectations are unchanged.
 */
export function generateNumericCode(length = 6): string {
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return crypto.randomInt(min, max).toString();
}

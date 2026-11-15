/**
 * Unit tests for the cryptographic numeric verification-code generator.
 *
 * These codes are the primary out-of-band factor on account-recovery flows
 * (SMS password reset, phone transfer, phone verification), so they MUST be
 * drawn from a cryptographically secure source — never `Math.random`
 * (CWE-338). This suite is the single behavioural witness for that guarantee
 * and for the single-source-of-truth invariant across the gateway.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateNumericCode } from '../../../utils/verification-code';

describe('generateNumericCode', () => {
  const originalRandom = Math.random;
  afterEach(() => {
    Math.random = originalRandom;
  });

  it('returns a 6-digit numeric string by default, in [100000, 999999]', () => {
    for (let i = 0; i < 2000; i++) {
      const code = generateNumericCode();
      expect(code).toMatch(/^\d{6}$/);
      const n = Number(code);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });

  it('honours an explicit length, always zero-avoiding the leading digit', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateNumericCode(4);
      expect(code).toMatch(/^\d{4}$/);
      const n = Number(code);
      expect(n).toBeGreaterThanOrEqual(1000);
      expect(n).toBeLessThanOrEqual(9999);
    }
  });

  it('does NOT consume Math.random — proving a crypto source', () => {
    Math.random = () => {
      throw new Error('generateNumericCode must not use Math.random (CWE-338)');
    };
    expect(() => generateNumericCode()).not.toThrow();
    expect(generateNumericCode()).toMatch(/^\d{6}$/);
  });

  it('produces a broad spread (not a constant) across many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateNumericCode());
    // 500 draws from 900k values collide only pathologically; a stuck
    // generator would collapse to a handful of values.
    expect(seen.size).toBeGreaterThan(400);
  });
});

describe('no security-code-generation site consumes Math.random (regression witness)', () => {
  const root = join(__dirname, '../../..');
  const sites = [
    'services/PhonePasswordResetService.ts',
    'services/PhoneTransferService.ts',
    'services/AuthService.ts',
    'routes/users/contact-change.ts',
  ];

  it.each(sites)('%s mints codes via the crypto helper, not Math.random', (file) => {
    const source = readFileSync(join(root, file), 'utf8');
    expect(source).not.toMatch(/Math\.random/);
    expect(source).toMatch(/generateNumericCode/);
  });
});

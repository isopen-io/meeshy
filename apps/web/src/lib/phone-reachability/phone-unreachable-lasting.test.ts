import { describe, expect, test } from 'bun:test';

import { PHONE_REACHABILITY_CONFIG } from '@meeshy/shared/types/phone-reachability-constants';
import type { PhoneReachabilityState } from '@meeshy/shared/types/phone-reachability';

import { isPhoneUnreachableLasting, PHONE_UNREACHABLE_MINIMUM_SILENCE_MS, phoneUnreachableLastingWakeInMs } from './phone-unreachable-lasting';

/**
 * UN TÉLÉPHONE INJOIGNABLE QUI DURE (#20241, iso `PhoneUnreachableLasting.swift`) — l'état SERVI compte quand son
 * dernier signe de vie date de cinq minutes au moins et qu'il n'a pas dépassé sa durée de vie. Alors le talkie devient
 * un message vocal et « Demander un relevé » disparaît (`battery-panel.test.tsx`). Sans état servi : rien ne change.
 */

const SINCE = Date.parse('2026-11-21T10:00:00.000Z');
const MINUTE = 60_000;
const TTL_MS = PHONE_REACHABILITY_CONFIG.stateTtlSeconds * 1_000;
const state = (overrides: Partial<PhoneReachabilityState> = {}): PhoneReachabilityState => ({
  userId: 'b'.repeat(24),
  unreachableSince: new Date(SINCE).toISOString(),
  cause: 'network',
  ...overrides,
});

describe('le silence qui compte', () => {
  test('le seuil est de cinq minutes', () => {
    expect(PHONE_UNREACHABLE_MINIMUM_SILENCE_MS).toBe(5 * MINUTE);
  });

  test('sans état servi : rien ne compte', () => {
    expect(isPhoneUnreachableLasting(null, SINCE + 60 * MINUTE)).toBe(false);
  });

  test('un silence tout juste ouvert ne compte pas encore', () => {
    expect(isPhoneUnreachableLasting(state(), SINCE + 4 * MINUTE + 59_000)).toBe(false);
  });

  test('cinq minutes pile : il compte', () => {
    expect(isPhoneUnreachableLasting(state(), SINCE + 5 * MINUTE)).toBe(true);
  });

  test('au-delà de sa durée de vie, l’état n’est plus servi : il ne compte plus', () => {
    expect(isPhoneUnreachableLasting(state(), SINCE + TTL_MS)).toBe(true);
    expect(isPhoneUnreachableLasting(state(), SINCE + TTL_MS + 1)).toBe(false);
  });

  test('une date illisible ne compte pas', () => {
    expect(isPhoneUnreachableLasting(state({ unreachableSince: 'n/a' }), SINCE + 60 * MINUTE)).toBe(false);
  });

  test('le prochain changement : le passage du seuil, puis la fin de la durée de vie, puis rien', () => {
    expect(phoneUnreachableLastingWakeInMs(state(), SINCE + 2 * MINUTE)).toBe(3 * MINUTE);
    expect(phoneUnreachableLastingWakeInMs(state(), SINCE + 10 * MINUTE)).toBe(TTL_MS - 10 * MINUTE + 1);
    expect(phoneUnreachableLastingWakeInMs(state(), SINCE + TTL_MS + 1)).toBeNull();
    expect(phoneUnreachableLastingWakeInMs(null, SINCE)).toBeNull();
  });
});


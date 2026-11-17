// packages/shared/__tests__/e2ee-capabilities.test.ts
//
// #19155 — les capacités qu'un appareil chiffré déclare (`device-trust-v1`) : bornées à
// l'écriture, lues défensivement (un document écrit avant le champ ne le porte pas).

import { describe, expect, it } from 'vitest';
import {
  distinctCapabilities,
  e2eeCapabilitiesSchema,
  e2eeEnrollDeviceRequestSchema,
  E2EE_CAPABILITIES_MAX,
  readCapabilities,
} from '../types/e2ee-directory.js';
import { DEVICE_TRUST_CAPABILITY } from '../types/e2ee-device-trust.js';

describe('les capacités déclarées par un appareil chiffré (#19155)', () => {
  it('accepte au plus 8 capacités de 1 à 32 caractères, dans un alphabet borné', () => {
    expect(e2eeCapabilitiesSchema.safeParse([DEVICE_TRUST_CAPABILITY]).success).toBe(true);
    expect(e2eeCapabilitiesSchema.safeParse(Array.from({ length: E2EE_CAPABILITIES_MAX }, (_, i) => `c${i}`)).success).toBe(true);
    expect(e2eeCapabilitiesSchema.safeParse(Array.from({ length: E2EE_CAPABILITIES_MAX + 1 }, (_, i) => `c${i}`)).success).toBe(false);
    expect(e2eeCapabilitiesSchema.safeParse(['x'.repeat(33)]).success).toBe(false);
    expect(e2eeCapabilitiesSchema.safeParse(['']).success).toBe(false);
    expect(e2eeCapabilitiesSchema.safeParse(['Device Trust']).success).toBe(false);
    expect(e2eeCapabilitiesSchema.safeParse(['-tiret-en-tete']).success).toBe(false);
  });

  it('un enrôlement sans le champ reste valide (ancien client), et le champ est gardé quand il est présent', () => {
    const base = {
      registrationId: 1,
      identityKey: 'BQAA',
      signedPreKey: { keyId: 1, publicKey: 'AAAA', signature: 'AAAA' },
      kyberLastResort: { keyId: 1, publicKey: 'AAAA', signature: 'AAAA' },
      platform: 'ios',
      binding: { timestamp: 1, signature: 'AAAA' },
    };
    expect(e2eeEnrollDeviceRequestSchema.parse(base)).not.toHaveProperty('capabilities');
    expect(e2eeEnrollDeviceRequestSchema.parse({ ...base, capabilities: [DEVICE_TRUST_CAPABILITY] }).capabilities).toEqual([DEVICE_TRUST_CAPABILITY]);
  });

  it('se rangent sans doublon, et se lisent [] quand le champ est absent, nul ou hors forme', () => {
    expect(distinctCapabilities([DEVICE_TRUST_CAPABILITY, DEVICE_TRUST_CAPABILITY])).toEqual([DEVICE_TRUST_CAPABILITY]);
    expect(readCapabilities(undefined)).toEqual([]);
    expect(readCapabilities(null)).toEqual([]);
    expect(readCapabilities('device-trust-v1')).toEqual([]);
    expect(readCapabilities([DEVICE_TRUST_CAPABILITY, 42, 'Mauvaise Forme', DEVICE_TRUST_CAPABILITY])).toEqual([DEVICE_TRUST_CAPABILITY]);
  });
});

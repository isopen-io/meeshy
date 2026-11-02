import { describe, expect, test } from 'bun:test';
import * as directory from '@meeshy/shared/types/e2ee-directory';
import * as signals from '@meeshy/shared/types/e2ee-signals';

import * as wire from './wire';

describe('les constantes du fil recopiées sans Zod restent celles de @meeshy/shared', () => {
  test('protocole, codes et message de liaison', () => {
    expect(wire.LIBSIGNAL_PROTOCOL).toBe(directory.LIBSIGNAL_PROTOCOL);
    for (const [name, code] of Object.entries(wire.E2EE_CODES)) expect(code).toBe(Reflect.get(directory.E2EE_ERROR_CODES, name));
    const binding = { userId: 'u', registrationId: 12, identityKey: 'BQ==', timestamp: 1 };
    expect(wire.deviceBindingMessage(binding)).toBe(directory.deviceBindingMessage(binding));
  });

  test('le remplissage au palier, pour toute taille et tout nombre d\'enveloppes', () => {
    for (const recipients of [1, 2, 7, 31]) {
      for (const length of [0, 1, 255, 256, 257, 1000, 4097, 16384, 16385, 40000, 70000]) {
        expect(wire.e2eePaddedLength(length, recipients)).toBe(signals.e2eePaddedLength(length, recipients));
      }
    }
  });
});

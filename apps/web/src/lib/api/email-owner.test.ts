import { describe, expect, test } from 'bun:test';

import { decodeEmailOwner } from './email-owner';
import { placeSignupFailure } from '../view/auth-feedback';

describe('emailOwner — le détenteur masqué d’un 409 EMAIL_TAKEN (#8214 × #8216)', () => {
  test('une charge complète se décode, avatar compris', () => {
    expect(decodeEmailOwner({ maskedDisplayName: 'A** L***', maskedUsername: 'a**l', avatar: 'https://x/a.png' })).toEqual({
      maskedDisplayName: 'A** L***',
      maskedUsername: 'a**l',
      avatar: 'https://x/a.png',
    });
  });

  test('sans avatar : `null`, jamais `undefined`', () => {
    expect(decodeEmailOwner({ maskedDisplayName: 'A** L***', maskedUsername: 'a**l' })?.avatar).toBeNull();
  });

  test('absente ou mal formée : `null` — l’écran retombe sur la récupération seule', () => {
    expect(decodeEmailOwner(undefined)).toBeNull();
    expect(decodeEmailOwner({ maskedDisplayName: 3 })).toBeNull();
  });

  test('placeSignupFailure porte le détenteur d’un EMAIL_TAKEN, et seulement de lui', () => {
    const owner = { maskedDisplayName: 'A** L***', maskedUsername: 'a**l', avatar: null };
    const taken = placeSignupFailure({ ok: false, status: 409, error: 'x', code: 'EMAIL_TAKEN', field: 'email', emailOwner: owner });
    expect(taken.emailOwner).toEqual(owner);
    const other = placeSignupFailure({ ok: false, status: 409, error: 'x', code: 'USERNAME_TAKEN', emailOwner: owner });
    expect(other.emailOwner).toBeNull();
  });
});

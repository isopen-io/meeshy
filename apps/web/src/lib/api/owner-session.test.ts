import { describe, expect, test } from 'bun:test';

import { ownerCredentialOf } from './owner-session';
import type { SessionState } from './session';

/**
 * #9743 (revue de sécurité) — CE QUI ATTEND UN LECTEUR NE PART QUE SOUS SA
 * SESSION : l'identité et le jeton sont lus dans le MÊME instantané, et tout
 * autre état (autre compte, invité, déconnecté) rend `null` — on n'envoie pas.
 */
const session = (id: string, token: string) => ({ status: 'authenticated', user: { id }, token, sessionToken: 's', expiresAt: 0 }) as unknown as SessionState;

describe('ownerCredentialOf', () => {
  test('le propriétaire connecté : SON jeton', () => {
    expect(ownerCredentialOf('u_a', session('a', 'jeton-a'))).toEqual({ kind: 'registered', token: 'jeton-a' });
  });

  test('un AUTRE compte connecté : rien', () => {
    expect(ownerCredentialOf('u_a', session('b', 'jeton-b'))).toBeNull();
  });

  test('invité, déconnecté, propriétaire vide ou illisible : rien', () => {
    expect(ownerCredentialOf('u_a', { status: 'guest', sessionToken: 'anon' } as unknown as SessionState)).toBeNull();
    expect(ownerCredentialOf('u_a', { status: 'anonymous' } as unknown as SessionState)).toBeNull();
    expect(ownerCredentialOf('', session('', 'jeton'))).toBeNull();
    expect(ownerCredentialOf('u_', session('', 'jeton'))).toBeNull();
    expect(ownerCredentialOf('u_a', session('a', ''))).toBeNull();
  });
});

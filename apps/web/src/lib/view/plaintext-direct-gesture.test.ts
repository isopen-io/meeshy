import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import type { Conversation } from '@/lib/api/types';

import { plaintextDirectGesture } from './plaintext-direct-gesture';

/**
 * **LE GESTE DE LA FICHE, CÂBLÉ** (#12966) — l'hôte de la fiche (la feuille de
 * détails) le donne pour un tête-à-tête dont il connaît le pair, nommé par lui,
 * et il demande la conversation lisible AVEC CE PAIR, jamais une autre.
 */
const conversation = (type: 'direct' | 'group', participants: ReadonlyArray<{ userId?: string; displayName: string }>): Conversation =>
  ({ id: 'c-sealed', type, encryptionMode: 'e2ee', participants }) as unknown as Conversation;

function gateway(response: { readonly status: number; readonly body: unknown }) {
  const bodies: unknown[] = [];
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(response.body), { status: response.status });
  }) as typeof fetch;
  return { deps: { source: 'gateway' as const, transport: createHttpTransport({ base: '', fetchImpl, credential: () => ({ kind: 'registered', token: 'jwt' }) }) }, bodies };
}

describe('plaintextDirectGesture', () => {
  test('un tête-à-tête : nommé par le pair, il demande la conversation lisible avec lui et y mène', async () => {
    const { deps, bodies } = gateway({ status: 201, body: { success: true, data: { id: 'c-readable', title: null } } });
    const went: string[] = [];
    const gesture = plaintextDirectGesture({
      deps,
      conversation: conversation('direct', [{ userId: 'u-me', displayName: 'Moi' }, { userId: 'u-amina', displayName: 'Amina' }]),
      viewerId: 'u-me',
      fallbackName: 'Amina',
      online: () => true,
      go: (id) => went.push(id),
    });
    expect(gesture?.peerName).toBe('Amina');
    expect(await gesture?.open()).toBe('opened');
    expect(bodies).toEqual([{ type: 'direct', participantIds: ['u-amina'], plaintext: true }]);
    expect(went).toEqual(['c-readable']);
  });

  test('un pair sans nom servi : le geste prend le nom que la fiche affiche', () => {
    const { deps } = gateway({ status: 500, body: {} });
    const gesture = plaintextDirectGesture({
      deps,
      conversation: conversation('direct', [{ userId: 'u-me', displayName: 'Moi' }, { userId: 'u-amina', displayName: '' }]),
      viewerId: 'u-me',
      fallbackName: 'Amina K.',
      online: () => true,
      go: () => {},
    });
    expect(gesture?.peerName).toBe('Amina K.');
  });

  test('un groupe, ou un tête-à-tête sans pair connu, n’a pas de geste', () => {
    const { deps } = gateway({ status: 500, body: {} });
    const base = { deps, viewerId: 'u-me', fallbackName: 'X', online: () => true, go: () => {} };
    expect(plaintextDirectGesture({ ...base, conversation: conversation('group', [{ userId: 'u-amina', displayName: 'Amina' }]) })).toBeUndefined();
    expect(plaintextDirectGesture({ ...base, conversation: conversation('direct', [{ userId: 'u-me', displayName: 'Moi' }]) })).toBeUndefined();
    expect(plaintextDirectGesture({ ...base, conversation: conversation('direct', [{ displayName: 'Invité' }]) })).toBeUndefined();
  });
});

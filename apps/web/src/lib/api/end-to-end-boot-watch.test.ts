import { describe, expect, test } from 'bun:test';

import { canSendPlaintext } from '@/lib/end-to-end-regime-ledger';

import { messagesQueryKey } from './messages';
import { appQueryClient } from './query-client';
import { sessionStore } from './session';

/**
 * #12986 (audit) — LA SURVEILLANCE DU CACHE EST POSÉE AVEC LE CLIENT DE
 * REQUÊTES, pas avec le temps réel : chargé après la première peinture (et
 * peut-être jamais), `realtime.ts` laissait une fenêtre où la file d'envoi
 * relancée au démarrage lisait un registre aveugle à un fil e2ee déjà en cache.
 * Ce témoin n'importe PAS `realtime.ts`.
 */
describe('au démarrage, avant le temps réel', () => {
  test('un fil e2ee mis en cache scelle déjà l’envoi', () => {
    const id = 'c-boot-sealed';
    appQueryClient.setQueryData(messagesQueryKey(id), {
      pages: [{ messages: [{ id: 'e1', conversationId: id, messageType: 'text', content: '', isEncrypted: true, encryptionMode: 'e2ee' }], hasOlder: false, nextCursor: null }],
      pageParams: [undefined],
    });

    expect(canSendPlaintext({ conversationId: id })).toBe(false);
    appQueryClient.removeQueries({ queryKey: messagesQueryKey(id) });
  });
});

/**
 * #12986 (audit) — AU CHANGEMENT DE COMPTE, le registre se lie au compte qui
 * ARRIVE avant que son cache rangé ne soit remis en place : sinon ce que ce
 * cache prouve chiffré s'apprenait sous le compte qui part, et se perdait.
 */
describe('au changement de compte', () => {
  const user = (id: string) => ({ id, username: id, displayName: id });
  const signIn = (id: string) => sessionStore.getState().establish({ user: user(id), token: `t-${id}`, sessionToken: `s-${id}`, expiresIn: 86_400 });

  test('le fil e2ee du compte qui revient scelle encore son envoi', () => {
    signIn('alice-12986');
    appQueryClient.setQueryData(messagesQueryKey('c-x'), {
      pages: [{ messages: [{ id: 'e1', conversationId: 'c-x', messageType: 'text', content: '', isEncrypted: true, encryptionMode: 'e2ee' }], hasOlder: false, nextCursor: null }],
      pageParams: [undefined],
    });
    signIn('bob-12986');
    expect(canSendPlaintext({ conversationId: 'c-x' })).toBe(true);
    signIn('alice-12986');

    expect(canSendPlaintext({ conversationId: 'c-x' })).toBe(false);
    sessionStore.getState().clearSession();
    appQueryClient.clear();
  });
});

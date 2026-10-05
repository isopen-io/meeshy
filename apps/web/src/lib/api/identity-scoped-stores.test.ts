import { afterEach, describe, expect, test } from 'bun:test';

import { conversationStore } from '../conversation-store';
import { localMessageOf } from '../send/local-message';
import { createOutboxStore } from '../send/outbox-store';

import { watchIdentityScopedStores } from './identity-scoped-stores';
import { createSessionStore, type SessionStoreApi } from './session';
import { createTypingStore } from './typing-store';

/**
 * CE QU'A dans la MÉMOIRE de l'onglet NE PASSE PAS À B (#8674) — l'envoi en
 * échec d'A (son TEXTE, et un « Réessayer » qui le publierait au nom de B),
 * ses épingles optimistes, la frappe reçue sur sa connexion.
 */

function signIn(session: SessionStoreApi, id: string): void {
  session.getState().establish({ user: { id, username: id }, token: `jwt-${id}`, sessionToken: `s-${id}`, expiresIn: 86_400 });
}

function appAsA() {
  const session = createSessionStore({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
  signIn(session, 'a');
  const outbox = createOutboxStore();
  const typing = createTypingStore();
  const unwatch = watchIdentityScopedStores({ session, outbox, conversations: conversationStore, typing });
  outbox.getState().enqueue('c-partagee', {
    message: localMessageOf({
      clientMessageId: 'cm-a',
      conversationId: 'c-partagee',
      viewerId: 'a',
      content: 'brouillon privé de A',
      originalLanguage: 'fr',
      now: new Date(0),
    }),
    delivery: 'failed',
    attempts: 1,
    startedAt: 0,
  });
  conversationStore.getState().togglePin('c-partagee', false);
  typing.getState().start('c-partagee', { userId: 'x', displayName: 'X' }, Date.now());
  return { session, outbox, typing, unwatch };
}

afterEach(() => {
  conversationStore.setState({ overrides: {} });
});

describe('A → B : les magasins en mémoire se vident', () => {
  test('l’envoi en échec d’A (et son texte) disparaît de l’outbox', () => {
    const { session, outbox, unwatch } = appAsA();

    signIn(session, 'b');

    expect(outbox.getState().entries).toEqual({});
    unwatch();
  });

  test('les épingles optimistes d’A ne s’appliquent pas aux rangées de B', () => {
    const { session, unwatch } = appAsA();

    signIn(session, 'b');

    expect(conversationStore.getState().overrides).toEqual({});
    unwatch();
  });

  test('la frappe reçue sur la connexion d’A s’efface', () => {
    const { session, typing, unwatch } = appAsA();

    signIn(session, 'b');

    expect(typing.getState().byConversation).toEqual({});
    unwatch();
  });

  test('même compte, jeton renouvelé ⇒ rien ne se vide', () => {
    const { session, outbox, unwatch } = appAsA();

    signIn(session, 'a');

    expect(Object.keys(outbox.getState().entries)).toEqual(['c-partagee']);
    unwatch();
  });
});

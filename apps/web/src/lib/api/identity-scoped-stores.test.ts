import { afterEach, describe, expect, test } from 'bun:test';

import { callBackPromptStore } from '../calls/call-back-prompt';
import { callIdentityOf, rememberCallIdentity } from '../calls/call-notice';
import { conversationStore } from '../conversation-store';
import { inAppBannerStore, offerInAppBanner } from '../notifications/in-app-banner';
import { conversationPreviewStore, openConversationPreview } from '../notifications/conversation-preview';
import type { NotificationRecord } from '../notifications/record';
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
  inAppBannerStore.setState({ current: null });
  conversationPreviewStore.setState({ conversationId: null });
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

/**
 * LA BANNIÈRE IN-APP ET L'APERÇU OUVERT DEPUIS ELLE APPARTIENNENT À UNE
 * IDENTITÉ (#18907, web-notifs-5) — la bannière d'A (« Awa : <aperçu> »)
 * survivait à la déconnexion et au changement de compte : la toucher ouvrait la
 * conversation d'A sous l'identité de B, et « marquer lu » partait avec le jeton
 * de B.
 */
const bannerOfA: NotificationRecord = {
  id: 'n-a',
  type: 'new_message',
  title: 'Awa',
  content: 'aperçu privé de A',
  actor: null,
  context: { conversationId: 'c1' },
  metadata: {},
  state: { isRead: false, createdAt: '2026-11-17T08:00:00.000Z' },
};

function appAsAWithBanner() {
  const { session, unwatch } = appAsA();
  offerInAppBanner(bannerOfA, { pathname: '/' });
  openConversationPreview('c1');
  expect(inAppBannerStore.getState().current?.id).toBe('n-a');
  expect(conversationPreviewStore.getState().conversationId).toBe('c1');
  return { session, unwatch };
}

describe('la bannière d’A ne survit ni à sa déconnexion ni au compte de B', () => {
  test('A → déconnecté : la bannière et l’aperçu ouvert se retirent', () => {
    const { session, unwatch } = appAsAWithBanner();

    session.getState().clearSession();

    expect(inAppBannerStore.getState().current).toBeNull();
    expect(conversationPreviewStore.getState().conversationId).toBeNull();
    unwatch();
  });

  test('A → B : la bannière et l’aperçu ouvert se retirent', () => {
    const { session, unwatch } = appAsAWithBanner();

    signIn(session, 'b');

    expect(inAppBannerStore.getState().current).toBeNull();
    expect(conversationPreviewStore.getState().conversationId).toBeNull();
    unwatch();
  });

  test('même compte, jeton renouvelé ⇒ la bannière reste', () => {
    const { session, unwatch } = appAsAWithBanner();

    signIn(session, 'a');

    expect(inAppBannerStore.getState().current?.id).toBe('n-a');
    unwatch();
  });
});

describe('l’invite de rappel et les identités d’appel d’A ne passent pas à B (#18907)', () => {
  const promptOfA = { conversationId: 'c-maman', media: 'video', title: 'Maman', avatar: null, isGroup: false } as const;

  const appAsAWithCallBack = () => {
    const { session, unwatch } = appAsA();
    rememberCallIdentity('c-maman', { title: 'Maman', avatar: 'https://cdn/maman.png', isGroup: false });
    callBackPromptStore.setState({ request: promptOfA });
    return { session, unwatch };
  };

  test('A → déconnecté : l’invite « Rappeler Maman » se retire et le nom vu par A est oublié', () => {
    const { session, unwatch } = appAsAWithCallBack();

    session.getState().clearSession();

    expect(callBackPromptStore.getState().request).toBeNull();
    expect(callIdentityOf('c-maman').title).toBe('');
    unwatch();
  });

  test('A → B : l’invite ne compose jamais vers la conversation d’A avec la connexion de B', () => {
    const { session, unwatch } = appAsAWithCallBack();

    signIn(session, 'b');

    expect(callBackPromptStore.getState().request).toBeNull();
    expect(callIdentityOf('c-maman').title).toBe('');
    unwatch();
  });

  test('même compte, jeton renouvelé ⇒ l’invite reste', () => {
    const { session, unwatch } = appAsAWithCallBack();

    signIn(session, 'a');

    expect(callBackPromptStore.getState().request).toEqual(promptOfA);
    callBackPromptStore.setState({ request: null });
    unwatch();
  });
});

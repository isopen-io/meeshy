import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { accountReplacementOf, provenSessionOf } from './proven-session';
import { heldAccountOf, sessionStore, type SessionUser } from './session';

/**
 * UN COMPTE TENU DERRIÈRE UNE IDENTITÉ ANONYME N'EST JAMAIS PERDU (#10474, R1
 * de l'audit de #10451). Quand un compte connecté lit une conversation sous
 * son identité anonyme (#8816), la session EFFECTIVE est l'invité et le
 * compte est tenu à côté. Quitter cet état — accepter le lien d'un autre
 * compte, ou changer de compte — range le compte TENU au sélecteur avec sa
 * session, comme depuis un compte effectif.
 *
 * Les gestes sont ceux de l'APPAREIL (`device-accounts.ts`) : vrai coffre,
 * vrai sélecteur, vrai magasin de session, vrai `localStorage`.
 */

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

/* Le coffre et le magasin sont ceux du module, et le coffre garde le
   `localStorage` qu'il a trouvé à son chargement : un fichier lancé avant
   celui-ci dans la même suite peut y avoir laissé un compte. On le vide par
   le coffre lui-même. */
const resetDevice = async () => {
  const { accountVault } = await import('./device-accounts');
  accountVault.list().forEach((account) => accountVault.forget(account.user.id));
  sessionStore.getState().clearSession();
  globalThis.localStorage.clear();
};

beforeEach(resetDevice);
afterEach(resetDevice);

const ADA: SessionUser = { id: 'u-ada', username: 'ada', displayName: 'Ada' };
const BOB = { user: { id: 'u-bob', username: 'bob', displayName: 'Bob' }, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 86_400 };

async function device() {
  return import('./device-accounts');
}

async function adaReadingAnonymously() {
  const { accountVault } = await device();
  sessionStore.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3_600 });
  accountVault.noteActive(ADA);
  sessionStore.getState().adoptAnonymous({
    sessionToken: 'anon-1',
    guest: { participantId: 'p-1', nickname: 'Invité', conversationId: 'c-1', link: 'lnk', mayWrite: true },
  });
  expect(sessionStore.getState().session.status).toBe('guest');
}

describe('Accepter le lien d’un autre compte depuis une identité anonyme tenue', () => {
  test('le compte tenu reste au sélecteur AVEC sa session, et l’autre compte s’ouvre', async () => {
    await adaReadingAnonymously();
    const { provenSessions, accountVault } = await device();
    const replacement = accountReplacementOf(sessionStore.getState().session, provenSessionOf(BOB));
    expect(replacement?.current.id).toBe('u-ada');

    expect(await provenSessions.adopt(replacement!)).toBe(true);

    expect(accountVault.hasPreservedSession('u-ada')).toBe(true);
    expect(accountVault.list().map((account) => account.user.id).sort()).toEqual(['u-ada', 'u-bob']);
    expect(heldAccountOf(sessionStore.getState().session)?.user.id).toBe('u-bob');
  });
});

describe('Changer de compte depuis une identité anonyme tenue', () => {
  test('le compte tenu est rangé avec sa session : on peut y revenir sans mot de passe', async () => {
    const { accountVault, accountSwitcher } = await device();
    sessionStore.getState().establish({ user: BOB.user, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3_600 });
    accountVault.noteActive(BOB.user);
    accountSwitcher.suspend();
    await adaReadingAnonymously();
    expect(accountVault.hasPreservedSession('u-bob')).toBe(true);

    expect(accountSwitcher.switchTo('u-bob')).toBe('switched');
    expect(accountVault.hasPreservedSession('u-ada')).toBe(true);

    expect(accountSwitcher.switchTo('u-ada')).toBe('switched');
    const session = sessionStore.getState().session;
    expect(session.status === 'authenticated' ? session.token : null).toBe('jwt-ada');
  });

  test('« Ajouter un compte » depuis l’identité anonyme garde aussi le compte tenu', async () => {
    await adaReadingAnonymously();
    const { accountVault, accountSwitcher } = await device();

    accountSwitcher.suspend();

    expect(sessionStore.getState().session.status).toBe('anonymous');
    expect(accountVault.hasPreservedSession('u-ada')).toBe(true);
  });
});

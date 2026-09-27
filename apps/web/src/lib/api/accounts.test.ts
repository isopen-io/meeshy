import { describe, expect, test } from 'bun:test';

import { createAccountSwitcher, createAccountVault, purgeAccountLocalData, type PreservedSession } from './accounts';
import { createSessionStore, type SessionStorage, type SessionUser } from './session';

/**
 * PLUSIEURS COMPTES SUR L'APPAREIL (#8286) — le coffre des comptes et la
 * bascule, éprouvés contre le VRAI magasin de session (jamais un mock) : ce
 * qui compte est ce que la session devient, et ce qui reste sur le disque.
 */

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const DAY_S = 24 * 60 * 60;

function memoryStorage(seed: Readonly<Record<string, string>> = {}): SessionStorage & { readonly raw: Map<string, string> } {
  const raw = new Map(Object.entries(seed));
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

const alice: SessionUser = { id: 'a1', username: 'alice', displayName: 'Alice', avatar: 'https://cdn/a.png', systemLanguage: 'fr' };
const bob: SessionUser = { id: 'b2', username: 'bob', displayName: 'Bob' };

function makeDevice() {
  const storage = memoryStorage();
  const clock = { now: NOW };
  const now = () => clock.now;
  const store = createSessionStore({ storage, now });
  const vault = createAccountVault({ storage, now });
  const ended: PreservedSession[] = [];
  const switcher = createAccountSwitcher({ vault, store, now, endServerSession: (session) => ended.push(session) });
  const signIn = (user: SessionUser, token: string, keepsSession?: boolean) => {
    store.getState().establish({ user, token, sessionToken: `s-${token}`, expiresIn: DAY_S });
    vault.noteActive(user, keepsSession);
  };
  const activeToken = () => {
    const session = store.getState().session;
    return session.status === 'authenticated' ? session.token : null;
  };
  return { storage, clock, store, vault, switcher, ended, signIn, activeToken };
}

describe('le premier compte', () => {
  test('est gardé par défaut, sans question', () => {
    const device = makeDevice();
    expect(device.switcher.offersKeepSignedIn()).toBe(false);

    device.signIn(alice, 'tA');

    expect(device.vault.list().map((a) => [a.user.username, a.keepsSession])).toEqual([['alice', true]]);
  });
});

describe('la case « Rester connecté »', () => {
  test('est proposée dès qu’un autre compte garde sa session', () => {
    const device = makeDevice();
    device.signIn(alice, 'tA');
    device.switcher.suspend();

    expect(device.store.getState().session.status).toBe('anonymous');
    expect(device.switcher.offersKeepSignedIn()).toBe(true);
  });

  test('n’est pas proposée si le seul compte listé a été déconnecté', () => {
    const device = makeDevice();
    device.signIn(alice, 'tA');
    device.store.getState().clearSession();

    expect(device.switcher.offersKeepSignedIn()).toBe(false);
  });
});

describe('changer de compte', () => {
  test('va et revient entre deux comptes gardés, sans mot de passe', () => {
    const device = makeDevice();
    device.signIn(alice, 'tA');
    device.switcher.suspend();
    device.signIn(bob, 'tB', true);

    expect(device.switcher.switchTo('a1')).toBe('switched');
    expect(device.activeToken()).toBe('tA');
    expect(device.switcher.switchTo('b2')).toBe('switched');
    expect(device.activeToken()).toBe('tB');
  });

  test('la bascule rend l’identité du compte, projection comprise', () => {
    const device = makeDevice();
    device.signIn(alice, 'tA');
    device.switcher.suspend();
    device.signIn(bob, 'tB');
    device.switcher.switchTo('a1');

    const session = device.store.getState().session;
    expect(session.status === 'authenticated' ? session.user : null).toEqual(alice);
  });

  test('un compte connecté SANS « rester connecté » est fermé quand on le quitte', () => {
    const device = makeDevice();
    device.signIn(alice, 'tA');
    device.switcher.suspend();
    device.signIn(bob, 'tB', false);

    expect(device.switcher.switchTo('a1')).toBe('switched');

    expect(device.vault.hasPreservedSession('b2')).toBe(false);
    expect(device.ended.map((s) => s.token)).toEqual(['tB']);
    expect(device.switcher.switchTo('b2')).toBe('needs-password');
  });

  test('les jetons du compte ACTIF ne dorment jamais dans le coffre', () => {
    const device = makeDevice();
    device.signIn(alice, 'tA');
    device.switcher.suspend();
    device.signIn(bob, 'tB');
    device.switcher.switchTo('a1');

    const stored = device.storage.raw.get('meeshy.accounts') ?? '';
    expect(stored).not.toContain('"tA"');
    expect(stored).toContain('"tB"');
  });

  test('une session gardée mais ÉCHUE redemande le mot de passe, et quitte le coffre', () => {
    const device = makeDevice();
    device.signIn(alice, 'tA');
    device.switcher.suspend();
    device.clock.now = NOW + (DAY_S + 1) * 1000;

    expect(device.switcher.switchTo('a1')).toBe('needs-password');
    expect(device.vault.hasPreservedSession('a1')).toBe(false);
  });

  test('un compte inconnu redemande le mot de passe', () => {
    expect(makeDevice().switcher.switchTo('zz')).toBe('needs-password');
  });
});

describe('déconnexion', () => {
  test('le compte reste listé, et y revenir exige le mot de passe', () => {
    const device = makeDevice();
    device.signIn(alice, 'tA');
    device.store.getState().clearSession();

    expect(device.vault.list().map((a) => a.user.username)).toEqual(['alice']);
    expect(device.switcher.switchTo('a1')).toBe('needs-password');
  });

  test('retirer un compte l’efface de la liste ET du coffre', () => {
    const device = makeDevice();
    device.signIn(alice, 'tA');
    device.switcher.suspend();
    device.vault.forget('a1');

    expect(device.vault.list()).toEqual([]);
    expect(device.storage.raw.get('meeshy.accounts') ?? '').not.toContain('tA');
  });
});

describe('le coffre', () => {
  test('liste le compte le plus récemment actif en tête', () => {
    const device = makeDevice();
    device.signIn(alice, 'tA');
    device.switcher.suspend();
    device.clock.now = NOW + 1000;
    device.signIn(bob, 'tB');

    expect(device.vault.list().map((a) => a.user.username)).toEqual(['bob', 'alice']);
  });

  test('une entrée corrompue rend un coffre vide, jamais une exception', () => {
    const storage = memoryStorage({ 'meeshy.accounts': '{"accounts":[{"user":{"id":1}}]}' });
    expect(createAccountVault({ storage, now: () => NOW }).list()).toEqual([]);
    const garbage = memoryStorage({ 'meeshy.accounts': 'pas du json' });
    expect(createAccountVault({ storage: garbage, now: () => NOW }).list()).toEqual([]);
  });

  test('ne retient de l’utilisateur que les champs de la session', () => {
    const device = makeDevice();
    device.vault.noteActive({ ...alice, email: 'alice@x.io', role: 'ADMIN' } as SessionUser);

    const stored = device.storage.raw.get('meeshy.accounts') ?? '';
    expect(stored).not.toContain('alice@x.io');
    expect(stored).not.toContain('ADMIN');
  });

  test('survit à un rechargement', () => {
    const device = makeDevice();
    device.signIn(alice, 'tA');
    device.switcher.suspend();

    const reloaded = createAccountVault({ storage: device.storage, now: () => NOW });
    expect(reloaded.hasPreservedSession('a1')).toBe(true);
  });
});

describe('les données locales d’un compte déconnecté', () => {
  test('partent, celles des autres comptes restent', () => {
    const storage = memoryStorage({
      'meeshy.draft.u_a1.c1': '{}',
      'meeshy.draft.story.a1': '{}',
      'meeshy.studio.audience.a1': 'PUBLIC',
      'meeshy.reading-mode.u_a1.c1': 'focal',
      'meeshy.last-opened.u_a1.c1': '1',
      'meeshy.draft.u_b2.c1': '{}',
      'meeshy.draft.story.b2': '{}',
      'meeshy.scheme': 'dark',
    });

    purgeAccountLocalData({ storage, userId: 'a1', keys: [...storage.raw.keys()] });

    expect([...storage.raw.keys()].sort()).toEqual(['meeshy.draft.story.b2', 'meeshy.draft.u_b2.c1', 'meeshy.scheme']);
  });
});

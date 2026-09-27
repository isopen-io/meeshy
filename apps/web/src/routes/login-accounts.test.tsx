import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createAccountSwitcher, createAccountVault } from '@/lib/api/accounts';
import type { LoginRequest, LoginResponseData } from '@/lib/api/auth';
import type { ApiResult } from '@/lib/api/http';
import { sessionStore, type SessionStorage, type SessionUser } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { LoginDoors } from '@/routes/login';
import { typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * LES COMPTES DE L'APPAREIL À L'ÉCRAN DE CONNEXION (#8286) — la liste (avatar,
 * nom, @pseudo), la bascule SANS mot de passe vers un compte gardé, et la case
 * « Rester connecté sur cet appareil » proposée au compte SUPPLÉMENTAIRE.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/login?methode=password' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  sessionStore.getState().clearSession();
  window.history.replaceState({}, '', '/login?methode=password');
});

function memoryStorage(): SessionStorage {
  const raw = new Map<string, string>();
  return { getItem: (key) => raw.get(key) ?? null, setItem: (key, value) => void raw.set(key, value), removeItem: (key) => void raw.delete(key) };
}

const alice: SessionUser = { id: 'a1', username: 'alice', displayName: 'Alice' };
const bob: SessionUser = { id: 'b2', username: 'bob', displayName: 'Bob' };

function makeAccounts() {
  const now = () => Date.now();
  const vault = createAccountVault({ storage: memoryStorage(), now });
  const switcher = createAccountSwitcher({ vault, store: sessionStore, now, endServerSession: () => undefined });
  return { vault, switcher };
}

function withSuspended(accounts: ReturnType<typeof makeAccounts>, user: SessionUser, token: string) {
  sessionStore.getState().establish({ user, token, sessionToken: `s-${token}`, expiresIn: 3600 });
  accounts.vault.noteActive(user);
  accounts.switcher.suspend();
}

function loginStub() {
  const calls: LoginRequest[] = [];
  const login = async (request: LoginRequest): Promise<ApiResult<LoginResponseData>> => {
    calls.push(request);
    return { ok: false, status: 401, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' };
  };
  return { calls, login };
}

function mount(accounts: ReturnType<typeof makeAccounts>, login = loginStub().login) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<LoginDoors method="password" passwordLogin={login} accounts={accounts} />);
  });
  return container;
}

async function submit(el: HTMLElement) {
  typeInto(el.querySelector<HTMLInputElement>('#login-username'), 'carol');
  typeInto(el.querySelector<HTMLInputElement>('#login-password'), 'secret-1');
  await act(async () => {
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

const activeToken = () => {
  const session = sessionStore.getState().session;
  return session.status === 'authenticated' ? session.token : null;
};

describe('la liste des comptes de l’appareil', () => {
  test('montre avatar, nom et @pseudo, et dit quel compte s’ouvre sans mot de passe', () => {
    const accounts = makeAccounts();
    withSuspended(accounts, alice, 'tA');
    const el = mount(accounts);

    const row = el.querySelector('[data-device-account="alice"]');
    expect(row?.textContent).toContain('Alice');
    expect(row?.textContent).toContain('@alice');
    expect(row?.textContent).toContain('Connecté');
  });

  test('toucher un compte gardé l’ouvre, sans mot de passe', () => {
    const accounts = makeAccounts();
    withSuspended(accounts, alice, 'tA');
    const stub = loginStub();
    const el = mount(accounts, stub.login);

    act(() => {
      (el.querySelector('[data-device-account="alice"]') as HTMLButtonElement).click();
    });

    expect(activeToken()).toBe('tA');
    expect(stub.calls).toEqual([]);
  });

  test('toucher un compte déconnecté préremplit son identifiant et attend le mot de passe', () => {
    const accounts = makeAccounts();
    accounts.vault.noteActive(bob);
    const el = mount(accounts);

    act(() => {
      (el.querySelector('[data-device-account="bob"]') as HTMLButtonElement).click();
    });

    expect(activeToken()).toBeNull();
    expect(el.querySelector<HTMLInputElement>('#login-username')?.value).toBe('bob');
  });

  test('la croix retire le compte de l’appareil', () => {
    const accounts = makeAccounts();
    accounts.vault.noteActive(bob);
    const el = mount(accounts);

    act(() => {
      (el.querySelector('[data-device-account-forget="bob"]') as HTMLButtonElement).click();
    });

    expect(el.querySelector('[data-device-account="bob"]')).toBeNull();
    expect(accounts.vault.list()).toEqual([]);
  });
});

describe('« Rester connecté sur cet appareil »', () => {
  test('n’est pas proposée au premier compte, qui est gardé sans question', async () => {
    const accounts = makeAccounts();
    const stub = loginStub();
    const el = mount(accounts, stub.login);

    expect(el.querySelector('[data-keep-signed-in]')).toBeNull();
    await submit(el);
    expect(stub.calls[0]).toEqual({ username: 'carol', password: 'secret-1' });
  });

  test('est proposée, cochée, dès qu’un autre compte garde sa session', async () => {
    const accounts = makeAccounts();
    withSuspended(accounts, alice, 'tA');
    const stub = loginStub();
    const el = mount(accounts, stub.login);

    const box = el.querySelector<HTMLInputElement>('[data-keep-signed-in] input[type="checkbox"]');
    expect(box?.checked).toBe(true);
    await submit(el);
    expect(stub.calls[0]).toEqual({ username: 'carol', password: 'secret-1', rememberDevice: true });
  });

  test('décochée, la session du nouveau compte ne sera pas gardée', async () => {
    const accounts = makeAccounts();
    withSuspended(accounts, alice, 'tA');
    const stub = loginStub();
    const el = mount(accounts, stub.login);

    act(() => {
      el.querySelector<HTMLInputElement>('[data-keep-signed-in] input[type="checkbox"]')?.click();
    });
    await submit(el);
    expect(stub.calls[0]?.rememberDevice).toBe(false);
  });

  test('le choix est retenu pour le compte qui vient de se connecter', () => {
    const accounts = makeAccounts();
    withSuspended(accounts, alice, 'tA');
    const el = mount(accounts);

    act(() => {
      el.querySelector<HTMLInputElement>('[data-keep-signed-in] input[type="checkbox"]')?.click();
    });
    act(() => {
      sessionStore.getState().establish({ user: bob, token: 'tB', sessionToken: 's-tB', expiresIn: 3600 });
    });

    expect(accounts.vault.list().find((account) => account.user.id === 'b2')?.keepsSession).toBe(false);
  });
});

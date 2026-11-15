import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createAccountSwitcher, createAccountVault } from '@/lib/api/accounts';
import { createSessionStore, type SessionStorage, type SessionUser } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { AccountSwitcherSheet, SwitchAccountButton } from '@/routes/settings-accounts';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * « CHANGER DE COMPTE » (#8286) — un geste DISTINCT de « Déconnexion » : il
 * garde les sessions, ouvre la liste des comptes de l'appareil, et passe à un
 * compte gardé sans mot de passe.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
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
});

function memoryStorage(): SessionStorage {
  const raw = new Map<string, string>();
  return { getItem: (key) => raw.get(key) ?? null, setItem: (key, value) => void raw.set(key, value), removeItem: (key) => void raw.delete(key) };
}

const alice: SessionUser = { id: 'a1', username: 'alice', displayName: 'Alice' };
const bob: SessionUser = { id: 'b2', username: 'bob', displayName: 'Bob' };
const carol: SessionUser = { id: 'c3', username: 'carol', displayName: 'Carol' };

/** Alice est gardée, Carol connue mais déconnectée, Bob est le compte actif. */
function makeDevice() {
  const storage = memoryStorage();
  const now = () => Date.now();
  const store = createSessionStore({ storage, now });
  const vault = createAccountVault({ storage, now });
  const switcher = createAccountSwitcher({ vault, store, now, endServerSession: () => undefined });
  vault.noteActive(carol);
  store.getState().establish({ user: alice, token: 'tA', sessionToken: 's-tA', expiresIn: 3600 });
  vault.noteActive(alice);
  switcher.suspend();
  store.getState().establish({ user: bob, token: 'tB', sessionToken: 's-tB', expiresIn: 3600 });
  vault.noteActive(bob);
  const outcomes: string[] = [];
  return { store, vault, switcher, outcomes };
}

function mount(device: ReturnType<typeof makeDevice>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <AccountSwitcherSheet
        language="fr"
        accounts={{ vault: device.vault, switcher: device.switcher }}
        activeUser={bob}
        onClose={() => device.outcomes.push('closed')}
        onSwitched={() => device.outcomes.push('switched')}
        onSignInRequired={(username) => device.outcomes.push(`sign-in:${username ?? ''}`)}
      />,
    );
  });
  return container;
}

const activeToken = (device: ReturnType<typeof makeDevice>) => {
  const session = device.store.getState().session;
  return session.status === 'authenticated' ? session.token : null;
};

describe('le bouton « Changer de compte »', () => {
  test('est distinct de « Déconnexion », sans habit destructif', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<SwitchAccountButton language="fr" onPress={() => undefined} />);
    });
    const button = container.querySelector('[data-settings-switch-account]');
    expect(button?.textContent).toContain('Changer de compte');
    expect(button?.getAttribute('style') ?? '').not.toContain('danger');
  });
});

describe('la feuille « Changer de compte »', () => {
  test('liste les comptes de l’appareil, le compte actuel marqué et non choisissable', () => {
    const el = mount(makeDevice());

    const current = el.querySelector<HTMLButtonElement>('[data-device-account="bob"]');
    expect(current?.getAttribute('aria-current')).toBe('true');
    expect(current?.disabled).toBe(true);
    expect(el.querySelector('[data-device-account="alice"]')?.textContent).toContain('Connecté');
    expect(el.querySelector('[data-device-account="carol"]')).not.toBeNull();
  });

  test('passer à un compte gardé : sans mot de passe, et retour possible', () => {
    const device = makeDevice();
    const el = mount(device);

    act(() => {
      (el.querySelector('[data-device-account="alice"]') as HTMLButtonElement).click();
    });

    expect(activeToken(device)).toBe('tA');
    expect(device.outcomes).toEqual(['switched']);
    expect(device.switcher.switchTo('b2')).toBe('switched');
    expect(activeToken(device)).toBe('tB');
  });

  test('un compte déconnecté mène à la connexion, identifiant prérempli, en gardant le compte actuel', () => {
    const device = makeDevice();
    const el = mount(device);

    act(() => {
      (el.querySelector('[data-device-account="carol"]') as HTMLButtonElement).click();
    });

    expect(device.outcomes).toEqual(['sign-in:carol']);
    expect(device.store.getState().session.status).toBe('anonymous');
    expect(device.vault.hasPreservedSession('b2')).toBe(true);
  });

  test('« Ajouter un compte » mène à la connexion et garde le compte actuel', () => {
    const device = makeDevice();
    const el = mount(device);

    act(() => {
      (el.querySelector('[data-accounts-add]') as HTMLButtonElement).click();
    });

    expect(device.outcomes).toEqual(['sign-in:']);
    expect(device.vault.hasPreservedSession('b2')).toBe(true);
  });
});

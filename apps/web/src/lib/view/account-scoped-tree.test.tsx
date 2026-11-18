import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createSessionStore, type SessionStorage } from '@/lib/api/session';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AccountScopedTree, nextAccountGeneration } from './account-scoped-tree';

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

function fakeStorage(): SessionStorage {
  const raw = new Map<string, string>();
  return { getItem: (k) => raw.get(k) ?? null, setItem: (k, v) => void raw.set(k, v), removeItem: (k) => void raw.delete(k) };
}

const establish = (store: ReturnType<typeof createSessionStore>, id: string) =>
  store.getState().establish({ user: { id, username: id }, token: `jwt-${id}`, sessionToken: `sess-${id}`, expiresIn: 3600 });

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

describe('la génération de l’arbre ne change qu’au passage d’un compte à un autre', () => {
  const start = { account: null, generation: 0 } as const;

  test('se connecter, se déconnecter ou revenir au même compte garde la génération', () => {
    const ada = nextAccountGeneration(start, 'u-ada');
    expect(ada.generation).toBe(0);
    expect(nextAccountGeneration(ada, null).generation).toBe(0);
    expect(nextAccountGeneration(nextAccountGeneration(ada, null), 'u-ada').generation).toBe(0);
  });

  test('un autre compte, directement ou après une déconnexion, change la génération', () => {
    const ada = nextAccountGeneration(start, 'u-ada');
    expect(nextAccountGeneration(ada, 'u-bob').generation).toBe(1);
    expect(nextAccountGeneration(nextAccountGeneration(ada, null), 'u-bob').generation).toBe(1);
  });
});

describe('ce qu’un écran tient en mémoire ne survit pas au passage à un autre compte', () => {
  test('le brouillon reste à la connexion et au retour du même compte, et part quand Bob arrive', () => {
    const store = createSessionStore({ storage: fakeStorage(), now: () => NOW });
    let type: (text: string) => void = () => undefined;
    function Draft() {
      const [text, setText] = useState('');
      type = setText;
      return <output>{text}</output>;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<AccountScopedTree store={store}><Draft /></AccountScopedTree>));
    act(() => type('étape 2 de l’inscription'));
    act(() => establish(store, 'u-ada'));
    expect(container.textContent).toBe('étape 2 de l’inscription');

    act(() => type('brouillon d’Ada'));
    act(() => store.getState().adoptAnonymous({ sessionToken: 'anon-1', guest: { participantId: 'p-1', nickname: 'Anonyme', conversationId: 'c-1', link: 'l', mayWrite: true } }));
    expect(container.textContent).toBe('brouillon d’Ada');

    act(() => establish(store, 'u-bob'));
    expect(container.textContent).toBe('');
    act(() => root.unmount());
    container.remove();
  });

  test('l’application monte chaque écran sous cet arbre', () => {
    const main = readFileSync(join(import.meta.dir, '../../main.tsx'), 'utf8');
    expect(main).toContain('<AccountScopedTree>{screen}</AccountScopedTree>');
  });
});

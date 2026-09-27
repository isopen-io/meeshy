import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createSessionStore, type SessionStoreApi } from '@/lib/api/session';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { localDay, rememberInviteShown } from './invite';
import { useActivationInviteArmed } from './invite-gate';

/**
 * **LE PORTILLON DE L'INVITATION** (#8239) — la coquille ne va chercher
 * l'hôte (et ne relit l'état) que pour une session OUVERTE à qui l'invitation
 * n'a pas été montrée aujourd'hui. La décision est prise UNE fois par
 * utilisateur : retenir le jour pendant que la modal est ouverte ne doit pas
 * la démonter sous ses doigts au rendu suivant.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

function Probe({ store, storage, tick }: { readonly store: SessionStoreApi; readonly storage: ReturnType<typeof memoryStorage>; readonly tick: number }) {
  const armed = useActivationInviteArmed({ store, storage, now: () => NOW });
  return <output data-tick={tick}>{armed ? 'armed' : 'idle'}</output>;
}

function signIn(store: SessionStoreApi) {
  store.getState().establish({ user: { id: 'u1', username: 'amina' }, token: 't', sessionToken: 's', expiresIn: 3600 });
}

describe('le portillon', () => {
  test('sans session ⇒ rien', async () => {
    const host = await mounter.mount(<Probe store={createSessionStore({ storage: memoryStorage() })} storage={memoryStorage()} tick={0} />);
    expect(host.textContent).toBe('idle');
  });

  test('session ouverte, pas encore montrée aujourd’hui ⇒ armé', async () => {
    const store = createSessionStore({ storage: memoryStorage() });
    signIn(store);
    const host = await mounter.mount(<Probe store={store} storage={memoryStorage()} tick={0} />);
    expect(host.textContent).toBe('armed');
  });

  test('déjà montrée aujourd’hui ⇒ rien', async () => {
    const store = createSessionStore({ storage: memoryStorage() });
    signIn(store);
    const storage = memoryStorage();
    storage.setItem('meeshy.activation-invite.shown-on', localDay(NOW));
    const host = await mounter.mount(<Probe store={store} storage={storage} tick={0} />);
    expect(host.textContent).toBe('idle');
  });

  test('retenir le jour pendant que la modal est ouverte ne désarme pas', async () => {
    const store = createSessionStore({ storage: memoryStorage() });
    signIn(store);
    const storage = memoryStorage();
    const host = await mounter.mount(<Probe store={store} storage={storage} tick={0} />);
    rememberInviteShown(storage, NOW);
    await mounter.rerender(host, <Probe store={store} storage={storage} tick={1} />);
    expect(host.textContent).toBe('armed');
  });
});

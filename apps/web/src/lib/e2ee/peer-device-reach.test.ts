import { describe, expect, test } from 'bun:test';

import { createPeerDeviceReachStore, lacksEncryptedDevice, mayRedirectAutomatically, peerDeviceReachFor, refreshPeerDeviceReach } from './peer-device-reach';
import { forgetPeersSeenWithDevice, peersSeenWithDeviceKey } from './peer-device-key';

/**
 * **CE QUE CE NAVIGATEUR SAIT DES PAIRS SANS APPAREIL CHIFFRÉ** (#20075,
 * miroir `EndToEndPeerDeviceReach`, iOS #20074) — appris par la liste de leurs
 * appareils, oublié dès qu'elle en montre un. Une lecture qui échoue ne change
 * rien : on ne dit que ce qu'on sait, jamais un bandeau sur une supposition.
 */
describe('peerDeviceReach', () => {
  test('aucun appareil publié : le pair est su sans appareil chiffré', async () => {
    const store = createPeerDeviceReachStore(null);
    await refreshPeerDeviceReach(store, async () => 0, 'u-ana');
    expect(lacksEncryptedDevice(store.getState(), 'u-ana')).toBe(true);
    expect(lacksEncryptedDevice(store.getState(), 'u-bea')).toBe(false);
  });

  test('un appareil publié depuis : le pair est oublié', async () => {
    const store = createPeerDeviceReachStore(null);
    await refreshPeerDeviceReach(store, async () => 0, 'u-ana');
    await refreshPeerDeviceReach(store, async () => 1, 'u-ana');
    expect(lacksEncryptedDevice(store.getState(), 'u-ana')).toBe(false);
  });

  test('une lecture qui échoue ne change rien, dans un sens comme dans l’autre', async () => {
    const store = createPeerDeviceReachStore(null);
    await refreshPeerDeviceReach(store, async () => null, 'u-ana');
    expect(lacksEncryptedDevice(store.getState(), 'u-ana')).toBe(false);
    await refreshPeerDeviceReach(store, async () => 0, 'u-ana');
    await refreshPeerDeviceReach(store, async () => null, 'u-ana');
    await refreshPeerDeviceReach(store, () => Promise.reject(new Error('boom')), 'u-ana');
    expect(lacksEncryptedDevice(store.getState(), 'u-ana')).toBe(true);
  });

  test('un état inchangé garde son identité (aucun rendu de plus)', async () => {
    const store = createPeerDeviceReachStore(null);
    await refreshPeerDeviceReach(store, async () => 0, 'u-ana');
    const before = store.getState().withoutDevice;
    await refreshPeerDeviceReach(store, async () => 0, 'u-ana');
    await refreshPeerDeviceReach(store, async () => 2, 'u-bea');
    expect(store.getState().withoutDevice).toBe(before);
  });
});

describe('un appareil déjà connu pour ce pair (#20181)', () => {
  const memory = () => {
    const items = new Map<string, string>();
    return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), removeItem: (key: string) => void items.delete(key) };
  };

  test('jamais d’appareil vu, liste vide : la redirection automatique est permise', async () => {
    const store = createPeerDeviceReachStore(memory());
    await refreshPeerDeviceReach(store, async () => 0, 'u-ana');
    expect(mayRedirectAutomatically(store.getState(), 'u-ana')).toBe(true);
  });

  test('un appareil déjà servi, puis une liste vide : sans appareil, mais aucun automatisme', async () => {
    const store = createPeerDeviceReachStore(memory());
    await refreshPeerDeviceReach(store, async () => 1, 'u-ana');
    await refreshPeerDeviceReach(store, async () => 0, 'u-ana');
    expect(lacksEncryptedDevice(store.getState(), 'u-ana')).toBe(true);
    expect(mayRedirectAutomatically(store.getState(), 'u-ana')).toBe(false);
  });

  test('la mémoire survit au navigateur rouvert, et une mémoire illisible ne coûte rien', async () => {
    const storage = memory();
    await refreshPeerDeviceReach(createPeerDeviceReachStore(storage), async () => 2, 'u-ana');
    const reopened = createPeerDeviceReachStore(storage);
    await refreshPeerDeviceReach(reopened, async () => 0, 'u-ana');
    expect(mayRedirectAutomatically(reopened.getState(), 'u-ana')).toBe(false);

    const broken = { getItem: () => '{oops', setItem: () => { throw new Error('quota'); }, removeItem: () => undefined };
    const store = createPeerDeviceReachStore(broken);
    await refreshPeerDeviceReach(store, async () => 1, 'u-bea');
    expect(store.getState().seenWithDevice['u-bea']).toBe(true);
  });

  test('sans stockage : mémoire de session seulement', async () => {
    const store = createPeerDeviceReachStore(null);
    await refreshPeerDeviceReach(store, async () => 1, 'u-ana');
    await refreshPeerDeviceReach(store, async () => 0, 'u-ana');
    expect(mayRedirectAutomatically(store.getState(), 'u-ana')).toBe(false);
  });
});

describe('la mémoire est partagée entre onglets et rangée par compte (#20197)', () => {
  const memory = () => {
    const items = new Map<string, string>();
    return {
      items,
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    };
  };

  test('deux onglets : un appareil vu dans l’onglet A interdit l’automatisme dans l’onglet B', async () => {
    const shared = memory();
    const tabB = createPeerDeviceReachStore(shared, { account: 'u-moi' });
    const tabA = createPeerDeviceReachStore(shared, { account: 'u-moi' });
    await refreshPeerDeviceReach(tabA, async () => 1, 'u-bob');
    await refreshPeerDeviceReach(tabB, async () => 0, 'u-bob');
    expect(mayRedirectAutomatically(tabB.getState(), 'u-bob')).toBe(false);
  });

  test('l’événement `storage` d’un autre onglet met la mémoire à jour sans relecture de l’annuaire', async () => {
    const shared = memory();
    const listeners: Array<(key: string | null) => void> = [];
    const tabB = createPeerDeviceReachStore(shared, { account: 'u-moi', listen: (onChange) => void listeners.push(onChange) });
    await refreshPeerDeviceReach(tabB, async () => 0, 'u-bob');
    expect(mayRedirectAutomatically(tabB.getState(), 'u-bob')).toBe(true);
    await refreshPeerDeviceReach(createPeerDeviceReachStore(shared, { account: 'u-moi' }), async () => 1, 'u-bob');
    listeners.forEach((onChange) => onChange(peersSeenWithDeviceKey('u-moi')));
    expect(mayRedirectAutomatically(tabB.getState(), 'u-bob')).toBe(false);
  });

  test('un compte ne lit jamais la mémoire d’un autre, et chacun a sa clé', async () => {
    const shared = memory();
    await refreshPeerDeviceReach(createPeerDeviceReachStore(shared, { account: 'u-ada' }), async () => 1, 'u-bob');
    const bea = createPeerDeviceReachStore(shared, { account: 'u-bea' });
    await refreshPeerDeviceReach(bea, async () => 0, 'u-bob');
    expect(mayRedirectAutomatically(bea.getState(), 'u-bob')).toBe(true);
    expect([...shared.items.keys()]).toEqual([peersSeenWithDeviceKey('u-ada')]);
    expect(peersSeenWithDeviceKey('u-ada')).not.toBe(peersSeenWithDeviceKey('u-bea'));
  });

  test('retirer le compte efface sa mémoire, celle des autres reste', async () => {
    const shared = memory();
    await refreshPeerDeviceReach(createPeerDeviceReachStore(shared, { account: 'u-ada' }), async () => 1, 'u-bob');
    await refreshPeerDeviceReach(createPeerDeviceReachStore(shared, { account: 'u-bea' }), async () => 1, 'u-bob');
    forgetPeersSeenWithDevice(shared, 'u-ada');
    expect([...shared.items.keys()]).toEqual([peersSeenWithDeviceKey('u-bea')]);
  });

  test('un magasin par compte, le même à chaque appel', () => {
    expect(peerDeviceReachFor('u-ada')).toBe(peerDeviceReachFor('u-ada'));
    expect(peerDeviceReachFor('u-ada')).not.toBe(peerDeviceReachFor('u-bea'));
  });
});

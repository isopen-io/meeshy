import { createStore, type StoreApi } from 'zustand/vanilla';

import { peersSeenWithDeviceKey } from './peer-device-key';

/**
 * **CE QUE CE NAVIGATEUR SAIT DES PAIRS SANS APPAREIL CHIFFRÉ** (#20075,
 * miroir `EndToEndPeerDeviceReach`, iOS #20074) — appris à l'ouverture d'un
 * tête-à-tête chiffré de bout en bout par la liste des appareils du pair,
 * oublié dès qu'elle en montre un. Une lecture qui échoue ne change rien : on
 * ne dit que ce qu'on sait, jamais un bandeau sur une supposition.
 *
 * **ET CE QU'IL EN A DÉJÀ VU** (#20181, décision porteur) — un serveur qui
 * cacherait les appareils d'un pair obtiendrait le clair de tout message tapé
 * par la redirection automatique. Un pair dont une réponse servie a déjà listé
 * un appareil chiffré est donc retenu (`seenWithDevice`, rangé sur l'appareil
 * et jamais oublié) : une liste vide servie ensuite le dit sans appareil, mais
 * l'envoi en clair exige alors le geste « Écrire sans chiffrement ». Le web ne
 * chiffrant pas, c'est la seule connaissance qu'il ait du pair. Ce qui est rangé
 * n'est qu'une liste d'identifiants de comptes, sans contenu.
 *
 * **PAR COMPTE ET PARTAGÉE ENTRE ONGLETS** (#20197) — une clé par compte
 * (`peer-device-key.ts`) ; le stockage est relu à chaque décision et à chaque
 * événement `storage` d'un autre onglet, si bien qu'un appareil vu dans un
 * onglet interdit l'automatisme dans tous.
 */
export type PeerDeviceReachState = {
  readonly withoutDevice: Readonly<Record<string, true>>;
  readonly seenWithDevice: Readonly<Record<string, true>>;
  confirmWithoutDevice(userId: string): void;
  forget(userId: string): void;
  noteDevice(userId: string): void;
};

export type PeerDeviceStorage = {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
};

function browserStorage(): PeerDeviceStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readSeen(storage: PeerDeviceStorage | null, key: string): Readonly<Record<string, true>> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(key) ?? '[]');
    const ids = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id !== '') : [];
    return Object.fromEntries(ids.map((id) => [id, true as const]));
  } catch {
    return {};
  }
}

function writeSeen(storage: PeerDeviceStorage | null, key: string, seen: Readonly<Record<string, true>>): void {
  try {
    storage?.setItem(key, JSON.stringify(Object.keys(seen)));
  } catch {
    return;
  }
}

/** Prévient d'une écriture du stockage par un autre onglet (`storage`), avec la clé touchée (`null` : tout vidé). */
export type StorageChanges = (onChange: (key: string | null) => void) => void;

function browserStorageChanges(onChange: (key: string | null) => void): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (event) => onChange(event.key));
}

export function createPeerDeviceReachStore(
  storage: PeerDeviceStorage | null = browserStorage(),
  options: { readonly account?: string; readonly listen?: StorageChanges } = {},
): StoreApi<PeerDeviceReachState> {
  const key = peersSeenWithDeviceKey(options.account ?? '');
  const merged = (seen: Readonly<Record<string, true>>): Readonly<Record<string, true>> => ({ ...readSeen(storage, key), ...seen });
  const store = createStore<PeerDeviceReachState>((set, get) => ({
    withoutDevice: {},
    seenWithDevice: readSeen(storage, key),
    confirmWithoutDevice: (userId) =>
      set((state) => {
        const seenWithDevice = merged(state.seenWithDevice);
        const known = state.withoutDevice[userId] === true || userId === '';
        if (known && Object.keys(seenWithDevice).length === Object.keys(state.seenWithDevice).length) return state;
        return { seenWithDevice, withoutDevice: known ? state.withoutDevice : { ...state.withoutDevice, [userId]: true } };
      }),
    forget: (userId) =>
      set((state) => {
        if (state.withoutDevice[userId] !== true) return state;
        const { [userId]: _forgotten, ...rest } = state.withoutDevice;
        return { withoutDevice: rest };
      }),
    noteDevice: (userId) => {
      if (userId === '' || get().seenWithDevice[userId] === true) return;
      const seenWithDevice = { ...merged(get().seenWithDevice), [userId]: true as const };
      set({ seenWithDevice });
      writeSeen(storage, key, seenWithDevice);
    },
  }));
  (options.listen ?? browserStorageChanges)((changed) => {
    if (changed !== null && changed !== key) return;
    const seenWithDevice = merged(store.getState().seenWithDevice);
    if (Object.keys(seenWithDevice).length !== Object.keys(store.getState().seenWithDevice).length) store.setState({ seenWithDevice });
  });
  return store;
}

const byAccount = new Map<string, StoreApi<PeerDeviceReachState>>();

/** Le magasin du compte, le même à chaque appel : sa mémoire n'est lue par aucun autre (#20197). */
export function peerDeviceReachFor(account: string): StoreApi<PeerDeviceReachState> {
  const known = byAccount.get(account);
  if (known !== undefined) return known;
  const store = createPeerDeviceReachStore(browserStorage(), { account });
  byAccount.set(account, store);
  return store;
}

export const lacksEncryptedDevice = (state: Pick<PeerDeviceReachState, 'withoutDevice'>, userId: string): boolean => state.withoutDevice[userId] === true;

/** La redirection AUTOMATIQUE vers le clair : aucun appareil listé, et aucun jamais connu de ce navigateur (#20181). */
export const mayRedirectAutomatically = (state: Pick<PeerDeviceReachState, 'withoutDevice' | 'seenWithDevice'>, userId: string): boolean =>
  lacksEncryptedDevice(state, userId) && state.seenWithDevice[userId] !== true;

export type EncryptedDeviceCounter = (userId: string) => Promise<number | null>;

/** Relit la liste des appareils du pair et rend ce qu'elle a compté (`null` : lecture impossible, rien ne change). */
export async function refreshPeerDeviceReach(store: StoreApi<PeerDeviceReachState>, count: EncryptedDeviceCounter, userId: string): Promise<number | null> {
  const devices = await count(userId).catch(() => null);
  if (devices === null) return null;
  if (devices === 0) {
    store.getState().confirmWithoutDevice(userId);
    return 0;
  }
  store.getState().noteDevice(userId);
  store.getState().forget(userId);
  return devices;
}

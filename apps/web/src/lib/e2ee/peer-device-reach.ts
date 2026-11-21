import { createStore, type StoreApi } from 'zustand/vanilla';

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

export const PEERS_SEEN_WITH_DEVICE_KEY = 'meeshy.e2ee.peers-seen-with-device';

function browserStorage(): PeerDeviceStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readSeen(storage: PeerDeviceStorage | null): Readonly<Record<string, true>> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(PEERS_SEEN_WITH_DEVICE_KEY) ?? '[]');
    const ids = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id !== '') : [];
    return Object.fromEntries(ids.map((id) => [id, true as const]));
  } catch {
    return {};
  }
}

function writeSeen(storage: PeerDeviceStorage | null, seen: Readonly<Record<string, true>>): void {
  try {
    storage?.setItem(PEERS_SEEN_WITH_DEVICE_KEY, JSON.stringify(Object.keys(seen)));
  } catch {
    return;
  }
}

export const createPeerDeviceReachStore = (storage: PeerDeviceStorage | null = browserStorage()): StoreApi<PeerDeviceReachState> =>
  createStore<PeerDeviceReachState>((set, get) => ({
    withoutDevice: {},
    seenWithDevice: readSeen(storage),
    confirmWithoutDevice: (userId) =>
      set((state) => (userId === '' || state.withoutDevice[userId] === true ? state : { withoutDevice: { ...state.withoutDevice, [userId]: true } })),
    forget: (userId) =>
      set((state) => {
        if (state.withoutDevice[userId] !== true) return state;
        const { [userId]: _forgotten, ...rest } = state.withoutDevice;
        return { withoutDevice: rest };
      }),
    noteDevice: (userId) => {
      if (userId === '' || get().seenWithDevice[userId] === true) return;
      const seenWithDevice = { ...readSeen(storage), ...get().seenWithDevice, [userId]: true as const };
      set({ seenWithDevice });
      writeSeen(storage, seenWithDevice);
    },
  }));

export const peerDeviceReach = createPeerDeviceReachStore();

export const lacksEncryptedDevice = (state: Pick<PeerDeviceReachState, 'withoutDevice'>, userId: string): boolean => state.withoutDevice[userId] === true;

/** La redirection AUTOMATIQUE vers le clair : aucun appareil listé, et aucun jamais connu de ce navigateur (#20181). */
export const mayRedirectAutomatically = (state: Pick<PeerDeviceReachState, 'withoutDevice' | 'seenWithDevice'>, userId: string): boolean =>
  lacksEncryptedDevice(state, userId) && state.seenWithDevice[userId] !== true;

export type EncryptedDeviceCounter = (userId: string) => Promise<number | null>;

export async function refreshPeerDeviceReach(store: StoreApi<PeerDeviceReachState>, count: EncryptedDeviceCounter, userId: string): Promise<void> {
  const devices = await count(userId).catch(() => null);
  if (devices === null) return;
  if (devices === 0) return store.getState().confirmWithoutDevice(userId);
  store.getState().noteDevice(userId);
  store.getState().forget(userId);
}

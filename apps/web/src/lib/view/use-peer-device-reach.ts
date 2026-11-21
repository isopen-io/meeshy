import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { encryptedDeviceCountOf } from '@/lib/api/e2ee-peer-devices';
import {
  lacksEncryptedDevice,
  mayRedirectAutomatically,
  peerDeviceReachFor,
  refreshPeerDeviceReach,
  type EncryptedDeviceCounter,
  type PeerDeviceReachState,
} from '@/lib/e2ee/peer-device-reach';

export type PeerDevicesPort = { readonly store: StoreApi<PeerDeviceReachState>; readonly count: EncryptedDeviceCounter };

/** Le compteur de l'annuaire, la passerelle réelle. */
export const countEncryptedDevices: EncryptedDeviceCounter = (userId) => encryptedDeviceCountOf(apiDeps, userId);

const byAccount = new Map<string, PeerDevicesPort>();

/** Le magasin du compte (#20197) et l'annuaire réel, la même valeur à chaque appel. */
export function defaultPeerDevices(account: string): PeerDevicesPort {
  const known = byAccount.get(account);
  if (known !== undefined) return known;
  const port = { store: peerDeviceReachFor(account), count: countEncryptedDevices };
  byAccount.set(account, port);
  return port;
}

/**
 * CE QUE CE NAVIGATEUR SAIT DU PAIR D'UN TÊTE-À-TÊTE CHIFFRÉ (#20075, #20181)
 * — `unknown` : il a un appareil chiffré, ou on n'en sait rien ; `automatic` :
 * aucun appareil listé et aucun jamais connu, l'envoi part de lui-même dans la
 * conversation lisible ; `gesture` : aucun appareil listé mais un déjà connu,
 * l'envoi en clair exige le geste « Écrire sans chiffrement ». Ce qui est su se
 * lit tout de suite (cache-first) ; la liste se relit en silence à chaque
 * ouverture. `undefined` : aucun pair à interroger, aucune requête.
 */
export type PeerDeviceVerdict = 'unknown' | 'automatic' | 'gesture';

export function usePeerDeviceVerdict(peerId: string | undefined, port: PeerDevicesPort): PeerDeviceVerdict {
  const { store, count } = port;
  const verdict = useStore(store, (state): PeerDeviceVerdict => {
    if (peerId === undefined || !lacksEncryptedDevice(state, peerId)) return 'unknown';
    return mayRedirectAutomatically(state, peerId) ? 'automatic' : 'gesture';
  });
  useEffect(() => {
    if (peerId === undefined) return;
    void refreshPeerDeviceReach(store, count, peerId);
  }, [peerId, store, count]);
  return verdict;
}

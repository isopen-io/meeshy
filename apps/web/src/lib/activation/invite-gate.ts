import { useRef } from 'react';
import { useStore } from 'zustand/react';

import { sessionStore, type SessionStoreApi } from '@/lib/api/session';
import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

import { wasInviteShownToday } from './invite';

/**
 * **LE PORTILLON DE L'INVITATION À VALIDER SON COMPTE** (#8239) — même
 * doctrine que `sync-pill-gate.ts` : la coquille l'importe en STATIQUE, il ne
 * connaît ni libellé ni réseau, et c'est sa réponse OUI qui va chercher l'hôte
 * (`lazy()`, `components/shell.tsx`) — lequel relit l'état servi.
 *
 * OUI = une session ouverte à qui l'invitation n'a pas été montrée aujourd'hui
 * sur cet appareil. La décision est prise UNE fois par utilisateur : l'hôte
 * retient le jour dès que la modal s'ouvre, et un portillon qui relirait ce
 * jour au rendu suivant démonterait la modal sous les doigts du lecteur.
 */

let defaultStorage: SafeStorage | null = null;
const storageOrDefault = (storage: SafeStorage | undefined): SafeStorage => {
  if (storage !== undefined) return storage;
  defaultStorage ??= safeLocalStorage();
  return defaultStorage;
};

export function useActivationInviteArmed({
  store = sessionStore,
  storage,
  now = Date.now,
}: {
  readonly store?: SessionStoreApi;
  readonly storage?: SafeStorage;
  readonly now?: () => number;
} = {}): boolean {
  const userId = useStore(store, (s) => (s.session.status === 'authenticated' ? s.session.user.id : null));
  const decided = useRef<{ readonly userId: string; readonly armed: boolean } | null>(null);
  if (userId === null) {
    decided.current = null;
    return false;
  }
  if (decided.current?.userId !== userId) {
    decided.current = { userId, armed: !wasInviteShownToday(storageOrDefault(storage), now()) };
  }
  return decided.current.armed;
}

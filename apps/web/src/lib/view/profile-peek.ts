import { useSyncExternalStore } from 'react';

/**
 * **LE PROFIL S'OUVRE LÀ OÙ L'ON SE TROUVE** (parité iOS, directive porteur du
 * 2026-09-25). Sur iOS, toucher l'avatar ou le nom d'un auteur — dans un fil,
 * une story, un commentaire — présente `UserProfileSheet` PAR-DESSUS l'écran
 * (`RootViewLayers.swift`, `router.participantProfileTarget`) : on lit le
 * profil sans perdre sa place, et la story attend. Le web quittait l'écran
 * pour `/u/$username`.
 *
 * Un store hors de React, et minuscule, parce que ses lecteurs (`Avatar`,
 * `PersonName`, les mentions) sont peints avant le premier pixel : la feuille
 * elle-même se charge à la demande (`components/profile-peek-host.tsx`).
 *
 * **SANS HÔTE MONTÉ, LE LIEN RESTE UN LIEN.** `peekProfile` rend `false`
 * quand aucune coquille n'écoute (un témoin qui monte un composant seul, une
 * page institutionnelle) : l'appelant laisse alors la navigation se faire,
 * jamais un toucher sans effet (loi 4).
 */
let current: string | null = null;
let hosts = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): string | null {
  return current;
}

export function peekProfile(username: string): boolean {
  if (hosts === 0 || username === '') return false;
  current = username;
  emit();
  return true;
}

export function closeProfilePeek(): void {
  if (current === null) return;
  current = null;
  emit();
}

/** Déclare un hôte : rend sa propre désinscription. */
export function registerProfilePeekHost(): () => void {
  hosts += 1;
  return () => {
    hosts -= 1;
    if (hosts === 0) closeProfilePeek();
  };
}

export function useProfilePeek(): string | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

export function useProfilePeekOpen(): boolean {
  return useProfilePeek() !== null;
}

/**
 * Le `onClick` d'un lien vers un profil : le toucher simple ouvre la feuille,
 * les gestes du navigateur (nouvel onglet, clic du milieu) gardent l'adresse
 * — le `Link` du routeur ne nous appelle même pas pour eux.
 */
export function peekProfileOnClick(username: string): (event: { preventDefault: () => void }) => void {
  return (event) => {
    if (peekProfile(username)) event.preventDefault();
  };
}

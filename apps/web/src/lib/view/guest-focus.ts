import { useStore } from 'zustand/react';

import { sessionStore, type GuestIdentity, type SessionState } from '@/lib/api/session';

/**
 * SANS COMPTE, PAS DE STRUCTURE D'APPLICATION (#10100, décision porteur du
 * 2026-10-11).
 *
 * Un invité n'a qu'UNE conversation — celle de son lien — et la garde lui
 * refuse toutes les autres routes (`session-guard.ts`). Lui montrer la liste,
 * un retour vers elle ou la navigation de l'application, c'est lui montrer des
 * portes qui mènent à la connexion. Son fil s'affiche donc en FOCUS : l'en-tête
 * de la conversation, ses messages, son composeur, rien d'autre.
 *
 * Un COMPTE qui lit une conversation sous son identité anonyme (#8816) a une
 * session `guest` lui aussi, mais il TIENT son compte à côté : il garde son
 * application. C'est la seule distinction que cette loi pose.
 */
export function focusGuestOf(session: SessionState): GuestIdentity | null {
  return session.status === 'guest' && session.account === undefined ? session.guest : null;
}

/** L'invité sans compte TENU, au rendu — `null` pour un compte ou personne. */
export function useFocusGuest(): GuestIdentity | null {
  return useStore(sessionStore, (state) => focusGuestOf(state.session));
}

/** Le fil se lit-il en focus ? — un booléen, pour un rendu qui n'a besoin que de lui. */
export function useGuestFocus(): boolean {
  return useStore(sessionStore, (state) => focusGuestOf(state.session) !== null);
}

/**
 * **QUI PARLE À LA PASSERELLE EN INVITÉ** (#10205) — toute session `guest`,
 * compte tenu à côté ou non : le transport ne présente alors que le jeton
 * d'invité (`credentialFromSession`), et la passerelle lui refuse la liste des
 * membres, les accusés par personne et les profils (403 `ACCOUNT_REQUIRED`).
 * Ce qui DÉPEND de ces routes — détails, fiches, mentions suggérées, accusés —
 * se lit ici, jamais au focus (qui ne décide que de la STRUCTURE de l'écran).
 */
export function speaksAsGuest(session: SessionState): boolean {
  return session.status === 'guest';
}

/** `speaksAsGuest` au rendu. */
export function useSpeaksAsGuest(): boolean {
  return useStore(sessionStore, (state) => speaksAsGuest(state.session));
}

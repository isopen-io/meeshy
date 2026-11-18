import { Fragment, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { heldAccountOf, sessionStore, type SessionStoreApi } from '@/lib/api/session';

/**
 * LE COMPTE QUE L'ARBRE A SERVI ET SA GÉNÉRATION (audit #19352) — la
 * génération change quand un AUTRE compte arrive, jamais à la connexion
 * (aucun compte → Ada), à la déconnexion, ni au retour du même compte :
 * l'écran de connexion ou d'inscription garde ses étapes, seul le passage
 * d'un compte à un autre remonte l'arbre.
 */
export type AccountGeneration = { readonly account: string | null; readonly generation: number };

export function nextAccountGeneration(previous: AccountGeneration, account: string | null): AccountGeneration {
  if (account === null || account === previous.account) return previous;
  if (previous.account === null) return { account, generation: previous.generation };
  return { account, generation: previous.generation + 1 };
}

/**
 * UN BROUILLON APPARTIENT AU COMPTE QUI L'ÉCRIT (audit #19352). Un onglet suit
 * l'appareil quand un autre onglet change de compte (`session-follow.ts`) :
 * tout écran qui garde un brouillon en mémoire (profil, réglages, composeur)
 * l'afficherait sous le nouveau compte, et l'enregistrerait en son nom.
 * L'application monte chaque écran sous cet arbre : le passage à un autre
 * compte le REMONTE, et rien de ce que l'écran tenait ne survit.
 */
export function AccountScopedTree({ children, store = sessionStore }: { readonly children: ReactNode; readonly store?: SessionStoreApi }) {
  const account = useStore(store, (state) => heldAccountOf(state.session)?.user.id ?? null);
  const served = useRef<AccountGeneration>({ account, generation: 0 });
  served.current = nextAccountGeneration(served.current, account);
  return <Fragment key={served.current.generation}>{children}</Fragment>;
}

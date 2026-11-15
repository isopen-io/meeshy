import { useLayoutEffect } from 'react';
import { useStore } from 'zustand/react';

import { scopedConversationOf, sessionStore, type SessionStoreApi } from '@/lib/api/session';

/**
 * L'IDENTITÉ SUIT LA CONVERSATION LUE (#8816) — miroir web du
 * `fullScreenCover` invité d'iOS (`MeeshyApp.swift § activeGuestSession`,
 * `isDeliberate`) : un compte qui a rejoint une conversation en « Anonyme » la
 * lit sous l'identité anonyme TENUE à côté de lui, et redevient lui-même dès
 * qu'il en sort.
 *
 * La session EFFECTIVE est posée AVANT que l'écran ne rende : tant que la
 * route et la session ne concordent pas, le hook rend `false` et la garde
 * peint le squelette — la première requête du fil ne part jamais sous la
 * mauvaise identité. La bascule se fait dans un effet de MISE EN PAGE (jamais
 * pendant le rendu) et elle est idempotente.
 */

export type ScopeRoute = { readonly key: string; readonly params: Readonly<Record<string, string>> };

/** La conversation que la route LIT — le fil seul ; toute autre route n'en lit aucune. */
export function anonymousConversationOf(route: ScopeRoute): string | null {
  return route.key === 'thread' ? (route.params.conversation ?? null) : null;
}

export function useAnonymousScope(route: ScopeRoute, store: SessionStoreApi = sessionStore): boolean {
  const conversation = anonymousConversationOf(route);
  const current = useStore(store, (state) => scopedConversationOf(state.session));
  const wanted = useStore(store, (state) => state.anonymousScopeFor(conversation));

  useLayoutEffect(() => {
    if (wanted !== current) store.getState().scopeAnonymous(conversation);
  }, [conversation, current, store, wanted]);

  return wanted === current;
}

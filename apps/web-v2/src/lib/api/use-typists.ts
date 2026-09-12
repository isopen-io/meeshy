import { useMemo } from 'react';
import { useStore } from 'zustand/react';

import { typingStore, typistNamesOf, type TypingEntry } from './typing-store';

const EMPTY: readonly TypingEntry[] = [];

/**
 * LES FRAPPEURS D'UNE CONVERSATION (#5793) — filtre SOI (jamais annoncé,
 * miroir `ConversationListViewModel.swift:971-975`) et les entrées PÉRIMÉES
 * (`typing-store.ts`). `useMemo` sur la référence BRUTE du magasin : ce hook
 * ne recalcule qu'au moment où CETTE conversation reçoit un `start`/`stop`,
 * jamais à chaque rendu du fil — le virtualiseur en provoque plusieurs par
 * seconde au défilement (`thread.tsx`, doc-comment de `place()`).
 *
 * Rend UN SEUL frappeur ce lot (le premier de la liste, § 1.3/2 de la
 * spécification #5793 : « recevoir une LISTE de frappeurs, le roster est un
 * suivi ») — `thread-modes.tsx` continue de rendre au plus une ligne.
 */
export function useTypists(conversationId: string, viewerId: string): readonly TypingEntry[] {
  const raw = useStore(typingStore, (s) => s.byConversation[conversationId] ?? EMPTY);
  return useMemo(() => {
    const now = Date.now();
    const alive = raw.filter((t) => t.userId !== viewerId && t.expiresAt > now);
    return alive.length === raw.length ? raw : alive;
  }, [raw, viewerId]);
}

/**
 * LES FRAPPEURS DE TOUTE LA LISTE (#5793, ligne 2 de la Lentille) —
 * `conversationId → nom`. L'ÉCRAN s'abonne UNE fois et distribue : une rangée
 * est rendue dans un `.map`, elle ne peut pas appeler de hook. Même forme que
 * `overrides` (`useStore(conversationStore, …)` puis `effectiveFlagsOf` par
 * rangée) dans `routes/conversations.tsx`.
 *
 * L'identité du résultat change à CHAQUE `start`/`stop`, quelle que soit la
 * conversation — c'est inhérent à une carte de tout l'écran. Ce que ça coûte
 * est borné par `sameRowProps` (`components/lens-row.tsx`) : une rangée dont le
 * `typist` reste `undefined` ne se re-rend PAS, même si l'écran l'a fait.
 */
export function useTypistNames(viewerId: string): Readonly<Record<string, string>> {
  const byConversation = useStore(typingStore, (s) => s.byConversation);
  return useMemo(() => typistNamesOf({ byConversation }, viewerId, Date.now()), [byConversation, viewerId]);
}

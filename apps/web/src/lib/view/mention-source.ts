import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand/react';
import { createStore } from 'zustand/vanilla';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { fetchMentionSuggestions, type MentionCandidate } from '@/lib/api/mention-suggestions';
import { sessionStore } from '@/lib/api/session';
import type { Message } from '@/lib/api/types';
import { resolveViewer } from '@/lib/api/viewer';

import { localMentionCandidates } from './mention-query';

/**
 * LA SOURCE DES MENTIONS DU FIL OUVERT (#7826).
 *
 * Le composeur ne connaît ni la conversation, ni ses messages, ni le lecteur :
 * il ne reçoit que ce que `routes/thread.tsx` lui passe, et ce contrat-là est
 * délibérément étroit (`memo`, props stabilisées). Plutôt que d'élargir ses
 * props, le fil PUBLIE ici ce qu'une mention exige — les candidats locaux,
 * l'identité du lecteur, la recherche distante — depuis `useThreadCompose`,
 * qui possède déjà `conversationId` et `messages` ; le composeur s'y abonne.
 *
 * Deux propriétés en découlent :
 * - un composeur monté HORS d'un fil (un témoin, une surface future) lit
 *   `null` et n'ouvre aucune liste — jamais une recherche sans contexte ;
 * - le composeur ne s'abonne qu'une requête `@` ACTIVE (sélecteur
 *   conditionnel, `use-mention-suggestions.ts`) : un message qui arrive ne
 *   re-rend pas un composeur au repos.
 *
 * La source est RETIRÉE au démontage du fil, et seulement si c'est encore la
 * sienne — un fil qui en remplace un autre ne se fait pas effacer par le
 * nettoyage tardif du précédent.
 */

export type MentionSource = {
  readonly selfId: string | null;
  readonly locals: readonly MentionCandidate[];
  readonly search: (query: string, signal: AbortSignal) => Promise<readonly MentionCandidate[]>;
};

export type MentionSourceState = { readonly source: MentionSource | null };

export const mentionSourceStore = createStore<MentionSourceState>(() => ({ source: null }));

export function publishMentionSource(source: MentionSource): () => void {
  mentionSourceStore.setState({ source });
  return () => {
    if (mentionSourceStore.getState().source === source) mentionSourceStore.setState({ source: null });
  };
}

export function useSelfId(): string | null {
  const session = useStore(sessionStore, (state) => state.session);
  return useMemo(() => resolveViewer({ source: apiDeps.source, session }).id, [session]);
}

export function usePublishMentionSource(input: {
  readonly conversationId: string | undefined;
  readonly messages: readonly Message[];
}): void {
  const { conversationId, messages } = input;
  const selfId = useSelfId();
  const locals = useMemo(() => localMentionCandidates(messages, selfId), [messages, selfId]);
  const search = useMemo(
    () =>
      conversationId === undefined
        ? null
        : async (query: string, signal: AbortSignal) =>
            unwrap(await fetchMentionSuggestions(apiDeps, { conversationId, query, signal })),
    [conversationId],
  );

  useEffect(() => {
    if (search === null) return undefined;
    return publishMentionSource({ selfId, locals, search });
  }, [search, selfId, locals]);
}

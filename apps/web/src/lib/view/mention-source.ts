import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand/react';
import { createStore } from 'zustand/vanilla';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { fetchMentionSuggestions, type MentionCandidate, type MentionContext } from '@/lib/api/mention-suggestions';
import { sessionStore } from '@/lib/api/session';
import type { Message } from '@/lib/api/types';
import { searchUsers } from '@/lib/api/users-search';
import { resolveViewer } from '@/lib/api/viewer';

import { localMentionCandidates, peopleMentionCandidates } from './mention-query';

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
  /** Les PARTICIPANTS du contexte — les contacts, eux, viennent de leur
   * propre cache (`mention-contacts.ts`), communs à tous les champs. */
  readonly locals: readonly MentionCandidate[];
  readonly search: (query: string, signal: AbortSignal) => Promise<readonly MentionCandidate[]>;
};

const NO_PARTICIPANTS: readonly MentionCandidate[] = [];

const contextSearch =
  (context: MentionContext) =>
  async (query: string, signal: AbortSignal): Promise<readonly MentionCandidate[]> =>
    unwrap(await fetchMentionSuggestions(apiDeps, { context, query, signal }));

const directorySearch = async (query: string): Promise<readonly MentionCandidate[]> =>
  peopleMentionCandidates(unwrap(await searchUsers(apiDeps, query)), null);

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
    () => (conversationId === undefined ? null : contextSearch({ type: 'conversation', id: conversationId })),
    [conversationId],
  );

  useEffect(() => {
    if (search === null) return undefined;
    return publishMentionSource({ selfId, locals, search });
  }, [search, selfId, locals]);
}

type MentionablePeople = Parameters<typeof peopleMentionCandidates>[0];

/**
 * LA SOURCE D'UN CHAMP HORS FIL (#7846) — rendue au champ, jamais publiée :
 * plusieurs de ces champs peuvent vivre ensemble (le fil de commentaires sous
 * une story, son champ de modification), chacun avec son contexte.
 *
 * - une PUBLICATION existante ⇒ `contextType=post` : la passerelle classe son
 *   auteur et ses commentateurs, puis les amis, puis le reste ;
 * - rien encore (une publication en cours d'écriture, une humeur) ⇒
 *   l'ANNUAIRE (`/directory/people`, ≥ 2 caractères comme la règle).
 *
 * `null` pour un lecteur sans identité : les deux routes exigent un compte.
 */
export function useMentionSource(
  context: { readonly postId: string; readonly people: MentionablePeople } | { readonly directory: true },
): MentionSource | null {
  const selfId = useSelfId();
  const postId = 'postId' in context ? context.postId : null;
  const people = 'people' in context ? context.people : null;
  const locals = useMemo(() => (people === null ? NO_PARTICIPANTS : peopleMentionCandidates(people, selfId)), [people, selfId]);
  const search = useMemo(() => (postId === null ? directorySearch : contextSearch({ type: 'post', id: postId })), [postId]);
  return useMemo(() => (selfId === null ? null : { selfId, locals, search }), [selfId, locals, search]);
}

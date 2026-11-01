import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand/react';
import { createStore } from 'zustand/vanilla';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { fetchMentionSuggestions, type MentionCandidate, type MentionContext } from '@/lib/api/mention-suggestions';
import { sessionStore } from '@/lib/api/session';
import { useSpeaksAsGuest } from '@/lib/view/guest-focus';
import type { Message } from '@/lib/api/types';
import { searchUsers } from '@/lib/api/users-search';
import { resolveViewer } from '@/lib/api/viewer';

import type { MentionReach } from '@meeshy/shared/utils/mention-lookup';

import { conversationMentionReach, localMentionCandidates, peopleMentionCandidates } from './mention-query';

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
  /** La portée de la conversation (#14071) : une suggestion qui n'y aurait aucun
   * effet n'est pas affichée. Absente hors conversation (post, annuaire). */
  readonly reach?: MentionReach;
};

const NO_PARTICIPANTS: readonly MentionCandidate[] = [];

const contextSearch =
  (context: MentionContext) =>
  async (query: string, signal: AbortSignal): Promise<readonly MentionCandidate[]> =>
    unwrap(await fetchMentionSuggestions(apiDeps, { context, query, signal }));

const noSearch = async (): Promise<readonly MentionCandidate[]> => NO_PARTICIPANTS;

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
  readonly conversation: Parameters<typeof conversationMentionReach>[0]['conversation'];
}): void {
  const { conversationId, messages, conversation } = input;
  const selfId = useSelfId();
  const locals = useMemo(() => localMentionCandidates(messages, selfId), [messages, selfId]);
  /* LA PORTÉE (#14071) — dérivée des TROIS primitives qu'elle lit : la
     conversation passe par un objet que l'hôte reconstruit à chaque rendu. */
  const conversationType = conversation?.type;
  const isMember = conversation?.isMember;
  const currentUserRole = conversation?.currentUserRole;
  const participants = conversation?.participants;
  /* UN INVITÉ NE DEMANDE PAS LES MEMBRES (#10205) : la passerelle ne les lui
     sert plus. Il mentionne les auteurs qu'il LIT déjà dans le fil (`locals`),
     sans requête. */
  const speaksAsGuest = useSpeaksAsGuest();
  const reach = useMemo(
    () =>
      conversationMentionReach({
        conversation:
          conversationType === undefined || participants === undefined
            ? undefined
            : { type: conversationType, participants, isMember, currentUserRole },
        viewerId: selfId,
        isGuest: speaksAsGuest,
      }),
    [conversationType, isMember, currentUserRole, participants, selfId, speaksAsGuest],
  );
  const search = useMemo(
    () => (conversationId === undefined ? null : speaksAsGuest ? noSearch : contextSearch({ type: 'conversation', id: conversationId })),
    [conversationId, speaksAsGuest],
  );

  useEffect(() => {
    if (search === null) return undefined;
    return publishMentionSource({ selfId, locals, search, reach });
  }, [search, selfId, locals, reach]);
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
 *   l'ANNUAIRE (`/directory/people`), appelé selon la même loi
 *   (`mentionLookupStage`, #14053).
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

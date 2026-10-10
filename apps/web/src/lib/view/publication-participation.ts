import { useSyncExternalStore } from 'react';

import type { StoryActionRailButton } from '@/lib/stories/action-rail';

/**
 * **CE QUE LE LECTEUR A DÉJÀ FAIT D'UNE PUBLICATION** (directive porteur
 * 2026-10-01 : « le contour du cœur sur tous les autres éléments lorsqu'on a
 * commenté, partagé etc. »).
 *
 * La passerelle sert la RÉACTION du lecteur sur une story
 * (`currentUserReactions`, `PostFeedService.getStories`) ; elle ne sert NI
 * qu'il l'a commentée, NI qu'il l'a envoyée, NI qu'il l'a republiée
 * (`isRepostedByMe` n'est posé que par `withViewerPostState`, que le fil des
 * stories n'appelle pas). Ce magasin retient donc ce que CE lecteur a fait
 * pendant la session, noté aux deux sites uniques du geste — `commentAction`
 * et `recordShareAction` (`lib/api/query.ts`) — et lu par les rails.
 *
 * Valeurs IMMUABLES : un geste neuf remplace l'ensemble de SA publication, un
 * geste déjà noté ne change rien (aucun abonné réveillé pour rien).
 */
export type PublicationParticipation = 'commented' | 'sent' | 'reposted';

const NONE: ReadonlySet<PublicationParticipation> = new Set();

export type ParticipationStore = {
  readonly note: (postId: string, kind: PublicationParticipation) => void;
  readonly marksOf: (postId: string) => ReadonlySet<PublicationParticipation>;
  readonly subscribe: (listener: () => void) => () => void;
};

export function createParticipationStore(): ParticipationStore {
  let marks: ReadonlyMap<string, ReadonlySet<PublicationParticipation>> = new Map();
  const listeners = new Set<() => void>();
  return {
    note: (postId, kind) => {
      const current = marks.get(postId) ?? NONE;
      if (current.has(kind)) return;
      marks = new Map(marks).set(postId, new Set([...current, kind]));
      listeners.forEach((listener) => listener());
    },
    marksOf: (postId) => marks.get(postId) ?? NONE,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const participation = createParticipationStore();

export const notePublicationParticipation = (postId: string, kind: PublicationParticipation): void => participation.note(postId, kind);

export function usePublicationParticipation(postId: string | undefined): ReadonlySet<PublicationParticipation> {
  const read = (): ReadonlySet<PublicationParticipation> => (postId === undefined ? NONE : participation.marksOf(postId));
  return useSyncExternalStore(participation.subscribe, read, read);
}

/**
 * **L'ANNEAU DE CHAQUE BOUTON DU RAIL D'UNE STORY** — « Envoyer » (la story
 * d'autrui) et « Partager » (la sienne) ouvrent la MÊME feuille
 * (`storySendRequest`) : un envoi allume donc les deux faces.
 */
export function storyRailParticipated(params: {
  readonly marks: ReadonlySet<PublicationParticipation>;
  readonly reacted: boolean;
}): Readonly<Pick<Record<StoryActionRailButton, boolean>, 'react' | 'comments' | 'forward' | 'share' | 'repost'>> {
  const sent = params.marks.has('sent');
  return {
    react: params.reacted,
    comments: params.marks.has('commented'),
    forward: sent,
    share: sent,
    repost: params.marks.has('reposted'),
  };
}

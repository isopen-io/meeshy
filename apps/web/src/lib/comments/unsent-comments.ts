import { createStore, type StoreApi } from 'zustand/vanilla';

import type { PostComment } from '@/lib/api/publication-comments';
import type { PendingAttachment } from '@/lib/send/attachments';

/**
 * **LES COMMENTAIRES NON ENVOYÉS** (#9743) — la file d'un commentaire dont la
 * CRÉATION n'a pas abouti (hors ligne, 5xx) alors que ses pièces sont déjà
 * téléversées. Même motif que l'outbox du message (`send/outbox-store.ts`) :
 * `zustand/vanilla`, mémoire seule, hors du cache de requêtes — une relecture
 * de la liste n'efface pas ce qui attend, et quitter la feuille non plus.
 *
 * Une entrée porte TOUT ce que son rejeu demande : le corps déjà composé (ses
 * `attachmentIds` compris — rien ne remonte une seconde fois) et l'identifiant
 * de mutation de la première tentative (la passerelle reconnaît le rejeu). Et
 * ce qu'un refus définitif doit RENDRE : le texte et les pièces d'origine.
 */
export type UnsentComment = {
  readonly tempId: string;
  /** Le lecteur qui l'a écrit (`u_<id>`) — jamais rejoué sous un autre compte. */
  readonly scope: string;
  readonly postId: string;
  readonly parentId?: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly clientMutationId: string;
  /** La rangée provisoire — reposée si une relecture de la liste l'a effacée. */
  readonly row: PostComment;
  readonly pieces: readonly PendingAttachment[];
  /** `sending` : un rejeu est en vol — un second ne part pas. */
  readonly state: 'unsent' | 'sending';
};

export type UnsentCommentsState = {
  readonly entries: readonly UnsentComment[];
  park(entry: UnsentComment): void;
  mark(tempId: string, state: UnsentComment['state']): void;
  remove(tempId: string): void;
  forgetScope(scope: string): void;
};

export function createUnsentComments(): StoreApi<UnsentCommentsState> {
  return createStore<UnsentCommentsState>((set) => ({
    entries: [],
    park: (entry) => set((state) => ({ entries: [...state.entries.filter((held) => held.tempId !== entry.tempId), entry] })),
    mark: (tempId, next) =>
      set((state) => ({ entries: state.entries.map((entry) => (entry.tempId === tempId ? { ...entry, state: next } : entry)) })),
    remove: (tempId) => set((state) => ({ entries: state.entries.filter((entry) => entry.tempId !== tempId) })),
    forgetScope: (scope) => set((state) => ({ entries: state.entries.filter((entry) => entry.scope !== scope) })),
  }));
}

export const unsentComments = createUnsentComments();

export const unsentOf = (state: Pick<UnsentCommentsState, 'entries'>, scope: string, postId: string): readonly UnsentComment[] =>
  state.entries.filter((entry) => entry.scope === scope && entry.postId === postId);

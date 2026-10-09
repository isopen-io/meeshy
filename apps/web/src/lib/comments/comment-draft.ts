import type { PendingAttachment } from '@/lib/send/attachments';
import { draftStore, type DraftStore } from '@/lib/send/draft-store';

/**
 * **LE BROUILLON D'UN COMMENTAIRE** (#9743) — le texte et les pièces choisies,
 * par (lecteur, publication) : fermer la feuille d'une story ou quitter le
 * détail d'un post ne les perd pas.
 *
 * LE TEXTE passe par le magasin de brouillons du message (`draftStore`, sur
 * le disque, purgé à la déconnexion du compte) sous la clé `comment.<post>`.
 * LES PIÈCES sont tenues en MÉMOIRE : un `File` ne se range pas dans
 * `localStorage`, et le composeur de message ne les garde pas non plus au
 * rechargement — après un rechargement, le texte revient, les pièces non.
 */
export type CommentDraft = { readonly text: string; readonly pending: readonly PendingAttachment[] };

export type CommentDrafts = {
  readonly get: (scope: string, postId: string) => CommentDraft;
  readonly set: (scope: string, postId: string, draft: CommentDraft) => void;
  readonly forgetScope: (scope: string) => void;
};

const NO_PIECES: readonly PendingAttachment[] = [];
const textKey = (postId: string): string => `comment.${postId}`;
const piecesKey = (scope: string, postId: string): string => `${scope}\u0000${postId}`;

export function createCommentDrafts(texts: DraftStore = draftStore): CommentDrafts {
  const pieces = new Map<string, readonly PendingAttachment[]>();
  return {
    get: (scope, postId) => ({
      text: texts.getDraft(scope, textKey(postId))?.text ?? '',
      pending: pieces.get(piecesKey(scope, postId)) ?? NO_PIECES,
    }),
    set: (scope, postId, draft) => {
      texts.setDraft(scope, textKey(postId), { text: draft.text, language: '', protection: {} });
      if (draft.pending.length === 0) pieces.delete(piecesKey(scope, postId));
      else pieces.set(piecesKey(scope, postId), draft.pending);
    },
    forgetScope: (scope) => {
      [...pieces.keys()].filter((key) => key.startsWith(`${scope}\u0000`)).forEach((key) => pieces.delete(key));
    },
  };
}

export const commentDrafts: CommentDrafts = createCommentDrafts();

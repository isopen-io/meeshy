import type { QueryClient } from '@tanstack/react-query';

import { commentDrafts } from '@/lib/comments/comment-draft';
import { forgetUploadedCommentMedia } from '@/lib/comments/comment-media';
import { unsentComments, unsentOf, type UnsentComment } from '@/lib/comments/unsent-comments';

import { commentRepliesQueryKey, dropReply, settleReply } from './comment-replies';
import { outcomeOf } from './outcome';
import type { OwnerCredential } from './owner-session';
import {
  commentStillInFlight,
  commentsQueryKey,
  dropComment,
  insertComment,
  sendComment,
  shiftCommentCount,
  shiftReplyCount,
  type CommentDeps,
  type CommentInfiniteData,
  type PostComment,
} from './publication-comments';

/**
 * **LE REJEU D'UN COMMENTAIRE NON ENVOYÉ** (#9743) — la reprise que
 * `performComment` annonçait sans la faire. Il renvoie le corps TEL QUEL
 * (`attachmentIds` compris : les pièces sont déjà sur le serveur, rien ne
 * remonte une seconde fois) sous l'identifiant de mutation de la première
 * tentative — la passerelle reconnaît le rejeu, donc une seule création même
 * si la première avait atteint le serveur sans que sa réponse revienne.
 *
 * Quatre issues :
 *  - servi : il prend la place de la rangée provisoire (reposée si une
 *    relecture l'avait effacée) ;
 *  - 410 : la création AVAIT eu lieu et son résultat n'est plus servi — la
 *    liste se relit, rien n'est défait ni rendu au brouillon ;
 *  - refus définitif : la rangée et les compteurs sont défaits, le texte et
 *    les pièces reviennent au brouillon de la publication ;
 *  - panne passagère : il attend encore, relançable.
 */
/**
 * `owner` — OBLIGATOIRE, et fermé : la session du PROPRIÉTAIRE de l'entrée,
 * lue dans le tour même où la requête part (`owner-session.ts`). Un autre
 * compte connecté, un invité, personne : rien ne part, l'entrée attend son
 * auteur. La requête porte le jeton lu avec l'identité — le transport n'en
 * relit aucun.
 */
export type ReplayDeps = CommentDeps & { readonly queryClient: QueryClient; readonly owner: OwnerCredential };

export type ReplayOutcome = 'sent' | 'unsent' | 'refused' | 'absent';

const RESULT_GONE = 410;

const isServed = (value: unknown): value is PostComment =>
  value !== null && typeof value === 'object' && typeof (value as PostComment).id === 'string';

const listKeyOf = (entry: UnsentComment) =>
  entry.parentId === undefined ? commentsQueryKey(entry.postId) : commentRepliesQueryKey(entry.postId, entry.parentId);

function settle(queryClient: QueryClient, entry: UnsentComment, served: PostComment): void {
  if (entry.parentId !== undefined) {
    queryClient.setQueryData<CommentInfiniteData>(listKeyOf(entry), (data) => settleReply(data, entry.tempId, served));
    return;
  }
  queryClient.setQueryData<CommentInfiniteData>(listKeyOf(entry), (data) => {
    const cleared = dropComment(data, entry.tempId);
    const alreadyThere = cleared?.pages.some((page) => page.comments.some((comment) => comment.id === served.id)) === true;
    return alreadyThere ? cleared : insertComment(cleared, served);
  });
}

function undo(queryClient: QueryClient, entry: UnsentComment): void {
  if (entry.parentId === undefined) {
    queryClient.setQueryData<CommentInfiniteData>(listKeyOf(entry), (data) => dropComment(data, entry.tempId));
  } else {
    queryClient.setQueryData<CommentInfiniteData>(listKeyOf(entry), (data) => dropReply(data, entry.tempId));
    shiftReplyCount(queryClient, entry.postId, entry.parentId, -1);
  }
  shiftCommentCount(queryClient, entry.postId, -1);
}

function giveBack(entry: UnsentComment): void {
  /* Refusé pour de bon : ces pièces ne sont plus « déjà montées » — un nouvel envoi les retéléverse. */
  forgetUploadedCommentMedia(entry.pieces);
  const draft = commentDrafts.get(entry.scope, entry.postId);
  if (draft.text.trim() !== '' || draft.pending.length > 0) return;
  commentDrafts.set(entry.scope, entry.postId, { text: entry.row.content, pending: entry.pieces });
}

export async function replayUnsentComment(deps: ReplayDeps, tempId: string): Promise<ReplayOutcome> {
  const store = unsentComments.getState();
  const entry = store.entries.find((held) => held.tempId === tempId);
  if (entry === undefined || entry.state === 'sending') return 'absent';
  /* LE PROPRIÉTAIRE, PUIS LA REQUÊTE, DANS LE MÊME TOUR — aucun `await` entre
     la lecture de la session et le départ, et le jeton lu est IMPOSÉ. */
  const credential = deps.owner(entry.scope);
  if (credential === null) return 'absent';
  store.mark(tempId, 'sending');

  const result = await sendComment(deps, { postId: entry.postId, body: entry.body, clientMutationId: entry.clientMutationId, credential }).catch(() => null);

  /* LA SESSION A PU CHANGER PENDANT LE VOL : la file et le brouillon sont au
     propriétaire (leur portée le dit), mais le cache de requêtes est celui du
     lecteur COURANT — il n'est écrit que si c'est encore le propriétaire. */
  const stillOwner = deps.owner(entry.scope) !== null;

  if (result !== null && result.ok) {
    if (stillOwner && isServed(result.data)) settle(deps.queryClient, entry, result.data);
    store.remove(tempId);
    return 'sent';
  }
  if (result !== null && result.status === RESULT_GONE) {
    store.remove(tempId);
    if (stillOwner) {
      deps.queryClient.setQueryData<CommentInfiniteData>(listKeyOf(entry), (data) =>
        entry.parentId === undefined ? dropComment(data, tempId) : dropReply(data, tempId),
      );
      void deps.queryClient.invalidateQueries({ queryKey: listKeyOf(entry), exact: true });
    }
    return 'sent';
  }
  /* 409 `MUTATION_IN_FLIGHT` : la première tentative se crée encore — elle attend, rien n'est défait. */
  if (result !== null && outcomeOf(result) === 'permanent' && !commentStillInFlight(result)) {
    store.remove(tempId);
    /* L'auteur parti, rien ne se réécrit : ni le cache du lecteur courant, ni un brouillon sous sa portée. */
    if (stillOwner) {
      undo(deps.queryClient, entry);
      giveBack(entry);
    }
    return 'refused';
  }
  store.mark(tempId, 'unsent');
  return 'unsent';
}

/** Tout ce qui attend pour CE lecteur sur CETTE publication, dans l'ordre où
 * il a été écrit — rend le nombre de commentaires partis. */
export async function replayUnsentComments(deps: ReplayDeps, scope: string, postId: string): Promise<number> {
  let sent = 0;
  for (const entry of unsentOf(unsentComments.getState(), scope, postId)) {
    if ((await replayUnsentComment(deps, entry.tempId)) === 'sent') sent += 1;
  }
  return sent;
}

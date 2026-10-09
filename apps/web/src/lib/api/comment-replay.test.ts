import { afterEach, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { commentsQueryKey, flattenCommentPages, performComment, type CommentInfiniteData } from '@/lib/api/publication-comments';
import { postQueryKey } from '@/lib/api/publication-detail';
import { commentDrafts } from '@/lib/comments/comment-draft';
import { unsentComments, unsentOf } from '@/lib/comments/unsent-comments';
import { pendingAttachmentOf } from '@/lib/send/attachments';

import { replayUnsentComment, replayUnsentComments } from './comment-replay';

/**
 * #9743 — **UN COMMENTAIRE AVEC PIÈCES NE SE PERD PAS** quand la création
 * échoue après le téléversement (hors ligne, 5xx) : il attend, « non envoyé »,
 * avec ses `attachmentIds`, et son rejeu repart sous le MÊME
 * `X-Client-Mutation-Id` — une seule création, jamais deux.
 */
const author = { id: 'u-me', username: 'moi', displayName: 'Moi', avatar: null };
const SCOPE = 'u_u-me';
const PHOTO = { postMediaId: '507f1f77bcf86cd799439011', fileUrl: '/u/a.jpg', mimeType: 'image/jpeg' };
const piece = () => pendingAttachmentOf(new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }));

type Call = { readonly body?: unknown; readonly headers?: Readonly<Record<string, string>> };
type Answer = { ok: true; status: number; data: unknown } | { ok: false; status: number; error: string } | 'network';

function world(answers: Answer[]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(commentsQueryKey('p1'), { pages: [{ comments: [], pagination: { limit: 20, hasMore: false, nextCursor: null } }], pageParams: [undefined] });
  queryClient.setQueryData(postQueryKey('p1'), { id: 'p1', commentCount: 0 });
  const calls: Call[] = [];
  const transport = {
    request: async (request: Call) => {
      calls.push(request);
      const answer = answers.shift() ?? 'network';
      if (answer === 'network') throw new Error('réseau');
      return answer;
    },
  };
  const deps = { source: 'gateway' as const, transport: transport as never, queryClient };
  const rows = () => flattenCommentPages(queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1')));
  const count = () => queryClient.getQueryData<{ commentCount: number }>(postQueryKey('p1'))?.commentCount;
  return { deps, calls, rows, count };
}

const poser = (deps: ReturnType<typeof world>['deps'], pieces = [piece()]) =>
  performComment({ postId: 'p1', content: 'Regarde', author, media: [PHOTO], pieces, deps });

afterEach(() => {
  unsentComments.getState().forgetScope(SCOPE);
  commentDrafts.forgetScope(SCOPE);
});

describe('un commentaire dont la création échoue attend, avec ses pièces (#9743)', () => {
  test('hors ligne après le téléversement : il reste « non envoyé », ses attachmentIds gardés', async () => {
    const { deps, rows } = world(['network']);
    const result = await poser(deps);
    expect(result.ok).toBe(true);
    const [waiting] = unsentOf(unsentComments.getState(), SCOPE, 'p1');
    expect(waiting?.state).toBe('unsent');
    expect(waiting?.body).toEqual({ content: 'Regarde', attachmentIds: [PHOTO.postMediaId] });
    expect(rows()[0]?.id).toBe(waiting?.tempId);
    expect(rows()[0]?.media?.map((m) => m.id)).toEqual([PHOTO.postMediaId]);
  });

  test('un 503 le garde aussi ; un refus permanent ne laisse rien en attente', async () => {
    const a = world([{ ok: false, status: 503, error: 'indisponible' }]);
    await poser(a.deps);
    expect(unsentOf(unsentComments.getState(), SCOPE, 'p1')).toHaveLength(1);
    unsentComments.getState().forgetScope(SCOPE);
    const b = world([{ ok: false, status: 403, error: 'fermé' }]);
    await poser(b.deps);
    expect(unsentOf(unsentComments.getState(), SCOPE, 'p1')).toHaveLength(0);
  });

  test('le rejeu repart sous le MÊME identifiant de mutation, avec les mêmes pièces, et le servi prend la place', async () => {
    const { deps, calls, rows, count } = world(['network', { ok: true, status: 201, data: { id: 'cm-1', content: 'Regarde', createdAt: '2026-10-09T10:00:00.000Z', author } }]);
    await poser(deps);
    expect(await replayUnsentComments(deps, SCOPE, 'p1')).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).toEqual(calls[0]?.body);
    expect(calls[1]?.headers?.['X-Client-Mutation-Id']).toBe(calls[0]?.headers?.['X-Client-Mutation-Id'] ?? 'absent');
    expect(rows().map((row) => row.id)).toEqual(['cm-1']);
    expect(count()).toBe(1);
    expect(unsentOf(unsentComments.getState(), SCOPE, 'p1')).toHaveLength(0);
  });

  test('UNE SEULE FOIS : deux rejeux lancés ensemble n’envoient qu’une création', async () => {
    const { deps, calls } = world(['network', { ok: true, status: 201, data: { id: 'cm-1', content: 'Regarde', createdAt: '2026-10-09T10:00:00.000Z', author } }]);
    await poser(deps);
    const tempId = unsentOf(unsentComments.getState(), SCOPE, 'p1')[0]?.tempId ?? '';
    await Promise.all([replayUnsentComment(deps, tempId), replayUnsentComment(deps, tempId)]);
    expect(calls).toHaveLength(2);
  });

  test('un rejeu qui échoue encore le laisse en attente, relançable', async () => {
    const { deps, rows } = world(['network', 'network']);
    await poser(deps);
    expect(await replayUnsentComments(deps, SCOPE, 'p1')).toBe(0);
    expect(unsentOf(unsentComments.getState(), SCOPE, 'p1')[0]?.state).toBe('unsent');
    expect(rows()).toHaveLength(1);
  });

  test('la rangée effacée par une relecture est reposée quand le rejeu aboutit', async () => {
    const { deps, rows } = world(['network', { ok: true, status: 201, data: { id: 'cm-1', content: 'Regarde', createdAt: '2026-10-09T10:00:00.000Z', author } }]);
    await poser(deps);
    deps.queryClient.setQueryData(commentsQueryKey('p1'), { pages: [{ comments: [], pagination: { limit: 20, hasMore: false, nextCursor: null } }], pageParams: [undefined] });
    await replayUnsentComments(deps, SCOPE, 'p1');
    expect(rows().map((row) => row.id)).toEqual(['cm-1']);
  });

  test('410 au rejeu : la création avait eu lieu — plus d’attente, la liste se relit, rien n’est défait', async () => {
    const { deps, count } = world(['network', { ok: false, status: 410, error: 'gone' }]);
    await poser(deps);
    await replayUnsentComments(deps, SCOPE, 'p1');
    expect(unsentOf(unsentComments.getState(), SCOPE, 'p1')).toHaveLength(0);
    expect(count()).toBe(1);
    expect(deps.queryClient.getQueryState(commentsQueryKey('p1'))?.isInvalidated).toBe(true);
    expect(commentDrafts.get(SCOPE, 'p1').pending).toHaveLength(0);
  });

  test('refusé pour de bon au rejeu : la rangée part, le texte ET les pièces reviennent au brouillon', async () => {
    const { deps, rows, count } = world(['network', { ok: false, status: 403, error: 'fermé' }]);
    const pieces = [piece()];
    await poser(deps, pieces);
    await replayUnsentComments(deps, SCOPE, 'p1');
    expect(rows()).toHaveLength(0);
    expect(count()).toBe(0);
    expect(commentDrafts.get(SCOPE, 'p1')).toEqual({ text: 'Regarde', pending: pieces });
  });

  test('le rejeu ne touche jamais l’attente d’un AUTRE compte', async () => {
    const { deps, calls } = world(['network']);
    await poser(deps);
    expect(await replayUnsentComments(deps, 'u_autre', 'p1')).toBe(0);
    expect(calls).toHaveLength(1);
  });
});

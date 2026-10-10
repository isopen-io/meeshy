import { afterEach, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { commentsQueryKey, flattenCommentPages, performComment, type CommentInfiniteData } from '@/lib/api/publication-comments';
import { VIEWER_ID } from '@/lib/api/fixtures-base';
import { postQueryKey } from '@/lib/api/publication-detail';
import { uploadCommentMedia } from '@/lib/comments/comment-media';
import { commentDrafts } from '@/lib/comments/comment-draft';
import { unsentComments, unsentOf } from '@/lib/comments/unsent-comments';
import { pendingAttachmentOf } from '@/lib/send/attachments';

import { replayUnsentComment, replayUnsentComments } from './comment-replay';
import { commentAction } from './query';
import { appQueryClient } from './query-client';

/**
 * #9743 — **UN COMMENTAIRE AVEC PIÈCES NE SE PERD PAS** quand la création
 * échoue après le téléversement (hors ligne, 5xx) : il attend, « non envoyé »,
 * avec ses `attachmentIds`, et son rejeu repart sous le MÊME
 * `X-Client-Mutation-Id` — une seule création, jamais deux.
 */
/* Le lecteur de FIXTURE : le brouillon de l'application ne s'écrit que pour le lecteur connecté (#9743, A2). */
const author = { id: VIEWER_ID, username: 'moi', displayName: 'Moi', avatar: null };
const SCOPE = `u_${VIEWER_ID}`;
const PHOTO = { postMediaId: '507f1f77bcf86cd799439011', fileUrl: '/u/a.jpg', mimeType: 'image/jpeg' };
const piece = () => pendingAttachmentOf(new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }));

type Call = { readonly body?: unknown; readonly headers?: Readonly<Record<string, string>>; readonly credential?: unknown };
const JETON_A = { kind: 'registered' as const, token: 'jeton-a' };
type Answer = { ok: true; status: number; data: unknown } | { ok: false; status: number; error: string; code?: string } | 'network';

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
  /* QUI EST CONNECTÉ — le lecteur A par défaut ; un témoin le change en cours de route. */
  const session = { scope: SCOPE as string | null };
  const owner = (scope: string) => (session.scope === scope ? JETON_A : null);
  const deps = { source: 'gateway' as const, transport: transport as never, queryClient, owner };
  const rows = () => flattenCommentPages(queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1')));
  const count = () => queryClient.getQueryData<{ commentCount: number }>(postQueryKey('p1'))?.commentCount;
  return { deps, calls, rows, count, session };
}

const poser = (deps: ReturnType<typeof world>['deps'], pieces = [piece()]) =>
  performComment({ postId: 'p1', content: 'Regarde', author, media: [PHOTO], pieces, deps });

afterEach(() => {
  unsentComments.getState().forgetScope(SCOPE);
  commentDrafts.set(SCOPE, 'p1', { text: '', pending: [] });
  appQueryClient.clear();
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

  test('SÉCURITÉ — l’attente de A sous la session de B : zéro requête, elle attend A', async () => {
    const { deps, calls, rows, session } = world(['network', { ok: true, status: 201, data: { id: 'cm-1', content: 'Regarde', createdAt: '2026-10-09T10:00:00.000Z', author } }]);
    await poser(deps);
    const tempId = unsentOf(unsentComments.getState(), SCOPE, 'p1')[0]?.tempId ?? '';
    session.scope = 'u_b';
    expect(await replayUnsentComment(deps, tempId)).toBe('absent');
    expect(await replayUnsentComments(deps, SCOPE, 'p1')).toBe(0);
    expect(calls).toHaveLength(1);
    expect(unsentOf(unsentComments.getState(), SCOPE, 'p1')[0]?.state).toBe('unsent');
    expect(rows()).toHaveLength(1);
    session.scope = null;
    expect(await replayUnsentComment(deps, tempId)).toBe('absent');
    expect(calls).toHaveLength(1);
  });

  test('SÉCURITÉ — le rejeu part sous le jeton du PROPRIÉTAIRE, lu avec son identité', async () => {
    const { deps, calls } = world(['network', { ok: true, status: 201, data: { id: 'cm-1', content: 'Regarde', createdAt: '2026-10-09T10:00:00.000Z', author } }]);
    await poser(deps);
    await replayUnsentComments(deps, SCOPE, 'p1');
    expect(calls[0]?.credential).toEqual(JETON_A);
    expect(calls[1]?.credential).toEqual(JETON_A);
  });

  test('SÉCURITÉ — la session change PENDANT le rejeu : aucune création de plus ne part', async () => {
    const { deps, calls, session } = world(['network', 'network']);
    await poser(deps);
    await poser(deps);
    expect(unsentOf(unsentComments.getState(), SCOPE, 'p1')).toHaveLength(2);
    const servi = { ok: true as const, status: 201, data: { id: 'cm-1', content: 'Regarde', createdAt: '2026-10-09T10:00:00.000Z', author } };
    const transport = deps.transport as unknown as { request: (request: Call) => Promise<unknown> };
    transport.request = async (request: Call) => {
      calls.push(request);
      session.scope = 'u_b';
      return servi;
    };
    await replayUnsentComments(deps, SCOPE, 'p1');
    expect(calls).toHaveLength(3);
    expect(unsentOf(unsentComments.getState(), SCOPE, 'p1')).toHaveLength(1);
  });

  test('SÉCURITÉ — la session a changé pendant que la création était en vol : la liste du nouveau lecteur n’est pas touchée', async () => {
    const { deps, rows, session } = world(['network']);
    await poser(deps);
    const avant = rows();
    const transport = deps.transport as unknown as { request: (request: Call) => Promise<unknown> };
    transport.request = async () => {
      session.scope = 'u_b';
      return { ok: false, status: 403, error: 'fermé' };
    };
    await replayUnsentComments(deps, SCOPE, 'p1');
    expect(rows()).toEqual(avant);
    expect(unsentOf(unsentComments.getState(), SCOPE, 'p1')).toHaveLength(0);
    /* A2 — le propriétaire n'est plus là : rien n'est réécrit sous sa portée. */
    expect(commentDrafts.get(SCOPE, 'p1').text).toBe('');
    expect(commentDrafts.get('u_b', 'p1').text).toBe('');
  });

  test('A1 — 409 MUTATION_IN_FLIGHT au rejeu : la création est en cours, l’entrée reste « non envoyée », rien n’est défait', async () => {
    const { deps, rows, count } = world(['network', { ok: false, status: 409, error: 'Comment already in flight', code: 'MUTATION_IN_FLIGHT' } as Answer]);
    await poser(deps);
    expect(await replayUnsentComments(deps, SCOPE, 'p1')).toBe(0);
    expect(unsentOf(unsentComments.getState(), SCOPE, 'p1')[0]?.state).toBe('unsent');
    expect(rows()).toHaveLength(1);
    expect(count()).toBe(1);
    expect(commentDrafts.get(SCOPE, 'p1')).toEqual({ text: '', pending: [] });
  });

  test('A1 — un 409 d’une autre cause reste un refus définitif', async () => {
    const { deps, rows } = world(['network', { ok: false, status: 409, error: 'conflit' }]);
    await poser(deps);
    await replayUnsentComments(deps, SCOPE, 'p1');
    expect(rows()).toHaveLength(0);
  });

  test('A1 — au PREMIER envoi aussi, 409 MUTATION_IN_FLIGHT fait attendre', async () => {
    const { deps, rows } = world([{ ok: false, status: 409, error: 'in flight', code: 'MUTATION_IN_FLIGHT' } as Answer]);
    expect((await poser(deps)).ok).toBe(true);
    expect(unsentOf(unsentComments.getState(), SCOPE, 'p1')).toHaveLength(1);
    expect(rows()).toHaveLength(1);
  });

  test('A2 — l’auteur est parti pendant le premier envoi : rien n’est mis en attente sous sa portée', async () => {
    const { deps, session } = world([]);
    const transport = deps.transport as unknown as { request: (request: Call) => Promise<unknown> };
    transport.request = async () => {
      session.scope = null;
      throw new Error('réseau');
    };
    await poser(deps);
    expect(unsentComments.getState().entries).toHaveLength(0);
  });

  test('A3 — session changée pendant le PREMIER envoi, refus définitif : ni la liste ni les compteurs du nouveau lecteur ne bougent', async () => {
    const { deps, rows, count, session } = world([]);
    const transport = deps.transport as unknown as { request: (request: Call) => Promise<unknown> };
    let pendant: { rows: number; count: number | undefined } | undefined;
    transport.request = async () => {
      pendant = { rows: rows().length, count: count() };
      session.scope = 'u_b';
      return { ok: false, status: 403, error: 'fermé' };
    };
    const result = await poser(deps);
    expect(result.ok).toBe(false);
    expect({ rows: rows().length, count: count() }).toEqual(pendant ?? { rows: -1, count: -1 });
  });

  test('A3 — session changée pendant le premier envoi, création servie : le cache du nouveau lecteur n’est pas réécrit', async () => {
    const { deps, rows, session } = world([]);
    const transport = deps.transport as unknown as { request: (request: Call) => Promise<unknown> };
    transport.request = async () => {
      session.scope = 'u_b';
      return { ok: true, status: 201, data: { id: 'cm-1', content: 'Regarde', createdAt: '2026-10-09T10:00:00.000Z', author } };
    };
    await poser(deps);
    expect(rows().some((row) => row.id === 'cm-1')).toBe(false);
  });

  test('A4 — refusé pour de bon au rejeu : les pièces du lot ne sont plus reprises comme « déjà montées »', async () => {
    const montées: string[] = [];
    const upload = async (f: File) => {
      montées.push(f.name);
      return { ok: true as const, status: 201, data: { postMediaId: `pm-${montées.length}`, fileUrl: '/u/a.jpg', mimeType: 'image/jpeg' } };
    };
    const pieces = [piece()];
    await uploadCommentMedia(pieces, upload, { owner: SCOPE });
    const { deps } = world(['network', { ok: false, status: 403, error: 'fermé' }]);
    await poser(deps, pieces);
    await replayUnsentComments(deps, SCOPE, 'p1');
    await uploadCommentMedia(pieces, upload, { owner: SCOPE });
    expect(montées).toHaveLength(2);
  });

  test('A5 — sans `owner`, rien ne part : la garde est fermée, pas optionnelle', async () => {
    const { deps, calls, rows } = world([]);
    const { owner: _owner, ...sansGarde } = deps;
    const result = await performComment({ postId: 'p1', content: 'Regarde', author, deps: sansGarde as typeof deps });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(rows()).toHaveLength(0);
  });

  test('A5 — `commentAction` passe la garde : un auteur qui n’est pas le lecteur connecté ne publie pas', async () => {
    const result = await commentAction({ postId: 'post-text-rank2', content: 'Usurpé', author: { id: 'u-autre', displayName: 'Autre' } });
    expect(result.ok).toBe(false);
    expect(flattenCommentPages(appQueryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('post-text-rank2')))).toHaveLength(0);
  });

  test('SÉCURITÉ — un premier envoi sous une AUTRE session que celle de l’auteur ne part pas', async () => {
    const { deps, calls, rows, session } = world([]);
    session.scope = 'u_b';
    const result = await poser(deps);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(rows()).toHaveLength(0);
    expect(unsentComments.getState().entries).toHaveLength(0);
  });

  test('le rejeu ne touche jamais l’attente d’un AUTRE compte', async () => {
    const { deps, calls } = world(['network']);
    await poser(deps);
    expect(await replayUnsentComments(deps, 'u_autre', 'p1')).toBe(0);
    expect(calls).toHaveLength(1);
  });
});

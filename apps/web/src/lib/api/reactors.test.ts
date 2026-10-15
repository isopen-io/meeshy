import { describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from './conversations';
import type { ApiResult, HttpRequest } from './http';
import { fetchMessageReactors, messageReactorsQueryKey, parseReactorGroups } from './reactors';

/**
 * QUI A RÉAGI (#10583) — `GET /reactions/:messageId` : la liste nominative de
 * « Plus… ». Rien n'est fabriqué : un nom que la passerelle ne sert pas n'est
 * pas affiché.
 */

const SERVED = {
  messageId: 'm-1',
  reactions: [
    {
      emoji: '❤️',
      count: 2,
      hasCurrentUser: false,
      participantIds: ['p-1', 'p-2'],
      users: [
        { username: 'Awa', avatar: 'https://cdn.test/awa.jpg', createdAt: '2026-10-14T09:00:00.000Z' },
        { username: 'Malik', avatar: null, createdAt: '2026-10-14T09:01:00.000Z' },
      ],
    },
    { emoji: '👍', count: 1, hasCurrentUser: true, participantIds: ['p-3'], users: [{ username: 'Vous', createdAt: '2026-10-14T09:02:00.000Z' }] },
  ],
  totalCount: 3,
  userReactions: ['👍'],
};

const depsOf = (respond: (request: HttpRequest) => ApiResult<unknown>): { readonly deps: ConversationsDeps; readonly requests: HttpRequest[] } => {
  const requests: HttpRequest[] = [];
  return {
    requests,
    deps: {
      source: 'gateway',
      transport: {
        request: <T,>(request: HttpRequest) => {
          requests.push(request);
          return Promise.resolve(respond(request) as ApiResult<T>);
        },
      } as ConversationsDeps['transport'],
    },
  };
};

describe('parseReactorGroups — ce que la passerelle sert, et rien d’autre', () => {
  test('un groupe par emoji, ses réacteurs dans l’ordre servi', () => {
    expect(parseReactorGroups(SERVED)).toEqual([
      {
        emoji: '❤️',
        reactors: [
          { name: 'Awa', avatar: 'https://cdn.test/awa.jpg' },
          { name: 'Malik', avatar: null },
        ],
      },
      { emoji: '👍', reactors: [{ name: 'Vous', avatar: null }] },
    ]);
  });

  test('un réacteur sans nom servi n’est pas inventé', () => {
    const groups = parseReactorGroups({ reactions: [{ emoji: '🔥', count: 3, users: [{ avatar: null }, { username: '' }, { username: 'Lina' }, 'x', null] }] });
    expect(groups).toEqual([{ emoji: '🔥', reactors: [{ name: 'Lina', avatar: null }] }]);
  });

  test('un groupe sans `users` reste un groupe sans nom ; un groupe sans emoji est écarté', () => {
    expect(parseReactorGroups({ reactions: [{ emoji: '😮', count: 1 }, { count: 2, users: [{ username: 'Awa' }] }] })).toEqual([{ emoji: '😮', reactors: [] }]);
  });

  test('une charge qui n’a pas la forme attendue ne rend aucun groupe', () => {
    expect(parseReactorGroups(null)).toEqual([]);
    expect(parseReactorGroups('oops')).toEqual([]);
    expect(parseReactorGroups({ reactions: 'oops' })).toEqual([]);
  });
});

describe('fetchMessageReactors', () => {
  test('lit `GET /api/v1/reactions/:messageId` et rend les groupes servis', async () => {
    const { deps, requests } = depsOf(() => ({ ok: true, data: SERVED, status: 200 }));
    const result = await fetchMessageReactors({ ...deps, messageId: 'm 1' });
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /api/v1/reactions/m%201']);
    expect(result.ok && result.data.map((group) => group.emoji)).toEqual(['❤️', '👍']);
  });

  test('un refus de la passerelle est rendu tel quel — rien n’est affiché à sa place', async () => {
    const { deps } = depsOf(() => ({ ok: false, status: 403, error: 'Access denied to this conversation' }));
    const result = await fetchMessageReactors({ ...deps, messageId: 'm-1' });
    expect(result).toEqual({ ok: false, status: 403, error: 'Access denied to this conversation' });
  });

  test('en source `fixtures`, aucun appel réseau et aucun nom', async () => {
    const { deps, requests } = depsOf(() => ({ ok: true, data: SERVED, status: 200 }));
    const result = await fetchMessageReactors({ ...deps, source: 'fixtures', messageId: 'm-1' });
    expect(requests).toEqual([]);
    expect(result).toEqual({ ok: true, data: [], status: 200 });
  });

  test('la clé de cache est celle du message', () => {
    expect(messageReactorsQueryKey('m-1')).toEqual(['message-reactors', 'm-1']);
  });
});

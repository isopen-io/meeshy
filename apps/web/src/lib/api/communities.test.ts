import { describe, expect, test } from 'bun:test';

import {
  createCommunity,
  decodeCommunity,
  decodeCommunityConversation,
  loadCommunities,
  loadCommunity,
  loadCommunityConversations,
  validateCommunityDraft,
} from './communities';
import { createHttpTransport } from './http';

/**
 * LE PORT DES COMMUNAUTÉS (#6364) — `GET /api/v1/communities`,
 * `GET /api/v1/communities/:id`, `GET /api/v1/communities/:id/conversations`
 * et `POST /api/v1/communities` (`services/gateway/src/routes/communities/
 * core.ts`). Témoins écrits contre le transport RÉEL nourri d'un `fetch`
 * bouchonné : la méthode, le chemin et le corps que la passerelle reçoit sont
 * mesurés, jamais supposés.
 */

const wireCommunity = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: '64f0c0ffee00000000000c01',
  identifier: 'mshy_polyglottes',
  name: 'Les polyglottes',
  description: 'Apprendre ensemble',
  avatar: null,
  banner: null,
  isPrivate: false,
  isActive: true,
  createdBy: '64f0c0ffee0000000000abcd',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-03T00:00:00.000Z',
  creator: { id: '64f0c0ffee0000000000abcd', username: 'ada', displayName: 'Ada', avatar: null, isOnline: true },
  memberCount: 12,
  conversationCount: 3,
  ...overrides,
});

const wireConversation = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: '64f0c0ffee00000000000d01',
  identifier: 'general',
  title: 'Général',
  type: 'community',
  description: null,
  avatar: null,
  memberCount: 8,
  lastMessageAt: '2026-09-12T10:00:00.000Z',
  communityId: '64f0c0ffee00000000000c01',
  participants: [{ id: 'p1', userId: 'u1', displayName: 'Ada', role: 'member', isActive: true, user: { id: 'u1', username: 'ada', isOnline: true } }],
  _count: { messages: 40, participants: 8 },
  ...overrides,
});

type RecordedCall = { readonly url: string; readonly method: string; readonly body: unknown };

const gatewayReplying = (replies: ReadonlyArray<{ readonly status: number; readonly body: unknown }>) => {
  const calls: RecordedCall[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawBody = init?.body;
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)] ?? { status: 500, body: {} };
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  };
  const transport = createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 });
  return { calls, deps: { source: 'gateway' as const, transport } };
};

describe('une communauté décodée est une PROJECTION', () => {
  test('les compteurs aplatis sont lus, le créateur et sa présence ne passent pas', () => {
    expect(decodeCommunity(wireCommunity())).toEqual({
      id: '64f0c0ffee00000000000c01',
      identifier: 'mshy_polyglottes',
      name: 'Les polyglottes',
      description: 'Apprendre ensemble',
      avatar: null,
      banner: null,
      isPrivate: false,
      createdBy: '64f0c0ffee0000000000abcd',
      memberCount: 12,
      conversationCount: 3,
    });
  });

  test('la forme héritée `_count` sert de repli aux compteurs aplatis', () => {
    const community = decodeCommunity(wireCommunity({ memberCount: undefined, conversationCount: undefined, _count: { members: 5, Conversation: 2 } }));
    expect(community?.memberCount).toBe(5);
    expect(community?.conversationCount).toBe(2);
  });

  test('une description vide devient absente ; une communauté sans nom est illisible', () => {
    expect(decodeCommunity(wireCommunity({ description: '  ' }))?.description).toBeNull();
    expect(decodeCommunity(wireCommunity({ name: '' }))).toBeNull();
  });

  test('une conversation de communauté ne transporte ni participants ni présence', () => {
    const conversation = decodeCommunityConversation(wireConversation());
    expect(conversation).toEqual({
      id: '64f0c0ffee00000000000d01',
      identifier: 'general',
      title: 'Général',
      type: 'community',
      avatar: null,
      memberCount: 8,
      lastMessageAt: '2026-09-12T10:00:00.000Z',
    });
    expect(JSON.stringify(conversation)).not.toContain('isOnline');
  });

  test('le compte de membres d’une conversation retombe sur `_count.participants`', () => {
    expect(decodeCommunityConversation(wireConversation({ memberCount: null }))?.memberCount).toBe(8);
  });
});

describe('la liste de SES communautés — `GET /api/v1/communities`', () => {
  test('page 1 sans recherche : offset 0, limite 20, et la page suivante commence après les lignes reçues', async () => {
    const { calls, deps } = gatewayReplying([
      { status: 200, body: { success: true, data: [wireCommunity(), wireCommunity({ id: 'c2', name: 'Deux' })], pagination: { total: 30, limit: 20, offset: 0, hasMore: true } } },
    ]);
    const result = await loadCommunities({ ...deps, search: '', offset: 0 });
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toBe('https://gate.test/api/v1/communities?offset=0&limit=20');
    expect(result.ok && result.data.communities.map((c) => c.name)).toEqual(['Les polyglottes', 'Deux']);
    expect(result.ok && result.data.nextOffset).toBe(2);
  });

  test('une recherche d’au moins deux caractères part, rognée ; en deçà elle ne part pas', async () => {
    const { calls, deps } = gatewayReplying([{ status: 200, body: { success: true, data: [], pagination: { hasMore: false } } }]);
    await loadCommunities({ ...deps, search: '  po ', offset: 0 });
    await loadCommunities({ ...deps, search: 'p', offset: 0 });
    expect(calls[0]?.url).toBe('https://gate.test/api/v1/communities?offset=0&limit=20&search=po');
    expect(calls[1]?.url).toBe('https://gate.test/api/v1/communities?offset=0&limit=20');
  });

  test('une dernière page ne promet pas de suite ; une ligne illisible est écartée, pas la page', async () => {
    const { deps } = gatewayReplying([
      { status: 200, body: { success: true, data: [wireCommunity(), { id: 'x' }], pagination: { hasMore: false } } },
    ]);
    const result = await loadCommunities({ ...deps, search: '', offset: 20 });
    expect(result.ok && result.data.communities).toHaveLength(1);
    expect(result.ok && result.data.nextOffset).toBeNull();
  });
});

describe('le détail et ses conversations', () => {
  test('`GET /api/v1/communities/:id` rend la projection ; un refus garde son statut', async () => {
    const { calls, deps } = gatewayReplying([
      { status: 200, body: { success: true, data: wireCommunity() } },
      { status: 403, body: { success: false, error: 'Access denied to this community' } },
    ]);
    const ok = await loadCommunity({ ...deps, communityId: 'mshy_polyglottes' });
    const refused = await loadCommunity({ ...deps, communityId: 'secret' });
    expect(calls[0]?.url).toBe('https://gate.test/api/v1/communities/mshy_polyglottes');
    expect(ok.ok && ok.data.name).toBe('Les polyglottes');
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.status).toBe(403);
  });

  test('les conversations se lisent par page, à l’offset demandé', async () => {
    const { calls, deps } = gatewayReplying([
      { status: 200, body: { success: true, data: [wireConversation()], pagination: { hasMore: true } } },
    ]);
    const result = await loadCommunityConversations({ ...deps, communityId: 'c 1', offset: 20 });
    expect(calls[0]?.url).toBe('https://gate.test/api/v1/communities/c%201/conversations?offset=20&limit=20');
    expect(result.ok && result.data.conversations.map((c) => c.title)).toEqual(['Général']);
    expect(result.ok && result.data.nextOffset).toBe(21);
  });
});

describe('créer une communauté — `POST /api/v1/communities`', () => {
  test('le brouillon est validé avec les bornes de `createCommunityRequestSchema`', () => {
    expect(validateCommunityDraft({ name: '  ', identifier: '', description: '', isPrivate: true })).toEqual({ ok: false, field: 'name' });
    expect(validateCommunityDraft({ name: 'x'.repeat(101), identifier: '', description: '', isPrivate: true })).toEqual({ ok: false, field: 'name' });
    expect(validateCommunityDraft({ name: 'Club', identifier: 'mon club', description: '', isPrivate: true })).toEqual({ ok: false, field: 'identifier' });
    expect(validateCommunityDraft({ name: 'Club', identifier: '', description: 'd'.repeat(501), isPrivate: true })).toEqual({ ok: false, field: 'description' });
    expect(validateCommunityDraft({ name: ' Club ', identifier: '', description: ' ', isPrivate: false })).toEqual({
      ok: true,
      body: { name: 'Club', isPrivate: false },
    });
  });

  test('un brouillon valide part, rogné, sans champ vide ; la réponse 201 est la communauté créée', async () => {
    const { calls, deps } = gatewayReplying([{ status: 201, body: { success: true, data: wireCommunity({ name: 'Club' }) } }]);
    const result = await createCommunity(deps, { name: ' Club ', identifier: 'club-1', description: ' Bienvenue ', isPrivate: true });
    expect(calls[0]).toEqual({
      url: 'https://gate.test/api/v1/communities',
      method: 'POST',
      body: { name: 'Club', identifier: 'club-1', description: 'Bienvenue', isPrivate: true },
    });
    expect(result.ok && result.data.name).toBe('Club');
  });

  test('un brouillon invalide ne part pas et nomme son champ', async () => {
    const { calls, deps } = gatewayReplying([{ status: 201, body: {} }]);
    const result = await createCommunity(deps, { name: '', identifier: '', description: '', isPrivate: true });
    expect(calls).toHaveLength(0);
    expect(!result.ok && result.field).toBe('name');
  });
});

import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { scriptedGateway } from '@/test-support/scripted-transport';

import {
  CONVERSATION_CATEGORIES_QUERY_KEY,
  decodeConversationCategories,
  loadConversationCategories,
  setCategoryExpanded,
  type ConversationCategory,
} from './conversation-categories';
import { FIXTURE_CONVERSATION_CATEGORIES } from './fixtures-categories';

const row = (overrides: Record<string, unknown>) => ({
  id: 'cat-1',
  userId: 'u-viewer',
  name: 'Travail',
  color: '#3B82F6',
  icon: null,
  order: 0,
  isExpanded: true,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...overrides,
});

describe('decodeConversationCategories — la forme servie par GET /me/categories', () => {
  test('garde id, nom, ordre et état déplié, triés dans l’ordre DÉCLARÉ par l’utilisateur', () => {
    const decoded = decodeConversationCategories([
      row({ id: 'b', name: 'Proches', order: 1, isExpanded: false }),
      row({ id: 'a', name: 'Travail', order: 0 }),
    ]);
    expect(decoded).toEqual([
      { id: 'a', name: 'Travail', order: 0, isExpanded: true },
      { id: 'b', name: 'Proches', order: 1, isExpanded: false },
    ]);
  });

  test('à ordre égal, l’identifiant départage — jamais l’ordre d’arrivée', () => {
    const decoded = decodeConversationCategories([row({ id: 'z', order: 2 }), row({ id: 'm', order: 2 })]);
    expect(decoded.map((c) => c.id)).toEqual(['m', 'z']);
  });

  test('FAIL-CLOSED par entrée : une ligne illisible est écartée, les autres restent', () => {
    const decoded = decodeConversationCategories([
      row({ id: 'ok' }),
      row({ id: '' }),
      row({ id: 'sans-nom', name: '   ' }),
      row({ id: 'ordre', order: 'premier' }),
      null,
      'cat',
    ]);
    expect(decoded.map((c) => c.id)).toEqual(['ok']);
  });

  test('`isExpanded` absent ⇒ dépliée (le défaut serveur, `@default(true)`)', () => {
    const { isExpanded: _omitted, ...withoutExpanded } = row({ id: 'x' });
    expect(decodeConversationCategories([withoutExpanded])[0]?.isExpanded).toBe(true);
  });

  test('le nom est rendu TEL QUE l’utilisateur l’a écrit, espaces de bord retirés', () => {
    expect(decodeConversationCategories([row({ name: '  Famille  ' })])[0]?.name).toBe('Famille');
  });

  test('une charge qui n’est pas un tableau ⇒ aucune catégorie', () => {
    expect(decodeConversationCategories({ data: [] })).toEqual([]);
    expect(decodeConversationCategories(undefined)).toEqual([]);
  });
});

describe('loadConversationCategories', () => {
  test('passerelle : l’adresse CANONIQUE `/me/categories`, cent catégories au plus', async () => {
    const gateway = scriptedGateway({
      'GET /api/v1/me/categories?limit=100': { ok: true, data: [row({ id: 'a' })] },
    });
    const result = await loadConversationCategories(gateway.deps);
    expect(result).toEqual({ ok: true, data: [{ id: 'a', name: 'Travail', order: 0, isExpanded: true }] });
    expect(gateway.calls().map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/v1/me/categories?limit=100']);
  });

  test('passerelle en échec : l’échec remonte tel quel (la liste garde ce qu’elle a)', async () => {
    const gateway = scriptedGateway({ 'GET /api/v1/me/categories?limit=100': { ok: false, status: 500, error: 'boom' } });
    expect((await loadConversationCategories(gateway.deps)).ok).toBe(false);
  });

  test('fixtures : le jeu de démonstration, sans réseau', async () => {
    const gateway = scriptedGateway({});
    const result = await loadConversationCategories({ source: 'fixtures', transport: gateway.transport });
    expect(result).toEqual({ ok: true, data: FIXTURE_CONVERSATION_CATEGORIES });
    expect(gateway.calls()).toEqual([]);
  });
});

describe('setCategoryExpanded — optimiste, confirmé par PATCH, défait sur échec', () => {
  const seeded = (): QueryClient => {
    const client = new QueryClient();
    const categories: readonly ConversationCategory[] = [
      { id: 'a', name: 'Travail', order: 0, isExpanded: true },
      { id: 'b', name: 'Proches', order: 1, isExpanded: true },
    ];
    client.setQueryData(CONVERSATION_CATEGORIES_QUERY_KEY, categories);
    return client;
  };
  const expandedOf = (client: QueryClient, id: string) =>
    client.getQueryData<readonly ConversationCategory[]>(CONVERSATION_CATEGORIES_QUERY_KEY)?.find((c) => c.id === id)?.isExpanded;

  test('la préférence SERVEUR reçoit `{ isExpanded }` seul, sur l’adresse canonique', async () => {
    const client = seeded();
    const gateway = scriptedGateway({ 'PATCH /api/v1/me/categories/a': { ok: true, data: row({ id: 'a', isExpanded: false }) } });
    const pending = setCategoryExpanded({ client, deps: gateway.deps, id: 'a', isExpanded: false });
    expect(expandedOf(client, 'a')).toBe(false);
    expect(await pending).toBe(true);
    expect(gateway.calls().map((c) => ({ method: c.method, path: c.path, body: c.body }))).toEqual([
      { method: 'PATCH', path: '/api/v1/me/categories/a', body: { isExpanded: false } },
    ]);
    expect(expandedOf(client, 'b')).toBe(true);
  });

  test('échec : l’état d’avant revient, sans toucher les autres catégories', async () => {
    const client = seeded();
    const gateway = scriptedGateway({ 'PATCH /api/v1/me/categories/a': { ok: false, status: 503, error: 'indisponible' } });
    expect(await setCategoryExpanded({ client, deps: gateway.deps, id: 'a', isExpanded: false })).toBe(false);
    expect(expandedOf(client, 'a')).toBe(true);
    expect(expandedOf(client, 'b')).toBe(true);
  });

  test('fixtures : le geste s’applique localement, aucun appel ne part', async () => {
    const client = seeded();
    const gateway = scriptedGateway({});
    expect(await setCategoryExpanded({ client, deps: { source: 'fixtures', transport: gateway.transport }, id: 'b', isExpanded: false })).toBe(true);
    expect(expandedOf(client, 'b')).toBe(false);
    expect(gateway.calls()).toEqual([]);
  });
});

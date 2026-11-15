import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { message } from '@/lib/api/fixtures-base';
import type { MessageSearchPage } from '@/lib/api/messages-search';
import type { Message } from '@/lib/api/types';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useThreadSearch, type ThreadSearch } from './use-thread-search';

/**
 * L'ÉTAT DE LA RECHERCHE DANS LA CONVERSATION — ce que la loupe ouvre.
 * Prouvé ici, avec une recherche injectée (aucun réseau) : l'anti-rebond
 * (une frappe d'un trait = UNE requête), le seuil, la réponse PÉRIMÉE jamais
 * peinte, la page suivante, l'échec réessayable, et la fermeture qui remet à
 * zéro.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const DEBOUNCE = 20;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const row = (id: string, content: string): Message =>
  message({ id, senderId: 'u-1', content, originalLanguage: 'fr', translations: [], createdAt: new Date('2026-10-14T10:00:00.000Z') });

type Call = { readonly query: string; readonly cursor: string | null; readonly signal: AbortSignal };
type Responder = (call: Call) => Promise<MessageSearchPage | null>;

function mount(respond: Responder): { readonly state: () => ThreadSearch; readonly calls: Call[] } {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const calls: Call[] = [];
  const search = (call: Call) => {
    calls.push(call);
    return respond(call);
  };
  let captured!: ThreadSearch;
  function Harness() {
    captured = useThreadSearch({ conversationId: 'c1', deps: { source: 'fixtures', transport: undefined as never }, search, debounceMs: DEBOUNCE });
    return null;
  }
  act(() => root.render(<Harness />));
  return { state: () => captured, calls };
}

const settle = async (ms = DEBOUNCE * 3) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const page = (rows: readonly Message[], next: string | null = null): MessageSearchPage => ({ results: rows, hasMore: next !== null, nextCursor: next });

describe('useThreadSearch', () => {
  test('fermée au départ ; la loupe l’ouvre sur un champ vide, rien ne part', async () => {
    const { state, calls } = mount(async () => page([]));
    expect(state().open).toBe(false);
    act(() => state().openSearch());
    expect(state().open).toBe(true);
    expect(state().phase).toBe('idle');
    await settle();
    expect(calls).toHaveLength(0);
  });

  test('sous deux caractères, aucune requête', async () => {
    const { state, calls } = mount(async () => page([]));
    act(() => state().openSearch());
    act(() => state().setQuery(' b '));
    await settle();
    expect(calls).toHaveLength(0);
    expect(state().ready).toBe(false);
  });

  test('une frappe d’un trait ne coûte qu’UNE requête, rognée, et ses résultats sont peints', async () => {
    const { state, calls } = mount(async () => page([row('m1', 'bonjour à tous')]));
    act(() => state().openSearch());
    for (const typed of ['bo', 'bon', 'bonj', 'bonjour ']) act(() => state().setQuery(typed));
    expect(state().phase).toBe('loading');
    await settle();
    expect(calls.map((c) => c.query)).toEqual(['bonjour']);
    expect(calls[0]?.cursor).toBeNull();
    expect(state().phase).toBe('done');
    expect(state().count).toBe(1);
    expect(state().hits.map((h) => h.snippet.match)).toEqual(['bonjour']);
  });

  test('la réponse d’une requête dépassée n’est jamais peinte', async () => {
    const pending: Array<(value: MessageSearchPage) => void> = [];
    const { state, calls } = mount(
      (call) =>
        new Promise((resolve) => {
          if (call.query === 'bon') pending.push(resolve);
          else resolve(page([row('m2', 'bonsoir')]));
        }),
    );
    act(() => state().openSearch());
    act(() => state().setQuery('bon'));
    await settle();
    act(() => state().setQuery('bonsoir'));
    await settle();
    expect(calls[0]?.signal.aborted).toBe(true);
    await act(async () => pending[0]?.(page([row('m1', 'bon vieux')])));
    expect(state().hits.map((h) => h.messageId)).toEqual(['m2']);
  });

  test('la page suivante s’ajoute avec le curseur servi, sans doublon', async () => {
    const { state, calls } = mount(async (call) =>
      call.cursor === null ? page([row('m3', 'mot'), row('m2', 'mot')], 'm2') : page([row('m2', 'mot'), row('m1', 'mot')]),
    );
    act(() => state().openSearch());
    act(() => state().setQuery('mot'));
    await settle();
    expect(state().hasMore).toBe(true);
    act(() => state().loadMore());
    await settle(5);
    expect(calls[1]).toMatchObject({ query: 'mot', cursor: 'm2' });
    expect(state().hits.map((h) => h.messageId)).toEqual(['m3', 'm2', 'm1']);
    expect(state().hasMore).toBe(false);
  });

  test('un échec se dit, et « Réessayer » relance la même requête', async () => {
    let fail = true;
    const { state, calls } = mount(async () => (fail ? null : page([row('m1', 'mot')])));
    act(() => state().openSearch());
    act(() => state().setQuery('mot'));
    await settle();
    expect(state().phase).toBe('failed');
    fail = false;
    act(() => state().retry());
    await settle();
    expect(calls).toHaveLength(2);
    expect(state().phase).toBe('done');
    expect(state().count).toBe(1);
  });

  test('fermer remet tout à zéro : rouvrir donne un champ vide', async () => {
    const { state } = mount(async () => page([row('m1', 'mot')]));
    act(() => state().openSearch());
    act(() => state().setQuery('mot'));
    await settle();
    act(() => state().close());
    expect(state().open).toBe(false);
    act(() => state().openSearch());
    expect(state().query).toBe('');
    expect(state().hits).toEqual([]);
  });
});

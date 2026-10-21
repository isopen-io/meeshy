import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useMessageEdit, type MessageEditState } from './use-message-edit';

/**
 * #10581 — LE MODE ÉDITION DU COMPOSEUR. Le témoin passe par la porte que
 * l'écran câble : « Modifier » arme le mode sur le texte D'ORIGINE, envoyer un
 * texte vide ne fait rien, un texte inchangé referme sans rien envoyer, un
 * texte neuf part et son issue se dit.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr')]);
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const MINE: Message = message({
  id: 'm-1',
  conversationId: 'c-a',
  senderId: 'u-moi',
  content: 'bonjour à tous',
  originalLanguage: 'fr',
  translations: [],
  createdAt: minutesAgo(5),
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(answer: ApiResult<unknown> = { ok: true, data: null }) {
  const requests: HttpRequest[] = [];
  const announced: string[] = [];
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesQueryKey('c-a'), { pages: [{ messages: [MINE], hasOlder: false, nextCursor: null }], pageParams: [undefined] });
  const transport = {
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      requests.push(request);
      return answer as ApiResult<T>;
    },
  };
  let latest!: MessageEditState;
  function Harness() {
    latest = useMessageEdit({ conversationId: 'c-a', messages: [MINE], announce: (text) => announced.push(text), queryClient, transport });
    return null;
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
  return { state: () => latest, requests, announced };
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('useMessageEdit — armer, annuler, envoyer', () => {
  test('« Modifier » arme le mode sur le texte d’origine du message', () => {
    const { state } = mount();
    expect(state().editing).toBeNull();
    act(() => state().begin('m-1'));
    expect(state().editing).toEqual({ messageId: 'm-1', original: 'bonjour à tous' });
  });

  test('un message absent du fil n’arme rien', () => {
    const { state } = mount();
    act(() => state().begin('m-9'));
    expect(state().editing).toBeNull();
  });

  test('annuler referme le mode', () => {
    const { state } = mount();
    act(() => state().begin('m-1'));
    act(() => state().cancel());
    expect(state().editing).toBeNull();
  });

  test('un texte vide ne part pas, et le mode reste armé', async () => {
    const { state, requests } = mount();
    act(() => state().begin('m-1'));
    act(() => state().submit('   '));
    await settle();
    expect(requests).toEqual([]);
    expect(state().editing).not.toBeNull();
  });

  test('un texte inchangé ne part pas, et le mode se referme', async () => {
    const { state, requests } = mount();
    act(() => state().begin('m-1'));
    act(() => state().submit(' bonjour à tous '));
    await settle();
    expect(requests).toEqual([]);
    expect(state().editing).toBeNull();
  });

  test('un texte neuf part, le mode se referme et l’issue se dit', async () => {
    const { state, requests, announced } = mount();
    act(() => state().begin('m-1'));
    act(() => state().submit('bonsoir à tous'));
    expect(state().editing).toBeNull();
    await settle();
    expect(requests).toEqual([{ method: 'PUT', path: '/api/v1/messages/m-1', body: { content: 'bonsoir à tous' } }]);
    expect(announced).toEqual(['Message modifié']);
  });

  test('un refus se dit', async () => {
    const { state, announced } = mount({ ok: false, status: 403, error: 'Forbidden' });
    act(() => state().begin('m-1'));
    act(() => state().submit('bonsoir à tous'));
    await settle();
    expect(announced).toEqual(['Le message n’a pas pu être modifié']);
  });

  test('hors ligne se dit avec le mot de la coupure', async () => {
    const { state, announced } = mount({ ok: false, status: 0, error: 'offline' });
    act(() => state().begin('m-1'));
    act(() => state().submit('bonsoir à tous'));
    await settle();
    expect(announced).toHaveLength(1);
    expect(announced[0]).not.toBe('Le message n’a pas pu être modifié');
  });
});

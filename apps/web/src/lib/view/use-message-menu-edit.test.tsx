import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { menuConversation, menuViewer } from '@/test-support/menu-viewer';

import { useMessageMenu } from './use-message-menu';

/**
 * #10581 — « MODIFIER » DANS LE MENU ET DANS « PLUS… ». Le témoin passe par
 * le GESTE (clic droit sur la rangée) et lit ce que l'écran câble : l'entrée
 * n'existe que pour le message que le serveur laisserait modifier, et la
 * toucher arme le mode édition du composeur.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr')]);
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const row = (overrides: Partial<Message> & { readonly id: string }): Message =>
  message({
    conversationId: 'c-a',
    senderId: 'u-viewer',
    content: 'bonjour',
    originalLanguage: 'fr',
    translations: [],
    createdAt: minutesAgo(5),
    ...overrides,
  });

const MINE = row({ id: 'm-mine' });
const THEIRS = row({ id: 'm-theirs', senderId: 'u-autre' });
const OLD = row({ id: 'm-old', createdAt: minutesAgo(25 * 60) });

type MenuApi = ReturnType<typeof useMessageMenu>;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

function mount(options: { readonly hasAccount?: boolean; readonly withEdit?: boolean } = {}) {
  const edits: string[] = [];
  const messages = [MINE, THEIRS, OLD];
  const queryClient = new QueryClient();
  let latest!: MenuApi;
  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages,
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      viewer: menuViewer({ hasAccount: options.hasAccount ?? true }),
      conversation: menuConversation(),
      reply: {
        setReplyTarget: () => {},
        setReplyToMedia: () => {},
        ...(options.withEdit === false ? {} : { beginEdit: (id: string) => edits.push(id) }),
      },
      announce: () => {},
      queryClient,
      transport: { request: async () => ({ ok: true, data: null as never }) },
    });
    return (
      <>
        {messages.map((m) => (
          <div key={m.id} data-row={m.id} tabIndex={0} {...latest.longPress} />
        ))}
      </>
    );
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
  const open = (id: string) =>
    act(() => {
      container.querySelector(`[data-row="${id}"]`)?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
  return { api: () => latest, edits, open };
}

const ids = (api: MenuApi): readonly string[] => api.menuData?.items.map((item) => item.id) ?? [];

describe('useMessageMenu — « Modifier » suit la règle du serveur', () => {
  test('mon message récent ⇒ « Modifier » s’offre, juste après « Répondre » (#11210)', () => {
    const { api, open } = mount();
    open('m-mine');
    expect(ids(api()).slice(0, 2)).toEqual(['reply', 'edit']);
  });

  test('le message d’un autre, ou le mien au-delà de 24 heures ⇒ pas de « Modifier »', () => {
    const { api, open } = mount();
    open('m-theirs');
    expect(ids(api())).not.toContain('edit');
    act(() => api().onCloseMenu());
    open('m-old');
    expect(ids(api())).not.toContain('edit');
  });

  test('un invité ⇒ pas de « Modifier »', () => {
    const { api, open } = mount({ hasAccount: false });
    open('m-mine');
    expect(ids(api())).not.toContain('edit');
  });

  test('un hôte sans mode édition ⇒ pas de « Modifier » (un contrôle existe s’il a un effet)', () => {
    const { api, open } = mount({ withEdit: false });
    open('m-mine');
    expect(ids(api())).not.toContain('edit');
  });

  test('toucher « Modifier » arme le mode édition sur ce message', () => {
    const { api, open, edits } = mount();
    open('m-mine');
    act(() => api().onMenuAction('m-mine', 'edit'));
    expect(edits).toEqual(['m-mine']);
  });

  test('« Plus… » reçoit le même geste : offert pour le mien, nul pour celui d’un autre', () => {
    const { api, edits } = mount();
    expect(api().editOf('m-theirs')).toBeNull();
    const edit = api().editOf('m-mine');
    expect(edit).not.toBeNull();
    act(() => edit?.());
    expect(edits).toEqual(['m-mine']);
  });
});

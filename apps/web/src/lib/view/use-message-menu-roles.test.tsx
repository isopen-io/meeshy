import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ActionConversation } from '@meeshy/shared/utils/message-action-policy';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { MenuViewer } from './message-actions';
import { useMessageMenu } from './use-message-menu';

/**
 * #11210 — LE LECTEUR EST EXPLICITE. Le hook reçoit qui lit (son compte, son
 * rôle de plateforme, son rôle dans la conversation, sa permission d'écrire)
 * et le régime de la conversation ; il n'en déduit plus rien — le compte ne se
 * lit plus dans « peut mettre en favori », la modération ne lui arrive plus en
 * booléen calculé par l'écran.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr')]);
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const row = (overrides: Partial<Message> & { readonly id: string }): Message =>
  message({
    conversationId: 'c-a',
    senderId: 'u-other',
    content: `texte ${overrides.id}`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: minutesAgo(5),
    ...overrides,
  });

const THEIRS = row({ id: 'm-theirs' });
const MINE = row({ id: 'm-mine', senderId: 'u-viewer' });
const FAILED = row({ id: 'cid_failed', senderId: 'u-viewer' });
const MESSAGES = [THEIRS, MINE, FAILED];

const viewerOf = (overrides: Partial<MenuViewer> = {}): MenuViewer => ({
  id: 'u-viewer',
  participantId: null,
  hasAccount: true,
  isAnonymous: false,
  platformRole: 'USER',
  conversationRole: 'member',
  canSendMessages: true,
  isActiveMember: true,
  ...overrides,
});

type MenuApi = ReturnType<typeof useMessageMenu>;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

function mount(options: { readonly viewer?: Partial<MenuViewer>; readonly conversation?: Partial<ActionConversation> } = {}) {
  const retried: string[] = [];
  const queryClient = new QueryClient();
  let latest!: MenuApi;
  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages: MESSAGES,
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      viewer: viewerOf(options.viewer),
      conversation: { type: 'group', encryptionMode: null, isActive: true, ...options.conversation },
      reply: { setReplyTarget: () => {}, setReplyToMedia: () => {}, beginEdit: () => {} },
      send: { retry: (id) => retried.push(id), failed: (id) => id === 'cid_failed' },
      announce: () => {},
      queryClient,
      transport: { request: async () => ({ ok: true, data: null as never }) },
    });
    return (
      <>
        {MESSAGES.map((m) => (
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
  return { api: () => latest, open, retried };
}

const ids = (api: MenuApi): readonly string[] => api.menuData?.items.map((item) => item.id) ?? [];

describe('useMessageMenu — le lecteur est explicite', () => {
  test('le compte vient du lecteur : un inscrit épingle et modifie, sans que l’écran dise « favori »', () => {
    const { api } = mount();
    expect(api().pinOf('m-theirs')?.action).toBe('pin');
    expect(api().editOf('m-mine')).not.toBeNull();
  });

  test('un lecteur sans compte n’épingle, ne modifie ni ne supprime rien', () => {
    const { api } = mount({ viewer: { hasAccount: false, isAnonymous: true, platformRole: null } });
    expect(api().pinOf('m-theirs')).toBeNull();
    expect(api().editOf('m-mine')).toBeNull();
    expect(api().deleteOf('m-mine')).toBeNull();
  });

  test('un USER ne retire pas le message d’un autre ; un MODERATOR de plateforme, si', () => {
    const user = mount();
    user.open('m-theirs');
    expect(ids(user.api())).not.toContain('remove');
    act(() => root.unmount());
    const moderator = mount({ viewer: { platformRole: 'MODERATOR' } });
    moderator.open('m-theirs');
    expect(ids(moderator.api())).toContain('remove');
  });

  test('« Retirer » ouvre la demande de motif — rien d’autre ne s’offre dans ce geste', () => {
    const { api, open } = mount({ viewer: { conversationRole: 'admin' } });
    open('m-theirs');
    act(() => api().onMenuAction('m-theirs', 'remove'));
    expect(api().deleteRequest).toEqual({ messageIds: ['m-theirs'], offer: { forEveryone: false, forMe: false, remove: true } });
  });

  test('en bout en bout, mon message ne se modifie pas : il partirait en clair', () => {
    const { api } = mount({ conversation: { encryptionMode: 'e2ee' } });
    expect(api().editOf('m-mine')).toBeNull();
  });

  test('un envoi en échec offre « Réessayer » en tête, et le geste relance cet envoi', () => {
    const { api, open, retried } = mount();
    open('cid_failed');
    expect(ids(api())[0]).toBe('retry');
    act(() => api().onMenuAction('cid_failed', 'retry'));
    expect(retried).toEqual(['cid_failed']);
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { menuViewer } from '@/test-support/menu-viewer';

import { useMessageMenu } from './use-message-menu';

/**
 * #12632 — LE MENU D'UN ENVOI EN ÉCHEC OFFRE « ABANDONNER », et le geste
 * remet l'envoi à `useSend.discard`. Un refus PERMANENT ne promet plus de
 * rejeu, mais garde l'abandon ; un envoi encore en vol n'offre ni l'un ni
 * l'autre.
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

const row = (id: string): Message =>
  message({ id, conversationId: 'c-a', senderId: 'u-viewer', content: `texte ${id}`, originalLanguage: 'fr', translations: [], createdAt: minutesAgo(1) });

const FAILED = row('cid_failed');
const REFUSED = row('cid_refused');
const IN_FLIGHT = row('cid_flight');
const CONFIRMED = row('m-confirmed');
const MESSAGES = [FAILED, REFUSED, IN_FLIGHT, CONFIRMED];

type MenuApi = ReturnType<typeof useMessageMenu>;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

function mount() {
  const discarded: string[] = [];
  const retried: string[] = [];
  const queryClient = new QueryClient();
  let latest!: MenuApi;
  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages: MESSAGES,
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      viewer: menuViewer(),
      conversation: { type: 'group', encryptionMode: null, isActive: true },
      reply: { setReplyTarget: () => {}, setReplyToMedia: () => {} },
      send: {
        retry: (id) => retried.push(id),
        discard: (id) => discarded.push(id),
        failed: (id) => id === 'cid_failed' || id === 'cid_refused',
        permanent: (id) => id === 'cid_refused',
      },
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
  return { api: () => latest, open, discarded, retried };
}

const ids = (api: MenuApi): readonly string[] => api.menuData?.items.map((item) => item.id) ?? [];
const destructive = (api: MenuApi): readonly string[] =>
  api.menuData?.items.filter((item) => item.group === 'destructive').map((item) => item.id) ?? [];

describe('useMessageMenu — « Abandonner » un envoi en échec', () => {
  test('un refus passager offre « Réessayer » en tête et « Abandonner » dans le groupe destructif', () => {
    const { api, open } = mount();
    open('cid_failed');
    expect(ids(api())[0]).toBe('retry');
    expect(destructive(api())).toEqual(['discard']);
  });

  test('un refus permanent ne promet plus de rejeu, mais s’abandonne', () => {
    const { api, open } = mount();
    open('cid_refused');
    expect(ids(api())).not.toContain('retry');
    expect(destructive(api())).toEqual(['discard']);
    expect(api().retryableOf('cid_refused')).toBe(false);
  });

  test('le geste remet CET envoi à l’abandon', () => {
    const { api, open, discarded } = mount();
    open('cid_refused');
    act(() => api().onMenuAction('cid_refused', 'discard'));
    expect(discarded).toEqual(['cid_refused']);
  });

  test('un envoi encore en vol n’offre ni rejeu ni abandon, et le geste n’y fait rien', () => {
    const { api, open, discarded } = mount();
    open('cid_flight');
    expect(ids(api())).not.toContain('discard');
    act(() => api().onMenuAction('cid_flight', 'discard'));
    expect(discarded).toEqual([]);
  });

  test('un message confirmé ne l’offre pas', () => {
    const { api, open } = mount();
    open('m-confirmed');
    expect(ids(api())).not.toContain('discard');
  });

  test('discardableOf dit à la bande ce que dit le menu', () => {
    const { api } = mount();
    expect(api().discardableOf('cid_failed')).toBe(true);
    expect(api().discardableOf('cid_refused')).toBe(true);
    expect(api().discardableOf('cid_flight')).toBe(false);
    expect(api().discardableOf('m-confirmed')).toBe(false);
  });

  test('abandonner depuis le menu rend le focus à la rangée voisine, jamais au document', () => {
    const { api, open } = mount();
    container.querySelector<HTMLElement>('[data-row="cid_refused"]')?.focus();
    open('cid_refused');
    act(() => api().onMenuAction('cid_refused', 'discard'));
    act(() => api().onCloseMenu());
    expect((document.activeElement as HTMLElement | null)?.dataset.row).toBe('cid_failed');
  });

  test('abandonner depuis la bande pose le focus sur la rangée voisine avant que la sienne parte', () => {
    const { api, discarded } = mount();
    act(() => api().discard('cid_failed'));
    expect(discarded).toEqual(['cid_failed']);
    expect((document.activeElement as HTMLElement | null)?.dataset.row).toBe('cid_refused');
  });

  test('la bande n’abandonne pas un envoi en vol', () => {
    const { api, discarded } = mount();
    act(() => api().discard('cid_flight'));
    expect(discarded).toEqual([]);
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { attachmentDefaults, message, minutesAgo } from '@/lib/api/fixtures-base';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { messagesQueryKey } from '@/lib/api/messages';
import { sessionStore } from '@/lib/api/session';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageMenu } from '@/components/message-menu';
import { menuViewer } from '@/test-support/menu-viewer';

import { useMessageMenu } from './use-message-menu';

/**
 * #10599 — « ENREGISTRER » AU MENU D'UN MESSAGE À EXACTEMENT UNE PIÈCE
 * ENREGISTRABLE. Le témoin ouvre le menu par le geste (clic droit sur la
 * rangée), lit les actions offertes, et suit « Enregistrer » jusqu'au
 * téléchargement du fichier de CETTE pièce — par la porte du menu d'une pièce,
 * jamais une seconde écriture.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const realFetch = globalThis.fetch;

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

const piece = (id: string, partial: Partial<Attachment> = {}): Attachment =>
  ({
    ...attachmentDefaults,
    id,
    messageId: 'm-1',
    fileName: `${id}.jpg`,
    originalName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 1,
    fileUrl: `https://cdn.meeshy.me/${id}`,
    uploadedBy: 'u-other',
    createdAt: '2026-10-10T09:00:00.000Z',
    ...partial,
  }) as Attachment;

const messageWith = (attachments: readonly Attachment[], extra: Partial<Message> = {}): Message =>
  message({
    id: 'm-1',
    conversationId: 'c-a',
    senderId: 'u-other',
    content: '',
    originalLanguage: 'fr',
    createdAt: minutesAgo(5),
    translations: [],
    attachments: [...attachments],
    ...extra,
  });

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  container.remove();
  globalThis.fetch = realFetch;
  sessionStore.setState({ session: { status: 'anonymous' } });
});

type MenuApi = ReturnType<typeof useMessageMenu>;

function mount(lot: Message): { api: () => MenuApi; announced: string[]; chosen: string[] } {
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesQueryKey('c-a'), { pages: [{ messages: [lot], hasOlder: false, nextCursor: null }], pageParams: [undefined] });
  const transport = { request: async <T,>(_request: HttpRequest): Promise<ApiResult<T>> => ({ ok: true, data: null as T }) };
  const announced: string[] = [];
  const chosen: string[] = [];
  let latest: MenuApi | undefined;

  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages: [lot],
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      viewer: menuViewer({ hasAccount: false }),
      reply: { setReplyTarget: () => {}, setReplyToMedia: () => {} },
      announce: (text) => announced.push(text),
      queryClient,
      transport,
    });
    const target = latest.menuTarget;
    const data = latest.menuData;
    return (
      <div data-row={lot.id} tabIndex={0} {...latest.longPress}>
        {target === null || data === undefined ? null : (
          <MessageMenu
            target={target}
            items={data.items}
            choices={data.choices}
            subjectLabel={data.subjectLabel}
            onClose={() => {}}
            onReact={() => {}}
            onExpandReactions={() => {}}
            onAction={(id) => chosen.push(id)}
            onPickLanguage={() => {}}
          />
        )}
      </div>
    );
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  act(() => {
    container.querySelector('[data-row]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  return {
    api: () => {
      if (latest === undefined) throw new Error('hook non monté');
      return latest;
    },
    announced,
    chosen,
  };
}

const actionsOf = (api: () => MenuApi): readonly string[] => (api().menuData?.items ?? []).map((item) => item.id);

describe('« Enregistrer » au menu d’un message (#10599)', () => {
  test('une photo seule : l’entrée est offerte, en fin du groupe principal (#11210)', () => {
    const { api } = mount(messageWith([piece('a-1')]));
    expect(actionsOf(api).slice(0, 4)).toEqual(['reply', 'forward', 'save', 'select']);
  });

  test('le menu la dit « Enregistrer » et la remet à son hôte', () => {
    const { chosen } = mount(messageWith([piece('a-1')]));
    const entry = document.querySelector<HTMLElement>('[data-action="save"]');
    expect(entry?.textContent).toContain('Enregistrer');
    act(() => entry?.click());
    expect(chosen).toEqual(['save']);
  });

  test('deux pièces : pas d’entrée — le lot s’enregistre pièce par pièce', () => {
    const { api } = mount(messageWith([piece('a-1'), piece('a-2')]));
    expect(actionsOf(api)).not.toContain('save');
  });

  test('vue unique, flou ou pièce floutée : jamais', () => {
    expect(actionsOf(mount(messageWith([piece('a-1')], { isViewOnce: true })).api)).not.toContain('save');
    act(() => root.unmount());
    expect(actionsOf(mount(messageWith([piece('a-1')], { isBlurred: true })).api)).not.toContain('save');
    act(() => root.unmount());
    expect(actionsOf(mount(messageWith([piece('a-1', { isBlurred: true })])).api)).not.toContain('save');
  });

  test('« Enregistrer » télécharge le fichier de CETTE pièce et annonce l’issue', async () => {
    const fetched: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched.push(String(input));
      return new Response(new Blob(['x'], { type: 'image/jpeg' }), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }) as typeof fetch;
    sessionStore.setState({
      session: { status: 'authenticated', token: 'jwt', sessionToken: 's', expiresAt: Number.MAX_SAFE_INTEGER, user: { id: 'u-viewer', username: 'moi', displayName: 'Moi' } },
    });
    const { api, announced } = mount(messageWith([piece('a-1')]));
    await act(async () => {
      api().onMenuAction('m-1', 'save');
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(fetched).toEqual(['https://cdn.meeshy.me/a-1']);
    expect(announced.length).toBe(1);
    expect(announced.length).toBe(1);
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { attachmentDefaults, message, minutesAgo } from '@/lib/api/fixtures-base';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import type { StickerDefinition } from '@meeshy/shared/types/sticker-definition';
import { messagesQueryKey } from '@/lib/api/messages';
import { STICKERS_QUERY_KEY, resetFixtureStickersForTests } from '@/lib/api/stickers';
import { resetAddedStickersForTests } from '@/lib/stickers/received';
import { sessionStore } from '@/lib/api/session';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageMenu } from '@/components/message-menu';
import { menuViewer } from '@/test-support/menu-viewer';

import { useMessageMenu } from './use-message-menu';

/**
 * #10630 — « AJOUTER À MES STICKERS » À L'APPUI LONG D'UN STICKER. Le témoin
 * ouvre le menu par le geste, lit l'entrée offerte selon la bibliothèque du
 * lecteur, et suit l'action jusqu'à son EFFET : le sticker entre dans « Mes
 * stickers » et l'issue s'annonce. Jamais « Enregistrer » : ce n'est pas une photo.
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
  resetFixtureStickersForTests();
  resetAddedStickersForTests();
  sessionStore.setState({ session: { status: 'anonymous' } });
});

type MenuApi = ReturnType<typeof useMessageMenu>;

function mount(lot: Message, library: readonly StickerDefinition[]): { api: () => MenuApi; announced: string[]; chosen: string[]; queryClient: QueryClient } {
  const queryClient = new QueryClient();
  queryClient.setQueryData(STICKERS_QUERY_KEY, library);
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
    queryClient,
  };
}

const actionsOf = (api: () => MenuApi): readonly string[] => (api().menuData?.items ?? []).map((item) => item.id);

const png = (id: string): Attachment => piece(id, { mimeType: 'image/png', fileName: `${id}.png`, originalName: `${id}.png` });

const owned = (id: string): StickerDefinition => ({
  id,
  name: null,
  origin: 'upload',
  mimeType: 'image/png',
  fileUrl: `stickers/u-viewer/${id}.png`,
  width: 512,
  height: 512,
  sizeBytes: 4,
  animated: false,
  createdAt: '2026-10-10T09:00:00.000Z',
  lastUsedAt: '2026-10-10T09:00:00.000Z',
});

const stickerMessage = (attachments: readonly Attachment[]): Message => messageWith(attachments, { metadata: { sticker: { stickerId: 's-recu' } } });

describe('« Ajouter à mes stickers » à l’appui long d’un sticker (#10630)', () => {
  test('hors bibliothèque : offert, et jamais « Enregistrer »', () => {
    const { api } = mount(stickerMessage([png('a-1')]), [owned('autre')]);
    expect(actionsOf(api)).toContain('addSticker');
    expect(actionsOf(api)).not.toContain('save');
  });

  test('déjà dans la bibliothèque : ni ajout ni « Enregistrer »', () => {
    const { api } = mount(stickerMessage([png('a-1')]), [owned('s-recu')]);
    expect(actionsOf(api)).not.toContain('addSticker');
    expect(actionsOf(api)).not.toContain('save');
  });

  test('l’action fait ENTRER le sticker dans « Mes stickers » et l’annonce', async () => {
    globalThis.fetch = (async () => new Response(new Blob([new Uint8Array(4)], { type: 'image/png' }), { status: 200 })) as unknown as typeof fetch;
    const { api, announced, queryClient } = mount(stickerMessage([png('a-1')]), []);
    await act(async () => {
      api().onMenuAction('m-1', 'addSticker');
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(queryClient.getQueryData<readonly StickerDefinition[]>(STICKERS_QUERY_KEY)).toHaveLength(1);
    expect(announced).toEqual(['Sticker ajouté à votre bibliothèque']);
    expect(actionsOf(api)).not.toContain('addSticker');
  });

  test('une image qui ne se relit pas : rien n’entre, l’échec s’annonce', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const { api, announced, queryClient } = mount(stickerMessage([png('a-1')]), []);
    await act(async () => {
      api().onMenuAction('m-1', 'addSticker');
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(queryClient.getQueryData<readonly StickerDefinition[]>(STICKERS_QUERY_KEY)).toEqual([]);
    expect(announced).toEqual(['Le sticker n’a pas pu être ajouté']);
  });
});

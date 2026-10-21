import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { attachmentDefaults, message, minutesAgo } from '@/lib/api/fixtures-base';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { setAttachmentReactionEmitter, type AttachmentReactionRequest } from '@/lib/api/attachment-reaction-emit';
import { messagesQueryKey } from '@/lib/api/messages';
import { mineOf, reactionStore } from '@/lib/api/reaction-store';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { DOUBLE_TAP_GAP_MS } from './double-tap';
import { menuConversation, menuViewer } from '@/test-support/menu-viewer';

import { useMessageMenu } from './use-message-menu';

/**
 * #10599, DÉCISION PORTEUR DU 2026-10-14 — « Non, sur le web le double toucher
 * peut ouvrir plutôt un petit menu de réaction rapide ! » UN DOUBLE TOUCHER SUR
 * UN MESSAGE OUVRE LA BARRE DE RÉACTION RAPIDE, ancrée au message — ni le menu
 * complet de l'appui long, ni une réaction posée d'office ; sur la tuile d'un
 * message à plusieurs pièces, la barre vise CETTE pièce.
 * Le témoin passe par le GESTE (appui puis clic, deux fois) sur une rangée qui
 * porte les gestionnaires que l'écran étale (`longPress`), et lit l'effet :
 * la cible de la barre (`quickReactionFor`), aucun menu, aucune réaction
 * posée, l'ouverture (ou non) du média.
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

const piece = (id: string, messageId: string): Attachment =>
  ({
    ...attachmentDefaults,
    id,
    messageId,
    fileName: `${id}.jpg`,
    originalName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 1,
    fileUrl: `https://cdn.meeshy.me/${id}`,
    uploadedBy: 'u-other',
    createdAt: '2026-10-10T09:00:00.000Z',
  }) as Attachment;

const messageWith = (id: string, pieces: readonly string[], extra: Partial<Message> = {}): Message =>
  message({
    id,
    conversationId: 'c-a',
    senderId: 'u-other',
    content: 'regarde',
    originalLanguage: 'fr',
    createdAt: minutesAgo(5),
    translations: [],
    attachments: pieces.map((p) => piece(p, id)),
    ...extra,
  });

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  container.remove();
  reactionStore.setState({ mine: {} });
  window.getSelection()?.removeAllRanges();
});

type MenuApi = ReturnType<typeof useMessageMenu>;

function mount(lot: Message): { api: () => MenuApi; opened: string[]; controls: string[] } {
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesQueryKey('c-a'), { pages: [{ messages: [lot], hasOlder: false, nextCursor: null }], pageParams: [undefined] });
  const transport = { request: async <T,>(_request: HttpRequest): Promise<ApiResult<T>> => ({ ok: true, data: null as T }) };
  const opened: string[] = [];
  const controls: string[] = [];
  let latest: MenuApi | undefined;

  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages: [lot],
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      viewer: menuViewer({ hasAccount: false }),
      conversation: menuConversation(),
      reply: { setReplyTarget: () => {}, setReplyToMedia: () => {} },
      announce: () => {},
      queryClient,
      transport,
    });
    return (
      <div data-row={lot.id} tabIndex={0} {...latest.longPress}>
        <p data-text>{lot.content}</p>
        {(lot.attachments ?? []).map((a) => (
          <div key={a.id} data-piece={a.id}>
            <button type="button" data-media-tile data-tile={a.id} onClick={() => opened.push(a.id)} />
          </div>
        ))}
        <button type="button" data-pill onClick={() => controls.push('pill')} />
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
  return {
    api: () => {
      if (latest === undefined) throw new Error('hook non monté');
      return latest;
    },
    opened,
    controls,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tap(el: Element, options: { readonly x?: number; readonly detail?: number } = {}): Promise<void> {
  const x = options.x ?? 120;
  await act(async () => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 80, pointerType: 'touch', isPrimary: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 80, pointerType: 'touch', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: options.detail ?? 1, clientX: x, clientY: 80 }));
  });
}

async function doubleTap(el: Element): Promise<void> {
  await tap(el);
  await wait(40);
  await tap(el, { detail: 2 });
}

describe('le double toucher ouvre la barre de réaction rapide (#10599, porteur 2026-10-14)', () => {
  test('sur le texte : la barre s’ouvre, ancrée sur la rangée, sans menu ni réaction posée', async () => {
    const { api } = mount(messageWith('m-texte', []));
    await doubleTap(container.querySelector('[data-text]')!);
    const bar = api().quickReactionFor;
    expect(bar?.messageId).toBe('m-texte');
    expect(bar?.anchor).toBe(container.querySelector('[data-row="m-texte"]'));
    expect(bar?.x).toBe(120);
    expect(bar?.pieceId).toBeUndefined();
    expect(api().menuTarget).toBeNull();
    expect(mineOf('m-texte')).toEqual([]);
  });

  test('la barre se referme par sa porte', async () => {
    const { api } = mount(messageWith('m-texte', []));
    await doubleTap(container.querySelector('[data-text]')!);
    act(() => api().onCloseQuickReaction());
    expect(api().quickReactionFor).toBeNull();
  });

  test('un toucher seul n’ouvre rien', async () => {
    const { api } = mount(messageWith('m-texte', []));
    await tap(container.querySelector('[data-text]')!);
    await act(async () => wait(DOUBLE_TAP_GAP_MS + 30));
    expect(api().quickReactionFor).toBeNull();
  });

  test('sur le média d’un message à une pièce : la visionneuse ne s’ouvre pas, la barre vise le message', async () => {
    const { api, opened } = mount(messageWith('m-photo', ['a-1']));
    await doubleTap(container.querySelector('[data-tile="a-1"]')!);
    await act(async () => wait(DOUBLE_TAP_GAP_MS + 30));
    expect(opened).toEqual([]);
    expect(api().quickReactionFor?.messageId).toBe('m-photo');
    expect(api().quickReactionFor?.pieceId).toBeUndefined();
    expect(mineOf('m-photo')).toEqual([]);
  });

  test('un toucher simple sur un média ouvre la visionneuse après la fenêtre, une seule fois', async () => {
    const { api, opened } = mount(messageWith('m-photo', ['a-1']));
    await tap(container.querySelector('[data-tile="a-1"]')!);
    expect(opened).toEqual([]);
    await act(async () => wait(DOUBLE_TAP_GAP_MS + 30));
    expect(opened).toEqual(['a-1']);
    expect(api().quickReactionFor).toBeNull();
  });

  test('un clic clavier sur un média n’est jamais retenu', async () => {
    const { opened } = mount(messageWith('m-photo', ['a-1']));
    await act(async () => (container.querySelector('[data-tile="a-1"]') as HTMLButtonElement).click());
    expect(opened).toEqual(['a-1']);
  });

  test('dans un lot de photos, la barre vise la PIÈCE touchée et s’ancre sur sa tuile, sans rien réagir à sa place', async () => {
    const sent: AttachmentReactionRequest[] = [];
    setAttachmentReactionEmitter(async (request) => {
      sent.push(request);
      return 'ok';
    });
    try {
      const { api, opened } = mount(messageWith('m-lot', ['a-1', 'a-2', 'a-3']));
      await doubleTap(container.querySelector('[data-tile="a-2"]')!);
      await act(async () => wait(DOUBLE_TAP_GAP_MS + 30));
      expect(opened).toEqual([]);
      expect(api().quickReactionFor?.messageId).toBe('m-lot');
      expect(api().quickReactionFor?.pieceId).toBe('a-2');
      expect(api().quickReactionFor?.anchor).toBe(container.querySelector('[data-piece="a-2"]'));
      expect(api().menuTarget).toBeNull();
      expect(sent).toEqual([]);
      expect(mineOf('m-lot')).toEqual([]);
    } finally {
      setAttachmentReactionEmitter(null);
    }
  });

  test('barre ouverte, un nouveau double toucher ne change rien', async () => {
    const { api } = mount(messageWith('m-lot', ['a-1', 'a-2', 'a-3']));
    await doubleTap(container.querySelector('[data-tile="a-2"]')!);
    await act(async () => wait(DOUBLE_TAP_GAP_MS + 30));
    await doubleTap(container.querySelector('[data-tile="a-3"]')!);
    expect(api().quickReactionFor?.pieceId).toBe('a-2');
  });

  test('menu ouvert (appui long), le double toucher n’ouvre pas la barre', async () => {
    const { api } = mount(messageWith('m-texte', []));
    await act(async () => {
      container.querySelector('[data-row="m-texte"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 80 }));
    });
    expect(api().menuTarget?.messageId).toBe('m-texte');
    await doubleTap(container.querySelector('[data-text]')!);
    expect(api().quickReactionFor).toBeNull();
  });

  test('un contrôle de la rangée n’est jamais retardé et ne compte pas pour le geste', async () => {
    const { api, controls } = mount(messageWith('m-texte', []));
    await doubleTap(container.querySelector('[data-pill]')!);
    expect(controls).toEqual(['pill', 'pill']);
    expect(api().quickReactionFor).toBeNull();
  });

  test('la sélection de texte gagne : un double clic qui a sélectionné un mot n’ouvre pas la barre', async () => {
    const { api } = mount(messageWith('m-texte', []));
    const text = container.querySelector('[data-text]')!;
    await tap(text);
    await wait(40);
    const range = document.createRange();
    range.setStart(text.firstChild!, 0);
    range.setEnd(text.firstChild!, 7);
    window.getSelection()?.addRange(range);
    await tap(text, { detail: 2 });
    expect(api().quickReactionFor).toBeNull();
    expect(window.getSelection()?.toString()).toBe('regarde');
  });

  test('un message supprimé n’ouvre pas la barre', async () => {
    const { api } = mount(messageWith('m-texte', [], { deletedAt: new Date() }));
    await doubleTap(container.querySelector('[data-text]')!);
    expect(api().quickReactionFor).toBeNull();
  });

  test('en sélection, le double toucher ne fait rien', async () => {
    const { api } = mount(messageWith('m-texte', []));
    act(() => api().onMenuAction('m-texte', 'select'));
    await doubleTap(container.querySelector('[data-text]')!);
    expect(api().quickReactionFor).toBeNull();
    expect(api().menuTarget).toBeNull();
  });
});

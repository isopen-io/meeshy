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
import { EMOJI_USAGE_KEY } from '@/lib/emoji-usage';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { DOUBLE_TAP_GAP_MS } from './double-tap';
import { useMessageMenu } from './use-message-menu';

/**
 * #10599 — UN DOUBLE TOUCHER SUR UN MESSAGE POSE LA RÉACTION LA PLUS UTILISÉE.
 * Le témoin passe par le GESTE (appui puis clic, deux fois) sur une rangée qui
 * porte les gestionnaires que l'écran étale (`longPress`), et lit l'effet :
 * « mes réactions » du message, l'ouverture (ou non) du média, l'éclosion.
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
  localStorage.removeItem(EMOJI_USAGE_KEY);
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
      viewerId: 'u-viewer',
      canStar: false,
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

describe('le double toucher pose la réaction la plus utilisée (#10599)', () => {
  test('sur le texte : la première tuile du rail est posée, et elle éclot là où le doigt a touché', async () => {
    mount(messageWith('m-texte', []));
    const bursts: HTMLElement[] = [];
    const observer = new MutationObserver((records) =>
      records.forEach((record) =>
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && node.dataset.reactionBurst !== undefined) bursts.push(node);
        }),
      ),
    );
    observer.observe(document.body, { childList: true });
    await doubleTap(container.querySelector('[data-text]')!);
    observer.disconnect();
    expect(mineOf('m-texte')).toEqual(['😂']);
    expect(bursts.length).toBe(1);
    const burst = bursts[0];
    expect(burst?.textContent).toBe('😂');
    expect(burst?.getAttribute('aria-hidden')).toBe('true');
    expect(burst?.style.left).toBe('120px');
  });

  test('« la plus utilisée » suit le classement du rail : l’emoji le plus employé passe en tête', async () => {
    localStorage.setItem(EMOJI_USAGE_KEY, JSON.stringify([['🔥', 4], ['❤️', 2]]));
    mount(messageWith('m-texte', []));
    await doubleTap(container.querySelector('[data-text]')!);
    expect(mineOf('m-texte')).toEqual(['🔥']);
  });

  test('le geste AJOUTE et ne retire jamais : un second double toucher garde la réaction', async () => {
    mount(messageWith('m-texte', []));
    await doubleTap(container.querySelector('[data-text]')!);
    await wait(DOUBLE_TAP_GAP_MS + 30);
    await doubleTap(container.querySelector('[data-text]')!);
    expect(mineOf('m-texte')).toEqual(['😂']);
  });

  test('un toucher seul ne réagit pas', async () => {
    mount(messageWith('m-texte', []));
    await tap(container.querySelector('[data-text]')!);
    await act(async () => wait(DOUBLE_TAP_GAP_MS + 30));
    expect(mineOf('m-texte')).toEqual([]);
  });

  test('sur un média : la visionneuse ne s’ouvre pas, le message reçoit la réaction', async () => {
    const { opened } = mount(messageWith('m-photo', ['a-1']));
    await doubleTap(container.querySelector('[data-tile="a-1"]')!);
    await act(async () => wait(DOUBLE_TAP_GAP_MS + 30));
    expect(opened).toEqual([]);
    expect(mineOf('m-photo')).toEqual(['😂']);
  });

  test('un toucher simple sur un média ouvre la visionneuse après la fenêtre, une seule fois', async () => {
    const { opened } = mount(messageWith('m-photo', ['a-1']));
    await tap(container.querySelector('[data-tile="a-1"]')!);
    expect(opened).toEqual([]);
    await act(async () => wait(DOUBLE_TAP_GAP_MS + 30));
    expect(opened).toEqual(['a-1']);
    expect(mineOf('m-photo')).toEqual([]);
  });

  test('un clic clavier sur un média n’est jamais retenu', async () => {
    const { opened } = mount(messageWith('m-photo', ['a-1']));
    await act(async () => (container.querySelector('[data-tile="a-1"]') as HTMLButtonElement).click());
    expect(opened).toEqual(['a-1']);
  });

  test('dans un lot de photos, le double toucher vise la PIÈCE touchée, comme iOS', async () => {
    const sent: AttachmentReactionRequest[] = [];
    setAttachmentReactionEmitter(async (request) => {
      sent.push(request);
      return 'ok';
    });
    try {
      const { opened } = mount(messageWith('m-lot', ['a-1', 'a-2', 'a-3']));
      await doubleTap(container.querySelector('[data-tile="a-2"]')!);
      await act(async () => wait(DOUBLE_TAP_GAP_MS + 30));
      expect(opened).toEqual([]);
      expect(sent).toEqual([{ action: 'add', attachmentId: 'a-2', messageId: 'm-lot', emoji: '😂' }]);
      expect(mineOf('m-lot')).toEqual([]);
    } finally {
      setAttachmentReactionEmitter(null);
    }
  });

  test('un contrôle de la rangée n’est jamais retardé et ne compte pas pour le geste', async () => {
    const { controls } = mount(messageWith('m-texte', []));
    await doubleTap(container.querySelector('[data-pill]')!);
    expect(controls).toEqual(['pill', 'pill']);
    expect(mineOf('m-texte')).toEqual([]);
  });

  test('la sélection de texte gagne : un double clic qui a sélectionné un mot ne réagit pas', async () => {
    mount(messageWith('m-texte', []));
    const text = container.querySelector('[data-text]')!;
    await tap(text);
    await wait(40);
    const range = document.createRange();
    range.setStart(text.firstChild!, 0);
    range.setEnd(text.firstChild!, 7);
    window.getSelection()?.addRange(range);
    await tap(text, { detail: 2 });
    expect(mineOf('m-texte')).toEqual([]);
    expect(window.getSelection()?.toString()).toBe('regarde');
  });

  test('un message supprimé ne se réagit pas', async () => {
    mount(messageWith('m-texte', [], { deletedAt: new Date() }));
    await doubleTap(container.querySelector('[data-text]')!);
    expect(mineOf('m-texte')).toEqual([]);
  });

  test('en sélection, le double toucher ne fait rien', async () => {
    const { api } = mount(messageWith('m-texte', []));
    act(() => api().onMenuAction('m-texte', 'select'));
    await doubleTap(container.querySelector('[data-text]')!);
    expect(mineOf('m-texte')).toEqual([]);
  });
});

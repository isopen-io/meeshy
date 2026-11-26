import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import ThreadMediaViewer from '@/components/thread-media-viewer';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { createHttpTransport, type ApiResult, type HttpTransport } from '@/lib/api/http';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createDraftStore } from '@/lib/send/draft-store';
import { ThreadMediaContext } from '@/lib/view/thread-media-context';
import { useThreadCompose, type ThreadComposeState } from '@/lib/view/use-thread-compose';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { menuScope } from '@/test-support/menu-viewer';

import { createOutboxStore } from './outbox-store';
import { performSend } from './perform-send';

/**
 * **#7557 — RÉPONDRE À LA PIÈCE QU'ON REGARDE, DE LA VISIONNEUSE AU CORPS.**
 * Une bulle de quatre pièces, la visionneuse ouverte sur la TROISIÈME,
 * « Répondre », puis l'envoi : le corps du POST nomme cette pièce-là, pour
 * chaque genre de média que la visionneuse montre. Le document n'a pas de
 * visionneuse sur le web ; sa citation part du composeur et suit le même
 * chemin jusqu'au corps.
 *
 * Le chemin est REST, et seulement REST : le socket ne transporte pas
 * `attachmentReplyTo` — un repli socket perdrait la cible en silence.
 */
const CONVERSATION = 'c-7557';
const hex = (n: number): string => n.toString(16).padStart(24, '0');
const MESSAGE_ID = hex(7557);
const PIECES = [hex(1), hex(2), hex(3), hex(4)] as const;
const LOOKED_AT = PIECES[2];

type Genre = { readonly name: string; readonly mimeType: string; readonly extension: string; readonly viewer: 'visual' | 'audio' | null };

const GENRES: readonly Genre[] = [
  { name: 'image', mimeType: 'image/jpeg', extension: 'jpg', viewer: 'visual' },
  { name: 'vidéo', mimeType: 'video/mp4', extension: 'mp4', viewer: 'visual' },
  { name: 'audio', mimeType: 'audio/mpeg', extension: 'mp3', viewer: 'audio' },
  { name: 'document', mimeType: 'application/pdf', extension: 'pdf', viewer: null },
];

const pieceOf = (genre: Genre, id: string): Attachment =>
  ({
    id,
    messageId: MESSAGE_ID,
    fileName: `${id}.${genre.extension}`,
    originalName: `${id}.${genre.extension}`,
    mimeType: genre.mimeType,
    fileSize: 4096,
    fileUrl: `/uploads/${id}.${genre.extension}`,
    ...(genre.viewer === 'visual' ? { width: 640, height: 480 } : {}),
    ...(genre.viewer === 'audio' || genre.name === 'vidéo' ? { duration: 12 } : {}),
    uploadedBy: 'u-nour',
    isAnonymous: false,
    isViewOnce: false,
    isBlurred: false,
    createdAt: '2026-09-20T10:00:00.000Z',
  }) as unknown as Attachment;

const quotedOf = (genre: Genre): Message =>
  ({
    id: MESSAGE_ID,
    conversationId: CONVERSATION,
    senderId: 'u-nour',
    sender: { id: 'p-nour', displayName: 'Nour Haddad' },
    content: '',
    originalLanguage: 'fr',
    messageType: genre.viewer === 'audio' ? 'audio' : genre.viewer === 'visual' ? 'image' : 'file',
    createdAt: new Date('2026-09-20T10:02:00.000Z'),
    updatedAt: new Date('2026-09-20T10:02:00.000Z'),
    translations: [],
    attachments: PIECES.map((id) => pieceOf(genre, id)),
  }) as unknown as Message;

const emptyHub = (): ConversationsDeps => {
  const transport = (async () => ({ ok: false, status: 0, error: '' })) as unknown as HttpTransport;
  transport.request = (async () => ({ ok: true, data: [], cursorPagination: { hasMore: false, nextCursor: null, limit: 30 } }) as ApiResult<unknown>) as HttpTransport['request'];
  return { source: 'gateway', transport };
};

type Sent = { readonly method: string; readonly path: string; readonly body: Record<string, unknown> };

function capturingGateway(): { readonly impl: typeof fetch; readonly sent: Sent[] } {
  const sent: Sent[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof init?.body === 'string') sent.push({ method: init.method ?? 'GET', path: String(input), body: JSON.parse(init.body) as Record<string, unknown> });
    return new Response(
      JSON.stringify({ success: true, data: { id: hex(9999), clientMessageId: 'ignored', conversationId: CONVERSATION, senderId: 'u-viewer', createdAt: '2026-09-26T10:00:00.000Z' } }),
      { status: 200 },
    );
  }) as typeof fetch;
  return { impl, sent };
}

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
const until = async (check: () => boolean) => {
  for (let tries = 0; tries < 100 && !check(); tries += 1) await settle();
};
const viewer = (): HTMLElement | null => document.body.querySelector<HTMLElement>('[data-media-viewer]');

type Thread = { readonly state: () => ThreadComposeState; readonly sentReplyTo: () => Message | null | undefined };

function mountThread(genre: Genre): Thread {
  const quoted = quotedOf(genre);
  const calls: (Message | null)[] = [];
  let captured!: ThreadComposeState;
  const store = createDraftStore({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Harness() {
    captured = useThreadCompose({
      store,
      scope: 'u_v1',
      conversation: { id: CONVERSATION, type: 'group', participants: [] },
      messages: [quoted],
      readerLanguages: ['fr'],
      send: (_text, _attachments, replyTo) => {
        calls.push(replyTo);
      },
      replyable: () => true,
    });
    if (genre.viewer === null) return null;
    return (
      <ThreadMediaContext.Provider value={{ viewerId: 'u-viewer', onReplyToMedia: captured.setReplyToMedia, actionScope: menuScope({ id: 'u-viewer' }) }}>
        <ThreadMediaViewer
          kind={genre.viewer}
          opened={quoted}
          openedVisual={quoted.attachments as readonly Attachment[]}
          startIndex={2}
          viewerId="u-viewer"
          onReplyToMedia={captured.setReplyToMedia}
          onClose={() => {}}
          languages={['fr']}
          fallbackLanguage="fr"
          deps={emptyHub()}
        />
      </ThreadMediaContext.Provider>
    );
  }

  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  return { state: () => captured, sentReplyTo: () => calls[0] };
}

async function bodyOfReply(replyTo: Message): Promise<Sent> {
  const { impl, sent } = capturingGateway();
  await performSend({
    conversationId: CONVERSATION,
    draft: { content: 'celle-ci !', originalLanguage: 'fr', replyToId: replyTo.id, replyTo },
    viewerId: 'u-viewer',
    deps: { source: 'gateway', transport: createHttpTransport({ base: '', fetchImpl: impl }), queryClient: new QueryClient(), outbox: createOutboxStore(), online: true },
  });
  expect(sent).toHaveLength(1);
  return sent[0]!;
}

describe('#7557 — la réponse cite la pièce REGARDÉE, jusqu’au corps du POST, pour chaque genre', () => {
  for (const genre of GENRES.filter((g) => g.viewer !== null)) {
    test(`${genre.name} : visionneuse ouverte sur la 3ᵉ pièce, « Répondre », envoi ⇒ attachmentReplyTo nomme la 3ᵉ`, async () => {
      const thread = mountThread(genre);
      await until(() => viewer()?.getAttribute('data-viewer-attachment') === LOOKED_AT && viewer()?.querySelector('[data-viewer-action="reply"]') != null);
      expect(viewer()!.getAttribute('data-viewer-attachment')).toBe(LOOKED_AT);

      act(() => {
        viewer()!.querySelector<HTMLButtonElement>('[data-viewer-action="reply"]')!.click();
      });
      expect(thread.state().replyTo).toBeDefined();
      act(() => thread.state().onSend({ text: 'celle-ci !', attachments: [], language: 'fr', protection: {}, place: null }));

      const replyTo = thread.sentReplyTo();
      expect(replyTo?.id).toBe(MESSAGE_ID);
      const { method, path, body } = await bodyOfReply(replyTo!);
      expect(method).toBe('POST');
      expect(path).toContain(`/conversations/${CONVERSATION}/messages`);
      expect(body).toMatchObject({ replyToId: MESSAGE_ID, attachmentReplyTo: { attachmentId: LOOKED_AT } });
    });
  }

  test('document (aucune visionneuse sur le web) : la citation de la 3ᵉ pièce part du composeur jusqu’au corps', async () => {
    const thread = mountThread(GENRES.find((g) => g.viewer === null)!);
    act(() => thread.state().setReplyToMedia(MESSAGE_ID, LOOKED_AT));
    act(() => thread.state().onSend({ text: 'celle-ci !', attachments: [], language: 'fr', protection: {}, place: null }));
    const { body } = await bodyOfReply(thread.sentReplyTo()!);
    expect(body).toMatchObject({ replyToId: MESSAGE_ID, attachmentReplyTo: { attachmentId: LOOKED_AT } });
  });
});

const SOURCE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const isTestFile = (name: string): boolean => /\.test\.tsx?$/.test(name) || name.includes('test-support');

function productionSources(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test-support' ? [] : productionSources(path);
    return /\.tsx?$/.test(name) && !isTestFile(name) ? [path] : [];
  });
}

describe('#7557 — le chemin de l’envoi est REST, aucun repli socket n’emporte une réponse', () => {
  test('aucune source de l’application n’émet message:send ni message:send-with-attachments', () => {
    const forbidden = ['MESSAGE_SEND', CLIENT_EVENTS.MESSAGE_SEND, CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS];
    const offenders = productionSources(SOURCE_ROOT).filter((path) => {
      const text = readFileSync(path, 'utf8');
      return forbidden.some((needle) => text.includes(`'${needle}'`) || text.includes(`"${needle}"`) || text.includes(`.${needle}`));
    });
    expect(offenders).toEqual([]);
  });
});

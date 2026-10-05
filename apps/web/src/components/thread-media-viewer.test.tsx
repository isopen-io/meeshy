import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { mediaHubPath } from '@/lib/api/conversation-media-hub';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { closeSendSheet, sendSheetStore } from '@/lib/send/send-sheet-store';
import { ThreadMediaContext } from '@/lib/view/thread-media-context';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Attachments } from './attachment-blocks';

/**
 * **#6303 — TOUCHER UN MÉDIA DANS LE FIL OUVRE LA VISIONNEUSE DE TOUTE LA
 * CONVERSATION**, sur la même source paginée que l'écran des médias, ouverte
 * sur la pièce touchée, et « Répondre » y cite la PIÈCE.
 */
const CONVERSATION = 'c1';
const hex = (n: number): string => n.toString(16).padStart(24, '0');
const M1 = hex(1);
const M2 = hex(2);
const M3 = hex(3);

const wirePhoto = (messageId: string, id: string) => ({
  id,
  messageId,
  fileName: `${id}.jpg`,
  originalName: `${id}.jpg`,
  mimeType: 'image/jpeg',
  fileSize: 2048,
  fileUrl: `/uploads/${id}.jpg`,
  width: 640,
  height: 480,
  isViewOnce: false,
  isBlurred: false,
  createdAt: '2026-09-20T10:00:00.000Z',
});

const wireMessage = (id: string, minute: number, pieces: readonly string[]) => ({
  id,
  conversationId: CONVERSATION,
  senderId: 'u-nour',
  sender: { id: 'p-nour', displayName: 'Nour Haddad' },
  content: '',
  originalLanguage: 'fr',
  messageType: 'image',
  createdAt: `2026-09-20T10:0${minute}:00.000Z`,
  updatedAt: `2026-09-20T10:0${minute}:00.000Z`,
  translations: [],
  attachments: pieces.map((piece) => wirePhoto(id, piece)),
});

const A1 = hex(11);
const A2 = hex(12);
const A3 = hex(13);
const A4 = hex(14);

const index = [wireMessage(M3, 3, [A4]), wireMessage(M2, 2, [A2, A3]), wireMessage(M1, 1, [A1])];

const opened = {
  ...wireMessage(M2, 2, [A2, A3]),
  createdAt: new Date('2026-09-20T10:02:00.000Z'),
} as unknown as Message;

const depsServing = (): ConversationsDeps => {
  const transport = (async () => ({ ok: false, status: 0, error: '' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    if (req.path === mediaHubPath({ conversationId: CONVERSATION, kind: 'visual', term: null, before: undefined })) {
      return { ok: true, data: index, cursorPagination: { hasMore: false, nextCursor: null, limit: 30 } } as ApiResult<unknown>;
    }
    return { ok: false, status: 404, error: 'non prévu' };
  }) as HttpTransport['request'];
  return { source: 'gateway', transport };
};

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

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
  act(() => {
    closeSendSheet();
    root.unmount();
  });
  container.remove();
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
const until = async (check: () => boolean) => {
  for (let tries = 0; tries < 100 && !check(); tries += 1) await settle();
};

const viewer = (): HTMLElement | null => document.body.querySelector<HTMLElement>('[data-media-viewer]');

function mountThreadGrid(onReplyToMedia: (messageId: string, attachmentId: string) => void, viewerId = 'u-me'): void {
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <ThreadMediaContext.Provider value={{ viewerId, onReplyToMedia }}>
          <Attachments
            attachments={opened.attachments as readonly Attachment[]}
            message={opened}
            languages={['fr']}
            fallbackLanguage="fr"
            mediaFrame="tiles"
            deps={depsServing()}
          />
        </ThreadMediaContext.Provider>
      </QueryClientProvider>,
    );
  });
}

describe('le fil ouvre la visionneuse conversation-entière (#6303)', () => {
  test('la 2ᵉ tuile ouvre TOUTE la conversation, dans l’ordre du fil, sur la pièce touchée', async () => {
    mountThreadGrid(() => {});
    act(() => {
      container.querySelectorAll<HTMLButtonElement>('[data-media-tile]')[1]!.click();
    });
    await until(() => (viewer()?.querySelectorAll('[data-filmstrip-item]').length ?? 0) === 4);

    const strip = Array.from(viewer()!.querySelectorAll('[data-filmstrip-item]')).map((item) => item.getAttribute('data-attachment'));
    expect(strip).toEqual([A1, A2, A3, A4]);
    expect(viewer()!.getAttribute('data-viewer-attachment')).toBe(A3);
  });

  test('« Répondre » referme la visionneuse et cite la PIÈCE regardée', async () => {
    const replies: (readonly [string, string])[] = [];
    mountThreadGrid((messageId, attachmentId) => replies.push([messageId, attachmentId]));
    act(() => {
      container.querySelectorAll<HTMLButtonElement>('[data-media-tile]')[1]!.click();
    });
    await until(() => viewer()?.querySelector('[data-viewer-reply]') !== null && viewer() !== null);

    act(() => {
      viewer()!.querySelector<HTMLButtonElement>('[data-viewer-reply]')!.click();
    });
    expect(replies).toEqual([[M2, A3]]);
    await until(() => viewer() === null);
    expect(viewer()).toBeNull();
  });

  test('« Partager » ouvre la feuille d’envoi avec la PIÈCE regardée (ses identifiants, jamais son fichier), « mine » faux pour le message d’un autre (#8884)', async () => {
    mountThreadGrid(() => {});
    act(() => {
      container.querySelectorAll<HTMLButtonElement>('[data-media-tile]')[1]!.click();
    });
    await until(() => viewer()?.querySelector('[data-viewer-action="share"]') != null);
    act(() => {
      viewer()!.querySelector<HTMLButtonElement>('[data-viewer-action="share"]')!.click();
    });
    const request = sendSheetStore.getState().request;
    expect(request?.intent).toBe('share');
    expect(request?.payload).toMatchObject({
      kind: 'attachment',
      conversationId: CONVERSATION,
      messageId: M2,
      attachmentId: A3,
      mime: 'image/jpeg',
      mine: false,
      protected: false,
    });
  });

  test('sur sa propre pièce, « mine » est vrai : la copie serveur lui est permise', async () => {
    mountThreadGrid(() => {}, 'u-nour');
    act(() => {
      container.querySelectorAll<HTMLButtonElement>('[data-media-tile]')[1]!.click();
    });
    await until(() => viewer()?.querySelector('[data-viewer-action="share"]') != null);
    act(() => {
      viewer()!.querySelector<HTMLButtonElement>('[data-viewer-action="share"]')!.click();
    });
    expect(sendSheetStore.getState().request?.payload).toMatchObject({ kind: 'attachment', mine: true });
  });
});

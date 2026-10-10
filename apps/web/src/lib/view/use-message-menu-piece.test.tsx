import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { attachmentDefaults, message, minutesAgo } from '@/lib/api/fixtures-base';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { setAttachmentReactionEmitter, type AttachmentReactionRequest } from '@/lib/api/attachment-reaction-emit';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { sendSheetStore } from '@/lib/send/send-sheet-store';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageMenu } from '@/components/message-menu';

import { useMessageMenu } from './use-message-menu';

/**
 * #9907, #9908, #9906 — L'APPUI LONG SUR UNE TUILE VISE SA PIÈCE, ET LE MENU
 * AGIT SUR ELLE. Le témoin passe par le GESTE (clic droit sur la 3ᵉ tuile
 * d'une rangée) et par la porte du hook que l'écran câble : la cible retient
 * la pièce, le défilement la change, et chaque action atteint la pièce visée —
 * jamais la première du lot.
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

const piece = (id: string): Attachment =>
  ({
    ...attachmentDefaults,
    id,
    messageId: 'm-lot',
    fileName: `${id}.jpg`,
    originalName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 1,
    fileUrl: `https://cdn.meeshy.me/${id}`,
    uploadedBy: 'u-viewer',
    createdAt: '2026-10-10T09:00:00.000Z',
  }) as Attachment;

const LOT: Message = message({
  id: 'm-lot',
  conversationId: 'c-a',
  senderId: 'u-viewer',
  content: 'les photos',
  originalLanguage: 'fr',
  createdAt: minutesAgo(5),
  translations: [],
  attachments: ['a-1', 'a-2', 'a-3', 'a-4'].map(piece),
});

type MenuApi = ReturnType<typeof useMessageMenu>;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  sendSheetStore.getState().close();
  act(() => root.unmount());
  document.body.replaceChildren();
  container.remove();
});

function mount(lot: Message = LOT): { api: () => MenuApi; requests: HttpRequest[]; replies: [string, string][]; queryClient: QueryClient } {
  const requests: HttpRequest[] = [];
  const replies: [string, string][] = [];
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesQueryKey('c-a'), { pages: [{ messages: [lot], hasOlder: false, nextCursor: null }], pageParams: [undefined] });
  const transport = {
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      requests.push(request);
      return { ok: true, data: null as T };
    },
  };
  let latest: MenuApi | undefined;

  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages: [lot],
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      viewerId: 'u-viewer',
      canStar: false,
      reply: { setReplyTarget: () => {}, setReplyToMedia: (messageId, attachmentId) => replies.push([messageId, attachmentId]) },
      announce: () => {},
      queryClient,
      transport,
    });
    return (
      <div data-row="m-lot" tabIndex={0} {...latest.longPress}>
        <p data-text>les photos</p>
        {lot.attachments!.map((a) => (
          <div key={a.id} data-piece={a.id}>
            <button type="button" data-tile={a.id} />
          </div>
        ))}
        {((target, data) =>
          target === null || data === undefined ? null : (
            <MessageMenu
              target={target}
              items={data.items}
              choices={data.choices}
              subjectLabel={data.subjectLabel}
              onClose={latest!.onCloseMenu}
              onReact={() => {}}
              onExpandReactions={() => {}}
              onAction={() => {}}
              onPickLanguage={() => {}}
              {...(data.piece === undefined
                ? {}
                : { piece: { data: data.piece, onIndex: () => {}, onWholeMessage: () => {}, onAction: () => {} } })}
            />
          ))(latest.menuTarget, latest.menuData)}
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
    requests,
    replies,
    queryClient,
  };
}

const rightClick = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
};

describe('l’appui long sur une tuile vise SA pièce (#9907)', () => {
  test('clic droit sur la 3ᵉ tuile : la cible retient la 3ᵉ pièce, l’aperçu dit « Photo 3 sur 4 »', () => {
    const { api } = mount();
    rightClick(container.querySelector('[data-tile="a-3"]')!);
    expect(api().menuTarget?.pieceId).toBe('a-3');
    expect(api().menuData?.piece?.index).toBe(2);
    expect(api().menuData?.piece?.positionLabel).toBe('Photo 3 sur 4');
  });

  test('hors tuile, le menu vise le message entier', () => {
    const { api } = mount();
    rightClick(container.querySelector('[data-text]')!);
    expect(api().menuTarget?.messageId).toBe('m-lot');
    expect(api().menuTarget?.pieceId).toBeUndefined();
    expect(api().menuData?.piece).toBeUndefined();
  });

  test('le défilement change la cible ; « Tout le message » la retire', () => {
    const { api } = mount();
    rightClick(container.querySelector('[data-tile="a-3"]')!);
    act(() => api().onPieceChange('a-4'));
    expect(api().menuData?.piece?.index).toBe(3);
    act(() => api().onPieceChange(undefined));
    expect(api().menuData?.piece).toBeUndefined();
  });
});

describe('le menu agit sur la pièce visée (#9908, #9906)', () => {
  test('répondre arme la citation de CETTE pièce', () => {
    const { api, replies } = mount();
    act(() => api().onPieceAction('m-lot', 'a-3', 'pieceReply'));
    expect(replies).toEqual([['m-lot', 'a-3']]);
  });

  test('transférer remet CETTE pièce à la feuille d’envoi', () => {
    const { api } = mount();
    act(() => api().onPieceAction('m-lot', 'a-3', 'pieceForward'));
    const request = sendSheetStore.getState().request;
    expect(request?.payload.kind).toBe('attachment');
    expect(request?.payload.kind === 'attachment' ? request.payload.attachmentId : null).toBe('a-3');
  });

  test('supprimer la 3ᵉ pièce supprime la 3ᵉ, jamais la première', async () => {
    const { api, requests, queryClient } = mount();
    await act(async () => {
      api().onPieceAction('m-lot', 'a-3', 'pieceDelete');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(requests).toEqual([{ method: 'DELETE', path: '/api/v1/attachments/a-3' }]);
    const cached = queryClient.getQueryData<{ pages: { messages: Message[] }[] }>(messagesQueryKey('c-a'));
    expect(cached?.pages[0]?.messages[0]?.attachments?.map((a) => a.id)).toEqual(['a-1', 'a-2', 'a-4']);
  });

  test('l’auteur voit « Supprimer ce média » ; le menu garde l’accès au message entier', () => {
    const { api } = mount();
    rightClick(container.querySelector('[data-tile="a-3"]')!);
    expect(api().menuData?.piece?.items.map((i) => i.id)).toEqual(['pieceReply', 'pieceSave', 'pieceForward', 'pieceDelete', 'wholeMessage']);
  });

  test('réagir depuis le rail vise la pièce (#9910) : l’émoji part sur la 3ᵉ pièce, et sa pastille bouge', async () => {
    const { api, queryClient } = mount();
    const sent: AttachmentReactionRequest[] = [];
    setAttachmentReactionEmitter(async (request) => {
      sent.push(request);
      return 'ok';
    });
    try {
      await act(async () => {
        api().onMenuReact('m-lot', '❤️', 'a-3');
        await new Promise((r) => setTimeout(r, 0));
      });
    } finally {
      setAttachmentReactionEmitter(null);
    }
    expect(sent).toEqual([{ action: 'add', attachmentId: 'a-3', messageId: 'm-lot', emoji: '❤️' }]);
    const cached = queryClient.getQueryData<{ pages: { messages: Message[] }[] }>(messagesQueryKey('c-a'));
    const third = cached?.pages[0]?.messages[0]?.attachments?.find((a) => a.id === 'a-3');
    expect(third?.currentUserReactions).toContain('❤️');
  });
});

/**
 * DÉFAUT DE SÉCURITÉ (revue du lot 7d88788cda) — l'aperçu par pièce ne
 * consultait que les drapeaux de chaque PIÈCE. Une charge peut arriver sans eux
 * (cache ancien, envoi optimiste : `veiledAttachment` existe pour ça) : l'appui
 * long sur la tuile d'un message flouté, à vue unique, éphémère ou chiffré
 * montrait alors le fichier EN CLAIR et offrait de l'enregistrer et de le
 * transférer. Fail-closed : un message protégé, par lui-même ou par une de ses
 * pièces, n'ouvre jamais l'aperçu par pièce — le menu du message, comme avant.
 */
describe('un message protégé n’ouvre jamais l’aperçu par pièce (fail-closed)', () => {
  const inAnHour = new Date(Date.now() + 3_600_000);
  const PROTECTIONS: readonly (readonly [string, Partial<Message>])[] = [
    ['flouté', { isBlurred: true }],
    ['à vue unique', { isViewOnce: true }],
    ['éphémère', { expiresAt: inAnHour }],
    ['chiffré', { isEncrypted: true }],
  ];

  const expectNoPieceExposure = (api: () => MenuApi) => {
    expect(api().menuTarget?.messageId).toBe('m-lot');
    expect(api().menuTarget?.pieceId).toBeUndefined();
    expect(api().menuData?.piece).toBeUndefined();
    expect(document.querySelector('[data-message-menu-pieces]')).toBeNull();
    const files = Array.from(document.body.querySelectorAll('img, video')).filter((el) => (el.getAttribute('src') ?? '').includes('cdn.meeshy.me'));
    expect(files).toEqual([]);
    const actions = Array.from(document.querySelectorAll('[data-action]')).map((el) => el.getAttribute('data-action'));
    expect(actions).not.toContain('pieceSave');
    expect(actions).not.toContain('pieceForward');
  };

  for (const [nom, protection] of PROTECTIONS) {
    test(`message ${nom}, pièces SANS drapeau : ni fichier, ni enregistrer, ni transférer`, () => {
      const { api } = mount({ ...LOT, ...protection });
      rightClick(container.querySelector('[data-tile="a-3"]')!);
      expectNoPieceExposure(api);
    });
  }

  for (const [nom, protection] of PROTECTIONS.filter(([n]) => n !== 'éphémère')) {
    test(`message ordinaire, pièces au drapeau « ${nom} » : même verdict`, () => {
      const { api } = mount({ ...LOT, attachments: LOT.attachments!.map((a) => ({ ...a, ...protection })) as Attachment[] });
      rightClick(container.querySelector('[data-tile="a-3"]')!);
      expectNoPieceExposure(api);
    });
  }

  test('une seule pièce protégée suffit à fermer l’aperçu par pièce du lot', () => {
    const { api } = mount({ ...LOT, attachments: LOT.attachments!.map((a) => (a.id === 'a-1' ? { ...a, isViewOnce: true } : a)) });
    rightClick(container.querySelector('[data-tile="a-3"]')!);
    expectNoPieceExposure(api);
  });
});
